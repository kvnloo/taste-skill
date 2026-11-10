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
//   board.mjs status <id>                         the board plus the owner's picks (JSON)
//   board.mjs list | stop | serve [--port 8789]
// Sessions: $TASTE_BOARD_HOME (default ~/.cache/taste-board/<id>/), pruned after 7 days idle.
// Server: 127.0.0.1:$TASTE_BOARD_PORT (8789). $TASTE_BOARD_URL = the address to print instead (e.g. a tailnet URL).
// Public search: Exa's keyless MCP (https://mcp.exa.ai/mcp, override $TASTE_SEARCH_MCP); pictures from the page's
// og:image, else the r.jina.ai reader ($TASTE_READER). Your own references: $ATLAS_DATA/{bookmarks,sources}.atlas.json.
// In a Tern pane ($TERN_PANE) `start` docks the board beside the chat as a browser block.
// reuse-checked: scripts/atlas.mjs -- taxonomy CLI (reused via src/brief.js); sources.mjs -- builds atlas data offline.
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, cpSync, renameSync, watch, appendFileSync, openSync } from "node:fs";
import { dirname, join, extname, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { suggest, techById, techniqueRecord } from "../src/brief.js";

const here = dirname(fileURLToPath(import.meta.url)), app = join(here, "..");
const HOME = process.env.TASTE_BOARD_HOME ?? join(homedir(), ".cache/taste-board");
const PORT = +(process.env.TASTE_BOARD_PORT ?? 8789), LOCAL = `http://127.0.0.1:${PORT}`;
const BASE = (process.env.TASTE_BOARD_URL ?? LOCAL).replace(/\/$/, "");
const DATA = process.env.ATLAS_DATA ?? join(app, "data");
const MCP = process.env.TASTE_SEARCH_MCP ?? "https://mcp.exa.ai/mcp", READER = process.env.TASTE_READER ?? "https://r.jina.ai/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36";
const SITES = { dribbble: "dribbble.com/shots", behance: "behance.net/gallery", mobbin: "mobbin.com", web: "" };
const IDLE_DAYS = 7;

const argv = process.argv.slice(2), [cmd, ...rest] = argv;
const opt = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : null), has = (f) => rest.includes(f);
const BOOL = ["--owner", "--no-pane"];
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

// ---------- server
function serve() {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".mp4": "video/mp4" };
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
    if (u.pathname === "/api/boards") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(boardList())); return; }
    if (u.pathname === "/atlas" || u.pathname === "/atlas/" || u.pathname === "/atlas/index.html") { res.writeHead(301, { location: "/" + u.search }).end(); return; }
    if (u.pathname.startsWith("/atlas/")) { const f = inside(app, u.pathname.slice(6)); return f ? file(res, f) : res.writeHead(403).end(); }
    if (!m) { const f = inside(app, u.pathname); return f && !u.pathname.startsWith("/s/") ? file(res, f) : res.writeHead(404).end("not found"); }
    const d = join(HOME, m[1]), sub = m[2] ?? "/";
    if (!existsSync(join(d, "board.json"))) { res.writeHead(404, { "content-type": "text/plain" }).end(`No board ${m[1]}. Start one: board.mjs start`); return; }
    if (sub === "/") return file(res, join(app, "board.html"));
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
    if (sub.startsWith("/preview/")) { const f = inside(join(d, "preview"), sub.slice(8)); return f ? file(res, f.endsWith("/") || !extname(f) ? join(f, "index.html") : f, { "content-security-policy": "frame-ancestors 'self'" }) : res.writeHead(403).end(); }
    res.writeHead(404).end("not found");
  }).listen(PORT, "127.0.0.1", () => process.stderr.write(`taste board on ${LOCAL}\n`));
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
  case "status": {
    const d = dir(pos[0]), b = read(d), p = picks(d), last = new Map();
    for (const x of p) if (x.ref) last.set(x.ref, x.verdict);
    const byRef = (v) => b.refs.filter((r) => last.get(r.id) === v).map((r) => ({ id: r.id, url: r.url, title: r.title, source: r.source }));
    out({ id: b.id, title: b.title, goal: b.goal, url: `${BASE}/s/${b.id}/`, techniques: b.techniques, palette: b.palette, type: b.type, refs: b.refs.length,
      liked: byRef("like"), pinned: byRef("pin"), noped: byRef("nope"), owner_notes: p.filter((x) => x.verdict === "note").map((x) => x.text), preview: b.preview }); break;
  }
  case "list": out(sessions().map((s) => { const b = read(join(HOME, s)); return { id: s, title: b.title, refs: b.refs.length, updated: new Date(b.updated).toISOString(), url: `${BASE}/s/${s}/` }; })); break;
  case "stop": try { execFileSync("pkill", ["-f", `${basename(fileURLToPath(import.meta.url))} serve`]); out({ stopped: true }); } catch { out({ stopped: false }); } break;
  default: die(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
