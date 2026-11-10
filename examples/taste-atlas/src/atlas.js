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
      el("rect", { width: CARD.w, height: CARD.h, rx: 6, class: "swatch", fill: opById[n.op].color, opacity: 0.55 }, part.frame);
      part.art = el("g", { "clip-path": `url(#clip-${n.id})`, class: "art" }, part.frame);
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
    for (const [a, b, c, d] of view.extraBounds?.(ids) ?? []) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); }
    if (n.level >= 2) { const p = n.level === 4 ? n.parent : n; x0 = Math.min(x0, p.x - 60); y0 = Math.min(y0, p.y - 60); x1 = Math.max(x1, p.x + 60); y1 = Math.max(y1, p.y + 60); }
    const R = region ?? { x: 0, y: 0, w: width(), h: height() };
    const s = Math.min((R.w * pad) / (x1 - x0), (R.h * pad) / (y1 - y0), 2.2);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s, cx: R.x + R.w / 2, cy: R.y + R.h / 2 };
  }

  // Rendering is split by what invalidates it, because the app calls render() every animation frame:
  // state (focus/hover/theme) recolours; camera moves the world and resizes visible labels and edges;
  // animated specimens repaint only when on screen and big enough to see, at view.motionFps (film: every call).
  const keys = { state: "", cam: "", motion: "", card: "" };
  let force = false; // invalidate(): next render rewrites every attribute (films mutate opacities between frames)
  const setA = (e, k, v) => { if (force || e["_" + k] !== v) { e["_" + k] = v; e.setAttribute(k, v); } };
  let lit = null, committed = null, lastKey = "";
  function render(next = {}) {
    Object.assign(view, next);
    const { cam, theme, t } = view;
    const dark = theme === "dark";
    const W = width(), H = height();
    const f = g.byId.get(view.focus) ?? g.root;
    const stateKey = `${view.focus}|${view.hover}|${theme}`;
    if (stateKey !== keys.state) {
      keys.state = stateKey; keys.cam = "";
      svg.ownerDocument.documentElement.dataset.theme = theme;
      lit = f.level === 0 ? null : subtree(f.level === 4 ? f.parent : f);
      if (lit) for (let p = f; p; p = p.parent) lit.add(p.id);
      for (const [key, part] of parts) {
        if (key.startsWith("e:")) {
          const id = key.slice(2), n = g.byId.get(id), on = !lit || (lit.has(id) && lit.has(n.parent.id));
          setA(part, "stroke", color(n.op, theme));
          setA(part, "stroke-opacity", on ? (n.parent.level === 0 ? 0.35 : 0.85) : 0.04);
          continue;
        }
        const n = part.n, on = !lit || lit.has(n.id), c = color(n.op, theme);
        setA(part.g, "opacity", on ? 1 : 0.05);
        if (part.art) setA(part.art, "display", on ? "inline" : "none");
        if (n.level === 0) { setA(part.shape, "fill", dark ? "#ece8df" : "#1b1a17"); setA(part.shape, "opacity", lit ? 0 : 1); }
        else if (n.kind !== "execution") {
          setA(part.shape, "fill", dark ? "#1a1f21" : "#f7f6f2");
          setA(part.shape, "stroke", n.id === view.focus || n.id === view.hover ? c : on && lit ? c : dark ? "#3c4245" : "#cfccc4");
          setA(part.icon, "color", on && (lit || n.kind === "operation") ? c : dark ? "#7d7a72" : "#9a968c");
        } else {
          setA(part.shape, "stroke", n.id === view.focus || n.id === view.hover ? c : dark ? "#2a2f31" : "#d9d6ce");
          setA(part.shape, "stroke-width", n.id === view.focus ? 6 : 2);
        }
        setA(part.label, "fill", n.level === 1 ? c : dark ? "#d8d4ca" : "#2c2a26");
      }
    }
    const camKey = `${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.s.toFixed(4)},${cam.cx},${cam.cy},${W},${H},${view.labelScale}`;
    // Live mode: in Blink every SVG transform change relayouts the whole tree, so while the camera moves
    // the committed SVG is moved by a composited CSS transform; it re-commits once the camera holds still
    // for a frame or drifts far enough to blur or uncover an edge. Films (no view.live) commit every frame.
    const ox = cam.cx ?? W / 2, oy = cam.cy ?? H / 2;
    if (view.live && committed && keys.cam && camKey !== keys.cam) {
      const C = committed, k = cam.s / C.s, tx = ox - C.ox * k + (C.x - cam.x) * cam.s, ty = oy - C.oy * k + (C.y - cam.y) * cam.s;
      const far = k < 0.72 || k > 1.5 || Math.abs(tx + (k - 1) * W / 2) > W * 0.22 || Math.abs(ty + (k - 1) * H / 2) > H * 0.22;
      if (!far && camKey !== lastKey) { svg.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`; lastKey = camKey; return renderCard(f, view.t), void (force = false); }
    }
    lastKey = camKey;
    if (camKey !== keys.cam) {
      keys.cam = camKey; committed = { x: cam.x, y: cam.y, s: cam.s, ox, oy };
      if (view.live) svg.style.transform = "";
      world.setAttribute("transform", `translate(${(cam.cx ?? W / 2) - cam.x * cam.s} ${(cam.cy ?? H / 2) - cam.y * cam.s}) scale(${cam.s})`);
      // Specimen art under ~16px on screen is a flat swatch (level of detail), which keeps zooms cheap.
      world.classList.toggle("lod", CARD.w * 0.5 * cam.s < 16);
      const inv = (view.labelScale ?? 1) / cam.s;
      for (const [key, part] of parts) {
        if (key.startsWith("e:")) { const id = key.slice(2), on = !lit || (lit.has(id) && lit.has(g.byId.get(id).parent.id)); setA(part, "stroke-width", ((on && lit ? 2.2 : 1.2) * Math.max(inv, 0.6)).toFixed(2)); continue; }
        // Labels keep a constant on-screen size; small levels hide when zoomed out (display:none skips layout).
        const n = part.n, minS = [0, 0, 0.32, 0.42, 0.75][n.level];
        const show = n.level > 0 && cam.s >= minS && (n.level < 4 || (lit && lit.has(n.id)) || cam.s > 1.1);
        setA(part.label, "display", show ? "inline" : "none");
        if (!show) continue;
        const px = n.level === 1 ? 17 : n.level === 2 ? 12 : n.level === 3 ? 13 : 11;
        const off = n.level === 1 ? 62 : n.level === 4 ? 64 : 34;
        const fs = +(px * Math.max(inv, 0.5)).toFixed(2);
        setA(part.label, "font-size", fs);
        if (n.level === 1) {
          // Operation labels sit outside the ring, anchored away from the centre, so they never pile up.
          const cx = Math.cos(n.a), cy = Math.sin(n.a), d = 48 + fs * 0.4;
          setA(part.label, "x", (cx * d).toFixed(1));
          setA(part.label, "y", (cy * d + fs * 0.35 + (Math.abs(cx) < 0.3 ? Math.sign(cy) * fs * 0.6 : 0)).toFixed(1));
          setA(part.label, "text-anchor", Math.abs(cx) < 0.3 ? "middle" : cx > 0 ? "start" : "end");
        } else setA(part.label, "y", (off + fs).toFixed(1));
        setA(part.label, "class", "label l" + n.level);
      }
    }
    const tq = view.motionFps ? Math.floor(t * view.motionFps) / view.motionFps : t;
    const motionKey = view.animate ? `${tq}|${camKey}` : "";
    if (motionKey && motionKey !== keys.motion) {
      keys.motion = motionKey;
      const size = CARD.w * 0.5 * cam.s;
      if (size > 24) for (const part of parts.values()) {
        if (!part.motion) continue;
        const n = part.n, sx = ox + (n.x - cam.x) * cam.s, sy = oy + (n.y - cam.y) * cam.s;
        if (sx < -size || sy < -size || sx > W + size || sy > H + size || (lit && !lit.has(n.id))) continue;
        part.art.innerHTML = specimen(n.family, n.seed, tq + n.seed * 0.37);
      }
    }
    renderCard(f, tq);
    force = false;
  }

  function renderCard(f, tq) {
    if (!card) return;
    const fade = () => { if (card._in !== view.cardIn) { card._in = view.cardIn; card.style.opacity = view.cardIn; card.style.transform = `translateY(${(1 - view.cardIn) * -12}px)`; } };
    const line = f.level ? lineage(f) : [], ex = line[3];
    const key = `${f.id}|${view.theme}|${ex && MOTION.has(ex.family) ? tq : ""}`;
    if (key === keys.card) return fade();
    keys.card = key;
    if (!f.level) {
      card.innerHTML = `<div class="intro"><div class="eyebrow">A TAXONOMY OF TASTE</div><h1>Why an image <em>works.</em></h1><p>Every specimen is filed by what it asks the viewer to do, the property that carries it, and the named technique.</p>${LEVELS.map((L, i) => `<div class="lv"><b>0${i + 1}</b>${L}</div>`).join("")}</div>`;
      return fade();
    }
    const op = line[0]?.op;
    const c = op ? color(op, view.theme) : "#8a857a";
    const rows = LEVELS.map((L, i) => {
      const n = line[i];
      let val = n ? n.name : "—", sub = "", ic = "";
      if (i === 0 && n) ic = icon(n.op);
      if (i === 1 && n) ic = icon(n.domain);
      if (i === 2 && n) { ic = icon("technique"); sub = `<div class="mech">${n.mech}</div>`; }
      if (i === 3) {
        if (n) { ic = `<svg viewBox="0 0 ${CARD.w} ${CARD.h}" width="22" height="28">${specimen(n.family, n.seed, tq)}</svg>`; val = `<em>${n.name}</em>`; }
        else if (line[2]) val = `<em>${line[2].children.length} specimens</em>`;
      }
      return `<div class="row ${n ? "on" : ""}"><div class="ic" style="color:${c}">${ic}</div><div><div class="k"><b style="color:${c}">0${i + 1}</b> ${L}</div><div class="v ${i === 2 ? "mono" : ""}">${val}</div>${sub}</div></div>`;
    }).join("");
    const preview = line[3] ? `<div class="preview"><svg viewBox="0 0 ${CARD.w} ${CARD.h}" preserveAspectRatio="xMidYMid slice">${specimen(line[3].family, line[3].seed, tq)}</svg></div>` : "";
    // Optional layers (bookmarks) append "recorded examples" under the lineage.
    // Hand the focused branch to an agent as a build brief (handled in main.js; see src/brief.js).
    const act = `<div class="card-act"><button data-brief="site" title="Copy a site brief for an agent">Copy site brief</button><button data-brief="component" title="Copy a UI component brief for an agent">Component brief</button></div>`;
    card.innerHTML = `<div class="rows">${rows}</div>${preview}${view.cardExtra?.(f) ?? ""}${act}`;
    fade();
  }

  const api = { graph: g, view, render, fit, parts, world, invalidate: () => { keys.card = keys.state = keys.cam = keys.motion = ""; force = true; } };
  Object.defineProperty(api, "extraBounds", { set: (f) => (view.extraBounds = f) });
  return api;
}

export const stats = () => ({ techniques: TECHNIQUES.length, executions: TECHNIQUES.reduce((a, t) => a + t.executions.length, 0), domains: Object.keys(DOMAINS).length });
