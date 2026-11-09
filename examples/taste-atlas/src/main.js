// Interactive app: camera tweening, click-to-focus, search, theme, deep links (#technique-id).
import { createAtlas, stats } from "./atlas.js";
import { OPERATIONS, opById } from "./taxonomy.js";
import { mountBookmarks } from "./bookmarks.js";

const svg = document.getElementById("atlas");
const card = document.getElementById("card");
// The graph lays out in the space left of the bookmarks shelf when it is open.
const W = () => innerWidth - (document.querySelector(".shelf.open") ? Math.min(440, innerWidth * 0.42) + 36 : 0);
const A = createAtlas({ svg, card, width: W, height: () => innerHeight });
const params = new URLSearchParams(location.search);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

let tween = null;
function go(id, ms = 900) {
  const from = { ...A.view.cam }, to = A.fit(id);
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
    A.view.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s };
    if (k >= 1) tween = null;
  }
  A.render({ t: now / 1000, animate: true });
  requestAnimationFrame(frame);
}

// Pointer: click focuses, drag pans, wheel zooms.
let drag = null;
svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cam: { ...A.view.cam }, moved: false }; svg.setPointerCapture(e.pointerId); });
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
  if (wasDrag) return;
  const id = e.target.closest?.(".node")?.dataset.id;
  if (id) go(id === A.view.focus ? (A.graph.byId.get(id).parent?.id ?? "root") : id);
  else go("root");
});
svg.addEventListener("wheel", (e) => {
  e.preventDefault(); tween = null;
  const c = A.view.cam, k = Math.exp(-e.deltaY * 0.0015), s = Math.min(4, Math.max(0.12, c.s * k));
  const mx = (e.clientX - W() / 2) / c.s + c.x, my = (e.clientY - innerHeight / 2) / c.s + c.y;
  A.view.cam = { s, x: mx - (e.clientX - W() / 2) / s, y: my - (e.clientY - innerHeight / 2) / s };
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
addEventListener("resize", () => { if (!tween) A.view.cam = A.fit(A.view.focus); });
addEventListener("hashchange", () => { const id = location.hash.slice(1); if (A.graph.byId.has(id) && id !== A.view.focus) go(id); });

const st = stats();
document.getElementById("stat").textContent = `${OPERATIONS.length} operations · ${st.techniques} techniques · ${st.executions} specimens`;
theme(params.get("theme") ?? localStorage.getItem("atlas-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
A.view.cam = A.fit("root");
const start = location.hash.slice(1);
if (A.graph.byId.has(start)) go(start, 1200);
window.__atlas = { A, go };
mountBookmarks(A, { go }).then((bm) => { if (bm) document.getElementById("stat").textContent += ` · ${bm.count} of your bookmarks`; window.__atlas.bm = bm; });
requestAnimationFrame(frame);
