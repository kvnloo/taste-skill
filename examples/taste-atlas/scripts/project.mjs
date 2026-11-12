#!/usr/bin/env node
// Project mode data: node scripts/project.mjs [--dry] → data/project.<id>.json per project in scripts/project.config.json.
// Each screen of a product's user journey gets, from real sources only: its git history (commits on its code paths),
// the colours, fonts and libraries in that code now, your asks and the sessions they came from (asks-raw + every
// Hermes profile's state.db since), and the board pins, board notes and film ideas whose words name it. Every pin on
// the project's boards is kept; pins that name no screen land in the project's Board lane.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const tilde = (p) => String(p ?? "").replace(/^~(?=\/|$)/, homedir());
const sh = (cmd, args, cwd) => { try { return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };

// "a/{b,c}*" → ["a/b*", "a/c*"], then git glob pathspecs.
export const braces = (p) => { const m = /\{([^{}]*)\}/.exec(p); return m ? m[1].split(",").flatMap((x) => braces(p.slice(0, m.index) + x + p.slice(m.index + m[0].length))) : [p]; };
const specs = (paths) => paths.flatMap(braces).map((p) => `:(glob)${p}`);
// Keywords are regex fragments matched on word boundaries, case-insensitive.
export const matcher = (words) => (words?.length ? new RegExp(`\\b(?:${words.join("|")})\\b`, "i") : null);
// The passage of a message that names the screen, and how much of the message is about it (short, dense asks first).
export const snippet = (text, re, w = 170) => { const m = re.exec(text); if (!m) return text.slice(0, w * 2); const a = Math.max(0, m.index - w), b = Math.min(text.length, m.index + w); return `${a ? "…" : ""}${text.slice(a, b).trim()}${b < text.length ? "…" : ""}`; };
const density = (text, re) => (text.match(new RegExp(re.source, "gi"))?.length ?? 0) / Math.sqrt(Math.max(80, text.length));
const top = (list, n) => [...list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, n);
const DESIGN = /\b(style|theme|design|glass|layout|colou?r|font|density|spacing|polish|look|motion|card|rim|halo|palette|ui)\b/i;

export function gitFacts(repo, ref, paths, since) {
  const ps = specs(paths);
  const commits = sh("git", ["log", ref, `--since=${since}`, "--no-merges", "--format=%h%x1f%ct%x1f%s", "--", ...ps], repo).split("\n").filter(Boolean)
    .map((l) => { const [h, t, s] = l.split("\x1f"); return { h, t: +t, s, design: DESIGN.test(s) }; });
  const files = sh("git", ["grep", "-lI", "-e", "", ref, "--", ...ps], repo).split("\n").filter(Boolean); // ls-tree ignores glob pathspecs
  const grep = (re) => sh("git", ["grep", "-hoIE", re, ref, "--", ...ps], repo).split("\n").filter(Boolean);
  const colors = top(grep("#[0-9a-fA-F]{6}\\b").map((c) => c.toLowerCase()), 10);
  const fonts = top(grep("font-family:[^;\"'`]+|fontFamily: *['\"][^'\"]+|--(font|sans|mono|serif)[a-z-]*: *[^;]+|(MONO|SERIF|SANS|FONT)[A-Z_]* *= *['\"`][^'\"`]+").map((f) => f.replace(/^(font-?family:|--[a-z-]+:|[A-Z_]+ *=) *['"`]?/i, "").split(",")[0].replace(/["']/g, "").trim()).filter((f) => f && !/^(var|inherit|initial|\$|\d)/.test(f)), 5);
  const libs = top(grep("from ['\"][^.'\"/][^'\"]*['\"]|^import [a-z_][a-z0-9_]*|^from [a-z_][a-z0-9_.]* import")
    .map((x) => (/^from ['"]/.test(x) ? x.slice(6, -1) : x.split(" ")[1] === "type" ? "" : x.split(" ")[1]).replace(/^(@[^/]+\/[^/]+|[^/]+).*/, "$1").split(".")[0])
    .filter((x) => /^[@a-z][\w@/.-]*$/.test(x ?? "") && !/^(node:|\.|__future__|typing|os|sys|re|json|time|pathlib|dataclasses|collections|asyncio|subprocess)$/.test(x) && !x.startsWith("node:")), 10);
  return { commits, files: files.length, colors, fonts, libs };
}

// Your asks: the requirements snapshot, then each profile's live state.db after it (read-only). Only sessions you type
// into count (gui, cli, tui, telegram, local), so subagent, cron and kanban briefs written by agents never pass as yours;
// mid-turn steering is unwrapped to the words you sent.
const HUMAN = new Set(["gui", "cli", "tui", "telegram", "local"]);
export const unwrap = (s) => { const m = /\[OUT-OF-BAND USER MESSAGE[^\]]*\]\s*([\s\S]*?)\s*\[\/OUT-OF-BAND USER MESSAGE\]/.exec(s); return m ? m[1] : s; };
export const human = (s) => !/^(\[|<|#|…|[A-Z_]{3,}=|UI choice from)/.test(s) && s.length >= 8 && s.length <= 1500;
export function loadAsks(file) {
  const raw = readJson(tilde(file)) ?? [], last = Math.max(0, ...raw.map((a) => a.ts)), asks = [], meta = new Map();
  const roots = [join(homedir(), ".hermes"), ...(() => { try { return readdirSync(join(homedir(), ".hermes/profiles")).map((p) => join(homedir(), ".hermes/profiles", p)); } catch { return []; } })()];
  for (const r of roots) {
    const db = join(r, "state.db"), profile = r.endsWith(".hermes") ? "default" : r.split("/").at(-1);
    if (!existsSync(db)) continue;
    for (const x of JSON.parse(sh("sqlite3", ["-readonly", "-json", db, "select id s, source, coalesce(title,'') title, started_at t from sessions"]) || "[]")) meta.set(x.s, x);
    const rows = JSON.parse(sh("sqlite3", ["-readonly", "-json", db, `select m.session_id s, m.timestamp t, m.content c from messages m join sessions x on x.id=m.session_id where m.role='user' and x.source in (${[...HUMAN].map((h) => `'${h}'`).join(",")}) and m.timestamp>${last}`]) || "[]");
    for (const x of rows) asks.push({ t: x.t, text: unwrap(String(x.c ?? "")), session: x.s, profile });
  }
  for (const a of raw) { const m = meta.get(a.session); if (!m || HUMAN.has(m.source)) asks.push({ t: a.ts, text: unwrap(a.text), session: a.session, profile: a.profile }); }
  const seen = new Set(); // compaction and handoff copies repeat the same message
  return { asks: asks.filter((a) => human(a.text)).sort((a, b) => b.t - a.t).filter((a) => !seen.has(a.text) && seen.add(a.text)), titles: new Map([...meta].filter(([, m]) => m.title).map(([id, m]) => [id, m.title])) };
}

const boardOf = (home, id) => readJson(join(home, id, "board.json"));
const refImage = (id, img) => (!img ? null : /^(https?:|\/)/.test(img) ? img : `/s/${id}/${img}`);

export function build(cfg, { work, mission, asks, titles, home, now = Date.now() / 1000 }) {
  const win = cfg.windowDays ?? 60, since = `${win} days ago`, repos = work?.repos ?? {};
  const out = [];
  for (const p of cfg.projects) {
    const pk = matcher(p.keywords), mine = asks.filter((a) => pk?.test(a.text));
    const boards = p.boards.map((id) => ({ id, b: boardOf(home, id) })).filter((x) => x.b);
    const pins = boards.flatMap(({ id, b }) => b.refs.map((r) => ({ id: r.id, board: id, boardTitle: b.title, source: r.source, title: r.title ?? "", text: (r.text ?? "").slice(0, 400), url: r.url ?? null, image: refImage(id, r.image), t: r.t ? r.t / (r.t > 1e11 ? 1000 : 1) : null, screens: [] })));
    const notes = boards.flatMap(({ id, b }) => (b.notes ?? []).map((n) => ({ board: id, who: n.who, text: n.text, t: n.t ? n.t / (n.t > 1e11 ? 1000 : 1) : null })));
    const scenes = new Map((mission?.scenes ?? []).map((s) => [s.id, s]));
    const screens = p.screens.map((s) => {
      const re = matcher(s.keywords), scene = scenes.get(s.scene);
      const g = Object.entries(s.paths ?? {}).map(([rid, paths]) => {
        const path = repos[rid]?.path ? resolve(app, "scripts", tilde(repos[rid].path)) : null; // work.config paths are relative to scripts/
        return path && existsSync(path) ? { repo: rid, gh: repos[rid].gh, ...gitFacts(path, p.refs?.[rid] ?? "HEAD", paths, since) } : { repo: rid, missing: true };
      });
      const merge = (k, n) => top(g.flatMap((x) => (x[k] ?? []).flatMap(([v, c]) => Array(c).fill(v))), n);
      const hits = mine.filter((a) => re?.test(a.text)).map((a) => ({ ...a, score: density(a.text, re) })).sort((a, b) => b.score - a.score || b.t - a.t), sess = top(hits.map((a) => a.session), 6);
      for (const pin of pins) if (re?.test(`${pin.title} ${pin.text}`)) pin.screens.push(s.id);
      return { id: s.id, name: s.name, phase: s.phase, component: s.component, branch: !!s.branch, next: s.next ?? [],
        shot: s.shot, takes: s.takes ?? [], scene: scene ? { id: scene.id, name: scene.name, state: scene.state, note: scene.note } : null,
        code: g.map(({ repo, gh, missing, files, commits }) => ({ repo, gh, missing: !!missing, files: files ?? 0, commits: commits?.length ?? 0 })),
        commits: g.flatMap((x) => (x.commits ?? []).map((c) => ({ ...c, repo: x.repo, gh: x.gh }))).sort((a, b) => b.t - a.t).slice(0, 40),
        colors: merge("colors", 10), fonts: merge("fonts", 5), libs: merge("libs", 10),
        asks: hits.slice(0, 12).map((a) => ({ t: a.t, text: snippet(a.text, re), profile: a.profile })), asksTotal: hits.length,
        sessions: sess.map(([id, n]) => ({ id, n, title: titles.get(id) ?? null })),
        notes: notes.filter((n) => re?.test(n.text)).map((n) => ({ ...n, text: snippet(n.text, re) })),
        ideas: (mission?.ideas ?? []).filter((i) => re?.test(i.text)).map((i) => ({ text: i.text, kind: i.kind, stream: i.stream })) };
    });
    out.push({ id: p.id, generatedAt: Math.round(now), windowDays: win, phases: p.phases, screens, pins, boards: boards.map(({ id, b }) => ({ id, title: b.title, refs: b.refs.length })),
      asksTotal: mine.length, unpinned: pins.filter((x) => !x.screens.length).length });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), cfg = readJson(join(app, "scripts/project.config.json")), wcfg = readJson(join(app, "scripts/work.config.json"));
  const work = readJson(join(app, "data/work.atlas.json")) ?? { repos: wcfg.repos }, mission = readJson(join(app, "data/mission.json"));
  const { asks, titles } = loadAsks(wcfg.sources?.asks);
  for (const r of Object.keys(wcfg.repos)) if (!work.repos[r]?.path) work.repos[r] = wcfg.repos[r];
  const home = process.env.TASTE_BOARD_HOME ?? join(homedir(), ".cache/taste-board");
  for (const p of build(cfg, { work, mission, asks, titles, home })) {
    if (!process.argv.includes("--dry")) writeFileSync(join(app, `data/project.${p.id}.json`), JSON.stringify(p));
    const sc = p.screens;
    console.log(JSON.stringify({ project: p.id, screens: sc.length, shots: sc.filter((s) => existsSync(join(app, "data", s.shot))).length, commits: sc.reduce((a, s) => a + s.commits.length, 0),
      asks: p.asksTotal, screenAsks: sc.reduce((a, s) => a + s.asksTotal, 0), pins: p.pins.length, unpinned: p.unpinned, missingCode: sc.flatMap((s) => s.code.filter((c) => c.missing || !c.files).map((c) => `${s.id}:${c.repo}`)), seconds: (Date.now() - t0) / 1000 }));
  }
}
