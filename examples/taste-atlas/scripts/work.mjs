// Work importer: your projects as a nested repo map for the atlas Work layer → $ATLAS_DATA/work.atlas.json.
//   node scripts/work.mjs [--dry] [--config scripts/work.config.json] [--out data/work.atlas.json] [--no-shots] [--no-gh]
// Structure comes from work.config.json (products → component areas as path globs per repo, plus pages). Everything
// else is measured: git log touches (decayed by a half-life, raw timestamps kept so the UI can re-weigh "as of"),
// PRs and main CI from gh (cached in $ATLAS_DATA/work-cache with a TTL; a 403/429 backs off instead of retrying),
// page screenshots (pages that do not answer are listed "down"), and your asks that mention a product. A missing repo
// or gh makes that part "unknown", never a crash. Status seeded from the status board is labelled as such and only
// used while fresh.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, dirname, resolve, matchesGlob } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { weightAt, ago } from "../src/pack.js";

const H = 3600, D = 86400, RANK = { unknown: 0, "on-track": 1, watch: 2, "at-risk": 3, blocked: 4 };
const run = (cmd, args, opt = {}) => new Promise((ok) => execFile(cmd, args, { maxBuffer: 64 << 20, timeout: 60000, ...opt }, (err, stdout, stderr) => ok({ err, stdout, stderr: String(stderr ?? "") })));
const readJson = (f) => { try { return JSON.parse(readFileSync(f.replace(/^~(?=\/)/, homedir()), "utf8")); } catch { return null; } };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** `git log --format=%x01%ct --name-only` → [{t, files}]. */
export const parseLog = (text) => text.split("\x01").map((c) => c.trim()).filter(Boolean).map((c) => { const [t, ...files] = c.split("\n"); return { t: +t, files: files.map((f) => f.trim()).filter(Boolean) }; });

/** (repo, file) → "product/component" | null: the first component, in config order, with a glob for that repo matching. */
export function matcher(cfg) {
  const rules = new Map(), memo = new Map();
  for (const p of cfg.products) for (const c of p.components) for (const [repo, globs] of Object.entries(c.paths ?? {})) (rules.get(repo) ?? rules.set(repo, []).get(repo)).push({ id: `${p.id}/${c.id}`, globs });
  return (repo, file) => { const k = repo + "\0" + file; if (!memo.has(k)) memo.set(k, rules.get(repo)?.find((r) => r.globs.some((g) => matchesGlob(file, g)))?.id ?? null); return memo.get(k); };
}

/** gh check rollup → {pass, fail, pending}. */
export function checks(rollup = []) {
  const n = { pass: 0, fail: 0, pending: 0 };
  for (const c of rollup ?? []) {
    const v = (c.conclusion || c.state || "").toUpperCase();
    if (c.status && c.status !== "COMPLETED") n.pending++;
    else if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(v)) n.pass++;
    else if (["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", ""].includes(v)) n.pending++;
    else n.fail++;
  }
  return n;
}

/** Live status from measured signals only. `blocked` never comes from here (only a human can say that). */
export function liveStatus({ prs = [], ci = null, last = 0, now, deadline = null, gh = true }) {
  const open = prs.filter((p) => p.state === "OPEN"), failing = open.filter((p) => p.checks.fail);
  if (failing.length) return { value: deadline && deadline - now < 48 * H ? "at-risk" : "watch", why: `${failing.map((p) => "#" + p.number).slice(0, 3).join(" ")} checks failing` };
  if (ci?.conclusion === "failure") return { value: "watch", why: `main CI red since ${ago(ci.t, now)} ago` };
  if (!gh && !last) return { value: "unknown", why: "no repo or GitHub data" };
  const merged = prs.filter((p) => p.state === "MERGED" && now - p.t < 7 * D).length;
  if (last && now - last < 7 * D) return { value: "on-track", why: `touched ${ago(last, now)} ago${merged ? `, ${merged} merged this week` : ""}${open.length ? `, ${open.length} open` : ""}` };
  if (merged) return { value: "on-track", why: `${merged} merged this week` };
  if (!gh) return { value: "unknown", why: "GitHub unavailable" };
  return { value: "on-track", why: last ? `quiet ${ago(last, now)}, nothing failing` : "no work in the window, nothing failing" };
}
const worst = (list) => list.reduce((a, s) => (RANK[s.value] > RANK[a.value] ? s : a), { value: "unknown", why: "no signals" });

/** Asks that mention a node: product keywords pick the product, component keywords (within it) pick the component. */
export function attachAsks(asks, products, { per = 8 } = {}) {
  const re = (kws) => (kws?.length ? new RegExp(`(^|[^\\w/-])(${kws.join("|")})(?![\\w-])`, "i") : null), out = new Map();
  const add = (id, a) => (out.get(id) ?? out.set(id, []).get(id)).push(a);
  for (const a of asks) {
    const text = String(a.text ?? ""); if (!text) continue;
    for (const p of products) {
      if (!re(p.keywords)?.test(text)) continue;
      const hits = p.nodes.filter((c) => re(c.keywords)?.test(text));
      for (const c of hits.length ? hits : [p]) add(c.id, { t: Math.round(a.ts ?? 0), text: text.slice(0, 400), ...(a.id && { id: a.id }) });
    }
  }
  for (const l of out.values()) { l.sort((x, y) => y.t - x.t); const n = l.length; l.splice(per); l.total = n; }
  return out;
}

// gh with a cache and a back-off: fresh cache answers without a call; 403/429/rate limit writes a back-off file so no
// later call (this run or the next) hits GitHub until it expires; failures fall back to the stale cache.
export function ghCache({ dir, ttl = 900, now = () => Math.floor(Date.now() / 1000), exec = (args) => run("gh", args) }) {
  mkdirSync(dir, { recursive: true });
  const off = join(dir, "backoff.json");
  return async (args) => {
    const f = join(dir, createHash("sha1").update(args.join(" ")).digest("hex").slice(0, 16) + ".json"), c = readJson(f);
    if (c && now() - c.t < ttl) return { data: c.data, checked: c.t, cached: true };
    const until = readJson(off)?.until ?? 0;
    if (until > now()) return c ? { data: c.data, checked: c.t, cached: true, error: "rate limited" } : { error: `rate limited until ${new Date(until * 1000).toISOString()}` };
    const r = await exec(args);
    if (r.err) {
      const msg = (r.stderr || r.err.message).trim().split("\n")[0].slice(0, 200);
      if (/rate limit|HTTP 403|HTTP 429|secondary/i.test(msg)) writeFileSync(off, JSON.stringify({ until: now() + 900, why: msg }));
      return c ? { data: c.data, checked: c.t, cached: true, error: msg } : { error: msg };
    }
    let data; try { data = JSON.parse(r.stdout); } catch { return { error: "gh returned non-JSON" }; }
    writeFileSync(f, JSON.stringify({ t: now(), args, data }));
    return { data, checked: now() };
  };
}

const PR_FIELDS = "number,title,state,isDraft,updatedAt,url,statusCheckRollup";
const prOf = (p, repo, checked) => ({ repo, number: p.number, title: p.title, state: p.state, draft: p.isDraft, t: Math.floor(Date.parse(p.updatedAt) / 1000), url: p.url, checks: checks(p.statusCheckRollup), checked });

/** Shoot every page: URL pages that answer get a 640×400 JPEG; the rest are "down". File pages (repo:path) are local images. */
export async function shootPages(pages, { dir, pw = process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json", chrome = process.env.CHROME, now }) {
  mkdirSync(dir, { recursive: true });
  const probe = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(6000), redirect: "follow" }); return r.status; } catch (e) { return e.name === "TimeoutError" ? "timeout" : "refused"; } };
  const states = await Promise.all(pages.map(async (p) => ({ p, code: p.local ? (existsSync(p.local) ? 200 : "missing") : await probe(p.url) })));
  const up = states.filter((s) => s.code >= 200 && s.code < 400);
  let browser = null;
  if (up.length) try {
    const { chromium } = createRequire(pw)("playwright-core");
    browser = await chromium.launch({ executablePath: chrome ?? `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
  } catch (e) { process.stderr.write(`work: no browser for screenshots (${e.message.split("\n")[0]})\n`); }
  const shoot = async ({ p }) => {
    const file = `${p.shotId}.jpg`, q = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });
    try {
      await q.goto(p.local ? pathToFileURL(p.local).href : `${p.url}${p.url.includes("?") ? "&" : "?"}theme=dark`, { waitUntil: "load", timeout: 15000 });
      await q.waitForTimeout(p.local ? 200 : 2500);
      await q.screenshot({ path: join(dir, file), type: "jpeg", quality: 72 });
      return file;
    } catch (e) { process.stderr.write(`work: shot ${p.name}: ${e.message.split("\n")[0]}\n`); return null; } finally { await q.close(); }
  };
  const shots = new Map();
  if (browser) { const queue = [...up]; await Promise.all(Array.from({ length: 4 }, async () => { for (let s; (s = queue.shift());) shots.set(s.p, await shoot(s)); })); await browser.close(); }
  return states.map(({ p, code }) => ({ name: p.name, url: p.url ?? null, file: p.local ? p.file : undefined, shot: shots.get(p) ? `work-shots/${shots.get(p)}` : null, state: shots.get(p) ? "up" : code >= 200 && code < 400 ? "no-shot" : "down", code, checked: now }));
}

/** Build the work map. io: { git(repoPath, args), gh(args), shoot(pages), now, readJson, films }. */
export async function buildWork(cfg, io) {
  const now = io.now, hl = cfg.halfLifeHours ?? 48, since = now - (cfg.windowDays ?? 21) * D, errors = [], match = matcher(cfg);
  const repos = {}, unmapped = {};
  // 1. touches per component from each repo's git log
  const touches = new Map();
  await Promise.all(Object.entries(cfg.repos).map(async ([id, r]) => {
    const path = r.path && resolve(io.base ?? ".", r.path.replace(/^~(?=\/)/, homedir()));
    if (!path || !existsSync(path)) { repos[id] = { id, path: r.path, gh: r.gh, ok: false, why: "repo not found" }; errors.push(`${id}: repo not found at ${r.path}`); return; }
    const log = await io.git(path, ["log", `--since=${new Date(since * 1000).toISOString()}`, "--format=%x01%ct", "--name-only", "--no-renames"]);
    const head = await io.git(path, ["log", "-1", "--format=%h %ct %s"]);
    if (log === null) { repos[id] = { id, path: r.path, gh: r.gh, ok: false, why: "git log failed" }; errors.push(`${id}: git log failed`); return; }
    const commits = parseLog(log);
    for (const c of commits) {
      const per = new Map();
      for (const f of c.files) { const k = match(id, f); if (k) per.set(k, (per.get(k) ?? 0) + 1); else unmapped[id] = (unmapped[id] ?? 0) + 1; }
      for (const [k, n] of per) (touches.get(k) ?? touches.set(k, []).get(k)).push([c.t, n]);
    }
    const [h, t, ...s] = (head ?? "").trim().split(" ");
    repos[id] = { id, path: r.path, gh: r.gh, ok: true, head: h || null, headAt: +t || null, headMsg: s.join(" ") || null, commits: commits.length };
  }));
  for (const l of touches.values()) l.sort((a, b) => a[0] - b[0]);

  // 2. PRs and main CI per GitHub repo (one call each: `pr list --json files` maps PRs to components without extra calls)
  const gh = {}, ghRepo = new Map(Object.entries(cfg.repos).filter(([, r]) => r.gh).map(([id, r]) => [r.gh, id]));
  await Promise.all([...ghRepo.keys()].map(async (slugGh) => {
    if (!io.gh) { gh[slugGh] = { ok: false, error: "gh disabled" }; return; }
    const [prs, runs] = await Promise.all([
      io.gh(["pr", "list", "-R", slugGh, "--state", "all", "-L", "30", "--json", PR_FIELDS + ",files"]),
      io.gh(["run", "list", "-R", slugGh, "-b", "main", "-L", "5", "--json", "conclusion,status,createdAt,url,displayTitle"]),
    ]);
    if (prs.error && !prs.data) errors.push(`${slugGh}: gh pr list: ${prs.error}`);
    const done = (runs.data ?? []).find((x) => x.status === "completed");
    gh[slugGh] = { ok: !!prs.data, error: prs.error, checked: prs.checked ?? null,
      prs: (prs.data ?? []).map((p) => ({ ...prOf(p, slugGh, prs.checked), files: (p.files ?? []).map((f) => f.path) })),
      ci: done ? { conclusion: done.conclusion, t: Math.floor(Date.parse(done.createdAt) / 1000), url: done.url, title: done.displayTitle, checked: runs.checked } : null };
  }));
  const extraPr = async (ref) => { const [, r, n] = ref.match(/^(.+)#(\d+)$/) ?? []; if (!r || !io.gh) return null; const x = await io.gh(["pr", "view", n, "-R", r, "--json", PR_FIELDS]); return x.data ? prOf(x.data, r, x.checked) : (errors.push(`${ref}: ${x.error}`), null); };

  // 3. seed (status board), asks, lanes, films, links
  const seed = readJson(cfg.sources?.seed?.file ?? ""), seedAt = seed?.as_of ? Math.floor(Date.parse(seed.as_of) / 1000) : 0;
  const seedWin = (cfg.sources?.seed?.windowHours ?? 24) * H, seedLabel = cfg.sources?.seed?.label ?? "board";
  const lanes = readJson(cfg.sources?.lanes ?? "");
  const asks = readJson(cfg.sources?.asks ?? "") ?? [];
  const films = io.films ?? [];

  // 4. components (drawn once, in the product that lists them) and products
  const comps = [], products = [], compById = new Map();
  for (const p of cfg.products) for (const c of p.components) {
    const id = `${p.id}/${c.id}`, t = touches.get(id) ?? [], repoIds = Object.keys(c.paths ?? {});
    const repoGh = repoIds.map((r) => cfg.repos[r]?.gh).filter(Boolean), title = c.prTitle ? new RegExp(c.prTitle, "i") : null;
    const prs = repoGh.flatMap((r) => (gh[r]?.prs ?? []).filter((x) => x.files.some((f) => match(ghRepo.get(r), f) === id) || title?.test(x.title)).map(({ files, ...x }) => x));
    for (const ref of c.prs ?? []) { const x = await extraPr(ref); if (x) prs.push(x); }
    prs.sort((a, b) => (b.state === "OPEN") - (a.state === "OPEN") || b.t - a.t); prs.splice(12);
    const ghOk = repoGh.some((r) => gh[r]?.ok) || (c.prs?.length && prs.length > 0);
    const ci = repoGh.map((r) => gh[r]?.ci).find((x) => x?.conclusion === "failure") ?? repoGh.map((r) => gh[r]?.ci).find(Boolean) ?? null;
    const reposOk = repoIds.length ? repoIds.some((r) => repos[r]?.ok) : true;
    const last = t.at(-1)?.[0] ?? 0, deadline = p.deadline ? Date.parse(p.deadline) / 1000 : null;
    const status = { ...(reposOk || ghOk ? liveStatus({ prs, ci, last, now, deadline, gh: !!ghOk }) : { value: "unknown", why: "repo missing and no GitHub data" }), source: "live", checked: Math.min(now, ...repoGh.map((r) => gh[r]?.checked).filter(Boolean)), window: 6 * H };
    const metrics = [];
    if (c.lanes && lanes?.lanes) {
      const L = Object.entries(lanes.lanes), off = L.filter(([, v]) => v.enabled === false || v.invoke?.max_per_call === 0).map(([k]) => k);
      metrics.push(["Lanes", String(L.length), "lane config"], ["Off", off.join(", ") || "none", "lane config"]);
    }
    const node = { id, product: p.id, name: c.name, label: c.name, also: c.also ?? [], keywords: c.keywords ?? [], repos: repoIds, weight: +weightAt(t, now, hl).toFixed(3), lastTouched: last || null, touches: t,
      status, prs, metrics, pages: (c.pages ?? []).map((pg, i) => ({ ...pg, shotId: `${p.id}-${c.id}-${i}-${slug(pg.name)}` })), asks: [], films: [] };
    comps.push(node); compById.set(id, node);
  }
  for (const p of cfg.products) {
    const own = p.components.map((c) => `${p.id}/${c.id}`), portals = comps.filter((c) => c.also.includes(p.id)).map((c) => c.id);
    const all = [...own, ...portals].map((id) => compById.get(id)), t = all.flatMap((c) => c.touches).sort((a, b) => a[0] - b[0]);
    const pane = seed?.panes?.find((x) => x.id === p.seed), deadline = p.deadline ? Date.parse(p.deadline) / 1000 : null;
    const live = worst(own.map((id) => compById.get(id).status));
    const repoGh = [...new Set(p.components.flatMap((c) => Object.keys(c.paths ?? {}).map((r) => cfg.repos[r]?.gh)).filter(Boolean))];
    const status = pane && now - seedAt < seedWin
      ? { value: pane.status, why: pane.verdict, source: seedLabel, checked: seedAt, window: seedWin }
      : { ...live, source: "live", checked: Math.min(...own.map((id) => compById.get(id).status.checked)), window: 6 * H };
    const ciRows = repoGh.map((r) => gh[r]?.ci && [`${r.split("/")[1]} main CI`, gh[r].ci.conclusion === "success" ? "green" : gh[r].ci.conclusion ?? "running", "live"]).filter(Boolean);
    const prsAll = repoGh.flatMap((r) => gh[r]?.prs ?? []), week = prsAll.filter((x) => x.state === "MERGED" && now - x.t < 7 * D).length;
    products.push({ id: p.id, name: p.name, label: p.name, role: pane?.role ?? null, verdict: pane ? { text: pane.verdict, source: seedLabel, checked: seedAt } : null,
      status, live, deadline: p.deadline ?? null, deadlineLabel: p.deadline && seed?.deadline === p.deadline ? seed.deadline_label : null, keywords: p.keywords ?? [],
      repos: [...new Set(p.components.flatMap((c) => Object.keys(c.paths ?? {})))].map((r) => repos[r]).filter(Boolean),
      weight: +weightAt(t, now, hl).toFixed(3), lastTouched: t.at(-1)?.[0] ?? null, touches: t, components: own, portals,
      metrics: [...(pane?.metrics ?? []).map(([k, v]) => [k, v, seedLabel]), ...ciRows, ...(repoGh.length && prsAll.length ? [["PRs merged 7d", String(week), "live"], ["Open PRs", String(prsAll.filter((x) => x.state === "OPEN").length), "live"]] : [])],
      notes: pane ? { done: pane.done ?? [], open: pane.open ?? [], risks: pane.risks ?? [], source: seedLabel } : null, links: pane?.links ?? [], asks: [], films: [] });
  }
  // asks and films: product keywords, then the most specific component (own or portal)
  const asksBy = attachAsks(asks, products.map((p) => ({ id: p.id, keywords: p.keywords, nodes: [...p.components, ...p.portals].map((id) => compById.get(id)) })));
  const nodeBy = new Map([...products.map((p) => [p.id, p]), ...comps.map((c) => [c.id, c])]);
  for (const [id, l] of asksBy) { const n = nodeBy.get(id); n.asks = [...l]; n.asksTotal = l.total; }
  const filmsBy = attachAsks(films.map((f) => ({ id: f.id, text: f.title })), products.map((p) => ({ id: p.id, keywords: p.keywords, nodes: [...p.components, ...p.portals].map((id) => compById.get(id)) })), { per: 12 });
  for (const [id, l] of filmsBy) nodeBy.get(id).films = l.map((a) => a.id);

  // 5. pages
  const pages = comps.flatMap((c) => c.pages.map((pg) => ({ c, pg, local: pg.file ? join(resolve(io.base ?? ".", cfg.repos[pg.file.split(":")[0]]?.path ?? "/nonexistent"), pg.file.split(":").slice(1).join(":")) : null })));
  const shot = io.shoot ? await io.shoot(pages.map(({ pg, local }) => ({ ...pg, local }))) : pages.map(({ pg }) => ({ name: pg.name, url: pg.url ?? null, file: pg.file, shot: null, state: "unchecked", checked: null }));
  pages.forEach(({ c }, i) => { c._pages ??= []; c._pages.push(shot[i]); });
  for (const c of comps) { c.pages = c._pages ?? []; delete c._pages; delete c.keywords; }
  for (const p of products) delete p.keywords;

  return { kind: "taste-atlas.work.v1", generated: new Date(now * 1000).toISOString(), generatedAt: now, halfLifeHours: hl, windowDays: cfg.windowDays ?? 21,
    seed: seed ? { label: seedLabel, as_of: seed.as_of, deadline: seed.deadline, critical_path: seed.critical_path ?? [] } : null,
    repos, ci: Object.fromEntries(Object.entries(gh).map(([k, v]) => [k, v.ci ?? null])), unmapped, errors, products, components: comps };
}

const deepPages = (cfg, local) => { // private overlay: pages (and nothing else) merge into components by id
  for (const lp of local?.products ?? []) for (const lc of lp.components ?? []) {
    const c = cfg.products.find((p) => p.id === lp.id)?.components.find((x) => x.id === lc.id);
    if (c && lc.pages) c.pages = [...(c.pages ?? []), ...lc.pages];
  }
  return cfg;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2), opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d), here = dirname(fileURLToPath(import.meta.url)), app = resolve(here, "..");
  const DATA = process.env.ATLAS_DATA ?? join(app, "data"), t0 = Date.now(), now = Math.floor(Date.now() / 1000);
  const cfgFile = opt("--config", join(here, "work.config.json")), out = opt("--out", join(DATA, "work.atlas.json"));
  const cfg = deepPages(JSON.parse(readFileSync(cfgFile, "utf8")), readJson(join(DATA, "work.config.local.json")));
  const ghOk = !argv.includes("--no-gh") && (await run("gh", ["--version"])).err == null;
  const films = (readJson(join(DATA, "sources.atlas.json"))?.items ?? []).filter((b) => b.layer === "film").map((b) => ({ id: b.id, title: b.title ?? "" }));
  const w = await buildWork(cfg, {
    now, base: dirname(cfgFile), films,
    git: async (cwd, args) => { const r = await run("git", ["-C", cwd, ...args]); return r.err ? null : r.stdout; },
    gh: ghOk ? ghCache({ dir: join(DATA, "work-cache"), ttl: +(process.env.WORK_GH_TTL ?? 900) }) : null,
    shoot: argv.includes("--no-shots") || argv.includes("--dry") ? null : (pages) => shootPages(pages, { dir: join(DATA, "work-shots"), now }),
  });
  const summary = { products: w.products.map((p) => `${p.id} ${p.status.value} (${p.status.source}) w=${p.weight.toFixed(1)} comps=${p.components.length}+${p.portals.length}`),
    components: w.components.length, pages: w.components.flatMap((c) => c.pages).reduce((a, p) => ({ ...a, [p.state]: (a[p.state] ?? 0) + 1 }), {}),
    prs: w.components.reduce((a, c) => a + c.prs.length, 0), asks: [...w.products, ...w.components].reduce((a, n) => a + n.asks.length, 0), unmapped: w.unmapped, errors: w.errors, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  if (argv.includes("--dry")) { console.log(JSON.stringify(summary, null, 1)); process.exit(0); }
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out + ".tmp", JSON.stringify(w)); renameSync(out + ".tmp", out);
  console.log(JSON.stringify({ out, bytes: statSync(out).size, ...summary }, null, 1));
}
