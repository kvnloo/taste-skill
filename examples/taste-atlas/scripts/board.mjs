#!/usr/bin/env node
// Taste board: a temporary live page for brainstorming a design with an agent while you talk.
// The agent writes to the board with this CLI; the page updates within a second (server-sent events);
// what you like/nope/pin on the page comes back through `status`. Node 22+, no dependencies.
//   board.mjs start ["title"] [--goal "..."]      new session; starts the server if needed; prints {id,url}
//   board.mjs say <id> "<text>" [--owner]         a note on the timeline (agent's by default)
//   board.mjs push <id> '<json>'|-                merge {title,goal,techniques:[ids],palette:[hex],type:[font],refs:[..],notes:[..]}
//   board.mjs ref <id> <url...> [--note "why"]    add references; title and picture resolved from the page
//   board.mjs search <id> "<query>"|"*" [--from mine,portfolio,dribbble,behance,mobbin,web] [--n 6]
//     mine = your X bookmarks + everything below; portfolio = only your own apps, sites, films, repos; "*" = all of them
//   board.mjs techniques <id> <ids...>|"<request>"   attach atlas techniques (ids, or best matches for a request)
//   board.mjs preview <id> <file.html|dir>        show the design being built; the page reloads it on change
//   board.mjs design <id>                         kept refs + direction -> editable .fig (OpenPencil/Figma) + PNG, link to edit
//   board.mjs focus <id> <refIds...>|clear [--why] show only a shortlist (what a spoken filter becomes)
//   board.mjs compare <id> <a> <b>|clear [--why]  two refs side by side; the owner picks one (keys 1 / 2)
//   board.mjs image <id> <file> [--title] [--note] [--from a,b] [--same-round]   add a generated picture (a direction) in a round
//   board.mjs status <id>                         the board plus the owner's picks (JSON)
//   board.mjs canvas <id> [--ink]                 canvas URL + shape counts; writes <id>.excalidraw/.canvas; --ink opens Inkboard
//   board.mjs export <id> --format excalidraw|canvas   the canvas to stdout (.excalidraw with pictures, or JSON Canvas)
//   board.mjs import <id> <file.excalidraw|.canvas>    replace the canvas with a file edited in Inkboard/Obsidian/excalidraw.com
//   Canvas page /s/<id>/canvas: Excalidraw in the browser, or Ink (Inkboard desktop) via those files. Build once:
//   npm --prefix canvas ci && npm --prefix canvas run build (see canvas/README.md).
// The page's talk bar (typed or dictated) goes to a Hermes session over ACP that drives these commands: see agent.mjs.
//   board.mjs list | stop | serve [--port 8789]
//   The atlas links a post to a Work node with POST /api/work-links {item, node, op: add|remove} ($ATLAS_DATA/work-links.json).
// Sessions: $TASTE_BOARD_HOME (default ~/.cache/taste-board/<id>/), pruned after 7 days idle.
// Server: 127.0.0.1:$TASTE_BOARD_PORT (8789). $TASTE_BOARD_URL = the address to print instead (e.g. a tailnet URL).
// Public search: Exa's keyless MCP (https://mcp.exa.ai/mcp, override $TASTE_SEARCH_MCP); pictures from the page's
// og:image, else the r.jina.ai reader ($TASTE_READER). Your own references: $ATLAS_DATA/{bookmarks,sources}.atlas.json.
// In a Tern pane ($TERN_PANE) `start` docks the board beside the chat as a browser block.
// reuse-checked: scripts/atlas.mjs -- taxonomy CLI (reused via src/brief.js); sources.mjs -- builds atlas data offline.
import { createServer } from "node:http";
import { spawn, execFile, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, cpSync, renameSync, watch, appendFileSync, openSync, copyFileSync } from "node:fs";
import { dirname, join, extname, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { suggest, techById, techniqueRecord } from "../src/brief.js";
import { localImage } from "./design.mjs";
import { plan, picksFromScene, toJsonCanvas, parseImport, rehydrate, excalidrawFile } from "../src/canvasfmt.js";

const here = dirname(fileURLToPath(import.meta.url)), app = join(here, "..");
const HOME = process.env.TASTE_BOARD_HOME ?? join(homedir(), ".cache/taste-board");
const PORT = +(process.env.TASTE_BOARD_PORT ?? 8789), LOCAL = `http://127.0.0.1:${PORT}`;
const BASE = (process.env.TASTE_BOARD_URL ?? LOCAL).replace(/\/$/, "");
const DATA = process.env.ATLAS_DATA ?? join(app, "data");
const MCP = process.env.TASTE_SEARCH_MCP ?? "https://mcp.exa.ai/mcp", READER = process.env.TASTE_READER ?? "https://r.jina.ai/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36";
const SITES = { dribbble: "dribbble.com/shots", behance: "behance.net/gallery", mobbin: "mobbin.com", web: "" };
const IDLE_DAYS = 7;
// Self-hosted OpenPencil web editor; it fetches /s/<id>/design/<id>.fig cross-origin (https only), so the .fig gets CORS for it.
const PENCIL = (process.env.TASTE_PENCIL_URL ?? "").replace(/\/$/, "");

const argv = process.argv.slice(2), [cmd, ...rest] = argv;
const opt = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : null), has = (f) => rest.includes(f);
const BOOL = ["--owner", "--no-pane", "--ink"];
const pos = rest.filter((a, i) => !a.startsWith("--") && !(rest[i - 1]?.startsWith("--") && !BOOL.includes(rest[i - 1])));
const out = (v) => process.stdout.write((typeof v === "string" ? v : JSON.stringify(v, null, 2)) + "\n");
const die = (m) => { process.stderr.write(`board: ${m}\n`); process.exit(2); };
const dir = (id) => { if (!/^[a-z0-9-]{4,40}$/.test(id ?? "")) die(`bad session id: ${id}`); const d = join(HOME, id); if (!existsSync(join(d, "board.json"))) die(`no session ${id} (board.mjs list)`); return d; };
const read = (d) => JSON.parse(readFileSync(join(d, "board.json"), "utf8"));
const picks = (d) => (existsSync(join(d, "picks.jsonl")) ? readFileSync(join(d, "picks.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
function write(d, b) { b.updated = Date.now(); const f = join(d, "board.json"); writeFileSync(f + ".tmp", JSON.stringify(b, null, 1)); renameSync(f + ".tmp", f); }
const now = () => Date.now(), slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
// og:title / <title> / search titles arrive HTML-escaped ("Examples &amp; UI"); the page escapes again on render.
const unescape = (t) => String(t ?? "").replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g, (_, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", apos: "'", nbsp: " " })[k]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sourceOf = (u) => { const h = host(u); return h.includes("dribbble") ? "dribbble" : h.includes("behance") ? "behance" : h.includes("mobbin") ? "mobbin" : /^(x|twitter)\.com$/.test(h) ? "x" : "web"; };

// ---------- references
async function get(url, init = {}, ms = 15000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "user-agent": UA, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
const meta = (html, k) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)`, "i"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["']`, "i"))?.[1];
const STRONG_IMG = [/cdn\.dribbble\.com\/userupload/i, /mir-s3-cdn-cf\.behance\.net\/project_modules/i, /mobbin\.com\/.*screens|bytescale/i, /mir-s3-cdn-cf\.behance\.net\/projects/i];
const GOOD_IMG = /\.(png|jpe?g|webp|gif)(\?|$)/i;
const BAD_IMG = /logo|icon|avatar|favicon|sprite|badge|emoji|placeholder|og_image\.png|hero-app-icons|\/assets\/announcements/i;
// Reader markdown lists site chrome first (Dribbble's announcement tag, avatars); prefer the work itself, at a usable size.
const bestImage = (urls) => {
  const ok = urls.filter((u) => !BAD_IMG.test(u));
  let u = null; for (const re of STRONG_IMG) if ((u = ok.find((x) => re.test(x)))) break;
  u ??= ok.find((x) => GOOD_IMG.test(x));
  return u ? (u.includes("cdn.dribbble.com/userupload") ? u.split("?")[0] + "?resize=1024x768" : u) : null;
};

/** {url,title,image,text,source}; never throws: a reference with no picture still links out. */
async function resolveRef(url, note) {
  const ref = { id: randomBytes(4).toString("hex"), url, title: host(url), image: null, text: note ?? "", source: sourceOf(url), t: now() };
  const x = url.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/);
  try {
    if (x) {
      const t = (await (await get(`https://api.fxtwitter.com/${x[1]}/status/${x[2]}`)).json()).tweet, m = t.media?.all?.[0];
      return { ...ref, title: `@${t.author.screen_name}`, text: note ?? t.text?.slice(0, 280), image: m?.thumbnail_url ?? (m?.type === "photo" ? m.url : null), video: m?.type === "video" || m?.type === "gif" ? m.url : undefined };
    }
    const html = await (await get(url)).text();
    ref.title = (meta(html, "og:title") ?? html.match(/<title>([^<]+)/i)?.[1] ?? ref.title).trim().slice(0, 140);
    ref.text ||= (meta(html, "og:description") ?? "").slice(0, 280);
    const og = meta(html, "og:image"); if (og && !BAD_IMG.test(og)) ref.image = new URL(og, url).href;
  } catch { /* bot walls (Dribbble 202, Behance 403): fall through to the reader */ }
  if (!ref.image) try {
    const md = await (await get(READER + url, { headers: { "x-return-format": "markdown" } }, 25000)).text();
    ref.title = ref.title === host(url) ? (md.match(/^Title: (.+)$/m)?.[1] ?? ref.title).slice(0, 140) : ref.title;
    ref.image = bestImage([...md.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]));
  } catch (e) { process.stderr.write(`reader: ${e.message}\n`); }
  ref.title = unescape(ref.title); ref.text = unescape(ref.text);
  return ref;
}

async function exa(query, n) {
  const r = await get(MCP, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "web_search_exa", arguments: { query, numResults: n } } }) }, 30000);
  const body = await r.text(), json = JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? body);
  if (json.error) throw new Error(`exa: ${json.error.message}`);
  const text = json.result.content.map((c) => c.text).join("\n");
  return [...text.matchAll(/Title: (.*)\nURL: (\S+)/g)].map((m) => ({ title: unescape(m[1].trim()), url: m[2] }));
}

function mine(query, n, layers = null) {
  const files = ["bookmarks.atlas.json", "sources.atlas.json", "history.atlas.json"].map((f) => join(DATA, f)).filter(existsSync);
  if (!files.length) throw new Error(`no bookmarks.atlas.json, sources.atlas.json or history.atlas.json in ${DATA} (set $ATLAS_DATA)`);
  const rows = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")).items).filter((b) => !layers || layers.includes(b.layer));
  const words = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);
  const techs = new Set(suggest(query, 3).map((t) => t.id)), all = query.trim() === "*";
  const rank = { portfolio: 0.3, project: 0.2, film: 0.1 };  // when scores tie, your own shipped work first
  return rows.map((b) => {
    const hay = `${b.text ?? ""} ${b.post ?? ""} ${b.seen ?? ""} ${b.title ?? ""} ${b.author ?? ""} ${b.cat ?? ""}`.toLowerCase();
    return { b, s: (rank[b.layer] ?? 0) + (all ? 1 + (b.thumb ? 0.1 : 0) : words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) + (techs.has(b.technique) ? 0.5 : 0) + (b.thumb ? 0.1 : 0)) };
  }).filter((r) => r.s >= 1).sort((a, b) => b.s - a.s).slice(0, n).map(({ b }) => ({
    id: randomBytes(4).toString("hex"), url: b.url, title: b.title ?? `@${b.author}`, text: (b.layer === "ask" ? `You asked: ${b.text}` : b.seen ?? b.text ?? "").slice(0, 280),
    image: b.thumb ? `/data/${b.thumb}` : null, video: b.video, source: b.layer ? `mine:${b.layer}` : "mine", technique: b.technique, t: now(),
  }));
}

async function pool(items, k, fn) { const res = []; let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const j = i++; res[j] = await fn(items[j]); } })); return res; }

function addRefs(d, refs) {
  const b = read(d), seen = new Set(b.refs.map((r) => r.url));
  const fresh = refs.filter((r) => r && r.url && !seen.has(r.url));
  b.refs.push(...fresh); write(d, b); return fresh;
}

// ---------- canvas: one Excalidraw scene per board (canvas.excalidraw) plus its pictures (canvas-files/); src/canvasfmt.js
const CANVAS = "canvas.excalidraw", CFILES = "canvas-files";
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
const verdictMap = (d) => { const m = new Map(); for (const p of picks(d)) if (p.ref) m.set(p.ref, p.verdict); return m; };
/** The saved scene plus whatever the board gained since (agent refs, notes, swatches), placed without moving anything. */
function scene(d) {
  const f = join(d, CANVAS), s = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { elements: [], appState: {} };
  const add = plan(read(d), verdictMap(d), s.elements);
  return { elements: [...s.elements, ...add], appState: s.appState ?? {}, added: add.length };
}
/** Save the scene; refs dragged into Kept / Noped / back to Inspo become picks, so `status` and the board page agree. */
function saveScene(d, elements, appState = {}) {
  if (!Array.isArray(elements) || elements.some((e) => typeof e?.id !== "string" || typeof e?.type !== "string")) throw new Error("elements must be an array of {id,type,...}");
  const f = join(d, CANVAS), before = scene(d).elements;
  writeFileSync(f + ".tmp", JSON.stringify({ elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } })); renameSync(f + ".tmp", f);
  const ps = picksFromScene(elements, verdictMap(d), before);
  for (const p of ps) appendFileSync(join(d, "picks.jsonl"), JSON.stringify({ ref: p.ref, verdict: p.verdict, via: "canvas", t: now() }) + "\n");
  return ps;
}
const canvasFiles = (d) => { const c = join(d, CFILES); return existsSync(c) ? Object.fromEntries(readdirSync(c).filter((f) => f.endsWith(".json")).map((f) => { const j = JSON.parse(readFileSync(join(c, f), "utf8")); return [j.id, j]; })) : {}; };
function saveFile(d, f) {
  if (!/^[\w-]{1,80}$/.test(f?.id ?? "") || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(f?.dataURL ?? "")) throw new Error("bad file: needs {id, dataURL: data:image/...;base64,...}");
  const c = join(d, CFILES), p = join(c, `${f.id}.json`); mkdirSync(c, { recursive: true });
  if (!existsSync(p)) writeFileSync(p, JSON.stringify({ id: f.id, mimeType: f.dataURL.slice(5, f.dataURL.indexOf(";")), dataURL: f.dataURL, created: now() }));
}
/** A board ref's picture as bytes: local atlas/board files first, else the remote URL (only refs on this board). */
async function refImage(d, refId) {
  const ref = read(d).refs.find((r) => r.id === refId); if (!ref?.image) return null;
  const loc = localImage(ref.image, { app, data: DATA, boards: HOME });
  if (loc) return { mime: MIME[extname(loc).toLowerCase()] ?? "image/jpeg", buf: readFileSync(loc) };
  const du = String(ref.image).match(/^data:(image\/[\w+.-]+);base64,(.*)$/s); if (du) return { mime: du[1], buf: Buffer.from(du[2], "base64") };
  if (!/^https?:/.test(ref.image)) return null;
  const r = await get(ref.image, {}, 20000), mime = (r.headers.get("content-type") ?? "").split(";")[0];
  return mime.startsWith("image/") ? { mime, buf: Buffer.from(await r.arrayBuffer()) } : null;
}
/** The whole canvas as one .excalidraw (pictures embedded): what Inkboard and excalidraw.com open. */
async function fullExcalidraw(d) {
  const s = scene(d), files = canvasFiles(d);
  await pool(s.elements.filter((e) => e.type === "image" && !e.isDeleted && e.fileId && !files[e.fileId] && e.customData?.ref), 4, async (e) => {
    try { const im = await refImage(d, e.customData.ref); if (im) files[e.fileId] = { id: e.fileId, mimeType: im.mime, dataURL: `data:${im.mime};base64,${im.buf.toString("base64")}`, created: now() }; } catch { /* a ref whose picture is gone stays a placeholder */ }
  });
  return excalidrawFile(s.elements.map((e) => (e.type === "image" && files[e.fileId] ? { ...e, status: "saved" } : e)), files, s.appState);
}
function importInto(d, raw) {
  const p = parseImport(raw), files = p.files, elements = rehydrate(p.elements, read(d));
  for (const f of Object.values(files)) try { saveFile(d, f); } catch { /* skip non-image files */ }
  return { elements: elements.length, picks: saveScene(d, elements) };
}

// ---------- server
function serve() {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".mp4": "video/mp4", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
  const file = (res, f, extra = {}) => {
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream", "cache-control": "no-store", ...extra }).end(readFileSync(f));
  };
  const inside = (root, p) => { const f = resolve(root, "." + decodeURIComponent(p)); return f.startsWith(resolve(root) + "/") || f === resolve(root) ? f : null; };
  createServer((req, res) => {
    const u = new URL(req.url, LOCAL), m = u.pathname.match(/^\/s\/([a-z0-9-]{4,40})(\/.*)?$/);
    // One app: atlas (/), library (/library) and boards (/boards, /s/<id>/) share this origin, nav and theme.
    if (u.pathname === "/" || u.pathname === "/library") return file(res, join(app, "index.html"));
    if (u.pathname === "/boards") return file(res, join(app, "boards.html"));
    if (u.pathname === "/history") return file(res, join(app, "history.html"));
    if (u.pathname === "/network") return file(res, join(app, "network.html"));
    if (u.pathname === "/api/boards") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(boardList())); return; }
    if (u.pathname === "/api/work-links" && req.method === "POST") {  // atlas: link a post to a work node, or unlink it
      let body = ""; req.on("data", (c) => { body += c; if (body.length > 2048) req.destroy(); });
      req.on("end", () => {
        try {
          const { item, node, op = "add" } = JSON.parse(body);
          if (typeof item !== "string" || !/^[\w:.-]{1,120}$/.test(item) || typeof node !== "string" || !/^[a-z0-9-]{1,40}(\/[a-z0-9-]{1,40})?$/.test(node) || !["add", "remove"].includes(op)) throw new Error("bad link");
          const f = join(DATA, "work-links.json"), cur = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { kind: "taste-atlas.work-links.v1", links: [] };
          cur.links = cur.links.filter((l) => !(l.item === item && l.node === node));
          if (op === "add") cur.links.push({ item, node, t: now() });
          writeFileSync(f + ".tmp", JSON.stringify(cur, null, 1)); renameSync(f + ".tmp", f);
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(cur));
        } catch (e) { res.writeHead(400).end(e.message); }
      }); return;
    }
    if (u.pathname === "/atlas" || u.pathname === "/atlas/" || u.pathname === "/atlas/index.html") { res.writeHead(301, { location: "/" + u.search }).end(); return; }
    if (u.pathname.startsWith("/atlas/")) { const f = inside(app, u.pathname.slice(6)); return f ? file(res, f) : res.writeHead(403).end(); }
    if (!m) { const f = inside(app, u.pathname); return f && !u.pathname.startsWith("/s/") ? file(res, f) : res.writeHead(404).end("not found"); }
    const d = join(HOME, m[1]), sub = m[2] ?? "/";
    if (!existsSync(join(d, "board.json"))) { res.writeHead(404, { "content-type": "text/plain" }).end(`No board ${m[1]}. Start one: board.mjs start`); return; }
    if (sub === "/") return file(res, join(app, "board.html"));
    if (sub === "/canvas" || sub === "/canvas/") {
      const f = join(app, "canvas/dist/index.html");
      return existsSync(f) ? file(res, f) : res.writeHead(503, { "content-type": "text/plain" }).end(`The canvas isn't built yet. Run once:\n  npm --prefix ${join(app, "canvas")} ci && npm --prefix ${join(app, "canvas")} run build\nMeanwhile: board.mjs canvas ${m[1]} --ink opens it in Inkboard.`);
    }
    if (sub === "/canvas.json" && req.method !== "POST") { const s = scene(d); res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ...s, files: u.searchParams.get("files") === "0" ? {} : canvasFiles(d) })); return; }
    const body = (limit, fn) => { const chunks = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > limit) { res.writeHead(413).end("too large"); req.destroy(); } else chunks.push(c); });
      req.on("end", async () => { if (res.writableEnded) return; try { const r = await fn(Buffer.concat(chunks).toString("utf8")); res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r ?? { ok: true })); } catch (e) { res.writeHead(400).end(e.message); } }); };
    if (sub === "/canvas.json" && req.method === "POST") return body(8 << 20, (t) => { const p = JSON.parse(t); return { picks: saveScene(d, p.elements, p.appState) }; });
    if (sub === "/canvas/file" && req.method === "POST") return body(16 << 20, (t) => { saveFile(d, JSON.parse(t)); });
    if (sub === "/canvas/import" && req.method === "POST") return body(64 << 20, (t) => importInto(d, t));
    if (sub === "/canvas/img") {
      refImage(d, u.searchParams.get("ref") ?? "").then((im) => (im ? res.writeHead(200, { "content-type": im.mime, "cache-control": "max-age=86400" }).end(im.buf) : res.writeHead(404).end("no picture")), (e) => res.writeHead(502).end(e.message));
      return;
    }
    if (sub === "/board.excalidraw") { fullExcalidraw(d).then((x) => res.writeHead(200, { "content-type": "application/json", "content-disposition": `attachment; filename="${m[1]}.excalidraw"` }).end(JSON.stringify(x)), (e) => res.writeHead(500).end(e.message)); return; }
    if (sub === "/board.canvas") { res.writeHead(200, { "content-type": "application/json", "content-disposition": `attachment; filename="${m[1]}.canvas"` }).end(JSON.stringify(toJsonCanvas(scene(d).elements), null, 1)); return; }
    if (sub === "/board.json") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ...read(d), picks: picks(d) })); return; }
    if (sub === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      const ping = () => res.write(`data: ${now()}\n\n`); ping();
      let t; const w = watch(d, { recursive: true }, () => { clearTimeout(t); t = setTimeout(ping, 60); });
      const keep = setInterval(() => res.write(": keep\n\n"), 20000);
      req.on("close", () => { w.close(); clearInterval(keep); }); return;
    }
    if (sub === "/pick" && req.method === "POST") {
      let body = ""; req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", () => {
        try {
          const p = JSON.parse(body), ok = ["like", "nope", "pin", "clear", "note"].includes(p.verdict);
          if (!ok || (p.verdict !== "note" && typeof p.ref !== "string")) throw new Error("bad pick");
          appendFileSync(join(d, "picks.jsonl"), JSON.stringify({ ref: p.ref ?? null, verdict: p.verdict, text: typeof p.text === "string" ? p.text.slice(0, 500) : undefined, t: now() }) + "\n");
          res.writeHead(204).end();
        } catch (e) { res.writeHead(400).end(e.message); }
      }); return;
    }
    if (sub === "/talk" && req.method === "POST") {  // the owner speaks or types to the board's Hermes agent (ACP)
      let body = ""; req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", async () => {
        let text; try { text = String(JSON.parse(body).text ?? "").trim().slice(0, 1000); } catch { return res.writeHead(400).end("bad json"); }
        if (!text) return res.writeHead(400).end("empty");
        appendFileSync(join(d, "picks.jsonl"), JSON.stringify({ ref: null, verdict: "note", text, t: now() }) + "\n");
        const { agentEnabled, talk } = await import("./agent.mjs");
        if (!agentEnabled()) return res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ agent: false }));
        const set = (f) => { const b = read(d); f(b); write(d, b); };
        talk(m[1], text, `${BASE}/s/${m[1]}/`, (e) => {
          if (e.type === "busy") set((b) => { b.agent = { state: "thinking", t: now() }; });
          else if (e.type === "step") set((b) => { b.agent = { ...(b.agent ?? {}), state: "working", step: e.text.slice(0, 160), t: now() }; });
          else set((b) => { b.agent = null; if (e.text) b.notes.push({ who: "agent", text: (e.type === "error" ? `Agent problem: ${e.text}` : e.text).slice(0, 1200), t: now() }); });
        });
        res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ agent: true }));
      }); return;
    }
    if (sub === "/design" && req.method === "POST") {  // "Make design" button: same as `board.mjs design <id>`, in a child process
      const b = read(d); if (b.design?.state === "building") return res.writeHead(409).end("already building");
      b.design = { ...(b.design ?? {}), state: "building" }; write(d, b);
      execFile(process.execPath, [fileURLToPath(import.meta.url), "design", m[1]], { env: process.env, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
        const nb = read(d);
        if (err) { nb.design = { ...(nb.design ?? {}), state: "failed", error: String(stderr || err.message).trim().slice(-400) }; process.stderr.write(`design ${m[1]} failed: ${stderr || err.message}\n`); }
        else nb.design = { ...nb.design, state: "ready" };
        write(d, nb);
      });
      return res.writeHead(202).end();
    }
    if (sub === "/ref" && req.method === "POST") {  // a post sent from the atlas/library lightbox
      let body = ""; req.on("data", (c) => { body += c; if (body.length > 8192) req.destroy(); });
      req.on("end", () => {
        try {
          const r = JSON.parse(body), url = new URL(r.url);
          if (!/^https?:$/.test(url.protocol)) throw new Error("ref url must be http(s)");
          const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
          const fresh = addRefs(d, [{ id: randomBytes(4).toString("hex"), url: url.href, title: str(r.title, 200) ?? url.hostname, text: str(r.text, 280) ?? "", image: str(r.image, 500) ?? null, video: str(r.video, 500), source: str(r.source, 40) ?? "mine", technique: str(r.technique, 60), t: now() }]);
          res.writeHead(fresh.length ? 201 : 200, { "content-type": "application/json" }).end(JSON.stringify({ added: fresh.length }));
        } catch (e) { res.writeHead(400).end(e.message); }
      }); return;
    }
    if (sub.startsWith("/design/")) {
      const f = inside(join(d, "design"), sub.slice(7));
      if (!f || /\/\.work(\/|$)/.test(f)) return res.writeHead(403).end();
      const cors = PENCIL ? { "access-control-allow-origin": new URL(PENCIL).origin, vary: "origin" } : {};
      return file(res, f, f.endsWith(".fig") ? { ...cors, "content-disposition": `inline; filename="${basename(f)}"` } : cors);
    }
    if (sub.startsWith("/variants/")) { const f = inside(join(d, "variants"), sub.slice(9)); return f ? file(res, f) : res.writeHead(403).end(); }
    if (sub.startsWith("/preview/")) { const f = inside(join(d, "preview"), sub.slice(8)); return f ? file(res, f.endsWith("/") || !extname(f) ? join(f, "index.html") : f, { "content-security-policy": "frame-ancestors 'self'" }) : res.writeHead(403).end(); }
    res.writeHead(404).end("not found");
  }).listen(PORT, "127.0.0.1", () => { mkdirSync(HOME, { recursive: true }); writeFileSync(join(HOME, "server.pid"), String(process.pid)); process.stderr.write(`taste board on ${LOCAL}\n`); });
}

const sessions = () => (existsSync(HOME) ? readdirSync(HOME).filter((s) => existsSync(join(HOME, s, "board.json"))) : []);
function boardList() {
  return sessions().map((id) => {
    const d = join(HOME, id), b = read(d), v = new Map(picks(d).filter((p) => p.ref).map((p) => [p.ref, p.verdict]));
    const kept = b.refs.filter((r) => ["like", "pin"].includes(v.get(r.id)));
    const images = [...kept, ...b.refs.filter((r) => !kept.includes(r))].map((r) => r.image).filter(Boolean).slice(0, 6);
    return { id, title: b.title, goal: b.goal, refs: b.refs.length, kept: kept.length, notes: b.notes.length + picks(d).filter((p) => p.verdict === "note").length, preview: b.preview?.rev ?? 0, images, updated: Math.max(statSync(join(d, "board.json")).mtimeMs, existsSync(join(d, "picks.jsonl")) ? statSync(join(d, "picks.jsonl")).mtimeMs : 0) };
  }).sort((a, b) => b.updated - a.updated);
}
const latest = () => sessions().sort((a, b) => statSync(join(HOME, b, "board.json")).mtimeMs - statSync(join(HOME, a, "board.json")).mtimeMs)[0];
async function up() { try { return (await fetch(LOCAL + "/s/x/", { signal: AbortSignal.timeout(1500) })).status > 0; } catch { return false; } }

async function ensureServer() {
  if (await up()) return;
  mkdirSync(HOME, { recursive: true });
  const log = openSync(join(HOME, "server.log"), "a");
  spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], { detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) die(`server did not start; see ${join(HOME, "server.log")}`);
}

function ternPane(url) {
  if (!process.env.TERN_PANE || has("--no-pane")) return null;
  try {
    const r = JSON.parse(execFileSync("tern", ["browser", JSON.stringify({ op: "open", owner: +process.env.TERN_PANE, url, how: "beside" }), "--timeout", "15"], { encoding: "utf8", timeout: 20000 }));
    return r.ok ?? r;
  } catch (e) { process.stderr.write(`tern pane: ${(e.stdout || e.message).toString().trim().slice(0, 300)}\n`); return null; }
}

// ---------- commands
switch (cmd) {
  case "serve": serve(); break;
  case "start": {
    mkdirSync(HOME, { recursive: true });
    for (const s of sessions()) if (now() - statSync(join(HOME, s, "board.json")).mtimeMs > IDLE_DAYS * 864e5) rmSync(join(HOME, s), { recursive: true, force: true });
    const title = pos[0] ?? "Untitled brainstorm", id = `${slug(title) || "board"}-${randomBytes(2).toString("hex")}`, d = join(HOME, id);
    mkdirSync(join(d, "preview"), { recursive: true });
    write(d, { kind: "taste-board.v1", id, title, goal: opt("--goal") ?? "", created: now(), notes: [], refs: [], techniques: [], palette: [], type: [], preview: null });
    await ensureServer();
    const url = `${BASE}/s/${id}/`;
    out({ id, url, local: `${LOCAL}/s/${id}/`, tern: ternPane(`${LOCAL}/s/${id}/`), dir: d });
    break;
  }
  case "say": {
    const d = dir(pos[0]), text = pos.slice(1).join(" "); if (!text) die("say needs text");
    const b = read(d); b.notes.push({ who: has("--owner") ? "owner" : "agent", text: text.slice(0, 1200), t: now() }); write(d, b); out({ ok: true, notes: b.notes.length }); break;
  }
  case "push": {
    const d = dir(pos[0]), raw = pos[1] === "-" || !pos[1] ? readFileSync(0, "utf8") : pos[1];
    let p; try { p = JSON.parse(raw); } catch (e) { die(`push needs JSON: ${e.message}`); }
    const b = read(d);
    for (const k of ["title", "goal"]) if (typeof p[k] === "string") b[k] = p[k];
    for (const k of ["palette", "type"]) if (Array.isArray(p[k])) b[k] = p[k].map(String).slice(0, 12);
    if (Array.isArray(p.techniques)) b.techniques = p.techniques.filter((t) => techById.has(t)).slice(0, 6);
    if (Array.isArray(p.notes)) b.notes.push(...p.notes.map((n) => ({ who: n.who === "owner" ? "owner" : "agent", text: String(n.text ?? n).slice(0, 1200), t: now() })));
    write(d, b);
    if (Array.isArray(p.refs)) addRefs(d, p.refs.map((r) => ({ id: randomBytes(4).toString("hex"), source: sourceOf(r.url), t: now(), title: host(r.url), ...r })));
    out({ ok: true }); break;
  }
  case "ref": {
    const d = dir(pos[0]), urls = pos.slice(1).filter((u) => /^https?:\/\//.test(u)); if (!urls.length) die("ref needs URLs");
    const got = addRefs(d, await pool(urls, 4, (u) => resolveRef(u, opt("--note"))));
    out(got.map((r) => ({ url: r.url, title: r.title, image: !!r.image }))); break;
  }
  case "search": {
    const d = dir(pos[0]), q = pos.slice(1).join(" "), n = +(opt("--n") ?? 6); if (!q) die("search needs a query");
    const from = (opt("--from") ?? "mine,dribbble,behance").split(","), found = [], errors = [];
    for (const f of from) {
      if (f === "mine" || f === "portfolio") { try { found.push(...mine(q, n, f === "portfolio" ? ["portfolio", "film", "project", "idea"] : null)); } catch (e) { errors.push(`${f}: ${e.message}`); } continue; }
      if (!(f in SITES)) { errors.push(`unknown source ${f}`); continue; }
      try {
        const hits = await exa(SITES[f] ? `site:${SITES[f]} ${q}` : `${q} design inspiration`, n);
        found.push(...await pool(hits.filter((h) => !SITES[f] || h.url.includes(SITES[f].split("/")[0])).slice(0, n), 4, (h) => resolveRef(h.url).then((r) => ({ ...r, title: r.title === host(h.url) ? h.title : r.title, source: f, query: q }))));
      } catch (e) { errors.push(`${f}: ${e.message}`); }
    }
    const got = addRefs(d, found);
    out({ added: got.length, by_source: got.reduce((a, r) => ({ ...a, [r.source]: (a[r.source] ?? 0) + 1 }), {}), without_picture: got.filter((r) => !r.image).length, errors });
    if (errors.length && !got.length) process.exit(1);
    break;
  }
  case "techniques": {
    const d = dir(pos[0]), args = pos.slice(1); if (!args.length) die("techniques needs ids or a request");
    const ids = args.every((a) => techById.has(a)) ? args : suggest(args.join(" "), 3).map((t) => t.id);
    const b = read(d); b.techniques = [...new Set([...b.techniques, ...ids])].slice(-6); write(d, b);
    out(ids.map((i) => techniqueRecord(techById.get(i)))); break;
  }
  case "preview": {
    const d = dir(pos[0]), src = pos[1]; if (!src || !existsSync(src)) die("preview needs an existing .html file or folder");
    const dest = join(d, "preview"); rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
    if (statSync(src).isDirectory()) cpSync(src, dest, { recursive: true }); else cpSync(src, join(dest, "index.html"));
    const b = read(d); b.preview = { rev: (b.preview?.rev ?? 0) + 1, from: basename(resolve(src)) }; write(d, b);
    out({ ok: true, rev: b.preview.rev, url: `${BASE}/s/${b.id}/preview/` }); break;
  }
  case "design": {  // board -> editable OpenPencil/Figma .fig + PNG; opens in the self-hosted editor ($TASTE_PENCIL_URL)
    const d = dir(pos[0]), b = read(d), v = new Map(); for (const x of picks(d)) if (x.ref) v.set(x.ref, x.verdict);
    b.ownerNotes = picks(d).filter((x) => x.verdict === "note").map((x) => x.text);
    const { buildDesign } = await import("./design.mjs");
    const r = await buildDesign({ d, board: b, verdicts: v, app, data: DATA });
    const fig = `${BASE}/s/${b.id}/design/${basename(r.fig)}`;
    const nb = read(d); nb.design = { state: "ready", rev: (nb.design?.rev ?? 0) + 1, fig: basename(r.fig), cards: r.cards, edit: PENCIL ? `${PENCIL}/?file=${encodeURIComponent(fig)}` : null, t: now() }; write(d, nb);
    out({ ok: true, rev: nb.design.rev, cards: r.cards, missing_pictures: r.missing, fig, png: `${BASE}/s/${b.id}/design/board.png`, edit: PENCIL ? `${PENCIL}/?file=${encodeURIComponent(fig)}` : null, local: r.fig });
    break;
  }
  case "image": {  // add a picture the agent generated (a design direction or a merge) as a ref in a numbered round
    const d = dir(pos[0]), b = read(d), src = pos[1];
    if (!src || !existsSync(src)) die(`image needs a local picture file (got ${src})`);
    if (!/\.(png|jpe?g|webp)$/i.test(src)) die("image must be .png, .jpg or .webp");
    const round = +(opt("--round") ?? 0) || (b.round ?? 0) + (has("--same-round") ? 0 : 1) || 1;
    const from = (opt("--from") ?? "").split(",").filter(Boolean), known = new Set(b.refs.map((r) => r.id));
    const bad = from.filter((i) => !known.has(i)); if (bad.length) die(`unknown --from ref ids: ${bad.join(" ")}`);
    mkdirSync(join(d, "variants"), { recursive: true });
    const k = b.refs.filter((r) => r.source === "variant" && r.round === round).length + 1, name = `r${round}-${k}${extname(src).toLowerCase()}`;
    copyFileSync(src, join(d, "variants", name));
    const ref = { id: randomBytes(4).toString("hex"), url: `${BASE}/s/${b.id}/variants/${name}`, image: `/s/${b.id}/variants/${name}`, title: opt("--title") ?? `Round ${round} · ${String.fromCharCode(64 + k)}`,
      text: (opt("--note") ?? "").slice(0, 280), source: "variant", round, from, t: now() };
    b.refs.push(ref); b.round = Math.max(b.round ?? 0, round); write(d, b); out({ ok: true, ref }); break;
  }
  case "focus": case "compare": {  // narrow the wall to a shortlist, or put two refs side by side for the owner to choose
    const d = dir(pos[0]), b = read(d), ids = pos.slice(1);
    if (ids[0] === "clear") { delete b[cmd]; write(d, b); out({ ok: true, [cmd]: null }); break; }
    const known = new Set(b.refs.map((r) => r.id)), bad = ids.filter((i) => !known.has(i));
    if (bad.length) die(`unknown ref ids: ${bad.join(" ")} (board.mjs status ${b.id})`);
    if (cmd === "compare" && ids.length !== 2) die("compare needs exactly two ref ids");
    if (!ids.length) die(`${cmd} needs ref ids, or clear`);
    b[cmd] = { ids, why: opt("--why") ?? "", t: now() }; write(d, b); out({ ok: true, [cmd]: b[cmd] }); break;
  }
  case "status": {
    const d = dir(pos[0]), b = read(d), p = picks(d), last = new Map();
    for (const x of p) if (x.ref) last.set(x.ref, x.verdict);
    const byRef = (v) => b.refs.filter((r) => last.get(r.id) === v).map((r) => ({ id: r.id, url: r.url, title: r.title, source: r.source }));
    out({ id: b.id, title: b.title, goal: b.goal, url: `${BASE}/s/${b.id}/`, techniques: b.techniques, palette: b.palette, type: b.type, refs: b.refs.length,
      liked: byRef("like"), pinned: byRef("pin"), noped: byRef("nope"), focus: b.focus ?? null, compare: b.compare ?? null, design: b.design ?? null,
      all: b.refs.map((r) => ({ id: r.id, title: String(r.title).slice(0, 90), source: r.source, round: r.round, technique: r.technique ?? null, text: r.text ? String(r.text).slice(0, 120) : undefined, verdict: last.get(r.id) ?? null, file: localImage(r.image, { app, data: DATA, boards: HOME }) ?? (/^https?:/.test(r.image ?? "") ? r.image : null) })), owner_notes: p.filter((x) => x.verdict === "note").map((x) => x.text), preview: b.preview }); break;
  }
  case "canvas": {  // the canvas URL and counts; writes both Ink files; --ink opens the .excalidraw in Inkboard ($TASTE_INK or inkboard on PATH)
    const d = dir(pos[0]), b = read(d), s = scene(d), x = join(d, "export"); mkdirSync(x, { recursive: true });
    const ex = join(x, `${b.id}.excalidraw`), cv = join(x, `${b.id}.canvas`);
    writeFileSync(ex, JSON.stringify(await fullExcalidraw(d))); writeFileSync(cv, JSON.stringify(toJsonCanvas(s.elements), null, 1));
    const live = s.elements.filter((e) => !e.isDeleted), count = (f) => live.filter(f).length;
    let ink = null;
    if (has("--ink")) {
      const bin = process.env.TASTE_INK ?? ["inkboard", "Inkboard"].find((n) => { try { execFileSync("sh", ["-c", `command -v ${n}`], { stdio: "ignore" }); return true; } catch { return false; } });
      if (bin) { spawn(bin, [ex], { detached: true, stdio: "ignore" }).unref(); ink = { opened: ex, with: bin }; }
      else ink = { opened: null, why: "Inkboard not found: install it (https://github.com/VictorLetirand/inkboard/releases) or set $TASTE_INK", file: ex };
    }
    out({ url: `${BASE}/s/${b.id}/canvas`, engines: { excalidraw: `${BASE}/s/${b.id}/canvas?engine=excalidraw`, ink: `${BASE}/s/${b.id}/canvas?engine=ink` },
      shapes: { total: live.length, frames: count((e) => e.type === "frame"), refs: count((e) => e.customData?.ref), notes: count((e) => e.customData?.note !== undefined), swatches: count((e) => e.customData?.swatch) }, new_since_save: s.added, excalidraw: ex, canvas: cv, ink });
    break;
  }
  case "export": {
    const d = dir(pos[0]), f = opt("--format") ?? "excalidraw";
    if (f === "excalidraw") out(JSON.stringify(await fullExcalidraw(d))); else if (f === "canvas") out(toJsonCanvas(scene(d).elements)); else die("--format is excalidraw or canvas");
    break;
  }
  case "import": {
    const d = dir(pos[0]), f = pos[1]; if (!f || !existsSync(f)) die("import needs a .excalidraw or .canvas file");
    let r; try { r = importInto(d, readFileSync(f, "utf8")); } catch (e) { die(`import: ${e.message}`); }
    out({ ok: true, ...r }); break;
  }
  case "list": out(sessions().map((s) => { const b = read(join(HOME, s)); return { id: s, title: b.title, refs: b.refs.length, updated: new Date(b.updated).toISOString(), url: `${BASE}/s/${s}/` }; })); break;
  case "stop": {  // only this $TASTE_BOARD_HOME's server; a pattern kill would also take down other boards (e.g. the systemd one)
    const f = join(HOME, "server.pid"), pid = existsSync(f) ? +readFileSync(f, "utf8") : 0;
    try { if (!pid) throw 0; process.kill(pid); rmSync(f, { force: true }); out({ stopped: true, pid }); } catch { out({ stopped: false }); } break;
  }
  default: die(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
