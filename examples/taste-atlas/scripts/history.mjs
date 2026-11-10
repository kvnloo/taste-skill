// Watch and listen history -> taste items. Pure parsers: read one export file, return ranked items for sources.mjs.
// Formats are detected from the file, so `--history` takes any of:
//   YouTube  Google Takeout "My Activity/YouTube/MyActivity.html" or ".json" (watched, liked, disliked)
//   Spotify  Account data StreamingHistory_music_*.json, or Extended Streaming_History_Audio_*.json (has track URIs)
//   Tidal    CSV with a header naming title/track and artist (TIDAL's data request, or a TuneMyMusic/Soundiiz export);
//            optional columns: album, played_at/date, count/plays, url/id. Any other music service exporting CSV works too.
// Ranking is what you came back to, not what auto-played once: YouTube likes and repeat watches, Spotify minutes played
// (plays under 30 s are skips), Tidal play counts. Dislikes are dropped. Each item keeps its counts so the shelf can say why.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const unhtml = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const ytId = (u) => u?.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? null;
const bump = (m, k, n = 1) => { if (k) m[k] = (m[k] ?? 0) + n; };
const topOf = (m, k = 20) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, n]) => ({ name, n: Math.round(n) }));
const day = (d) => (d && !isNaN(new Date(d)) ? new Date(d).toISOString().slice(0, 10) : null);

export function detect(file, text) {
  const head = text.slice(0, 4000);
  if (/\.html?$/i.test(file) && /youtube\.com\/watch/.test(text.slice(0, 200000))) return "youtube";
  if (head.trimStart().startsWith("[")) {
    if (/"titleUrl"\s*:\s*"https:\/\/www\.youtube\.com/.test(head) || /"header"\s*:\s*"YouTube/.test(head)) return "youtube";
    if (/"msPlayed"|"ms_played"/.test(head)) return "spotify";
  }
  if (/\.csv$/i.test(file)) return "csv";
  throw new Error(`${basename(file)}: not a YouTube Takeout, Spotify export or music CSV (see scripts/history.mjs)`);
}

// Takeout HTML: one content cell per event, "Watched <a video>title</a><br><a channel>name</a><br>date<br>".
function youtubeEvents(file, text) {
  if (text.trimStart().startsWith("[")) return JSON.parse(text).map((e) => ({
    verb: e.title?.split(" ")[0], url: e.titleUrl, title: e.title?.replace(/^\w+\s/, ""), author: e.subtitles?.[0]?.name ?? null, date: e.time,
  }));
  const out = [], cell = /<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">(.*?)<\/div>/gs;
  for (const [, c] of text.matchAll(cell)) {
    const verb = c.match(/^\s*(\w+)/)?.[1], links = [...c.matchAll(/<a href="([^"]+)">(.*?)<\/a>/g)], parts = c.split("<br>");
    if (!verb || !links.length) continue;
    out.push({ verb, url: links[0][1], title: unhtml(links[0][2]), author: links[1] ? unhtml(links[1][2]) : null, date: unhtml(parts.at(-2) ?? "").replace(/\s[A-Z]{2,4}$/, "") });
  }
  return out;
}

function youtube(file, text) {
  const by = new Map(), daily = {}, chans = {}; let events = 0;
  for (const e of youtubeEvents(file, text)) {
    const id = ytId(e.url); if (!id) continue; // searches, channel visits, removed videos
    if (e.verb === "Watched") { events++; bump(daily, day(e.date)); bump(chans, e.author); }
    const v = by.get(id) ?? { id: `yt-${id}`, url: `https://www.youtube.com/watch?v=${id}`, title: e.title, author: e.author, watches: 0, liked: false, disliked: false, date: null };
    if (e.verb === "Watched") v.watches++;
    if (e.verb === "Liked") v.liked = true;
    if (e.verb === "Disliked") v.disliked = true;
    if (e.title && !/^https?:/.test(e.title)) v.title = e.title; // removed videos show their URL as the title
    const d = day(e.date); if (d && (!v.date || d > v.date)) v.date = d;
    by.set(id, v);
  }
  const items = [...by.values()].filter((v) => !v.disliked && (v.liked || v.watches >= 2) && !/^https?:/.test(v.title ?? "http"))
    .map((v) => ({ ...v, score: (v.liked ? 5 : 0) + Math.min(v.watches, 20), why: [v.liked && "liked", v.watches > 1 && `watched ${v.watches}×`].filter(Boolean).join(", "),
      type: "video", source: "youtube", thumb_url: `https://i.ytimg.com/vi/${v.id.slice(3)}/hqdefault.jpg` }));
  return { items, series: { unit: "watches", events, daily, top: topOf(chans), topLabel: "Channels" } };
}

function spotify(file, text) {
  const by = new Map(), daily = {}, artists = {}; let events = 0;
  for (const e of JSON.parse(text)) {
    const ms = e.msPlayed ?? e.ms_played ?? 0, track = e.trackName ?? e.master_metadata_track_name, artist = e.artistName ?? e.master_metadata_album_artist_name;
    if (!track || !artist) continue; // podcasts and audiobooks
    const uri = e.spotify_track_uri ?? null, key = uri ?? `${artist}\u0000${track}`;
    const v = by.get(key) ?? { track, artist, album: e.master_metadata_album_album_name ?? null, uri, ms: 0, plays: 0, date: null };
    v.ms += ms; bump(artists, artist, ms / 60000);
    const d = day(e.endTime ?? e.ts); if (d && (!v.date || d > v.date)) v.date = d;
    if (ms >= 30000) { v.plays++; events++; bump(daily, d); }
    by.set(key, v);
  }
  const items = [...by.values()].filter((v) => v.plays >= 2).map((v) => {
    const tid = v.uri?.split(":")[2];
    return { id: `sp-${tid ?? Buffer.from(`${v.artist}/${v.track}`).toString("base64url").slice(0, 24)}`, url: tid ? `https://open.spotify.com/track/${tid}` : `https://open.spotify.com/search/${encodeURIComponent(`${v.artist} ${v.track}`)}`,
      title: v.track, author: v.artist, album: v.album, date: v.date, plays: v.plays, minutes: Math.round(v.ms / 60000), score: v.ms / 60000,
      why: `${v.plays} plays, ${Math.round(v.ms / 60000)} min`, type: "track", source: "spotify", oembed: tid ? `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${tid}` : null };
  });
  return { items, series: { unit: "plays", events, daily, top: topOf(artists), topLabel: "Artists (minutes)" } };
}

// Minimal RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes.
export function csvRows(text) {
  const rows = [[]]; let f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { rows.at(-1).push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; rows.at(-1).push(f); f = ""; rows.push([]); }
    else f += ch;
  }
  rows.at(-1).push(f);
  return rows.filter((r) => r.some((x) => x.trim()));
}

function csv(file, text) {
  const [head, ...rows] = csvRows(text.replace(/^\uFEFF/, "")), h = head.map((x) => x.trim().toLowerCase());
  const col = (...names) => h.findIndex((x) => names.some((n) => x === n || x.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")));
  const ti = col("title", "track", "track name", "track_title", "song", "name"), ai = col("artist", "artist name", "artists", "artist_name"), al = col("album", "album name");
  const di = col("played_at", "date", "timestamp", "played", "time", "added"), ci = col("count", "plays", "play count", "playcount"), ui = col("url", "link", "track url"), ii = col("id", "track id", "track_id", "tidal id");
  if (ti < 0 || ai < 0) throw new Error(`${basename(file)}: CSV needs title/track and artist columns, got: ${head.join(", ")}`);
  const service = /tidal/i.test(file) || h.some((x) => /tidal/.test(x)) ? "tidal" : "music";
  const by = new Map(), daily = {}, artists = {}; let events = 0;
  for (const r of rows) {
    const track = r[ti]?.trim(), artist = r[ai]?.trim(); if (!track || !artist) continue;
    const key = `${artist}\u0000${track}`.toLowerCase(), v = by.get(key) ?? { track, artist, album: r[al]?.trim() || null, plays: 0, date: null, url: r[ui]?.trim() || null, tid: r[ii]?.trim() || null };
    const n = ci >= 0 && +r[ci] > 0 ? +r[ci] : 1; v.plays += n; events += n; bump(artists, artist, n);
    const d = day(r[di]); if (d && (!v.date || d > v.date)) v.date = d; bump(daily, d, n);
    by.set(key, v);
  }
  const items = [...by.values()].map((v) => {
    const url = v.url || (service === "tidal" && /^\d+$/.test(v.tid ?? "") ? `https://tidal.com/browse/track/${v.tid}` : null);
    return { id: `${service === "tidal" ? "td" : "mu"}-${Buffer.from(`${v.artist}/${v.track}`).toString("base64url").slice(0, 24)}`, url: url ?? "",
      title: v.track, author: v.artist, album: v.album, date: v.date, plays: v.plays, score: v.plays, why: v.plays > 1 ? `${v.plays} plays` : "saved",
      type: "track", source: service, oembed: url && /tidal\.com/.test(url) ? `https://oembed.tidal.com/?url=${encodeURIComponent(url)}` : null };
  });
  return { items, series: { unit: "plays", events, daily, top: topOf(artists), topLabel: "Artists" } };
}

export function parseHistory(file, top = 300) {
  const text = readFileSync(file, "utf8"), kind = detect(file, text);
  const { items, series } = { youtube, spotify, csv }[kind](file, text);
  items.sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? ""));
  if (!items.length) throw new Error(`${basename(file)}: parsed as ${kind} but found nothing you came back to (no likes, repeats or plays)`);
  return { kind, items: items.slice(0, top), total: items.length, series };
}

// GitHub through the gh CLI (its own login; no token passes through here): your contribution calendar for every
// year since the account opened, your repos' languages, and the repos you starred (the taste signal) as items.
export function github(user, top = 500, gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 28 })) {
  const q = (query, vars) => JSON.parse(gh(["api", "graphql", "-f", `query=${query}`, ...Object.entries(vars).flatMap(([k, v]) => ["-F", `${k}=${v}`])])).data;
  const created = q("query($u:String!){user(login:$u){createdAt}}", { u: user }).user.createdAt.slice(0, 4), daily = {};
  let events = 0;
  for (let y = +created; y <= new Date().getFullYear(); y++) {
    const c = q("query($u:String!,$f:DateTime!,$t:DateTime!){user(login:$u){contributionsCollection(from:$f,to:$t){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}",
      { u: user, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` }).user.contributionsCollection.contributionCalendar;
    for (const w of c.weeks) for (const d of w.contributionDays) if (d.contributionCount) { daily[d.date] = d.contributionCount; events += d.contributionCount; }
  }
  const jl = (args) => gh(args).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const langs = {};
  for (const r of jl(["api", `users/${user}/repos?per_page=100&type=owner`, "--paginate", "--jq", ".[] | {fork, language}"])) if (!r.fork) bump(langs, r.language);
  const me = gh(["api", "user", "--jq", ".login"]).trim();
  const starred = jl(["api", me === user ? "user/starred?per_page=100" : `users/${user}/starred?per_page=100`, "--paginate", "-H", "Accept: application/vnd.github.star+json",
    "--jq", ".[] | {at: .starred_at, id: .repo.id, name: .repo.full_name, owner: .repo.owner.login, url: .repo.html_url, desc: .repo.description, topics: .repo.topics, stars: .repo.stargazers_count, lang: .repo.language}"]);
  const items = starred.sort((a, b) => b.at.localeCompare(a.at)).slice(0, top).map((r) => ({
    id: `ghs-${r.id}`, url: r.url, title: r.name, author: r.owner, date: r.at.slice(0, 10), likes: r.stars, type: "repo", source: "github",
    why: `starred${r.lang ? ` · ${r.lang}` : ""}`, album: r.desc ?? null, topics: r.topics ?? [], score: 0, thumb_url: `https://opengraph.githubassets.com/1/${r.name}`, thumb_alt: `https://avatars.githubusercontent.com/${r.owner}?s=460`,
  }));
  return { kind: "github", items, total: starred.length, series: { unit: "contributions", events, daily, top: topOf(langs), topLabel: "Languages (your repos)", starred: starred.length } };
}

// CLI: node scripts/history.mjs <export>... [--github <user>] [--top 300]
// Writes $ATLAS_DATA/history.atlas.json (default ../data, gitignored; your history never leaves this machine) and
// cover art into data/thumbs/. Re-importing a service replaces only that service's items, so YouTube, Spotify and
// Tidal can be imported at different times. Exits 1 if a file cannot be read or more than 20% of covers fail.
// reuse-checked: scripts/sources.mjs -- its inputs for the existing layers are not recorded, so a rebuild there could
// drop them; history writes its own file and the app and board load it beside sources.atlas.json.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2), val = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null), top = +(val("--top") ?? 300), ghUser = val("--github");
  const files = argv.filter((a, i) => !a.startsWith("--") && !["--top", "--github"].includes(argv[i - 1]));
  if (!files.length && !ghUser) { console.error("usage: node scripts/history.mjs <MyActivity.html|watch-history.json|Streaming_History*.json|tidal.csv>... [--github <user>] [--top 300]"); process.exit(2); }
  const data = process.env.ATLAS_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "../data"), outFile = join(data, "history.atlas.json");
  mkdirSync(join(data, "thumbs"), { recursive: true });
  const prevFile = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {}, prev = prevFile.items ?? [], series = prevFile.series ?? {};
  const save = async (url, name) => {
    const file = join(data, "thumbs", name); if (existsSync(file)) return `thumbs/${name}`;
    let r;
    for (let i = 0; ; i++) { // image hosts (GitHub's opengraph) answer 429 to bursts: back off and retry, honouring Retry-After
      r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "taste-atlas" } });
      if (r.status !== 429 || i === 2) break;
      await new Promise((ok) => setTimeout(ok, (+r.headers.get("retry-after") || 2 ** i) * 1000));
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer())); return `thumbs/${name}`;
  };
  const cover = async (it) => {
    let img = it.thumb_url;
    if (!img && it.oembed) { const r = await fetch(it.oembed, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${r.status} ${it.oembed}`); img = (await r.json()).thumbnail_url; }
    if (!img && it.type === "track") { // TIDAL oEmbed has no art and its pages need a login: Apple's public catalogue search does
      const q = encodeURIComponent(`${it.author} ${it.title}`), r = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${r.status} itunes search`);
      img = (await r.json()).results?.[0]?.artworkUrl100?.replace("100x100", "600x600");
      if (!img) throw new Error(`no cover found for ${it.author} – ${it.title}`);
    }
    if (!img) throw new Error("no cover source");
    // GitHub's preview cards allow ~100 requests per window: past that, the owner's avatar stands in rather than nothing
    return save(img, `${it.id}.jpg`).catch((e) => { if (!it.thumb_alt) throw e; process.stderr.write(`cover ${it.id}: ${e.message}, using avatar\n`); return save(it.thumb_alt, `${it.id}.jpg`); });
  };
  let items = [], failed = 0, tried = 0; const report = {};
  const jobs = [...files.map((f) => () => ({ file: f, ...parseHistory(f, top) })), ...(ghUser ? [() => ({ file: `github:${ghUser}`, ...github(ghUser, Math.max(top, 500)) })] : [])];
  for (const job of jobs) {
    const { file: f, kind, items: got, total, series: ser } = job();
    for (let i = 0; i < got.length; i += 8) await Promise.all(got.slice(i, i + 8).map(async (it) => {
      tried++; try { it.thumb = await cover(it); } catch (e) { failed++; process.stderr.write(`cover ${it.id}: ${e.message}\n`); }
    }));
    const src = got[0].source; series[src] = { ...ser, from: Object.keys(ser.daily).sort()[0] ?? null, to: Object.keys(ser.daily).sort().at(-1) ?? null, imported: new Date().toISOString().slice(0, 10) };
    items = items.filter((x) => x.source !== src).concat(got.map(({ thumb_url, thumb_alt, oembed, score, ...it }) => ({ ...it, layer: src, technique: null, text: [it.title, it.author, it.album, it.why].filter(Boolean).join(" · ") })));
    report[src] = { file: f, kind, kept: got.length, of: total, with_cover: got.filter((x) => x.thumb).length };
  }
  const fresh = new Set(items.map((x) => x.source));
  const all = prev.filter((x) => !fresh.has(x.source)).concat(items);
  writeFileSync(outFile, JSON.stringify({ kind: "taste-atlas.history.v1", count: all.length, series, items: all }, null, 1));
  console.log(JSON.stringify({ out: outFile, ...report, total: all.length }));
  if (tried && failed / tried > 0.2) { console.error(`FAIL: ${failed}/${tried} covers failed`); process.exit(1); }
}
