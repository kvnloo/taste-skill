// Repo-map maths shared by the Work layer (src/work.js) and its importer (scripts/work.mjs), ported from aodl-views
// (src/layout/pack.ts, src/model/decay.ts). A touch [epochSeconds, count] weighs count * 0.5^(age / halfLife) at `at`;
// touches after `at` do not exist yet, so scrubbing `at` back replays how attention moved.
export const decayFactor = (age, halfLifeHours) => (halfLifeHours > 0 ? 0.5 ** (Math.max(0, age) / (halfLifeHours * 3600)) : age <= 0 ? 1 : 0);
export const weightAt = (touches, at, halfLifeHours) => { let s = 0; for (const [t, n] of touches) if (t <= at) s += n * decayFactor(at - t, halfLifeHours); return s; };
/** Relative age: 42s, 7m, 3h, 2d. */
export function ago(t, now) {
  if (!t) return "—";
  const s = Math.max(0, now - t);
  return s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

// Deterministic circle packing: largest first; each next circle takes the spot tangent to one or two placed circles
// that is closest to the centre without overlap. n <= ~40, so O(n^3) is fine.
export function packCircles(items, gap = 3) {
  const list = items.filter((i) => i.r > 0).sort((a, b) => b.r - a.r || a.id.localeCompare(b.id)), placed = [];
  const fits = (x, y, r) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap - 1e-6);
  for (const it of list) {
    let best = null;
    const consider = (x, y) => { if (!fits(x, y, it.r)) return; const c = Math.hypot(x, y); if (!best || c < best.c) best = { x, y, c }; };
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let k = 0; k < 12; k++) { const t = (k / 12) * Math.PI * 2; consider(a.x + Math.cos(t) * (a.r + it.r + gap), a.y + Math.sin(t) * (a.r + it.r + gap)); }
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j], ra = a.r + it.r + gap, rb = b.r + it.r + gap, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (!d || d > ra + rb || d < Math.abs(ra - rb)) continue;
        const l = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - l * l)), mx = a.x + (dx * l) / d, my = a.y + (dy * l) / d;
        consider(mx - (dy * h) / d, my + (dx * h) / d); consider(mx + (dy * h) / d, my - (dx * h) / d);
      }
    }
    placed.push({ id: it.id, x: best?.x ?? 0, y: best?.y ?? 0, r: it.r });
  }
  return placed;
}

/** Scale and centre packed circles into a circle of radius R around (cx, cy). */
export function fitInCircle(circles, cx, cy, R) {
  if (!circles.length) return [];
  const mx = circles.reduce((s, c) => s + c.x * c.r * c.r, 0) / circles.reduce((s, c) => s + c.r * c.r, 0);
  const my = circles.reduce((s, c) => s + c.y * c.r * c.r, 0) / circles.reduce((s, c) => s + c.r * c.r, 0);
  const ext = Math.max(...circles.map((c) => Math.hypot(c.x - mx, c.y - my) + c.r)), k = R / ext;
  return circles.map((c) => ({ id: c.id, x: cx + (c.x - mx) * k, y: cy + (c.y - my) * k, r: c.r * k }));
}
