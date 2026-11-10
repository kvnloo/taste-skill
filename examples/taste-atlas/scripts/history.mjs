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
  const by = new Map();
  for (const e of youtubeEvents(file, text)) {
    const id = ytId(e.url); if (!id) continue; // searches, channel visits, removed videos
    const v = by.get(id) ?? { id: `yt-${id}`, url: `https://www.youtube.com/watch?v=${id}`, title: e.title, author: e.author, watches: 0, liked: false, disliked: false, date: null };
    if (e.verb === "Watched") v.watches++;
    if (e.verb === "Liked") v.liked = true;
    if (e.verb === "Disliked") v.disliked = true;
    if (e.title && !/^https?:/.test(e.title)) v.title = e.title; // removed videos show their URL as the title
    const d = day(e.date); if (d && (!v.date || d > v.date)) v.date = d;
    by.set(id, v);
  }
  return [...by.values()].filter((v) => !v.disliked && (v.liked || v.watches >= 2) && !/^https?:/.test(v.title ?? "http"))
    .map((v) => ({ ...v, score: (v.liked ? 5 : 0) + Math.min(v.watches, 20), why: [v.liked && "liked", v.watches > 1 && `watched ${v.watches}×`].filter(Boolean).join(", "),
      type: "video", source: "youtube", thumb_url: `https://i.ytimg.com/vi/${v.id.slice(3)}/hqdefault.jpg` }));
}

function spotify(file, text) {
  const by = new Map();
  for (const e of JSON.parse(text)) {
    const ms = e.msPlayed ?? e.ms_played ?? 0, track = e.trackName ?? e.master_metadata_track_name, artist = e.artistName ?? e.master_metadata_album_artist_name;
    if (!track || !artist) continue; // podcasts and audiobooks
    const uri = e.spotify_track_uri ?? null, key = uri ?? `${artist}\u0000${track}`;
    const v = by.get(key) ?? { track, artist, album: e.master_metadata_album_album_name ?? null, uri, ms: 0, plays: 0, date: null };
    v.ms += ms; if (ms >= 30000) v.plays++;
    const d = day(e.endTime ?? e.ts); if (d && (!v.date || d > v.date)) v.date = d;
    by.set(key, v);
  }
  return [...by.values()].filter((v) => v.plays >= 2).map((v) => {
    const tid = v.uri?.split(":")[2];
    return { id: `sp-${tid ?? Buffer.from(`${v.artist}/${v.track}`).toString("base64url").slice(0, 24)}`, url: tid ? `https://open.spotify.com/track/${tid}` : `https://open.spotify.com/search/${encodeURIComponent(`${v.artist} ${v.track}`)}`,
      title: v.track, author: v.artist, album: v.album, date: v.date, plays: v.plays, minutes: Math.round(v.ms / 60000), score: v.ms / 60000,
      why: `${v.plays} plays, ${Math.round(v.ms / 60000)} min`, type: "track", source: "spotify", oembed: tid ? `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${tid}` : null };
  });
}

// Minimal RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes.
function csvRows(text) {
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
  const by = new Map();
  for (const r of rows) {
    const track = r[ti]?.trim(), artist = r[ai]?.trim(); if (!track || !artist) continue;
    const key = `${artist}\u0000${track}`.toLowerCase(), v = by.get(key) ?? { track, artist, album: r[al]?.trim() || null, plays: 0, date: null, url: r[ui]?.trim() || null, tid: r[ii]?.trim() || null };
    v.plays += ci >= 0 && +r[ci] > 0 ? +r[ci] : 1;
    const d = day(r[di]); if (d && (!v.date || d > v.date)) v.date = d;
    by.set(key, v);
  }
  return [...by.values()].map((v) => {
    const url = v.url || (service === "tidal" && /^\d+$/.test(v.tid ?? "") ? `https://tidal.com/browse/track/${v.tid}` : null);
    return { id: `${service === "tidal" ? "td" : "mu"}-${Buffer.from(`${v.artist}/${v.track}`).toString("base64url").slice(0, 24)}`, url: url ?? "",
      title: v.track, author: v.artist, album: v.album, date: v.date, plays: v.plays, score: v.plays, why: v.plays > 1 ? `${v.plays} plays` : "saved",
      type: "track", source: service, oembed: url && /tidal\.com/.test(url) ? `https://oembed.tidal.com/?url=${encodeURIComponent(url)}` : null };
  });
}

export function parseHistory(file, top = 300) {
  const text = readFileSync(file, "utf8"), kind = detect(file, text);
  const items = { youtube, spotify, csv }[kind](file, text).sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? ""));
  if (!items.length) throw new Error(`${basename(file)}: parsed as ${kind} but found nothing you came back to (no likes, repeats or plays)`);
  return { kind, items: items.slice(0, top), total: items.length };
}

// CLI: node scripts/history.mjs <export>... [--top 300]
// Writes $ATLAS_DATA/history.atlas.json (default ../data, gitignored; your history never leaves this machine) and
// cover art into data/thumbs/. Re-importing a service replaces only that service's items, so YouTube, Spotify and
// Tidal can be imported at different times. Exits 1 if a file cannot be read or more than 20% of covers fail.
// reuse-checked: scripts/sources.mjs -- its inputs for the existing layers are not recorded, so a rebuild there could
// drop them; history writes its own file and the app and board load it beside sources.atlas.json.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2), ti = argv.indexOf("--top"), top = ti >= 0 ? +argv[ti + 1] : 300;
  const files = argv.filter((a, i) => !a.startsWith("--") && !(ti >= 0 && i === ti + 1));
  if (!files.length) { console.error("usage: node scripts/history.mjs <MyActivity.html|watch-history.json|Streaming_History*.json|tidal.csv>... [--top 300]"); process.exit(2); }
  const data = process.env.ATLAS_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "../data"), outFile = join(data, "history.atlas.json");
  mkdirSync(join(data, "thumbs"), { recursive: true });
  const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")).items : [];
  const save = async (url, name) => {
    const file = join(data, "thumbs", name); if (existsSync(file)) return `thumbs/${name}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "taste-atlas" } });
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
    return save(img, `${it.id}.jpg`);
  };
  let items = [], failed = 0, tried = 0; const report = {};
  for (const f of files) {
    const { kind, items: got, total } = parseHistory(f, top);
    for (let i = 0; i < got.length; i += 8) await Promise.all(got.slice(i, i + 8).map(async (it) => {
      tried++; try { it.thumb = await cover(it); } catch (e) { failed++; process.stderr.write(`cover ${it.id}: ${e.message}\n`); }
    }));
    const src = got[0].source;
    items = items.filter((x) => x.source !== src).concat(got.map(({ thumb_url, oembed, score, ...it }) => ({ ...it, layer: src, technique: null, text: [it.title, it.author, it.album, it.why].filter(Boolean).join(" · ") })));
    report[src] = { file: f, kind, kept: got.length, of: total, with_cover: got.filter((x) => x.thumb).length };
  }
  const fresh = new Set(items.map((x) => x.source));
  const all = prev.filter((x) => !fresh.has(x.source)).concat(items);
  writeFileSync(outFile, JSON.stringify({ kind: "taste-atlas.history.v1", count: all.length, items: all }, null, 1));
  console.log(JSON.stringify({ out: outFile, ...report, total: all.length }));
  if (tried && failed / tried > 0.2) { console.error(`FAIL: ${failed}/${tried} covers failed`); process.exit(1); }
}
