// Taste Atlas renderer: radial taxonomy graph + lineage card. Pure state -> DOM, so the same code
// drives the interactive app (main.js) and deterministic film scenes (view(state) per frame).
import { buildTree, opById, lineage, DOMAINS, TECHNIQUES } from "./taxonomy.js";
import { specimen, CARD } from "./specimens.js";

const NS = "http://www.w3.org/2000/svg";
const RADII = [0, 320, 700, 1100, 1680];
const MOTION = new Set(["ease", "stagger", "morph", "parallax", "ticker", "alive"]);
export const LEVELS = ["OPERATION", "DOMAIN", "TECHNIQUE", "EXECUTION"];

export const ICONS = {
  differentiate: `<rect x="3" y="3" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="3" width="7" height="14" fill="currentColor"/>`,
  infer: `<path d="M4 6h12M4 10h8M4 14h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  group: `<circle cx="7" cy="7" r="2.6" fill="currentColor"/><circle cx="13" cy="7" r="2.6" fill="currentColor"/><circle cx="10" cy="13" r="2.6" fill="currentColor"/>`,
  direct: `<path d="M3 15L15 5M15 5H8M15 5v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  animate: `<path d="M3 13c3-7 6-7 9 0s4 0 5-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  evoke: `<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.5" fill="currentColor"/>`,
  feature: `<circle cx="7" cy="10" r="4" fill="currentColor"/><rect x="11" y="6" width="7" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  semantic: `<circle cx="7" cy="10" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="10" r="4.5" fill="currentColor" opacity=".6"/>`,
  space: `<rect x="3" y="3" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="10" cy="10" r="2" fill="currentColor"/>`,
  grouping: `<rect x="2.5" y="4" width="15" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="10" r="1.8" fill="currentColor"/><circle cx="13" cy="10" r="1.8" fill="currentColor"/>`,
  cultural: `<rect x="4" y="3" width="12" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 13l3-4 2 2 3-4" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  time: `<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  material: `<path d="M3 14c2-6 12-6 14 0" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="10" cy="14" rx="7" ry="2.5" fill="currentColor" opacity=".5"/>`,
  technique: `<circle cx="10" cy="10" r="3.5" fill="currentColor"/><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/>`,
};
const icon = (k, size = 20) => `<svg viewBox="0 0 20 20" width="${size}" height="${size}">${ICONS[k] ?? ICONS.technique}</svg>`;

// Radial tree: leaves get equal arc, operations are separated by a gap.
export function layout() {
  const { root, byId } = buildTree();
  const leaves = [];
  const walk = (n) => (n.children.length ? n.children.forEach(walk) : leaves.push(n));
  walk(root);
  const gap = 1.6, total = leaves.length + gap * root.children.length;
  let slot = gap / 2, lastOp = leaves[0].op;
  for (const l of leaves) {
    if (l.op !== lastOp) { slot += gap; lastOp = l.op; }
    l.a = -Math.PI / 2 + (slot / total) * Math.PI * 2; slot += 1;
  }
  const angle = (n) => (n.children.length ? (angle(n.children[0]) + angle(n.children[n.children.length - 1])) / 2 : n.a);
  for (const n of byId.values()) {
    n.a = n.level === 0 ? 0 : angle(n);
    n.x = Math.cos(n.a) * RADII[n.level]; n.y = Math.sin(n.a) * RADII[n.level];
  }
  return { root, byId, leaves };
}

function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; }

function subtree(n, out = new Set()) { out.add(n.id); n.children.forEach((c) => subtree(c, out)); return out; }

export function createAtlas({ svg, card, width, height }) {
  // Optional fit region {x, y, w, h} in screen px (films reserve room for captions and the card).
  const g = layout();
  const view = { cam: { x: 0, y: 0, s: 0.3 }, focus: "root", theme: "light", t: 0, hover: null, cardIn: 1 };
  const world = el("g", {}, svg);
  const edgeLayer = el("g", { fill: "none" }, world);
  const nodeLayer = el("g", {}, world);
  const parts = new Map();

  // Edges: radial cubic from parent to child.
  for (const n of g.byId.values()) {
    if (!n.parent) continue;
    const p = n.parent, rp = RADII[p.level], rc = RADII[n.level], rm = (rp + rc) / 2;
    const d = p.level === 0
      ? `M0 0 L${n.x} ${n.y}`
      : `M${p.x} ${p.y} C${Math.cos(p.a) * rm} ${Math.sin(p.a) * rm} ${Math.cos(n.a) * rm} ${Math.sin(n.a) * rm} ${n.x} ${n.y}`;
    const path = el("path", { d, "stroke-linecap": "round" }, edgeLayer);
    parts.set("e:" + n.id, path);
  }
  // Nodes.
  for (const n of g.byId.values()) {
    const grp = el("g", { transform: `translate(${n.x} ${n.y})`, "data-id": n.id, class: "node " + (n.kind ?? "root") }, nodeLayer);
    const part = { g: grp, n };
    if (n.level === 0) {
      part.shape = el("circle", { r: 10 }, grp);
    } else if (n.kind === "operation") {
      part.shape = el("circle", { r: 40, "stroke-width": 2.5 }, grp);
      part.icon = el("g", { transform: "translate(-15 -15) scale(1.5)" }, grp); part.icon.innerHTML = ICONS[n.op];
    } else if (n.kind === "domain") {
      part.shape = el("rect", { x: -16, y: -16, width: 32, height: 32, rx: 9, "stroke-width": 2 }, grp);
      part.icon = el("g", { transform: "translate(-10 -10)" }, grp); part.icon.innerHTML = ICONS[n.domain];
    } else if (n.kind === "technique") {
      part.shape = el("circle", { r: 20, "stroke-width": 2 }, grp);
      part.icon = el("g", { transform: "translate(-10 -10)" }, grp); part.icon.innerHTML = ICONS.technique;
    } else {
      const s = 0.5, w = CARD.w * s, h = CARD.h * s;
      part.frame = el("g", { transform: `translate(${-w / 2} ${-h / 2}) scale(${s})` }, grp);
      const clip = el("clipPath", { id: "clip-" + n.id }, grp); el("rect", { width: CARD.w, height: CARD.h, rx: 6 }, clip);
      part.art = el("g", { "clip-path": `url(#clip-${n.id})` }, part.frame);
      part.art.innerHTML = specimen(n.family, n.seed, 0);
      part.shape = el("rect", { width: CARD.w, height: CARD.h, rx: 6, fill: "none", "stroke-width": 2 }, part.frame);
      part.motion = MOTION.has(n.family);
    }
    part.label = el("text", { "text-anchor": "middle", class: "label" }, grp);
    part.label.textContent = n.name;
    parts.set(n.id, part);
  }

  const color = (op, theme) => (op ? (theme === "dark" ? opById[op].night : opById[op].color) : theme === "dark" ? "#8f8a80" : "#8a857a");

  function fit(id, pad = 0.82, region) {
    const n = g.byId.get(id) ?? g.root;
    const ids = n.level === 4 ? subtree(n.parent) : subtree(n);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of ids) { const m = g.byId.get(k); const r = m.level === 4 ? 60 : 50; x0 = Math.min(x0, m.x - r); y0 = Math.min(y0, m.y - r); x1 = Math.max(x1, m.x + r); y1 = Math.max(y1, m.y + r); }
    if (n.level >= 2) { const p = n.level === 4 ? n.parent : n; x0 = Math.min(x0, p.x - 60); y0 = Math.min(y0, p.y - 60); x1 = Math.max(x1, p.x + 60); y1 = Math.max(y1, p.y + 60); }
    const R = region ?? { x: 0, y: 0, w: width(), h: height() };
    const s = Math.min((R.w * pad) / (x1 - x0), (R.h * pad) / (y1 - y0), 2.2);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s, cx: R.x + R.w / 2, cy: R.y + R.h / 2 };
  }

  function render(next = {}) {
    Object.assign(view, next);
    const { cam, theme, t } = view;
    const dark = theme === "dark";
    svg.ownerDocument.documentElement.dataset.theme = theme;
    const W = width(), H = height();
    world.setAttribute("transform", `translate(${(cam.cx ?? W / 2) - cam.x * cam.s} ${(cam.cy ?? H / 2) - cam.y * cam.s}) scale(${cam.s})`);
    const f = g.byId.get(view.focus) ?? g.root;
    const lit = f.level === 0 ? null : subtree(f.level === 4 ? f.parent : f);
    if (lit) for (let p = f; p; p = p.parent) lit.add(p.id);
    const inv = (view.labelScale ?? 1) / cam.s;
    for (const [key, part] of parts) {
      if (key.startsWith("e:")) {
        const id = key.slice(2), n = g.byId.get(id);
        const on = !lit || (lit.has(id) && lit.has(n.parent.id));
        part.setAttribute("stroke", color(n.op, theme));
        part.setAttribute("stroke-width", (on && lit ? 2.2 : 1.2) * Math.max(inv, 0.6));
        part.setAttribute("stroke-opacity", on ? (n.parent.level === 0 ? 0.35 : 0.85) : 0.04);
        continue;
      }
      const n = part.n, on = !lit || lit.has(n.id), c = color(n.op, theme);
      part.g.setAttribute("opacity", on ? 1 : 0.05);
      if (n.level === 0) { part.shape.setAttribute("fill", dark ? "#ece8df" : "#1b1a17"); part.shape.setAttribute("opacity", lit ? 0 : 1); }
      else if (n.kind !== "execution") {
        part.shape.setAttribute("fill", dark ? "#1a1f21" : "#f7f6f2");
        part.shape.setAttribute("stroke", n.id === view.focus || n.id === view.hover ? c : on && lit ? c : dark ? "#3c4245" : "#cfccc4");
        part.icon.setAttribute("color", on && (lit || n.kind === "operation") ? c : dark ? "#7d7a72" : "#9a968c");
      } else {
        part.shape.setAttribute("stroke", n.id === view.focus ? c : n.id === view.hover ? c : dark ? "#2a2f31" : "#d9d6ce");
        part.shape.setAttribute("stroke-width", n.id === view.focus ? 6 : 2);
        if (part.motion && view.animate) part.art.innerHTML = specimen(n.family, n.seed, t + n.seed * 0.37);
      }
      // Labels keep a constant on-screen size; small levels hide when zoomed out.
      const px = n.level === 1 ? 17 : n.level === 2 ? 12 : n.level === 3 ? 13 : 11;
      const minS = [0, 0, 0.32, 0.42, 0.75][n.level];
      const show = n.level > 0 && cam.s >= minS && (n.level < 4 || (lit && lit.has(n.id)) || cam.s > 1.1);
      const off = n.level === 1 ? 62 : n.level === 4 ? 64 : 34;
      part.label.setAttribute("font-size", px * Math.max(inv, 0.5));
      part.label.setAttribute("y", off + px * Math.max(inv, 0.5));
      part.label.setAttribute("fill", n.level === 1 ? c : dark ? "#d8d4ca" : "#2c2a26");
      part.label.setAttribute("opacity", show ? 1 : 0);
      part.label.setAttribute("class", "label l" + n.level);
    }
    renderCard(f);
  }

  function renderCard(f) {
    if (!card) return;
    if (!f.level) {
      card.innerHTML = `<div class="intro"><div class="eyebrow">A TAXONOMY OF TASTE</div><h1>Why an image <em>works.</em></h1><p>Every specimen is filed by what it asks the viewer to do, the property that carries it, and the named technique.</p>${LEVELS.map((L, i) => `<div class="lv"><b>0${i + 1}</b>${L}</div>`).join("")}</div>`;
      card.style.opacity = view.cardIn; card.style.transform = `translateY(${(1 - view.cardIn) * -12}px)`;
      return;
    }
    const line = lineage(f);
    const op = line[0]?.op;
    const c = op ? color(op, view.theme) : "#8a857a";
    const rows = LEVELS.map((L, i) => {
      const n = line[i];
      let val = n ? n.name : "—", sub = "", ic = "";
      if (i === 0 && n) ic = icon(n.op);
      if (i === 1 && n) ic = icon(n.domain);
      if (i === 2 && n) { ic = icon("technique"); sub = `<div class="mech">${n.mech}</div>`; }
      if (i === 3) {
        if (n) { ic = `<svg viewBox="0 0 ${CARD.w} ${CARD.h}" width="22" height="28">${specimen(n.family, n.seed, view.t)}</svg>`; val = `<em>${n.name}</em>`; }
        else if (line[2]) val = `<em>${line[2].children.length} specimens</em>`;
      }
      return `<div class="row ${n ? "on" : ""}"><div class="ic" style="color:${c}">${ic}</div><div><div class="k"><b style="color:${c}">0${i + 1}</b> ${L}</div><div class="v ${i === 2 ? "mono" : ""}">${val}</div>${sub}</div></div>`;
    }).join("");
    const preview = line[3] ? `<div class="preview"><svg viewBox="0 0 ${CARD.w} ${CARD.h}" preserveAspectRatio="xMidYMid slice">${specimen(line[3].family, line[3].seed, view.t)}</svg></div>` : "";
    card.innerHTML = `<div class="rows">${rows}</div>${preview}`;
    card.style.opacity = view.cardIn;
    card.style.transform = `translateY(${(1 - view.cardIn) * -12}px)`;
  }

  return { graph: g, view, render, fit, parts };
}

export const stats = () => ({ techniques: TECHNIQUES.length, executions: TECHNIQUES.reduce((a, t) => a + t.executions.length, 0), domains: Object.keys(DOMAINS).length });
