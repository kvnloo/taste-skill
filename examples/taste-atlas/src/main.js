// Interactive app: camera tweening, click-to-focus, search, theme, deep links (#technique-id).
import { createAtlas, stats } from "./atlas.js";
import { OPERATIONS, opById } from "./taxonomy.js";
import { mountBookmarks } from "./bookmarks.js";
import { brief, briefMarkdown } from "./brief.js";

const svg = document.getElementById("atlas");
const card = document.getElementById("card");
const A = createAtlas({ svg, card, width: () => innerWidth, height: () => innerHeight });
// Free screen area for the graph: left of the shelf on desktop; between card and bottom sheet on phones.
const phone = () => innerWidth <= 700;
function region() {
  const shelf = document.querySelector(".shelf")?.getBoundingClientRect();
  if (phone()) { const top = (card.getBoundingClientRect().bottom || 100) + 6; return { x: 0, y: top, w: innerWidth, h: Math.max(160, (shelf?.top ?? innerHeight) - top) }; }
  return { x: 0, y: 0, w: innerWidth - (document.querySelector(".shelf.open") ? innerWidth - shelf.left + 18 : 0), h: innerHeight };
}
// Deeper zooms leave room for side labels (technique names sit beside their node).
const fitR = (id) => A.fit(id, phone() ? ((A.graph.byId.get(id)?.level ?? 0) >= 3 ? 0.72 : 0.94) : 0.82, region());
const params = new URLSearchParams(location.search);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

let tween = null;
function go(id, ms = 900) {
  const from = { cx: innerWidth / 2, cy: innerHeight / 2, ...A.view.cam }, to = fitR(id);
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
  if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; tween = null; A.view.cam = { ...pinch.cam, s: Math.min(4, Math.max(0.12, pinch.cam.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d)) }; }
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
  const tile = A.tileAt?.(e);
  if (tile) { if (A.view.focus === tile.tech) A.openPost(tile.id); else go(tile.tech); return; }
  const id = e.target.closest?.(".node")?.dataset.id;
  if (id) go(id === A.view.focus ? (A.graph.byId.get(id).parent?.id ?? "root") : id);
  else go("root");
});
svg.addEventListener("wheel", (e) => {
  e.preventDefault(); tween = null;
  const c = A.view.cam, k = Math.exp(-e.deltaY * 0.0015), s = Math.min(4, Math.max(0.12, c.s * k));
  const ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2, mx = (e.clientX - ox) / c.s + c.x, my = (e.clientY - oy) / c.s + c.y;
  A.view.cam = { ...c, s, x: mx - (e.clientX - ox) / s, y: my - (e.clientY - oy) / s };
}, { passive: false });

// Search.
const q = document.getElementById("q"), hits = document.getElementById("hits");
const all = [...A.graph.byId.values()].filter((n) => n.level > 0);
let sel = 0, found = [];
function show() {
  const s = q.value.trim().toLowerCase();
  found = s ? all.filter((n) => n.name.toLowerCase().includes(s) || (n.mech ?? "").toLowerCase().includes(s)).slice(0, 8) : [];
  sel = 0;
  hits.className = found.length ? "on" : "";
  hits.innerHTML = found.map((n, i) => `<div data-id="${n.id}" class="${i === sel ? "sel" : ""}">${n.name}<small>${["", "operation", "domain", "technique", "specimen"][n.level]} · ${opById[n.op].name}</small></div>`).join("");
}
q.addEventListener("input", show);
q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : found.length - 1)) % Math.max(1, found.length); [...hits.children].forEach((d, i) => d.classList.toggle("sel", i === sel)); e.preventDefault(); }
  if (e.key === "Enter" && found[sel]) { go(found[sel].id); q.value = ""; show(); q.blur(); }
});
hits.addEventListener("click", (e) => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) { go(id); q.value = ""; show(); } });

// Theme, keys, legend.
const theme = (t) => { A.view.theme = t; localStorage.setItem("atlas-theme", t); };
document.getElementById("theme").onclick = () => theme(A.view.theme === "dark" ? "light" : "dark");
addEventListener("keydown", (e) => {
  if (e.target === q) { if (e.key === "Escape") q.blur(); return; }
  if (e.key === "Escape") go(A.graph.byId.get(A.view.focus)?.parent?.id ?? "root");
  if (e.key === "t") theme(A.view.theme === "dark" ? "light" : "dark");
  if (e.key === "/") { q.focus(); e.preventDefault(); }
});
document.getElementById("legend").innerHTML = OPERATIONS.map((o) => `<button data-id="${o.id}"><i style="background:${o.color}"></i>${o.name}</button>`).join("");
document.getElementById("legend").onclick = (e) => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) go(id); };
addEventListener("resize", () => { A.view.labelScale = phone() ? 0.8 : 1; if (!tween) A.view.cam = fitR(A.view.focus); });
addEventListener("hashchange", () => { const id = location.hash.slice(1); if (A.graph.byId.has(id) && id !== A.view.focus) go(id); });

const st = stats();
document.getElementById("stat").textContent = `${OPERATIONS.length} operations · ${st.techniques} techniques · ${st.executions} specimens`;
theme(params.get("theme") ?? localStorage.getItem("atlas-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
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
mountBookmarks(A, { go }).then((bm) => { if (bm) document.getElementById("stat").textContent += ` · ${bm.count} of your bookmarks`; window.__atlas.bm = bm; });
requestAnimationFrame(frame);
