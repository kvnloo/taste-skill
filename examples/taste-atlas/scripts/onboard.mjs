#!/usr/bin/env node
// Onboarding: bring your own bookmarks and history into Taste. One entry point for every importer, so a new user
// drops whatever exports they have and each lands as a layer on the Atlas canvas. Node 22+, no dependencies.
//   onboard.mjs status                    every source: imported or not, how many items, when, and how to get it
//   onboard.mjs add <file|folder|zip>...  detect what each export is and run its importer (zips are opened in place)
//   onboard.mjs github <user>             GitHub stars + contribution calendar through your `gh` login
//   onboard.mjs x [--max-pages 100]       sync your X bookmarks, read-only, through twitter-cli's browser login
// The web page /onboard (board.mjs serve) runs these same commands. Everything is written to $ATLAS_DATA (default
// ../data, gitignored): nothing leaves the machine except cover-art lookups. Importers:
//   YouTube / Spotify / TIDAL / music CSV -> scripts/history.mjs   LinkedIn -> scripts/network.mjs
//   X bookmarks (twitter-cli JSON)         -> bookmarks.atlas.json  (merged: posts already classified keep their technique)
//   Browser bookmarks (Netscape HTML from Chrome/Firefox/Safari/Edge/Arc/Raindrop/Pocket), URL lists, link CSVs
//                                          -> links.atlas.json (layer "web", grouped by bookmark folder)
// reuse-checked: history.mjs, network.mjs and taste-lab/scripts/sync_bookmarks_readonly.py run unchanged as children.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, basename, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { csvRows } from "./history.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const dataDir = () => process.env.ATLAS_DATA ?? join(here, "../data");
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + ".tmp", JSON.stringify(v, null, 1)); renameSync(f + ".tmp", f); };
const day = (d) => (d && !isNaN(new Date(d)) ? new Date(d).toISOString().slice(0, 10) : null);

// The checklist: what each source is, where its export comes from, and how to bring it in. /onboard renders this.
export const SOURCES = [
  { id: "x", label: "X bookmarks", how: "Log in to x.com in Chrome, then <code>pipx install twitter-cli</code> once. Press <b>Sync</b> (or run <code>onboard.mjs x</code>): it reads your bookmarks through that browser login, read-only. Or drop a <code>bookmarks.json</code> from twitter-cli.", action: "x", link: "https://github.com/jackwener/twitter-cli" },
  { id: "web", label: "Browser bookmarks", how: "Chrome, Edge, Brave, Arc: Bookmark manager → ⋮ → <i>Export bookmarks</i>. Firefox: Library → <i>Import and Backup</i> → <i>Export to HTML</i>. Safari: File → Export → Bookmarks. Raindrop, Pocket and Pinboard export the same HTML. A <code>.txt</code> with one URL per line works too." },
  { id: "youtube", label: "YouTube", how: "Google Takeout → <i>Deselect all</i> → tick <i>YouTube and YouTube Music</i> (history only) → export. Drop the zip as it arrives.", link: "https://takeout.google.com" },
  { id: "spotify", label: "Spotify", how: "Account → Privacy → request <i>Extended streaming history</i> (a few days) or <i>Account data</i> (faster). Drop the zip.", link: "https://www.spotify.com/account/privacy/" },
  { id: "tidal", label: "TIDAL & other music", how: "TIDAL's data request, or a CSV from TuneMyMusic or Soundiiz (any CSV with title and artist columns).", link: "https://www.tunemymusic.com" },
  { id: "github", label: "GitHub", how: "Type your username. Reads your stars and contribution calendar through your <code>gh</code> login (<code>gh auth login</code> once).", action: "github" },
  { id: "linkedin", label: "LinkedIn", how: "Settings → Data privacy → <i>Get a copy of your data</i> → the larger archive (it has messages, which is what makes warmth meaningful). Drop the zip. Message text, emails and phone numbers are never written out.", link: "https://www.linkedin.com/mypreferences/d/download-my-data" },
  { id: "projects", label: "Your projects & ideas", how: "Copy <code>sources.example.json</code>, set your GitHub user and ideas, then <code>node scripts/sources.mjs --projects my-sources.json</code>." },
];

// ---------- status
export function status(data = dataDir()) {
  const hist = readJson(join(data, "history.atlas.json"), {}), net = readJson(join(data, "network.atlas.json"));
  const bm = readJson(join(data, "bookmarks.atlas.json")), links = readJson(join(data, "links.atlas.json")), src = readJson(join(data, "sources.atlas.json"));
  const mtime = (f) => (existsSync(join(data, f)) ? day(statSync(join(data, f)).mtime) : null);
  const n = (items, f) => (items ?? []).filter(f).length;
  const got = {
    x: bm && { items: bm.items.length, detail: `${n(bm.items, (b) => b.technique)} placed on techniques`, imported: bm.imported ?? mtime("bookmarks.atlas.json") },
    web: links && { items: links.items.length, detail: `${new Set(links.items.map((l) => l.author)).size} folders`, imported: links.imported ?? mtime("links.atlas.json") },
    linkedin: net && { items: net.stats.connections, detail: `${net.stats.hubs} company hubs`, imported: net.generated ?? mtime("network.atlas.json") },
    projects: src && n(src.items, (b) => ["project", "idea", "portfolio"].includes(b.layer)) ? { items: n(src.items, (b) => ["project", "idea", "portfolio"].includes(b.layer)), imported: mtime("sources.atlas.json") } : null,
  };
  for (const [s, v] of Object.entries(hist.series ?? {})) {
    const id = s === "music" ? "tidal" : s;
    got[id] = { items: n(hist.items, (i) => i.source === s), detail: `${Number(v.events).toLocaleString("en-US")} ${v.unit} ${v.from ?? ""} → ${v.to ?? ""}`, imported: v.imported ?? null };
  }
  const sources = SOURCES.map((s) => ({ ...s, done: !!got[s.id], ...(got[s.id] ?? {}) }));
  return { kind: "taste-atlas.onboard.v1", data, sources, done: sources.filter((s) => s.done).length, total: sources.length, tools: tools() };
}

// What this machine has for the sources that need a login or a tool, so the page can say what is missing.
function tools() {
  const ok = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore", timeout: 8000 }); return true; } catch { return false; } };
  return { gh: ok("gh", ["auth", "status"]), unzip: ok("unzip", ["-v"]), twitterCli: !!twitterPython() };
}

// ---------- detection
// One export file -> which importer reads it. Returns null for files that are part of an export but not used
// (search history, LinkedIn's other CSVs, Takeout's README), so dropping a whole folder or zip just works.
export function classify(file, text) {
  const name = basename(file), ext = extname(file).toLowerCase(), head = text.slice(0, 4000);
  if (/search-history|archive_browser|index\.html$/i.test(name)) return null;
  if (ext === ".html" || ext === ".htm") {
    if (/NETSCAPE-Bookmark-file/i.test(head) || /<DT><A\s/i.test(text.slice(0, 200000))) return "web";
    if (/youtube\.com\/watch/.test(text.slice(0, 200000))) return "history";
    return null;
  }
  if (ext === ".json") {
    const t = head.trimStart();
    if (t.startsWith("[") && /"screenName"\s*:/.test(head) && /"id"\s*:/.test(head)) return "x";
    if (t.startsWith("[") && (/"titleUrl"\s*:\s*"https:\/\/www\.youtube\.com/.test(head) || /"header"\s*:\s*"YouTube/.test(head) || /"msPlayed"|"ms_played"/.test(head))) return "history";
    return null;
  }
  if (ext === ".csv") {
    const cols = (csvRows(head.replace(/^\uFEFF/, ""))[0] ?? []).map((c) => c.trim().toLowerCase());
    if (cols.some((c) => /artist/.test(c)) && cols.some((c) => /title|track|song/.test(c))) return "history";
    if (cols.some((c) => c === "url" || c === "link" || c === "href")) return "web";
    return null;
  }
  if (ext === ".txt" || ext === ".md") return /^\s*https?:\/\/\S+/m.test(head) ? "web" : null;
  return null;
}

// A zip or folder -> the files inside worth reading. Zips are listed first and only the files an importer needs
// are extracted (a Takeout zip can also hold gigabytes of video), into $ATLAS_DATA/inbox/<zip name>/.
const WANT = /(MyActivity\.(html|json)|watch-history\.(html|json)|Streaming_?History[^/]*\.json|bookmarks?[^/]*\.(html|json)|\.csv|\.txt)$/i;
export function expand(path, data) {
  const st = statSync(path);
  if (st.isDirectory()) {
    if (existsSync(join(path, "Connections.csv"))) return [{ path, kind: "linkedin" }];
    return readdirSync(path, { withFileTypes: true }).flatMap((e) => (e.name.startsWith(".") ? [] : expand(join(path, e.name), data)));
  }
  if (/\.zip$/i.test(path)) {
    const names = execFileSync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean);
    if (names.some((n) => basename(n) === "Connections.csv")) return [{ path, kind: "linkedin" }];
    const pick = names.filter((n) => !n.endsWith("/") && WANT.test(n) && !/__MACOSX/.test(n));
    if (!pick.length) return [{ path, kind: null, why: "nothing in this zip is an export Taste reads" }];
    const to = join(data, "inbox", basename(path, extname(path)));
    mkdirSync(to, { recursive: true });
    for (let i = 0; i < pick.length; i += 200) execFileSync("unzip", ["-o", "-q", path, ...pick.slice(i, i + 200), "-d", to]);
    return expand(to, data);
  }
  if (basename(path) === "Connections.csv") return [{ path: dirname(path), kind: "linkedin" }];
  let text; try { text = readFileSync(path, "utf8"); } catch (e) { return [{ path, kind: null, why: e.message }]; }
  return [{ path, kind: classify(path, text) }];
}

// ---------- importers
const node = (script, args, env = {}) => {
  const out = execFileSync(process.execPath, [join(here, script), ...args], { encoding: "utf8", env: { ...process.env, ATLAS_DATA: dataDir(), ...env }, stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 });
  try { return JSON.parse(out.trim().split("\n").at(-1)); } catch { return { out: out.trim().slice(-500) }; }
};

// Browser bookmarks: Netscape HTML keeps folders as <H3> headings around <DL> lists; the folder path is the group.
export function parseNetscape(html) {
  const out = [], stack = [];
  for (const m of html.matchAll(/<H3[^>]*>([\s\S]*?)<\/H3>|<A\s([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi)) {
    if (m[1] !== undefined) { stack.push(unent(m[1])); continue; }
    if (m[0].toUpperCase() === "</DL>") { stack.pop(); continue; }
    const href = m[2].match(/HREF="([^"]+)"/i)?.[1], added = m[2].match(/ADD_DATE="(\d+)"/i)?.[1];
    if (!href || !/^https?:/i.test(href)) continue;
    out.push({ url: unent(href), title: unent(m[3]) || null, folder: stack.filter(Boolean).slice(-2).join(" / ") || null, date: added ? day(added.length <= 11 ? +added * 1000 : added.length <= 13 ? +added : +added / 1000) : null }); // s, ms or µs
  }
  return out;
}
const unent = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
// Bookmarks bar / Other bookmarks / Favorites are containers, not categories.
const BOILER = /^(bookmarks( bar| toolbar| menu)?|other bookmarks|favorites( bar)?|mobile bookmarks|imported)( \/ |$)/i;

export function parseLinks(file, text) {
  const ext = extname(file).toLowerCase();
  if (ext === ".html" || ext === ".htm") return parseNetscape(text);
  if (ext === ".csv") {
    const rows = csvRows(text.replace(/^\uFEFF/, "")), head = rows[0].map((h) => h.trim().toLowerCase()), col = (...n) => head.findIndex((h) => n.includes(h));
    const u = col("url", "link", "href"), t = col("title", "name"), f = col("folder", "collection", "tags"), d = col("created", "time_added", "date", "added");
    return rows.slice(1).filter((r) => /^https?:/i.test(r[u] ?? "")).map((r) => ({ url: r[u], title: r[t] || null, folder: r[f] || null, date: day(/^\d{9,10}$/.test(r[d] ?? "") ? +r[d] * 1000 : r[d]) }));
  }
  return [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => ({ url: m[0], title: null, folder: null, date: null }));
}

export function mergeLinks(prev, rows, from) {
  const by = new Map((prev?.items ?? []).map((i) => [i.url, i]));
  for (const r of rows) {
    let host; try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }
    const folder = r.folder?.replace(BOILER, "").trim() || null;
    const id = "web-" + createHash("sha1").update(r.url).digest("hex").slice(0, 12);
    by.set(r.url, { id, layer: "web", url: r.url, title: r.title || host, author: folder || host, date: r.date, text: [r.title, folder, host].filter(Boolean).join(" · "), source: from, technique: null });
  }
  const items = [...by.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { kind: "taste-atlas.links.v1", imported: day(Date.now()), count: items.length, items };
}

// X: twitter-cli rows -> atlas items. Posts already in bookmarks.atlas.json keep everything they have (technique,
// labels, thumbs); new ones join as unsorted until a labeller places them. Their first picture becomes the thumb.
export function mergeX(prev, rows) {
  const items = [...(prev?.items ?? [])], have = new Set(items.map((b) => String(b.id))), add = [];
  for (const r of rows) {
    const id = String(r.id); if (have.has(id)) continue; have.add(id);
    const m = r.media?.[0], who = r.author?.screenName ?? r.author ?? "";
    add.push({ id, url: `https://x.com/${who}/status/${id}`, author: who, text: r.text ?? "", date: day(r.createdAtISO ?? r.createdAt), type: m?.type ?? "text",
      likes: r.metrics?.likes ?? null, technique: null, media_url: m ? (m.type === "photo" ? m.url : m.thumbnail ?? m.preview ?? m.url) : null });
  }
  return { out: { ...(prev ?? { source: "x", method: "twitter-cli export; unlabelled" }), imported: day(Date.now()), count: items.length + add.length, items: [...add, ...items] }, added: add };
}

async function thumbs(items, data) {
  mkdirSync(join(data, "thumbs"), { recursive: true });
  let ok = 0, failed = 0;
  for (let i = 0; i < items.length; i += 8) await Promise.all(items.slice(i, i + 8).map(async (b) => {
    const url = b.media_url; delete b.media_url; if (!url || !/^https:\/\/pbs\.twimg\.com\//.test(url)) return;
    const f = join(data, "thumbs", `${b.id}.jpg`);
    try {
      if (!existsSync(f)) {
        const u = new URL(url); u.searchParams.set("name", "small"); // X serves sized variants; a bare URL can 404
        const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${r.status} ${u}`);
        writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      }
      b.thumb = `thumbs/${b.id}.jpg`; ok++;
    } catch (e) { failed++; process.stderr.write(`thumb ${b.id}: ${e.message}\n`); }
  }));
  return { ok, failed };
}

async function importX(files, data) {
  const f = join(data, "bookmarks.atlas.json"), rows = files.flatMap((p) => JSON.parse(readFileSync(p, "utf8")));
  const { out, added } = mergeX(readJson(f), rows), pics = await thumbs(added, data);
  writeJson(f, out);
  return { kind: "x", files: files.length, read: rows.length, added: added.length, total: out.items.length, thumbs: pics };
}

function importWeb(files, data) {
  const f = join(data, "links.atlas.json"); let prev = readJson(f), read = 0;
  for (const p of files) { const rows = parseLinks(p, readFileSync(p, "utf8")); read += rows.length; prev = mergeLinks(prev, rows, basename(p)); }
  if (!read) throw new Error(`no links found in ${files.map((p) => basename(p)).join(", ")}`);
  writeJson(f, prev);
  return { kind: "web", files: files.length, read, total: prev.items.length, folders: new Set(prev.items.map((i) => i.author)).size };
}

export async function add(paths, data = dataDir()) {
  mkdirSync(data, { recursive: true });
  const found = paths.flatMap((p) => { if (!existsSync(p)) throw new Error(`${p}: no such file or folder`); return expand(resolve(p), data); });
  const by = Object.groupBy(found, (x) => x.kind ?? "skipped"), results = [];
  if (by.history) results.push({ kind: "history", ...node("history.mjs", by.history.map((x) => x.path)) });
  for (const x of by.linkedin ?? []) results.push({ kind: "linkedin", ...node("network.mjs", [x.path]) });
  if (by.x) results.push(await importX(by.x.map((x) => x.path), data));
  if (by.web) results.push(importWeb(by.web.map((x) => x.path), data));
  const skipped = (by.skipped ?? []).map((x) => ({ file: basename(x.path), why: x.why ?? "not an export Taste reads" }));
  if (!results.length) throw new Error(`nothing to import: ${skipped.map((s) => `${s.file} (${s.why})`).join("; ") || "no files"}`);
  return { results, skipped: skipped.length, skippedFiles: skipped.slice(0, 20) };
}

// ---------- X sync through twitter-cli (its Python has the client; see taste-lab/scripts/sync_bookmarks_readonly.py)
export function twitterPython() {
  const cands = [process.env.TWITTER_CLI_PYTHON, join(homedir(), ".local/share/pipx/venvs/twitter-cli/bin/python"), join(homedir(), ".local/share/uv/tools/twitter-cli/bin/python")];
  return cands.find((p) => p && existsSync(p)) ?? null;
}
async function syncX(maxPages, data) {
  const py = twitterPython(); if (!py) throw new Error("twitter-cli is not installed: pipx install twitter-cli (then log in to x.com in Chrome)");
  const script = join(here, "../../../taste-lab/scripts/sync_bookmarks_readonly.py");
  const out = join(data, "inbox", `x-sync-${new Date().toISOString().replace(/[:.]/g, "-")}`); // fresh dir: a finished checkpoint would exit at once
  const bus = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "bus"); // twitter-cli reads Chrome's cookies through the keyring on the user bus
  execFileSync(py, ["-I", script, "--out", out, "--max-pages", String(maxPages)], { stdio: ["ignore", 2, 2], env: { ...process.env, ...(existsSync(bus) ? { DBUS_SESSION_BUS_ADDRESS: `unix:path=${bus}` } : {}) } });
  const receipt = readJson(join(out, "receipt.json"), {});
  if (!existsSync(join(out, "bookmarks.json"))) throw new Error(`X sync stopped before any page (${receipt.stop_reason ?? "no receipt"}${receipt.error_class ? `: ${receipt.error_class}` : ""}); is x.com logged in in Chrome?`);
  return { ...(await importX([join(out, "bookmarks.json")], data)), pages: receipt.pages, stop: receipt.stop_reason };
}

// ---------- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2), print = (v) => console.log(JSON.stringify(v, null, 1));
  try {
    if (cmd === "status" || !cmd) print(status());
    else if (cmd === "add" && rest.length) print(await add(rest));
    else if (cmd === "github" && /^[A-Za-z0-9-]{1,39}$/.test(rest[0] ?? "")) print({ results: [{ kind: "github", ...node("history.mjs", ["--github", rest[0]]) }] });
    else if (cmd === "x") print({ results: [await syncX(+(rest[rest.indexOf("--max-pages") + 1] || 100), dataDir())] });
    else { console.error("usage: onboard.mjs status | add <file|folder|zip>... | github <user> | x [--max-pages N]"); process.exit(2); }
  } catch (e) { console.error(`onboard: ${e.message}`); process.exit(1); }
}
