// Slide viewer: the selected project screen full screen, with a player's prev / next. Swipe sideways, use the
// arrow keys, or tap the edge buttons; Esc closes. Ported from Sound Atlas's player feel (gestures.js): a short
// vibrate on every reversible move, a distinct one at either end of the deck.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PAT = { touch: 12, edge: [12, 40, 12] };
export const haptic = (k = "touch") => { try { navigator.vibrate?.(PAT[k] ?? PAT.touch); } catch {} };

// A sideways flick: >= 40 px and mostly horizontal. Left = next (+1), right = previous (-1), else 0.
export function swipe(dx, dy) {
  if (Math.abs(dx) < 40 || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

// step(d) moves the deck and returns the new slide (or null); slide() reads the current one.
export function mountDeck({ step, slide }) {
  const box = document.createElement("div");
  box.className = "deckview"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Slide viewer");
  document.body.appendChild(box);
  const on = () => box.classList.contains("on");
  function draw(s = slide()) {
    if (!s) return close();
    box.innerHTML = `<img src="${esc(s.shot)}" alt="${esc(s.name)}" draggable="false" />
      <button class="dv-x" aria-label="Close">×</button>
      <button class="dv-nav prev" data-dv="-1" aria-label="Previous slide"${s.i ? "" : " disabled"}>‹</button>
      <button class="dv-nav next" data-dv="1" aria-label="Next slide"${s.i < s.n - 1 ? "" : " disabled"}>›</button>
      <p class="dv-cap"><b>${String(s.i + 1).padStart(2, "0")} / ${s.n}</b> ${esc(s.name)}</p>`;
  }
  function go(d) {
    const was = slide();
    if (!was || was.i + d < 0 || was.i + d >= was.n) { haptic("edge"); return; } // first or last slide: stay
    const s = step(d);
    haptic(); draw(s);
  }
  function open() { if (!slide()) return; draw(); box.classList.add("on"); }
  function close() { box.classList.remove("on"); box.innerHTML = ""; }
  let x0 = null, y0 = 0, dragged = false;
  box.addEventListener("click", (e) => {
    if (dragged) { dragged = false; return; } // the click a drag ends with (on the backdrop) must not close
    const d = e.target.closest("[data-dv]")?.dataset.dv;
    if (d) return go(+d);
    if (e.target.closest(".dv-x") || e.target === box) close();
  });
  box.addEventListener("pointerdown", (e) => { dragged = false; if (!e.target.closest("button")) { x0 = e.clientX; y0 = e.clientY; } });
  box.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0, d = swipe(dx, dy); x0 = null;
    dragged = Math.hypot(dx, dy) > 8;
    if (d) { e.preventDefault(); go(d); }
  });
  box.addEventListener("pointercancel", () => { x0 = null; });
  addEventListener("keydown", (e) => {
    if (!on()) return;
    const d = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, " ": 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (d) { e.preventDefault(); e.stopImmediatePropagation(); go(d); }
    else if (e.key === "Escape") { e.stopImmediatePropagation(); close(); }
  }, true);
  return { open, close, on };
}
