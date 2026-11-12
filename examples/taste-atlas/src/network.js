// Network view (/network): your LinkedIn connections as one canvas graph, from scripts/network.mjs.
// You sit in the middle; connections pull closer the warmer they are (messages both ways, recency, endorsements);
// companies are hubs of the people who work there. Click a company for the warmest way in, a person for who
// else they can reach. Rendering is sigma.js (WebGL) with a ForceAtlas2 layout from graphology.
import Graph from "https://esm.sh/graphology@0.25.4";
import Sigma from "https://esm.sh/sigma@3.0.2";
import forceAtlas2 from "https://esm.sh/graphology-layout-forceatlas2@0.10.1";
import { mountNav, getTheme, saveTheme } from "./nav.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n).toLocaleString();
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".chrome .brand"));
const IMPORT = `Import your export (LinkedIn → Settings → Data privacy → Get a copy of your data):<br><code>node scripts/network.mjs Basic_LinkedInDataExport.zip</code>`;

const r = await fetch("/data/network.atlas.json", { cache: "no-store" });
if (!r.ok) { document.body.insertAdjacentHTML("beforeend", `<div class="empty-net"><p>${r.status === 404 ? "No network imported yet." : `The network could not load (server error ${r.status}).`}</p><p>${IMPORT}</p></div>`); throw new Error(`network.atlas.json ${r.status}`); }
const data = await r.json(), byId = new Map(data.nodes.map((n) => [n.id, n]));
const COL = { me: "--ink", company: "#2f6fd6", mine: "#1f8a5b", fof: "#7b3fa0" };
const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
const warmCol = (w) => `hsl(${28 - Math.min(1, w / 14) * 18}, ${30 + Math.min(1, w / 10) * 60}%, ${62 - Math.min(1, w / 14) * 18}%)`; // grey → amber → red
const colorOf = (n) => n.type === "me" ? css("--ink") : n.type === "company" ? (n.mine ? COL.mine : COL.company) : n.type === "fof" ? COL.fof : n.warmth > 1 ? warmCol(n.warmth) : css("--mute");
const sizeOf = (n) => n.type === "me" ? 16 : n.type === "company" ? 3 + 2.2 * Math.sqrt(n.n) : n.type === "fof" ? 3 : 1.6 + Math.sqrt(n.warmth);

// Seed the layout: companies on a ring, their people around them, unaffiliated people scattered.
const g = new Graph({ type: "undirected" });
const hubs = data.nodes.filter((n) => n.type === "company"), ring = new Map(hubs.map((h, i) => [h.id, i]));
const workAt = new Map(data.edges.filter((e) => e.type === "works").map((e) => [e.s, e.t]));
for (const n of data.nodes) {
  let x = 0, y = 0;
  if (n.type === "company") { const a = (2 * Math.PI * ring.get(n.id)) / hubs.length; x = 100 * Math.cos(a); y = 100 * Math.sin(a); }
  else if (n.type !== "me") { const h = workAt.get(n.id), a = h ? (2 * Math.PI * ring.get(h)) / hubs.length : Math.random() * 2 * Math.PI, d = h ? 100 : 40 + 120 * Math.random(); x = d * Math.cos(a) + Math.random() * 6; y = d * Math.sin(a) + Math.random() * 6; }
  g.addNode(n.id, { x, y, size: sizeOf(n), label: n.label, color: colorOf(n), kind: n.type });
}
for (const e of data.edges) if (!g.hasEdge(e.s, e.t)) g.addEdge(e.s, e.t, { weight: e.type === "knows" ? 0.15 + Math.min(4, e.w / 4) : e.type === "works" ? 2 : 1, kind: e.type, warm: e.w });
forceAtlas2.assign(g, { iterations: 220, settings: { ...forceAtlas2.inferSettings(g), barnesHutOptimize: true, linLogMode: true, gravity: 0.6, edgeWeightInfluence: 1 } });

const state = { hover: null, focus: null, hidden: new Set(), lit: null };
// Sigma's stock hover box is white whatever the theme; draw it in the page's own panel and ink colours.
function hoverLabel(ctx, d, s) {
  const size = s.labelSize, font = `${s.labelWeight} ${size}px ${s.labelFont}`; ctx.font = font;
  const w = d.label ? ctx.measureText(d.label).width + 10 : 0, h = size + 8, x = d.x + d.size + 3, y = d.y - h / 2;
  ctx.fillStyle = css("--bg"); ctx.shadowBlur = 8; ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.arc(d.x, d.y, d.size + 3, 0, 2 * Math.PI); ctx.fill();
  if (w) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); }
  ctx.shadowBlur = 0; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, 2 * Math.PI); ctx.fill();
  if (w) { ctx.fillStyle = css("--ink"); ctx.fillText(d.label, x + 5, d.y + size / 3); }
}
const nbrs = (id) => new Set([id, ...g.neighbors(id)]);
const sigma = new Sigma(g, $("#graph"), {
  labelFont: "Inter, sans-serif", labelWeight: "500", labelSize: 12, labelColor: { color: css("--ink") },
  labelRenderedSizeThreshold: 9, defaultEdgeColor: css("--line"), zIndex: true, minCameraRatio: 0.02, maxCameraRatio: 3, defaultDrawNodeHover: hoverLabel,
  nodeReducer: (id, a) => {
    const r = { ...a };
    if (state.hidden.has(a.kind) && id !== "me") return { ...r, hidden: true };
    if (state.lit && !state.lit.has(id)) { r.color = css("--line"); r.label = ""; r.zIndex = 0; }
    else if (state.lit) { r.zIndex = 2; r.forceLabel = a.kind !== "person" || state.lit.size < 60; }
    if (id === state.focus || id === state.hover) { r.highlighted = true; r.forceLabel = true; r.zIndex = 3; }
    return r;
  },
  // Your 3k "knows" spokes would bury everything: draw only warm ones unless a node is lit.
  edgeReducer: (id, a) => {
    const [s, t] = g.extremities(id);
    if (state.hidden.has(g.getNodeAttribute(s, "kind")) || state.hidden.has(g.getNodeAttribute(t, "kind"))) return { ...a, hidden: true };
    if (state.lit) return state.lit.has(s) && state.lit.has(t) && (s === (state.hover ?? state.focus) || t === (state.hover ?? state.focus) || a.kind !== "knows") ? { ...a, color: css("--mute"), size: 1 } : { ...a, hidden: true };
    if (a.kind === "knows" && a.warm < 6) return { ...a, hidden: true };
    return { ...a, color: css("--line"), size: a.kind === "knows" ? 0.6 : 0.4 };
  },
});
const light = () => { const id = state.hover ?? state.focus; state.lit = id ? nbrs(id) : null; sigma.refresh({ skipIndexation: true }); };
sigma.on("enterNode", ({ node }) => { state.hover = node; light(); $("#graph").style.cursor = "pointer"; });
sigma.on("leaveNode", () => { state.hover = null; light(); $("#graph").style.cursor = ""; });
sigma.on("clickNode", ({ node }) => focus(node));
sigma.on("clickStage", () => focus(null));

function focus(id, fly = true) {
  state.focus = id; state.hover = null; light(); show(id);
  history.replaceState(null, "", id ? `#${encodeURIComponent(id)}` : location.pathname);
  if (!fly) return;
  if (!id) return sigma.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 600 });
  const d = sigma.getNodeDisplayData(id); if (d) sigma.getCamera().animate({ x: d.x, y: d.y, ratio: byId.get(id).type === "company" ? 0.25 : 0.15 }, { duration: 700 });
}

// ---------- card
const when = (d) => d ? new Date(d + "T00:00Z").toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
const why = (p) => [p.msgs ? `${fmt(p.msgs)} msgs${p.twoWay ? " both ways" : ""}` : null, p.last ? `last ${when(p.last)}` : null, p.endorse ? `${p.endorse} endorsements` : null].filter(Boolean).join(" · ") || (p.since ? `connected ${when(p.since)}` : "connected");
const row = (p) => `<div class="p" data-id="${esc(p.id)}"><span>${esc(p.label)}</span><b>${p.warmth}</b><small>${esc(p.position ?? "")}${p.position ? " · " : ""}${esc(why(p))}</small></div>`;
const coRow = (c) => `<div class="p" data-id="${esc(c.id)}"><span>${esc(c.label)}</span><b>${c.n} · ${c.reach}</b><small>via ${esc(byId.get(c.best[0])?.label ?? "")}</small></div>`;
const cos = data.nodes.filter((n) => n.type === "company").sort((a, b) => b.reach - a.reach);
const colleagues = (p) => { const h = workAt.get(p.id); return h ? byId.get(h).best.map((id) => byId.get(id)).filter((q) => q.id !== p.id) : []; };
function show(id) {
  const n = id && byId.get(id), card = $("#card");
  if (!n) { card.innerHTML = ""; return; }
  let h = "";
  if (n.type === "me") {
    const s = data.stats;
    h = `<h2><em>${esc(n.label)}</em></h2><div class="sub">${esc(n.headline ?? "")}</div>
      <div class="meta"><i>${fmt(s.connections)} connections</i><i>${fmt(s.companies)} companies</i><i>talked with ${fmt(s.talkedTo)}</i><i>${fmt(s.threads)} threads</i></div>
      <h3>Warmest way in · people · reach</h3>${cos.slice(0, 8).map(coRow).join("")}
      ${cos.some((c) => c.mine) ? `<h3>Where you worked</h3>${cos.filter((c) => c.mine).map(coRow).join("")}` : ""}
      <h3>Warmest connections</h3>${data.nodes.filter((x) => x.type === "person").sort((a, b) => b.warmth - a.warmth).slice(0, 12).map(row).join("")}`;
  } else if (n.type === "company") {
    const ppl = n.best.map((x) => byId.get(x)), top = ppl[0];
    h = `<h2>${esc(n.label)}</h2><div class="sub">${fmt(n.n)} connection${n.n > 1 ? "s" : ""} · reach ${n.reach}${n.mine ? ` · <b style="color:${COL.mine}">you worked here${typeof n.mine === "string" ? ` (${esc(n.mine)})` : ""}</b>` : ""}</div>
      ${top ? `<div class="path">Best way in: <b>You</b> → <b>${esc(top.label)}</b> → ${esc(n.label)}<br><span style="color:var(--mute)">${esc(why(top))}</span></div>` : ""}
      <h3>People there, warmest first</h3>${ppl.map(row).join("")}${n.n > ppl.length ? `<div class="sub">+${n.n - ppl.length} more (search the company)</div>` : ""}`;
  } else {
    const co = workAt.get(n.id) && byId.get(workAt.get(n.id)), warmer = colleagues(n).filter((q) => q.warmth > n.warmth + 2);
    const tog = g.neighbors(n.id).map((x) => byId.get(x)).filter((q) => q.type === "person" && g.getEdgeAttribute(g.edge(n.id, q.id), "kind") === "together");
    h = `<h2>${esc(n.label)}</h2><div class="sub">${esc(n.position ?? "")}${n.company ? ` @ ${co ? `<a data-id="${esc(co.id)}" style="cursor:pointer;text-decoration:underline">${esc(n.company)}</a>` : esc(n.company)}` : ""}</div>
      <div class="meta"><i>warmth ${n.warmth}</i>${n.type === "fof" ? `<i>not connected${n.invited === "them" ? " · invited you" : ""}</i>` : n.since ? `<i>since ${when(n.since)}</i>` : ""}${n.msgs ? `<i>${fmt(n.msgs)} msgs${n.twoWay ? " ⇄" : ""}</i>` : ""}${n.last ? `<i>last ${when(n.last)}</i>` : ""}${n.endorse ? `<i>${n.endorse} endorsements</i>` : ""}</div>
      ${warmer.length ? `<div class="path">Warmer path: <b>You</b> → <b>${esc(warmer[0].label)}</b> → ${esc(n.label)}<br><span style="color:var(--mute)">same company · ${esc(why(warmer[0]))}</span></div>` : ""}
      ${n.via?.length ? `<h3>Reach them via</h3>${n.via.map((x) => row(byId.get(x))).join("")}` : ""}
      ${tog.length ? `<h3>In threads with</h3>${tog.map(row).join("")}` : ""}
      ${co ? `<h3>Also at ${esc(co.label)}</h3>${colleagues(n).slice(0, 6).map(row).join("")}` : ""}
      ${n.url ? `<p><a class="out" href="${esc(n.url)}" target="_blank" rel="noopener">Open on LinkedIn ↗</a></p>` : ""}`;
  }
  card.innerHTML = h;
}
$("#card").addEventListener("click", (e) => { const t = e.target.closest("[data-id]"); if (t) focus(t.dataset.id); });

// ---------- search
const q = $("#q"), hits = $("#hits"), hay = data.nodes.map((n) => [n, `${n.label} ${n.company ?? ""} ${n.position ?? ""}`.toLowerCase()]);
let sel = 0, found = [];
const paint = () => { hits.innerHTML = found.length ? found.map((n, i) => `<div class="${i === sel ? "sel" : ""}" data-id="${esc(n.id)}">${esc(n.label)}<small>${n.type === "company" ? `${n.n} people` : esc(n.company ?? n.type)}</small></div>`).join("") : `<div class="none">no match</div>`; hits.classList.toggle("on", !!q.value.trim()); };
q.addEventListener("input", () => {
  const t = q.value.trim().toLowerCase(); sel = 0;
  found = t ? hay.filter(([, s]) => s.includes(t)).map(([n]) => n).sort((a, b) => (b.type === "company") - (a.type === "company") || (b.reach ?? b.warmth ?? 0) - (a.reach ?? a.warmth ?? 0)).slice(0, 12) : [];
  paint();
});
q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : found.length - 1)) % Math.max(1, found.length); paint(); e.preventDefault(); }
  if (e.key === "Enter" && found[sel]) { focus(found[sel].id); q.blur(); hits.classList.remove("on"); }
  if (e.key === "Escape") { q.value = ""; hits.classList.remove("on"); q.blur(); }
});
hits.addEventListener("click", (e) => { const t = e.target.closest("[data-id]"); if (t) { focus(t.dataset.id); hits.classList.remove("on"); } });

// ---------- legend: type toggles (the ranked "where can I get in" lists live on your own card)
const TYPES = [["company", "Companies", COL.company], ["person", "Connections", warmCol(10)], ["fof", "Friends of friends", COL.fof]];
$("#legend").innerHTML = TYPES.map(([k, l, c]) => `<button data-k="${k}"><i style="background:${c}"></i>${l}</button>`).join("") + `<button data-k="mine-key" disabled><i style="background:${COL.mine}"></i>Where you worked</button>`;
$("#legend").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]:not([disabled])"); if (!b) return;
  state.hidden.has(b.dataset.k) ? state.hidden.delete(b.dataset.k) : state.hidden.add(b.dataset.k);
  b.classList.toggle("off", state.hidden.has(b.dataset.k)); sigma.refresh();
});
$("#stat").textContent = `${fmt(data.stats.connections)} connections · ${fmt(data.stats.hubs)} company hubs · imported ${data.generated}`;

// ---------- theme, keys, deep link
const retheme = () => {
  for (const n of data.nodes) g.setNodeAttribute(n.id, "color", colorOf(n));
  sigma.setSetting("labelColor", { color: css("--ink") }); sigma.setSetting("defaultEdgeColor", css("--line"));
};
const theme = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); retheme(); };
$("#theme").onclick = theme;
addEventListener("keydown", (e) => {
  if (e.target === q) return;
  if (e.key === "t") theme();
  if (e.key === "Escape") focus(null);
  if (e.key === "/") { q.focus(); e.preventDefault(); }
});
const hash = decodeURIComponent(location.hash.slice(1));
focus(byId.has(hash) ? hash : "me", byId.has(hash));
window.__network = { sigma, graph: g, data, focus }; // for scripted checks (scripts/shot.mjs)
