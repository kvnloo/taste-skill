// Interactive app: camera tweening, click-to-focus, search, theme, deep links (#technique-id).
import { createAtlas, stats } from "./atlas.js";
import { OPERATIONS, opById } from "./taxonomy.js";
import { mountBookmarks } from "./bookmarks.js";
import { mountWork } from "./work.js";
import { mountBoardFilter } from "./boardfilter.js";
import { brief, briefMarkdown } from "./brief.js";
import { mountNav, getTheme, saveTheme, setView } from "./nav.js";

const svg = document.getElementById("atlas");
const card = document.getElementById("card");
const A = createAtlas({ svg, card, width: () => innerWidth, height: () => innerHeight });
// Free screen area for the graph: left of the shelf on desktop; between card and bottom sheet on phones.
const phone = () => innerWidth <= 700;
function region(avoidCard) {
  const shelf = document.querySelector(".shelf")?.getBoundingClientRect();
  if (phone()) { const top = (card.getBoundingClientRect().bottom || 100) + 6; return { x: 0, y: top, w: innerWidth, h: Math.max(160, (shelf?.top ?? innerHeight) - top) }; }
  // The mosaic shelf covers the whole graph (left: 18px); fitting into the zero-width gap gave scale Infinity.
  const free = document.querySelector(".shelf.open") ? shelf.left - 18 : innerWidth, x = avoidCard ? card.getBoundingClientRect().right + 12 : 0;
  return { x, y: 0, w: free - x < 240 ? innerWidth : free - x, h: innerHeight };
}
// Deeper zooms leave room for side labels (technique names sit beside their node).
const fitR = (id) => A.fit(id, phone() ? ((A.graph.byId.get(id)?.level ?? 0) >= 3 ? 0.72 : 0.94) : 0.82, region());
const params = new URLSearchParams(location.search);
// Deep zoom: far enough that one post fills the screen at full resolution (tiles are 44 world units).
const MAX_ZOOM = 24;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

let tween = null;
// Fit a world box [x0, y0, x1, y1] (a layer or category on the outer ring) into the free region.
function fitBox([x0, y0, x1, y1], max = 2.2, avoidCard = false) { const R = region(avoidCard), pad = 0.86; return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.min((R.w * pad) / (x1 - x0), (R.h * pad) / (y1 - y0), max), cx: R.x + R.w / 2, cy: R.y + R.h / 2 }; }
// The Work layer flies deeper (its components are small in world units) and keeps clear of the card.
function fly(box, ms = 900, max = 2.2, avoidCard = false) { flyTo(fitBox(box, Math.min(max, MAX_ZOOM), avoidCard), ms); }
function go(id, ms = 900) {
  window.__atlas?.bm?.pick(null, true); window.__atlas?.work?.blur();
  flyTo(fitR(id), ms, id);
}
function flyTo(to, ms, id) {
  const from = { cx: innerWidth / 2, cy: innerHeight / 2, ...A.view.cam };
  if (id === undefined) { tween = { t0: performance.now(), ms, from, to, dip: Math.min(1, Math.hypot(to.x - from.x, to.y - from.y) / 1400) * 0.35 }; return; }
  A.view.focus = id; A.view.hover = null;
  if (id !== "root" && !location.hash.endsWith(id)) history.replaceState(null, "", "#" + id);
  if (id === "root") history.replaceState(null, "", location.pathname + location.search);
  // Arc the zoom: pull out a little mid-flight when travelling far.
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dip = Math.min(1, dist / 1400) * 0.35;
  tween = { t0: performance.now(), ms, from, to, dip };
}
function frame(now) {
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k);
    const { from, to, dip } = tween;
    const s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e) * (1 - dip * Math.sin(Math.PI * e));
    A.view.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e };
    if (k >= 1) tween = null;
  }
  A.render({ t: now / 1000, animate: true, motionFps: 12, live: true });
  requestAnimationFrame(frame);
}

// Pointer: click focuses, drag pans, wheel zooms.
let drag = null;
const touches = new Map(); let pinch = null, swallowTap = false;
svg.addEventListener("pointerdown", (e) => { touches.set(e.pointerId, e); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cam: { ...A.view.cam } }; drag = null; return; } });
svg.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e);
  if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; tween = null; A.view.cam = { ...pinch.cam, s: Math.min(MAX_ZOOM, Math.max(0.12, pinch.cam.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d)) }; }
});
const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2 && pinch) { pinch = null; drag = null; swallowTap = true; } if (!touches.size) setTimeout(() => (swallowTap = false)); };
svg.addEventListener("pointerup", endTouch); svg.addEventListener("pointercancel", endTouch);
svg.addEventListener("pointerdown", (e) => { if (pinch) return; drag = { x: e.clientX, y: e.clientY, cam: { ...A.view.cam }, moved: false }; svg.setPointerCapture(e.pointerId); });
svg.addEventListener("pointermove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { tween = null; A.view.cam = { ...drag.cam, x: drag.cam.x - dx / drag.cam.s, y: drag.cam.y - dy / drag.cam.s }; }
    return;
  }
  A.view.hover = e.target.closest?.(".node")?.dataset.id ?? null;
});
svg.addEventListener("pointerup", (e) => {
  const wasDrag = drag?.moved; drag = null;
  if (wasDrag || swallowTap) return;
  if (A.workAt?.(e)) return;
  const tile = A.tileAt?.(e);
  if (tile) { if (A.view.focus === tile.tech) A.openPost(tile.id); else go(tile.tech); return; }
  const id = e.target.closest?.(".node")?.dataset.id;
  if (id) go(id === A.view.focus ? (A.graph.byId.get(id).parent?.id ?? "root") : id);
  else go("root");
});
svg.addEventListener("wheel", (e) => {
  e.preventDefault(); tween = null;
  const c = A.view.cam, k = Math.exp(-e.deltaY * 0.0015), s = Math.min(MAX_ZOOM, Math.max(0.12, c.s * k));
  const ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2, mx = (e.clientX - ox) / c.s + c.x, my = (e.clientY - oy) / c.s + c.y;
  A.view.cam = { ...c, s, x: mx - (e.clientX - ox) / s, y: my - (e.clientY - oy) / s };
}, { passive: false });

// Search.
const q = document.getElementById("q"), hits = document.getElementById("hits");
const all = [...A.graph.byId.values()].filter((n) => n.level > 0);
let sel = 0, found = [];
function show() {
  const s = q.value.trim().toLowerCase();
  // Taxonomy nodes first, then your posts (text + picture description); the shelf filters live as you type.
  const bm = window.__atlas.bm, posts = s && bm ? bm.matching(s).length : 0, cats = s && bm ? bm.findGroups(s) : [], work = s ? window.__atlas.work?.find(s) ?? [] : [];
  bm?.setQuery(s);
  found = s ? all.filter((n) => n.name.toLowerCase().includes(s) || (n.mech ?? "").toLowerCase().includes(s)).slice(0, 6) : [];
  // Categories (a layer, channel, language or company) first: picking one keeps you on the canvas.
  found = [...work.map((w) => ({ w })), ...cats.map((g) => ({ g })), ...(posts ? [{ lib: posts }] : []), ...found].slice(0, 10);
  sel = 0;
  hits.className = s ? "on" : "";
  hits.innerHTML = found.map((n, i) => n.w
    ? `<div data-w="${n.w.id}" class="${i === sel ? "sel" : ""}">${n.w.name.replace(/</g, "&lt;")}<small>${n.w.sub}</small></div>`
    : n.g
    ? `<div data-g="${n.g.key.replace(/"/g, "&quot;")}" class="${i === sel ? "sel" : ""}">${n.g.name.replace(/</g, "&lt;")}<small>${n.g.sub} · ${n.g.n.toLocaleString()}</small></div>`
    : n.lib
    ? `<div data-lib="1" class="lib ${i === sel ? "sel" : ""}">${n.lib} of your posts<small>show in Library ↵</small></div>`
    : `<div data-id="${n.id}" class="${i === sel ? "sel" : ""}">${n.name}<small>${["", "operation", "domain", "technique", "specimen"][n.level]} · ${opById[n.op].name}</small></div>`).join("") || `<div class="none">No technique or post matches</div>`;
}
const pickHit = (h) => { if (!h) return; if (h.w) { q.value = ""; window.__atlas.bm?.setQuery(""); hits.className = ""; q.blur(); window.__atlas.work.focus(h.w.id); return; } if (h.g) { const bm = window.__atlas.bm; q.value = ""; bm.setQuery(""); hits.className = ""; q.blur(); bm.pick(h.g.key); return; } if (h.lib) { setView("library"); hits.className = ""; q.blur(); return; } go(h.id); q.value = ""; show(); q.blur(); };
q.addEventListener("input", show);
q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : found.length - 1)) % Math.max(1, found.length); [...hits.children].forEach((d, i) => d.classList.toggle("sel", i === sel)); e.preventDefault(); }
  if (e.key === "Enter") pickHit(found[sel]);
});
hits.addEventListener("click", (e) => { const d = e.target.closest("[data-id],[data-lib],[data-g],[data-w]"); if (d) pickHit(d.dataset.w ? found.find((h) => h.w?.id === d.dataset.w) : d.dataset.g ? found.find((h) => h.g?.key === d.dataset.g) : d.dataset.lib ? found.find((h) => h.lib) : found.find((h) => h.id === d.dataset.id)); });

// Theme, keys, legend.
const theme = (t) => { A.view.theme = t; saveTheme(t); };
mountNav(document.querySelector(".chrome .brand"));
document.getElementById("theme").onclick = () => theme(A.view.theme === "dark" ? "light" : "dark");
addEventListener("keydown", (e) => {
  if (e.target === q) { if (e.key === "Escape") { q.value = ""; show(); q.blur(); } return; }
  if (e.key === "Escape") go(A.graph.byId.get(A.view.focus)?.parent?.id ?? "root");
  if (e.key === "t") theme(A.view.theme === "dark" ? "light" : "dark");
  if (e.key === "/") { q.focus(); e.preventDefault(); }
});
document.getElementById("legend").innerHTML = OPERATIONS.map((o) => `<button data-id="${o.id}"><i style="background:${o.color}"></i>${o.name}</button>`).join("");
document.getElementById("legend").onclick = (e) => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) go(id); };
addEventListener("resize", () => { A.view.labelScale = phone() ? 0.8 : 1; if (!tween && !A.refit?.(1)) A.view.cam = fitR(A.view.focus); });
addEventListener("hashchange", () => { const id = location.hash.slice(1); if (A.graph.byId.has(id) && id !== A.view.focus) go(id); });

const st = stats();
document.getElementById("stat").textContent = `${OPERATIONS.length} operations · ${st.techniques} techniques · ${st.executions} specimens`;
theme(getTheme());
A.view.labelScale = phone() ? 0.8 : 1;
A.view.cam = fitR("root");
const start = location.hash.slice(1);
if (A.graph.byId.has(start)) go(start, 1200);
// Agent hand-off: the card's brief buttons copy markdown; window.__atlas.brief() returns the JSON.
const makeBrief = (ids, target = "site") => brief(ids, { target, refsFor: (id) => (window.__atlas.bm?.byTech.get(id) ?? []).filter((b) => b.thumb) });
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const t = Object.assign(document.createElement("textarea"), { value: text }); document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; }
}
card.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-brief]"); if (!b) return;
  const ok = await copy(briefMarkdown(makeBrief([A.view.focus], b.dataset.brief)));
  b.textContent = ok ? "Copied ✓" : "Copy failed"; setTimeout(() => A.invalidate(), 1400);
});
window.__atlas = { A, go, brief: makeBrief, briefMarkdown };
mountBookmarks(A, { go, fly }).then((bm) => { if (!bm) firstRun(); if (bm) document.getElementById("stat").textContent += ` · ${bm.count} of your bookmarks${bm.sources ? ` · ${bm.sources} sources` : ""}`; window.__atlas.bm = bm; return mountWork(A, { bm, fly, start }); })
  .then((work) => { window.__atlas.work = work; return mountBoardFilter(A, { bm: window.__atlas.bm, fly }); })
  .then((bf) => { window.__atlas.boards = bf; }).catch((e) => console.error("work:", e));
requestAnimationFrame(frame);

// First run: no personal data yet, so the atlas is only the taxonomy. Point at the import page.
function firstRun() {
  const a = document.createElement("a"); a.className = "first-run"; a.href = "/onboard";
  a.innerHTML = "<b>Make it yours.</b> Bring in your bookmarks, watch history and network →"; document.body.appendChild(a);
}
