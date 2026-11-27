#!/usr/bin/env node
// Entity graph → Work layer. Turns any traced {nodes, edges} graph of one repository (repos, businesses or other
// groups, the sites, pages and videos made for them, and the lineage edges between them) into data/work.atlas.json, so
// the trace opens in the atlas's own repo map (#work:<id>) and project lens (#project:<id>). No new page.
//
//   node scripts/entities.mjs <graph.json> [--root repo:<name>] [--id <productId>] [--out <dataDir>] [--merge] [--dry]
//
// Mapping (generic; nothing here knows any one repo):
//   root repo                      → a product (default: the repo node named by meta.repo, else the first repo node)
//   group node (business)          → a component of it, when it owns a site, page or video (for_business edges)
//   site / page / video            → that component's pages (kind site | page | film); a site's contained items join it
//   items several groups share     → one component per containing site, when a group has nothing of its own
//   groups with nothing made yet   → listed in the product's open notes
//   lineage out of the repo        → reuses / descends_from / implements / renders / inspired_by / cites, plus
//                                    built_with a repo or plugin, followed through the repo's own items (depth ≤ 4).
//                                    Each upstream node becomes a component of its own repo's product, shared into
//                                    the root (also[] + the root's portals), and the group lists that repo in also[],
//                                    so the map says "also in <repo>" and project focus greys the 1–2 nearest repos.
//   lineage inside the repo        → the component's "built from" metric (e.g. a film copied from another group's)
// Node fields read: id, type, label, repo ("owner/name@ref"), url, path, shot (optional image under data/), status
// (optional {value, why}). Edge fields: from, to, type, evidence. Unknown node ids in edges are skipped.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LINEAGE = new Set(["reuses", "descends_from", "implements", "renders", "inspired_by", "cites"]);
const ITEM = { site: "site", page: "page", video: "film" }, ORDER = { site: 0, page: 1, film: 2 };
const GROUP = new Set(["business"]);
const DAY = 86400, MAX_PORTALS = 8;

export const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const tail = (id) => String(id).replace(/^[^:]*:/, "");
// "Alpha Bakery LLC (owner Ann) [CRM a]" → "Alpha Bakery LLC"; long labels keep their first clause.
export const short = (label, max = 64) => {
  let s = String(label ?? "").replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\([^)]*\)/g, "").split(" | ")[0].trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return s || String(label ?? "");
};
// The repository a node lives in, as a bare lower-case name: repo nodes by URL or label, others by "owner/name@ref".
export function repoOf(n) {
  if (!n) return null;
  const gh = (u) => /github\.com\/[^/]+\/([^/#?]+)/.exec(u ?? "")?.[1];
  if (n.type === "repo") return slug(gh(n.url) ?? tail(n.id));
  if (n.repo) return slug(String(n.repo).split("@")[0].split("/").at(-1));
  return n.type === "product" || n.type === "plugin" ? (gh(n.url) ? slug(gh(n.url)) : null) : null;
}

export function entitiesToWork(graph, { root: rootId, id, now } = {}) {
  const nodes = graph.nodes ?? [], N = new Map(nodes.map((n) => [n.id, n]));
  const edges = (graph.edges ?? []).filter((e) => N.has(e.from) && N.has(e.to));
  const out = new Map(); for (const e of edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)).push(e);
  const repoNodes = nodes.filter((n) => n.type === "repo");
  const want = graph.meta?.repo ? slug(String(graph.meta.repo).split("/").at(-1)) : null;
  const root = (rootId && N.get(rootId)) ?? repoNodes.find((n) => repoOf(n) === want) ?? repoNodes[0];
  if (!root) throw new Error("entities: no repo node to root the product on (pass --root)");
  const home = repoOf(root), pid = id ?? home, at = now ?? (Date.parse(graph.meta?.generated ?? "") / 1000 || Math.floor(Date.now() / 1000));
  const source = `trace ${graph.meta?.generated ?? new Date(at * 1000).toISOString().slice(0, 10)}`;
  const status = (n, why) => ({ value: n?.status?.value ?? "unknown", why: n?.status?.why ?? why, source, checked: at, window: 14 * DAY });
  const inside = (n) => { const r = repoOf(n); return r === home || (r == null && !!ITEM[n.type]); };
  const repoName = new Map(repoNodes.map((n) => [repoOf(n), n]));

  // Items per group: direct for_business edges, plus whatever an attached site contains.
  const groupsOf = new Map(); // item id → Set(group ids)
  const add = (item, g) => (groupsOf.get(item) ?? groupsOf.set(item, new Set()).get(item)).add(g);
  for (const e of edges) if (e.type === "for_business" && ITEM[N.get(e.from).type] && GROUP.has(N.get(e.to).type)) add(e.from, e.to);
  for (const e of edges) if (e.type === "contains" && ITEM[N.get(e.from).type] && ITEM[N.get(e.to).type] && !groupsOf.has(e.to))
    for (const g of groupsOf.get(e.from) ?? []) add(e.to, g);
  const containerOf = new Map(); for (const e of edges) if (e.type === "contains" && N.get(e.from).type === "site" && ITEM[N.get(e.to).type]) containerOf.set(e.to, e.from);
  const groups = nodes.filter((n) => GROUP.has(n.type));
  const itemsOf = (g) => [...groupsOf].filter(([, s]) => s.has(g)).map(([i]) => i);
  const own = (g) => itemsOf(g).some((i) => groupsOf.get(i).size === 1 || N.get(i).type !== "page");
  const primary = groups.filter((g) => own(g.id)), empty = groups.filter((g) => !itemsOf(g.id).length);
  // Shared items of groups with nothing of their own gather under the site that contains them.
  const sharedBy = new Map(); // site id → { items:Set, groups:Set }
  for (const g of groups) if (!primary.includes(g)) for (const i of itemsOf(g.id)) {
    const s = containerOf.get(i) ?? i, v = sharedBy.get(s) ?? sharedBy.set(s, { items: new Set(), groups: new Set() }).get(s);
    if (s !== i) v.items.add(s); v.items.add(i); v.groups.add(g.id);
  }

  // Lineage: walk lineage edges through the repo's own nodes; the first node outside it is an upstream hit.
  const lineageEdge = (e) => LINEAGE.has(e.type) || (e.type === "built_with" && /^(repo|plugin)$/.test(N.get(e.to).type));
  function upstream(starts) {
    const hits = new Map(), from = new Map(), seen = new Set(starts), q = starts.map((s) => [s, 0]);
    while (q.length) {
      const [x, d] = q.shift();
      for (const e of (out.get(x) ?? []).filter(lineageEdge)) {
        const t = N.get(e.to); if (seen.has(t.id)) continue; seen.add(t.id);
        const r = repoOf(t);
        if (r && r !== home) { if (!hits.has(t.id)) hits.set(t.id, { node: t, repo: r, via: N.get(x), edge: e }); continue; }
        if (inside(t) && d < 4) { q.push([t.id, d + 1]); if (ITEM[t.type] && !starts.includes(t.id)) from.set(t.id, t); }
      }
    }
    return { hits: [...hits.values()], from: [...from.values()] };
  }

  const page = (n) => ({ id: n.id, name: short(n.label, 48), title: n.label, kind: ITEM[n.type], file: n.path ?? null, url: /^https?:/.test(n.url ?? "") ? n.url : null,
    shot: n.shot ?? null, state: n.shot ? "up" : "listed", code: "", checked: at, evidence: n.evidence ?? null });
  const pages = (ids) => [...new Set(ids)].map((i) => N.get(i)).sort((a, b) => ORDER[ITEM[a.type]] - ORDER[ITEM[b.type]]).map(page);
  const upComps = new Map(), upProducts = new Map(), components = [];
  const upId = (h) => `${h.repo}/${slug(tail(h.node.id))}`;
  // direct: used by the root repo itself (shared into it); otherwise one hop further upstream (not shared into the root).
  function upComp(h, direct = true) {
    const cid = upId(h);
    if (!upComps.has(cid)) {
      upComps.set(cid, { id: cid, product: h.repo, name: short(h.node.label, 40), label: short(h.node.label, 40), also: [], repos: [h.repo], refs: new Set(), node: h.node });
      if (!upProducts.has(h.repo)) upProducts.set(h.repo, repoName.get(h.repo) ?? { id: `repo:${h.repo}`, label: h.repo, type: "repo" });
    }
    const c = upComps.get(cid); if (direct && !c.also.includes(pid)) c.also.unshift(pid);
    return c;
  }
  const groupName = new Map();
  function component(cid, name, ids, metrics, n) {
    const { hits, from } = upstream([...(n ? [n.id] : []), ...ids]);
    for (const h of hits) upComp(h).refs.add(cid);
    const also = [...new Set(hits.map((h) => h.repo))];
    const fromGroups = [...new Set(from.flatMap((f) => [...(groupsOf.get(f.id) ?? [])]).filter((g) => !n || g !== n.id))].map((g) => groupName.get(g) ?? short(N.get(g).label));
    const pg = pages(ids), films = pg.filter((p) => p.kind === "film").length, sites = pg.length - films;
    const why = [sites && `${sites} site${sites > 1 ? "s" : ""}/pages`, films && `${films} film${films > 1 ? "s" : ""}`, fromGroups.length && `built from ${fromGroups.join(", ")}`].filter(Boolean).join(" · ") || "nothing made yet";
    components.push({ id: cid, product: pid, name, label: name, traced: true, also, keywords: [], repos: [home], weight: pg.length, lastTouched: at, touches: [[at, Math.max(1, pg.length)]],
      status: status(n, why), prs: [], pages: pg, asks: [], films: [],
      metrics: [...metrics, ...(fromGroups.length ? [["built from", fromGroups.join(", "), source]] : []),
        ...hits.map((h) => [`${h.edge.type.replace(/_/g, " ")} ${h.repo}`, `${short(h.node.label, 60)} (via ${short(h.via.label, 40)})`, h.edge.evidence ?? source])],
      lineage: hits.map((h) => ({ from: h.via.id, to: h.node.id, type: h.edge.type, repo: h.repo, evidence: h.edge.evidence ?? null })) });
  }
  for (const g of primary) groupName.set(g.id, short(g.label, 36));
  for (const g of primary) component(`${pid}/${slug(tail(g.id))}`, groupName.get(g.id), itemsOf(g.id), [], g);
  for (const [s, v] of sharedBy) component(`${pid}/${slug(tail(s))}`, short(N.get(s).label, 36), [...v.items], [["for", [...v.groups].map((g) => short(N.get(g).label, 30)).join(", "), source]], null);

  // Upstream: one hop further between outside repos too (e.g. a film repo that renders a plugin), so the chain reads.
  for (const c of [...upComps.values()]) for (const e of (out.get(c.node.id) ?? []).filter(lineageEdge)) {
    const t = N.get(e.to), r = repoOf(t);
    if (r && r !== home && r !== c.product) { upComp({ node: t, repo: r }, false).refs.add(c.id); if (!c.also.includes(r)) c.also.push(r); }
  }
  const upList = [...upComps.values()].map(({ refs, node, ...c }) => ({ ...c, traced: true, weight: refs.size, lastTouched: at, touches: [[at, Math.max(1, refs.size)]], keywords: [],
    status: status(node, `used by ${refs.size} part${refs.size > 1 ? "s" : ""} of ${root.label}`), prs: [], asks: [], films: [],
    pages: ITEM[node.type] ? [page(node)] : [], metrics: [["used by", [...refs].map((r) => components.find((x) => x.id === r)?.name ?? upComps.get(r)?.name ?? r).join(", "), source]] }));
  const all = [...components, ...upList];
  // Portals: the outside parts this product uses most, at most MAX_PORTALS so a phone can still read the map; the
  // rest still show as "also in <repo>" on the parts that use them.
  const portalsOf = (p) => all.filter((c) => c.product !== p && c.also.includes(p)).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, MAX_PORTALS).map((c) => c.id);
  const product = (p, name, n, extra = {}) => {
    const mine = all.filter((c) => c.product === p), t = mine.reduce((a, c) => a + c.touches[0][1], 0);
    return { id: p, label: name, name, traced: true, atlas: null, role: extra.role ?? null, verdict: null, deadline: null, keywords: [],
      weight: t, lastTouched: at, touches: [[at, Math.max(1, t)]], status: status(n, extra.why ?? `${mine.length} parts traced`),
      metrics: extra.metrics ?? [], repos: [{ id: p, gh: /github\.com\/([^/]+\/[^/#?]+)/.exec(n?.url ?? "")?.[1] ?? null, ok: false, why: `from the ${source}; run work.mjs for live git` }],
      components: mine.map((c) => c.id), portals: portalsOf(p), notes: extra.notes ?? null, links: n?.url ? [[`${name} on GitHub`, n.url]] : [], asks: [], films: [] };
  };
  const direct = new Set(components.flatMap((c) => c.also)); // repos the root's own parts use (not the hop beyond)
  const nFilms = components.reduce((a, c) => a + c.pages.filter((x) => x.kind === "film").length, 0), nPages = components.reduce((a, c) => a + c.pages.length, 0) - nFilms;
  const rootP = product(pid, root.label, root, {
    role: `${primary.length} ${[...GROUP].join("/")}es · ${nPages} sites/pages · ${nFilms} films`,
    why: `${primary.length} with work · built on ${direct.size} other repos`,
    metrics: [["groups", String(primary.length), source], ["sites/pages", String(nPages), source], ["films", String(nFilms), source], ["upstream repos", String(direct.size), source]],
    notes: { open: empty.length ? [`Nothing made yet: ${empty.map((g) => short(g.label, 30)).join(", ")}`] : [], risks: [], done: [], source } });
  rootP.links.push(...[...upProducts.values()].filter((n) => n.url).map((n) => [`${n.label} (upstream)`, n.url]));
  const products = [rootP, ...[...upProducts].map(([r, n]) => product(r, short(n.label, 30), n, { why: `upstream of ${root.label}` }))];
  return { kind: "taste-atlas.work.v1", generated: new Date(at * 1000).toISOString(), generatedAt: at, halfLifeHours: 48, windowDays: 21, source: { kind: "entities", root: root.id, nodes: nodes.length, edges: edges.length },
    products, components: all, ci: {}, repos: {}, unmapped: [], errors: [] };
}

// Merge into an existing work.atlas.json: products and components with the same ids are replaced, the rest kept.
export function mergeWork(base, add) {
  if (!base?.products) return add;
  const ids = new Set(add.products.map((p) => p.id)), cids = new Set(add.components.map((c) => c.id));
  return { ...base, products: [...base.products.filter((p) => !ids.has(p.id)), ...add.products], components: [...base.components.filter((c) => !cids.has(c.id)), ...add.components] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const file = a.find((x, i) => !x.startsWith("--") && !["--root", "--id", "--out"].includes(a[i - 1]));
  if (!file) { console.error("usage: node scripts/entities.mjs <graph.json> [--root <nodeId>] [--id <productId>] [--out <dataDir>] [--merge] [--dry]"); process.exit(2); }
  const dir = opt("--out") ?? process.env.ATLAS_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data"), dest = join(dir, "work.atlas.json");
  let w = entitiesToWork(JSON.parse(readFileSync(file, "utf8")), { root: opt("--root"), id: opt("--id") });
  if (a.includes("--merge") && existsSync(dest)) w = mergeWork(JSON.parse(readFileSync(dest, "utf8")), w);
  console.log(JSON.stringify({ products: w.products.map((p) => `${p.id}: ${p.components.length} parts + ${p.portals.length} portals`), components: w.components.length }, null, 1));
  if (!a.includes("--dry")) { mkdirSync(dir, { recursive: true }); writeFileSync(dest, JSON.stringify(w, null, 1)); console.log(`wrote ${dest}`); }
}
