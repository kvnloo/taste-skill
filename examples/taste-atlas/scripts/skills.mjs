// Skills atlas importer: the hand-made skill ontology as an alternative Atlas taxonomy (?atlas=skills), plus every
// record about a skill as a layer: the skill itself (status, loads), use cases (turns that loaded it), misses (turns it
// was hinted on but not loaded), router evals, remembered rules ("best way" cards), and GitHub copies/candidates/library.
//   node scripts/skills.mjs [--from <skill-ontology dir>]  ->  $ATLAS_DATA/skills.taxonomy.json, skills.atlas.json
// Levels: 01 domain (what the work is for) -> 02 area -> 03 job (one need; near-duplicate skills share it) -> 04 skill.
// Private: turn texts stay in the gitignored data dir.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg("--from", "/mnt/zer0models/workspace/zer0/data/operations/skill-ontology-20261112");
const TIERS = arg("--tiers", join(process.env.HOME, ".hermes/profiles/clean/plugins/skill-rank/tiers.json"));
const DATA = process.env.ATLAS_DATA ?? join(app, "data");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const jsonl = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const day = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "");
const title = (s) => s.split("-").map((w) => (/^(3d|ui|gui|oss|t3|ai)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
const clip = (s, n = 280) => { s = String(s ?? "").replace(/@image:\S+/g, "[image]").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

const tax = json(join(FROM, "taxonomy.json")), ranked = jsonl(join(FROM, "ranked-live.jsonl"));
const desc = new Map(jsonl(join(FROM, "ontology.jsonl")).map((o) => [o.name, o.desc]));
const PALETTE = { visual: ["#c2457a", "#ff86b8"], code: ["#2f6fd6", "#6ea8ff"], agents: ["#7b3fa0", "#c38bff"], memory: ["#c27c0e", "#ffbf4d"], devices: ["#1f8a5b", "#4fd69a"],
  web: ["#d6453d", "#ff6b5f"], write: ["#6b5a3e", "#d8c39a"], secrets: ["#4b4fa8", "#9da1f0"], life: ["#0f8fa3", "#5fd3e6"], stance: ["#5a5e66", "#b8bcc4"] };
const FAMILY = { visual: "material", code: "grid", agents: "hud", memory: "continuity", devices: "region", web: "leading", write: "serif", secrets: "isolate", life: "tone", stance: "hierarchy" };
const STATUS = { core: "#1f8a5b", active: "#2f6fd6", scoped: "#c27c0e", dormant: "#8a857a", "archive-candidate": "#b9b4a8" };

// Taxonomy: a job is on the graph when at least one of its skills is in use (not an archive candidate).
const live = ranked.filter((r) => r.status !== "archive-candidate");
const jobs = new Map();
for (const r of live) { const j = jobs.get(r.job) ?? jobs.set(r.job, { id: "j:" + r.job, op: r.domain, domain: r.area, skills: [] }).get(r.job); j.skills.push(r); }
const jobOf = new Map(ranked.map((r) => [r.name, jobs.has(r.job) ? "j:" + r.job : null]));
// Big and small domains alternate round the ring so the small ones' labels never pile up.
const order = ["visual", "secrets", "code", "write", "agents", "life", "devices", "web", "memory", "stance"].filter((d) => tax.domains[d]);
const operations = [...Object.entries(tax.domains)].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, d]) => ({ id, name: title(id), color: PALETTE[id]?.[0] ?? "#8a857a", night: PALETTE[id]?.[1] ?? "#b8b4aa", ask: d.ask }));
const domains = Object.fromEntries(Object.values(tax.domains).flatMap((d) => Object.keys(d.areas)).map((a) => [a, { name: title(a), icon: null }]));
const techniques = [...jobs.entries()].sort(([, a], [, b]) => order.indexOf(a.op) - order.indexOf(b.op) || a.domain.localeCompare(b.domain)).map(([job, j]) => {
  j.skills.sort((a, b) => b.score - a.score);
  const best = j.skills[0];
  return { id: j.id, op: j.op, domain: j.domain, name: title(job), family: FAMILY[j.op] ?? "grid", mech: clip(desc.get(best.name) || best.name, 160),
    ui: `skill_view(name="${best.name}")${j.skills.length > 1 ? ` · ${j.skills.length} skills share this job` : ""}`,
    executions: j.skills.map((s, i) => ({ id: "s:" + s.name, title: s.name, seed: (i % 4) + 1, family: FAMILY[j.op] ?? "grid", status: s.status })) };
});
const taxonomy = { kind: "skills", generatedAt: new Date().toISOString(), from: FROM, levels: ["DOMAIN", "AREA", "JOB", "SKILL"],
  intro: { eyebrow: "A TAXONOMY OF SKILLS", h1: "Which skill <em>fits.</em>", p: "Every skill is filed by what the work is for, its area, and the one job it does. Layers show how each one is used, missed, evaluated and remembered." },
  noun: { technique: "jobs", execution: "skills" }, operations, domains, techniques };

// Layers.
const items = [], seen = new Set();
const add = (b) => { if (!seen.has(b.id)) { seen.add(b.id); items.push({ tile: true, ...b }); } };
const areaName = (r) => `${title(r.domain)} · ${title(r.area)}`;
const byName = new Map(ranked.map((r) => [r.name, r]));
// Connections: the skill most often loaded in the same session as this one.
const turns = json(join(FROM, "turns.json")), co = new Map();
const bySess = new Map(); for (const t of turns) for (const n of t.loaded) (bySess.get(t.s) ?? bySess.set(t.s, new Set()).get(t.s)).add(n);
for (const set of bySess.values()) for (const a of set) for (const b of set) if (a !== b) { const m = co.get(a) ?? co.set(a, new Map()).get(a); m.set(b, (m.get(b) ?? 0) + 1); }
const partner = (n) => { const m = co.get(n); if (!m) return null; const own = jobOf.get(n); return [...m].sort((x, y) => y[1] - x[1]).map(([k]) => jobOf.get(k)).find((j) => j && j !== own) ?? null; };
for (const r of ranked) add({ id: "skill:" + r.name, layer: "skill", technique: jobOf.get(r.name), also: partner(r.name), title: r.name, author: areaName(r), group: areaName(r),
  subject: r.status, rgb: STATUS[r.status], score: r.score, date: r.days_since_load != null ? `${r.days_since_load}d since last load` : "never loaded",
  text: `${desc.get(r.name) ?? ""} — ${r.loads} loads in ${r.sessions} sessions · ${r.status}${r.variants > 1 ? ` · ${r.variants} copies across profiles` : ""}`, why: r.status });
// Use cases and misses: newest first, three per skill.
const uses = new Map(), misses = new Map();
const push = (m, n, t) => { const l = m.get(n) ?? m.set(n, []).get(n); if (l.length < 3) l.push(t); };
for (const t of [...turns].sort((a, b) => b.ts - a.ts)) {
  for (const n of t.loaded) push(uses, n, t);
  for (const n of [...t.hint, ...t.failed]) if (!t.loaded.includes(n)) push(misses, n, t);
}
for (const [m, layer, verb] of [[uses, "use", "loaded"], [misses, "miss", "hinted, not loaded"]]) for (const [n, l] of m) for (const t of l) {
  const r = byName.get(n); if (!r) continue;
  add({ id: `${layer}:${n}:${t.s}:${t.id}`, layer, technique: jobOf.get(n), title: n, author: `${t.p} · ${t.src}`, group: areaName(r), date: day(t.ts), text: clip(t.text), why: `${verb} ${n}`, subject: r.status });
}
// Evals: the 177-case router/auto-load set, with each model's pick.
const picks = {};
for (const m of ["haiku", "sonnet", "luna", "terra"]) for (let i = 0; i < 4; i++) { const f = join(FROM, `autoload-eval/${m}-${i}.txt`); if (!existsSync(f)) continue;
  for (const l of readFileSync(f, "utf8").split("\n")) { try { const o = JSON.parse(l); (picks[o.id] ??= {})[m] = o.pick; } catch {} } }
for (const c of json(join(FROM, "autoload-cases.json"))) {
  const gold = c.ga?.[0] ?? c.gb?.[0]; if (!gold) continue; const r = byName.get(gold), gs = new Set([...(c.ga ?? []), ...(c.gb ?? [])]);
  const hit = c.cands.slice(0, 3).some((x) => gs.has(x)), p = picks[c.id] ?? {};
  add({ id: "eval:" + c.id, layer: "eval", technique: jobOf.get(gold), title: `${c.id} → ${gold}`, author: c.set, group: r ? areaName(r) : "Other", subject: hit ? "hint hit" : "hint miss",
    rgb: hit ? "#1f8a5b" : "#d6453d", text: `${clip(c.text, 220)} | gold: ${[...gs].join(", ")} | hint top-3: ${c.cands.slice(0, 3).join(", ")} | ${Object.entries(p).map(([m, x]) => `${m}: ${x}`).join(" · ")}`, why: hit ? "hint hit" : "hint miss" });
}
// Remembered rules: the "best way he set" cards the skill-rank plugin injects.
const T = json(TIERS);
for (const c of T.cards) for (const n of c.skills ?? []) { const r = byName.get(n); if (!r) continue;
  add({ id: `memory:${c.id}:${n}`, layer: "memory", technique: jobOf.get(n), title: c.id, author: T.categories[c.cat] ?? c.cat, group: T.categories[c.cat] ?? "Other", text: clip(c.line, 400), why: `rule → ${n}`, subject: r.status }); }
// GitHub: copies of live skills, candidates (sit on their nearest live skill's job), library (outer ring, by area).
const paths = new Map(json(join(FROM, "gh/gh-skills.json")).map((g) => [`${g.repo}|${g.body_sha}`, g.path]));
for (const g of jsonl(join(FROM, "gh/gh-index.jsonl"))) {
  const p = paths.get(`${g.repo}|${g.sha}`), layer = { "dup-of-live": "copy", candidate: "candidate", library: "library" }[g.tier];
  const area = Array.isArray(g.area) ? `${title(g.area[0])} · ${title(g.area[1])}` : "Other";
  add({ id: `gh:${g.repo}:${g.sha}`, layer, technique: layer === "library" ? null : jobOf.get(g.nn) ?? null, title: g.name, author: `kvnloo/${g.repo}`, group: area,
    url: p ? `https://github.com/kvnloo/${g.repo}/blob/HEAD/${p.split("/").slice(1).join("/")}` : `https://github.com/kvnloo/${g.repo}`, score: g.conf,
    text: `${clip(g.desc, 240)} | nearest live: ${g.nn} (${g.nn_sim})`, why: g.tier, subject: g.tier });
}
const layers = {
  skill: { name: "Skills", color: "#1f8a5b", open: "Open ↗" }, use: { name: "Use cases", color: "#2f6fd6" }, miss: { name: "Missed", color: "#d6453d" },
  eval: { name: "Evals", color: "#7b3fa0" }, memory: { name: "Memories", color: "#c27c0e" }, copy: { name: "GitHub copies", color: "#6e5494", open: "Open on GitHub ↗" },
  candidate: { name: "GitHub candidates", color: "#6e5494", open: "Open on GitHub ↗" }, library: { name: "GitHub library", color: "#9a8fb0", open: "Open on GitHub ↗", outer: true },
};
const atlas = { kind: "skills", method: `skill ontology ${FROM.split("/").pop()} · ${ranked.length} live skills · placement by hand-written rules`, layers, count: items.length, items };
writeFileSync(join(DATA, "skills.taxonomy.json"), JSON.stringify(taxonomy));
writeFileSync(join(DATA, "skills.atlas.json"), JSON.stringify(atlas));
const n = (l) => items.filter((b) => b.layer === l).length;
process.stdout.write(`skills: ${operations.length} domains · ${Object.keys(domains).length} areas · ${techniques.length} jobs · ${techniques.reduce((a, t) => a + t.executions.length, 0)} skills on the graph\n` +
  `layers: ${Object.keys(layers).map((l) => `${l} ${n(l)}`).join(" · ")} · placed ${items.filter((b) => b.technique).length}/${items.length} → ${DATA}\n`);
