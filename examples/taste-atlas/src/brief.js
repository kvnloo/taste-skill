// Design briefs from the atlas, shared by the app ("Copy brief") and the agent CLI (scripts/atlas.mjs).
// A brief turns chosen techniques into what an agent needs to build a site or UI component:
// the intent (operation), the mechanism, the web recipe, and real references when bookmarks are loaded.
import { TECHNIQUES, OPERATIONS, DOMAINS, opById } from "./taxonomy.js";

export const techById = new Map(TECHNIQUES.map((t) => [t.id, t]));

// Technique ids for any node id: a technique, a specimen ("tactile-surface--2"), a domain ("evoke/material") or an operation.
export function techniquesFor(id) {
  if (techById.has(id)) return [techById.get(id)];
  const base = id.replace(/--\d+$/, ""); if (techById.has(base)) return [techById.get(base)];
  const [op, dom] = id.split("/");
  return TECHNIQUES.filter((t) => t.op === op && (!dom || t.domain === dom));
}

export function techniqueRecord(t, refs = []) {
  const op = opById[t.op];
  return {
    id: t.id, name: t.name,
    lineage: { operation: op.name, domain: DOMAINS[t.domain].name, technique: t.name },
    intent: op.ask, mechanism: t.mech, ui: t.ui, color: op.color,
    specimens: t.executions.map((e) => e.title),
    references: refs.map((b) => ({ url: b.url, author: b.author, text: b.text?.slice(0, 160), subject: b.subject, score: b.score })),
  };
}

// refsFor(techId) -> bookmark rows (optional). target: "site" | "component".
export function brief(ids, { refsFor = () => [], target = "site", maxRefs = 5 } = {}) {
  const seen = new Set(), techniques = [];
  for (const id of ids) for (const t of techniquesFor(id)) if (!seen.has(t.id)) { seen.add(t.id); techniques.push(techniqueRecord(t, refsFor(t.id).slice(0, maxRefs))); }
  const ops = [...new Set(techniques.map((t) => t.lineage.operation))];
  return { kind: "taste-atlas.brief.v1", target, operations: ops, techniques };
}

export function briefMarkdown(b) {
  const out = [`# Design brief (${b.target}) · Taste Atlas`, "", `Intent: ${b.techniques.map((t) => t.intent).filter((v, i, a) => a.indexOf(v) === i).join("; ")}.`, ""];
  for (const t of b.techniques) {
    out.push(`## ${t.name}  ·  ${t.lineage.operation} → ${t.lineage.domain} → ${t.name}`, `- Why it works: ${t.mechanism}`, `- Build it: ${t.ui}`);
    if (t.references.length) out.push(`- References: ${t.references.map((r) => `${r.url} (@${r.author})`).join(", ")}`);
    out.push("");
  }
  out.push(b.target === "component"
    ? "Apply every technique above inside one component; each must be visible in a screenshot. Name which element carries which technique."
    : "Apply each technique to at least one section; say which section carries which technique. Keep everything else quiet so these read.");
  return out.join("\n");
}

// Lexical match of a free-text request to techniques (an agent can rerank).
export function suggest(text, n = 6) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return TECHNIQUES.map((t) => {
    const hay = `${t.name} ${t.mech} ${t.ui} ${opById[t.op].ask} ${opById[t.op].name} ${t.domain}`.toLowerCase();
    return { id: t.id, name: t.name, score: words.reduce((s, w) => s + (w.length > 2 && hay.includes(w) ? 1 : 0), 0) };
  }).filter((r) => r.score).sort((a, b) => b.score - a.score).slice(0, n);
}

export const taxonomyExport = () => ({
  kind: "taste-atlas.taxonomy.v1",
  levels: ["operation", "domain", "technique", "execution"],
  operations: OPERATIONS.map((o) => ({ id: o.id, name: o.name, intent: o.ask, color: o.color })),
  domains: Object.entries(DOMAINS).map(([id, d]) => ({ id, name: d.name })),
  techniques: TECHNIQUES.map((t) => techniqueRecord(t)),
});
