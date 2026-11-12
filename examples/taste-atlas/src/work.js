// Work layer: your projects as a nested repo map in the centre of the atlas (data/work.atlas.json, scripts/work.mjs).
// Zoom is depth: products (status ring, deadline arc) → their component areas (area = decayed recent work, colour =
// status) → a component's pages, linked posts, films and PRs as tiles → a proof lightbox (PRs, CI, commits, your asks).
// A component shared by two products is drawn once; the other product shows a dashed portal to it. Any post links to a
// work node from its detail view ("Link to work…"), saved in data/work-links.json and tethered to its tile on the ring.
import { packCircles, fitInCircle, weightAt, ago } from "./pack.js";
import { createProject } from "./project.js";

const R = 250; // world radius of the disc inside the operation ring (operations sit at r = 320)
const ST = { "on-track": ["On track", "#1f8a5b", "#3fbf84"], watch: ["Watch", "#c27c0e", "#e0a43a"], "at-risk": ["At risk", "#d6453d", "#ef6a5f"], blocked: ["Blocked", "#7b3fa0", "#b07ad6"], unknown: ["Unknown", "#8a857a", "#8f8a80"] };
const AS_OF = [["Now", 0], ["−1d", -1], ["−3d", -3], ["−7d", -7]], HALF = [["12h", 12], ["2d", 48], ["7d", 168]];
const PR_COL = { MERGED: "#7b3fa0", CLOSED: "#8a857a" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const get = (f) => fetch(f, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const now = () => Date.now() / 1000;
const stale = (s) => !s?.checked || now() - s.checked > s.window;
const fresh = (s) => (s?.checked ? `${stale(s) ? "stale · " : ""}checked ${ago(s.checked, now())} ago` : "never checked");

export async function mountWork(A, { bm, fly, start = "" }) {
  const W = await get("./data/work.atlas.json"); if (!W?.products?.length) return null;
  let links = (await get("./data/work-links.json"))?.links ?? [];
  const P = new Map(W.products.map((p) => [p.id, p])), C = new Map(W.components.map((c) => [c.id, c]));
  const name = (id) => (C.has(id) ? `${P.get(C.get(id).product).name} · ${C.get(id).name}` : P.get(id)?.name ?? id);
  const hidden = bm?.hidden ?? new Set(), on = () => !hidden.has("work"), post = (id) => bm?.byId.get(id) ?? null;
  const col = (s, dark) => (stale(s) ? ST.unknown : ST[s?.value] ?? ST.unknown)[dark ? 2 : 1];
  // What hangs off a node: posts you linked to it, and films whose title names it (auto-linked by the importer).
  const linked = (id) => links.filter((l) => l.node === id).map((l) => post(l.item)).filter(Boolean);
  const extras = (id) => { const n = C.get(id) ?? P.get(id), seen = new Set(); return [...linked(id), ...(n?.films ?? []).map(post).filter(Boolean)].filter((b) => !seen.has(b.id) && seen.add(b.id)); };
  const kids = (p) => [...p.components.map((id) => ({ key: id, id })), ...p.portals.map((id) => ({ key: `${p.id}>${id}`, id, portal: true })), ...(extras(p.id).length ? [{ key: `${p.id}>linked`, id: p.id, linked: true }] : [])];

  // Layout: products packed in the disc by decayed weight "as of" the scrub, components packed inside their product.
  let asOf = 0, hl = W.halfLifeHours ?? 48, L = new Map(), prevL = null, anim = null, dirty = 1;
  function layout() {
    const at = W.generatedAt + asOf * 86400, w = (t) => weightAt(t, at, hl), next = new Map();
    const pw = W.products.map((p) => [p.id, w(p.touches)]), top = Math.max(...pw.map(([, x]) => x), 1e-9);
    for (const c of fitInCircle(packCircles(pw.map(([id, x]) => ({ id, r: 10 + 90 * Math.sqrt(x / top) }))), 0, 0, R)) next.set(c.id, c);
    for (const p of W.products) {
      const o = next.get(p.id), ks = kids(p).map((k) => [k.key, k.linked ? Math.min(1, extras(p.id).length / 12) * 0.5 : w(C.get(k.id).touches)]), kt = Math.max(...ks.map(([, x]) => x), 1e-9);
      for (const c of fitInCircle(packCircles(ks.map(([key, x]) => ({ id: key, r: 8 + 40 * Math.sqrt(x / kt) })), 1.5), o.x, o.y + o.r * 0.07, o.r * 0.76)) next.set(c.id, c);
    }
    prevL = L.size ? L : null; L = next; anim = prevL ? performance.now() : null; dirty++;
  }
  layout();
  // Project focus (src/project.js): products with a storyboard open as their journey, alone on the canvas.
  const pj = createProject(W, { P, C }); await pj.load();
  const aspect = () => (innerWidth > 700 ? (innerWidth - Math.min(440, innerWidth * 0.42) - 60) / (innerHeight - 150) : innerWidth / (innerHeight * 0.45));
  const at = (key, t) => { const b = L.get(key), a = anim && prevL?.get(key); if (!a) return b; const k = ease(Math.min(1, (t - anim) / 450)); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k }; };

  // A component's tiles: pages first (thumbnail-first), then linked posts and films, then its latest PRs as chips.
  const tilesOf = (key, o) => {
    const k = key.split(">"), id = k[1] === "linked" ? k[0] : k.at(-1), c = C.get(id);
    let items = [...(c?.pages ?? []).map((pg, i) => ({ kind: "page", pg, i, c })), ...extras(id).map((b) => ({ kind: "post", b }))], chips = (c?.prs ?? []).slice(0, 6).map((pr) => ({ kind: "pr", pr }));
    if (!items.length) [items, chips] = [chips, []];
    if (!items.length) return [];
    const S = o.r * 1.18, SH = chips.length ? S * 0.8 : S, n = items.length, fit = (cols) => Math.min(S / cols, SH / (Math.ceil(n / cols) * 0.625)); let best = 1;
    for (let cols = 2; cols <= n; cols++) if (fit(cols) > fit(best)) best = cols;
    const rows = Math.ceil(n / best), w = fit(best) * 0.94, h = w * 0.625, g = w * 0.06, x0 = o.x - (best * (w + g) - g) / 2, y0 = o.y + o.r * 0.1 - (rows * (h + g) - g + (chips.length ? S * 0.16 : 0)) / 2;
    const cw = Math.min(S / 6, w * 0.6) * 0.9, cy = y0 + rows * (h + g) + S * 0.02, cx0 = o.x - (chips.length * cw * 1.1 - cw * 0.1) / 2;
    return [...items.map((t, i) => ({ ...t, key: `${key}#${i}`, x: x0 + (i % best) * (w + g), y: y0 + Math.floor(i / best) * (h + g), w, h })),
      ...chips.map((t, i) => ({ ...t, key: `${key}#pr${i}`, x: cx0 + i * cw * 1.1, y: cy, w: cw, h: cw * 0.625 }))];
  };
  // Semantic zoom: what draws depends on a bubble's radius on screen (relative to the screen, so phones go as deep).
  let KIDS_PX = 200, TILES_PX = 110;
  const lod = () => { const m = Math.min(innerWidth, innerHeight); KIDS_PX = Math.min(200, m * 0.3); TILES_PX = Math.min(110, m * 0.18); };
  lod(); addEventListener("resize", lod);

  const cv = document.createElement("canvas"); cv.id = "work-canvas"; document.getElementById("atlas").before(cv);
  const ctx = cv.getContext("2d"), imgs = new Map();
  const img = (src) => {
    const v = imgs.get(src); if (v !== undefined) return v instanceof ImageBitmap ? v : null;
    imgs.set(src, null);
    fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status} ${src}`)))).then((b) => createImageBitmap(b))
      .then((b) => { imgs.set(src, b); dirty++; }, (e) => { imgs.set(src, "error"); console.error("work image:", e.message); });
    return null;
  };
  const cover = (im, x, y, w, h) => { const k = Math.max(w / im.width, h / im.height), sw = w / k, sh = h / k; ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h); };
  let key = "", focus = undefined, hover = null, ends = [], endsKey = "", shown = null, blank = false; // focus: undefined = not in the Work layer, null = portfolio, else a node id
  const fits = new Map(); // truncated labels, by text, font and room on screen (measureText every frame showed in profiles)
  const text = (s, x, y, px, c, { weight = 500, align = "center", font = "Inter, sans-serif", max } = {}) => {
    const sc = A.view.cam.s; let t = String(s);
    if (max) {
      const room = Math.round((max * sc) / 4) * 4, k = `${t}|${weight} ${px}px ${font}|${room}`;
      if (!fits.has(k)) { ctx.font = `${weight} ${px}px ${font}`; let u = t; while (u.length > 3 && ctx.measureText(u).width > room) u = u.slice(0, -2) + "…"; fits.set(k, u); }
      t = fits.get(k);
    }
    ctx.font = `${weight} ${px / sc}px ${font}`; ctx.textAlign = align; ctx.fillStyle = c; ctx.fillText(t, x, y);
  };

  function paint(t) {
    const c = A.view.cam, Wd = innerWidth, Hd = innerHeight, dpr = Math.min(devicePixelRatio || 1, Wd <= 700 ? 1.5 : 2), vis = on(), dark = A.view.theme === "dark";
    if (anim && t - anim > 480) { anim = null; dirty++; }
    const k = `${vis},${c.x.toFixed(1)},${c.y.toFixed(1)},${c.s.toFixed(4)},${c.cx},${c.cy},${Wd},${Hd},${A.view.theme},${dirty},${hover},${focus},${anim ? t : 0}`;
    if (k === key) return; key = k;
    const hh = !vis || focus === undefined; // DOM writes only on change: an attribute write per frame costs a style recalc
    if (vis !== shown) document.body.classList.toggle("work-on", (shown = vis)); if (hud.hidden !== hh) hud.hidden = hh;
    if (cv.width !== Math.round(Wd * dpr) || cv.height !== Math.round(Hd * dpr)) { cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr); }
    const s = c.s, ox = c.cx ?? Wd / 2, oy = c.cy ?? Hd / 2, px = (r) => r * s;
    const vx0 = c.x - ox / s, vy0 = c.y - oy / s, vx1 = c.x + (Wd - ox) / s, vy1 = c.y + (Hd - oy) / s;
    const seen = (o, m = 0) => o.x + o.r + m > vx0 && o.x - o.r - m < vx1 && o.y + o.r + m > vy0 && o.y - o.r - m < vy1;
    // Off screen (browsing techniques far from the centre): leave the canvas blank and untouched, so it costs no raster.
    const want = vis && (seen({ x: 0, y: 0, r: R + 20 }) || focus !== undefined);
    if (!want && blank) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); blank = !want;
    if (!want) return;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - c.x * s), dpr * (oy - c.y * s));
    const ink = dark ? "#ece8df" : "#1b1a17", mute = dark ? "#8f8a80" : "#8a857a", bg = dark ? "#0f1314" : "#f4f2ed", lw = (p) => p / s;
    if (pj.on()) return pj.paint(ctx, { text, img, lw, dark, ink, mute, bg, px, hover });
    // Inspo ↔ work edges: a faint bundle from each node to its posts' tiles on the ring; the focused node's are strong.
    const ek = `${links.length},${[...hidden].join()},${L.size}`;
    if (ek !== endsKey) { endsKey = ek; ends = []; for (const p of W.products) for (const kd of kids(p)) {
      const nid = kd.linked ? p.id : kd.id; if (kd.portal) continue;
      for (const b of extras(nid)) { const tl = bm?.tileOf(b.id); if (tl) ends.push([kd.key, tl, nid]); }
    } }
    ctx.lineCap = "round";
    for (const [kk, tl, nid] of ends) {
      const strong = nid === focus || C.get(nid)?.product === focus;
      const o = at(kk, t) ?? at(kk.split(">")[0], t); if (!o) continue;
      const tile = px(o.r) >= TILES_PX ? tilesOf(kk, o).find((x) => x.kind === "post" && x.b === tl.b) : null, fx = tile ? tile.x + tile.w / 2 : o.x, fy = tile ? tile.y + tile.h / 2 : o.y;
      ctx.globalAlpha = strong || tile ? 0.45 : 0.1; ctx.strokeStyle = dark ? "#9db4ff" : "#2f6fd6"; ctx.lineWidth = lw(strong ? 1.6 : 1);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + tl.x) * 0.3, (fy + tl.y) * 0.3, tl.x, tl.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!seen({ x: 0, y: 0, r: R + 20 })) return;
    // The disc itself: a quiet ground so the work reads as one place.
    ctx.fillStyle = dark ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.025)"; ctx.beginPath(); ctx.arc(0, 0, R + 8, 0, 7); ctx.fill();
    if (px(R) > 40 && focus === undefined) text("YOUR WORK", 0, -R - 2, 10, mute, { weight: 500, font: '"IBM Plex Mono", monospace' });
    for (const p of W.products) {
      const o = at(p.id, t); if (!seen(o, 20)) continue;
      const pr = px(o.r), sc = col(p.status, dark), open = pr >= KIDS_PX, f = focus === p.id || hover === p.id;
      ctx.globalAlpha = 1; ctx.fillStyle = sc + (dark ? "24" : "1a"); ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.setLineDash(stale(p.status) ? [lw(5), lw(4)] : []); ctx.strokeStyle = sc; ctx.lineWidth = lw(f ? 3.5 : 2); ctx.stroke(); ctx.setLineDash([]);
      if (p.deadline) { // deadline arc: the share of the last 72 h still left
        const left = Date.parse(p.deadline) / 1000 - now(), fr = Math.max(0, Math.min(1, left / (72 * 3600)));
        ctx.strokeStyle = left < 48 * 3600 ? ST["at-risk"][dark ? 2 : 1] : ST.watch[dark ? 2 : 1]; ctx.lineWidth = lw(4);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r + lw(6), -Math.PI / 2, -Math.PI / 2 + fr * Math.PI * 2); ctx.stroke();
        if (pr > 26) text(left > 0 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m left` : "deadline passed", o.x, o.y - o.r - lw(12), 11, ctx.strokeStyle, { weight: 600 });
      }
      if (!open) {
        if (pr >= 14) text(p.name, o.x, o.y + lw(pr >= 50 ? -2 : 4), Math.min(18, Math.max(10, pr * 0.3)), ink, { weight: 600, max: o.r * 1.9 });
        if (pr >= 50) { text(ST[p.status.value]?.[0] ?? p.status.value, o.x, o.y + lw(14), 11, sc, { weight: 600 }); text(fresh(p.status), o.x, o.y + lw(28), 10, mute, { font: '"IBM Plex Mono", monospace', max: o.r * 1.7 }); }
        continue;
      }
      text(p.name, o.x, o.y - o.r * 0.8, Math.min(20, pr * 0.1), ink, { weight: 600, max: o.r * 1.2 });
      if (pr > 160) text(`${ST[p.status.value]?.[0] ?? p.status.value} · ${p.status.source === "live" ? "live" : "from " + p.status.source} · ${fresh(p.status)}`, o.x, o.y - o.r * 0.8 + lw(15), 10, stale(p.status) ? mute : sc, { font: '"IBM Plex Mono", monospace', max: o.r * 1.3 });
      for (const kd of kids(p)) {
        const q = at(kd.key, t); if (!q || !seen(q)) continue;
        const qr = px(q.r), n = C.get(kd.id), hv = hover === kd.key || focus === kd.key;
        if (kd.portal) {
          ctx.setLineDash([lw(4), lw(3)]); ctx.strokeStyle = mute; ctx.lineWidth = lw(hv ? 2.5 : 1.2); ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          if (qr >= 14) { text(n.name, q.x, q.y - lw(2), Math.min(13, qr * 0.22), mute, { weight: 600, max: q.r * 1.8 }); text(`in ${P.get(n.product).name} →`, q.x, q.y + lw(11), 10, mute, { max: q.r * 1.8 }); }
          continue;
        }
        const cs = kd.linked ? (dark ? "#9db4ff" : "#2f6fd6") : col(n.status, dark), tiles = qr >= TILES_PX;
        ctx.fillStyle = cs + (dark ? "2a" : "1f"); ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
        ctx.setLineDash(!kd.linked && stale(n.status) ? [lw(4), lw(3)] : []); ctx.strokeStyle = cs; ctx.lineWidth = lw(hv ? 3 : 1.5); ctx.stroke(); ctx.setLineDash([]);
        const label = kd.linked ? `Linked · ${extras(p.id).length}` : n.name;
        if (!tiles) {
          if (qr >= 14) text(label, q.x, q.y + lw(qr >= 40 ? -3 : 4), Math.min(14, Math.max(9, qr * 0.24)), ink, { weight: 600, max: q.r * 1.85 });
          if (qr >= 40 && !kd.linked) text(n.also.length ? `also in ${n.also.map((a) => P.get(a)?.name ?? a).join(", ")}` : ST[n.status.value]?.[0] ?? "", q.x, q.y + lw(11), 10, n.also.length ? mute : cs, { max: q.r * 1.8 });
          if (qr >= 70 && !kd.linked) text(fresh(n.status), q.x, q.y + lw(24), 9, stale(n.status) ? ST["at-risk"][dark ? 2 : 1] : mute, { font: '"IBM Plex Mono", monospace', max: q.r * 1.7 });
          continue;
        }
        text(label, q.x, q.y - q.r * 0.68, Math.min(15, qr * 0.09), ink, { weight: 600, max: q.r * 1.3 });
        if (!kd.linked) text(`${n.status.why}${n.also.length ? ` · also in ${n.also.map((a) => P.get(a)?.name ?? a).join(", ")}` : ""}`, q.x, q.y - q.r * 0.68 + lw(14), 10, mute, { max: q.r * 1.5 });
        if (!kd.linked) text(`${ST[n.status.value]?.[0] ?? n.status.value} · ${fresh(n.status)}`, q.x, q.y - q.r * 0.68 + lw(27), 10, stale(n.status) ? ST["at-risk"][dark ? 2 : 1] : cs, { font: '"IBM Plex Mono", monospace', max: q.r * 1.5 });
        for (const tl of tilesOf(kd.key, q)) {
          const tw = px(tl.w), x = tl.x, y = tl.y, w = tl.w, h = tl.h; if (x > vx1 || x + w < vx0 || y > vy1 || y + h < vy0) continue;
          ctx.globalAlpha = 1; ctx.fillStyle = dark ? "#22282b" : "#e4e0d6"; ctx.fillRect(x, y, w, h);
          if (tl.kind === "page") {
            const im = tl.pg.shot && tw > 10 ? img("./data/" + tl.pg.shot) : null;
            if (im) cover(im, x, y, w, h);
            else if (!tl.pg.shot) { ctx.strokeStyle = mute; ctx.lineWidth = lw(1); ctx.setLineDash([lw(3), lw(3)]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); if (tw > 50) text("down", x + w / 2, y + h / 2 + lw(4), 11, ST["at-risk"][dark ? 2 : 1], { weight: 600 }); }
            if (tw > 70) { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x, y + h - lw(16), w, lw(16)); text(tl.pg.name, x + lw(5), y + h - lw(4.5), 10, "#fff", { align: "left", max: w - lw(10) }); }
          } else if (tl.kind === "post") {
            const im = tl.b.thumb && tw > 10 ? img("./data/" + tl.b.thumb) : null;
            if (im) cover(im, x, y, w, h); else if (tw > 40) text(tl.b.title ?? tl.b.author ?? "", x + w / 2, y + h / 2, 10, ink, { max: w - lw(6) });
            ctx.strokeStyle = dark ? "#9db4ff" : "#2f6fd6"; ctx.lineWidth = lw(1.5); ctx.strokeRect(x, y, w, h);
            if (tw > 60 && tl.b.layer === "film") { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x, y + h - lw(16), w, lw(16)); text(`▶ ${tl.b.title}`, x + lw(5), y + h - lw(4.5), 10, "#fff", { align: "left", max: w - lw(10) }); }
          } else {
            const pr2 = tl.pr, fc = PR_COL[pr2.state] ?? (pr2.checks.fail ? ST["at-risk"][1] : pr2.checks.pending ? ST.watch[1] : ST["on-track"][1]);
            ctx.fillStyle = fc; ctx.globalAlpha = 0.85; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
            if (tw > 24) text(`#${pr2.number}`, x + w / 2, y + h / 2 + lw(tw > 70 ? -2 : 4), tw > 70 ? 13 : 10, "#fff", { weight: 600 });
            if (tw > 70) text(`${pr2.state === "OPEN" ? (pr2.draft ? "draft" : "open") : pr2.state.toLowerCase()}${pr2.state === "OPEN" ? ` · ✓${pr2.checks.pass} ✗${pr2.checks.fail}` : ""}`, x + w / 2, y + h / 2 + lw(12), 9, "#fff", { font: '"IBM Plex Mono", monospace' });
          }
          if (hover === tl.key) { ctx.strokeStyle = ink; ctx.lineWidth = lw(2.5); ctx.strokeRect(x, y, w, h); }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Hit testing: the deepest thing drawn under the pointer.
  const toWorld = (cx, cy) => { const c = A.view.cam, ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2; return [(cx - ox) / c.s + c.x, (cy - oy) / c.s + c.y]; };
  function hit(wx, wy) {
    const s = A.view.cam.s, inC = (o) => o && Math.hypot(wx - o.x, wy - o.y) <= o.r;
    for (const p of W.products) {
      const o = L.get(p.id); if (!inC(o)) continue;
      if (o.r * s >= KIDS_PX) for (const kd of kids(p)) {
        const q = L.get(kd.key); if (!inC(q)) continue;
        if (q.r * s >= TILES_PX) { const tl = tilesOf(kd.key, q).find((x) => wx >= x.x && wx <= x.x + x.w && wy >= x.y && wy <= x.y + x.h); if (tl) return { id: kd.key, tile: tl }; }
        return { id: kd.linked ? kd.key : kd.portal ? kd.key : kd.id, portal: kd.portal && kd.id, linked: kd.linked };
      }
      return { id: p.id };
    }
    return null;
  }
  A.workAt = (e) => {
    if (!on()) return false;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (pj.on()) { // a screen opens its story; a greyed neighbour opens that project; empty space steps out
      const h = pj.hit(wx, wy);
      if (h?.startsWith("screen:")) pick(h.slice(7) === pj.sel() ? null : h.slice(7)); else if (h) focusOn(h.slice(6)); else if (pj.sel()) pick(null); else focusOn(null);
      return true;
    }
    if (Math.hypot(wx, wy) > R + 10) return false;
    const h = hit(wx, wy);
    if (!h) focusOn(null);
    else if (h.tile) openTile(h.tile);
    else if (h.portal) focusOn(h.portal);
    else if (h.id === focus && !h.linked) proof(h.id);
    else focusOn(h.id);
    return true;
  };
  document.getElementById("atlas").addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons || !on()) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY), h = !pj.on() && Math.hypot(wx, wy) <= R + 10 ? hit(wx, wy) : null, k = pj.on() ? pj.hit(wx, wy) : h ? h.tile?.key ?? h.id : null;
    if (k !== hover) { hover = k; dirty++; }
    if (k) document.getElementById("atlas").style.cursor = "pointer";
  });

  // Focus: fly to a node (depth 0 portfolio, 1 product, 2 component), deep-link it, and fill the shelf.
  const boxOf = (id) => { const o = L.get(id) ?? { x: 0, y: 0, r: R + 14 }, m = o.r * (C.has(id) ? 1.04 : 1.12); return [o.x - m, o.y - m, o.x + m, o.y + m]; };
  function focusOn(id, screen) {
    if (id && !L.has(id)) return;
    if (hidden.delete("work")) localStorage.setItem("taste:hidden", JSON.stringify([...hidden])); bm?.addLayer("work", "Work", W.products.length, "#2f6fd6");
    focus = id; dirty++;
    if (P.has(id) && pj.has(id)) { pj.enter(id, L.get(id), aspect()); document.body.classList.add("project-focus"); hud.hidden = true; return pick(screen, 900); }
    leave(); fly(boxOf(id ?? "disc"), 900, 24, true);
    history.replaceState(null, "", location.pathname + location.search + "#work" + (id ? ":" + id : ""));
    const nodes = id == null ? W.components : C.has(id) ? [C.get(id)] : id.endsWith(">linked") ? [] : P.get(id).components.map((x) => C.get(x));
    const posts = id == null ? W.products.flatMap((p) => [p.id, ...p.components]).flatMap(extras) : id.endsWith(">linked") ? extras(id.split(">")[0]) : C.has(id) ? extras(id) : [id, ...P.get(id).components].flatMap(extras);
    const pages = nodes.flatMap((c) => c.pages.map((pg, i) => ({ c, pg, i })));
    bm?.setCustom({ title: id == null ? "Your work" : name(id.replace(/>linked$/, "")), items: [...new Map(posts.map((b) => [b.id, b])).values()],
      n: pages.length + posts.length, html: pages.map(({ c, pg, i }) => `<a href="#" data-wpage="${esc(c.id)}|${i}" title="${esc(pg.name)}">${pg.shot ? `<img loading="lazy" src="./data/${esc(pg.shot)}" alt="" />` : `<div class="txt">${esc(pg.name)}<br><b>down</b> · ${esc(pg.code)}</div>`}<span class="meta"><em style="background:${pg.shot ? ST["on-track"][1] : ST["at-risk"][1]}"></em>${esc(pg.name)} · ${esc(c.name)}</span></a>`).join("") });
    drawHud();
  }
  // After the shelf opens/closes or the window resizes, keep the focused Work node framed (true = handled).
  A.refit = (ms = 600) => { if (focus === undefined) return false; fly(pj.on() ? pj.pick(pj.sel()) : boxOf(focus ?? "disc"), ms, 24, true); return true; };
  const blur = () => { if (focus === undefined) return; focus = undefined; dirty++; leave(); bm?.setCustom(null); };
  // Project focus: pick a screen (or none: the whole journey), fill the shelf, then fly clear of it.
  function pick(sid, ms = 600) {
    const b = pj.pick(sid); dirty++; bm?.setCustom(pj.shelf()); fly(b, ms, 24, true);
    history.replaceState(null, "", location.pathname + location.search + `#work:${pj.id()}${pj.sel() ? "@" + pj.sel() : ""}`);
  }
  function leave() { if (!pj.on()) return; pj.exit(); dirty++; document.body.classList.remove("project-focus"); }
  addEventListener("resize", () => { if (pj.on()) { pj.relayout(aspect()); dirty++; A.refit(0); } });

  // Proof lightbox (depth 3): text lives only here.
  const box = document.createElement("div"); box.className = "lightbox work-lb"; document.body.appendChild(box);
  const show = (html) => { box.innerHTML = `<div class="lb-card wk"><button class="lb-x" aria-label="Close">×</button><div class="lb-body">${html}</div></div>`; box.classList.add("on"); };
  const pill = (s) => `<span class="wk-pill" style="--c:${col(s, A.view.theme === "dark")}">${esc(ST[s.value]?.[0] ?? s.value)}</span> <span class="wk-src${stale(s) ? " stale" : ""}">${esc(s.source === "live" ? "live" : "from " + s.source)} · ${esc(fresh(s))}</span>`;
  const nums = (l) => `<div class="wk-nums">${l.map(([v, k]) => `<div><b>${esc(v)}</b><small>${esc(k)}</small></div>`).join("")}</div>`;
  const spark = (touches) => { // touches per day over the window
    const days = W.windowDays ?? 21, d0 = W.generatedAt - days * 86400, by = new Array(days).fill(0);
    for (const [t, n] of touches) { const i = Math.floor((t - d0) / 86400); if (i >= 0 && i < days) by[i] += n; }
    const m = Math.max(...by, 1);
    return `<svg class="wk-spark" viewBox="0 0 ${days * 6} 30" preserveAspectRatio="none" aria-label="files touched per day, last ${days} days">${by.map((n, i) => `<rect x="${i * 6}" y="${30 - (28 * n) / m}" width="4.5" height="${(28 * n) / m}"><title>${n} files</title></rect>`).join("")}</svg><small class="wk-k">files touched per day · last ${days} days</small>`;
  };
  const asks = (n) => (n.asks?.length ? `<div class="wk-k">You asked · ${n.asksTotal ?? n.asks.length}</div>${n.asks.map((a) => `<p class="asked"><b>You asked:</b> ${esc(a.text)} <small>${new Date(a.t * 1000).toISOString().slice(0, 10)}</small></p>`).join("")}` : "");
  const prList = (prs) => (prs.length ? `<div class="wk-k">Pull requests</div><ul class="wk-prs">${prs.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.number} ${esc(p.title)}</a> <em style="--c:${PR_COL[p.state] ?? (p.checks.fail ? ST["at-risk"][1] : ST["on-track"][1])}">${p.state === "OPEN" ? (p.draft ? "draft" : "open") : p.state.toLowerCase()}</em>${p.checks.pass + p.checks.fail + p.checks.pending ? ` <small>✓${p.checks.pass} ✗${p.checks.fail}${p.checks.pending ? ` …${p.checks.pending}` : ""}</small>` : ""} <small>${ago(p.t, now())} ago</small></li>`).join("")}</ul>` : "");
  const thumbs = (l, node) => (l.length ? `<div class="wk-k">Linked inspiration · ${l.length}</div><div class="wk-thumbs">${l.map((b) => `<figure><img src="./data/${esc(b.thumb)}" alt="" data-wpost="${esc(b.id)}" title="${esc(b.title ?? b.text?.slice(0, 80))}" />${links.some((x) => x.item === b.id && x.node === node) ? `<button data-wunlink="${esc(node)}" data-item="${esc(b.id)}" title="Unlink">×</button>` : ""}</figure>`).join("")}</div>` : "");
  const ci = (repos) => repos.map((r) => [r, W.ci[W.repos[r]?.gh]]).filter(([, x]) => x).map(([r, x]) => `<a class="wk-ci" style="--c:${x.conclusion === "success" ? ST["on-track"][1] : x.conclusion === "failure" ? ST["at-risk"][1] : ST.watch[1]}" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(r)} main CI ${esc(x.conclusion ?? "running")} · ${ago(x.t, now())} ago</a>`).join(" ");
  function proof(id) {
    if (C.has(id)) {
      const c = C.get(id), p = P.get(c.product), up = c.pages.filter((x) => x.shot).length;
      show(`<div class="lb-line"><span>${esc(p.name)}</span><span>${esc(c.name)}</span>${c.also.map((a) => `<span>also in <a href="#work:${esc(a)}" data-wgo="${esc(a)}">${esc(P.get(a)?.name ?? a)}</a></span>`).join("")}</div>
        <h3>${esc(c.name)}</h3><p>${pill(c.status)}</p><p class="wk-why">${esc(c.status.why)}</p>
        ${nums([[c.touches.reduce((a, [, n]) => a + n, 0), `files touched · ${W.windowDays}d`], [c.lastTouched ? ago(c.lastTouched, now()) : "—", "last touch"], [c.prs.filter((x) => x.state === "OPEN").length, "open PRs"], [c.pages.length ? `${up}/${c.pages.length}` : "—", "pages up"]])}
        ${spark(c.touches)}<p>${ci(c.repos)}</p>${c.metrics.map(([k, v, src]) => `<p class="wk-m"><b>${esc(k)}</b> ${esc(v)} <small>${esc(src)}</small></p>`).join("")}
        ${c.pages.length ? `<div class="wk-k">Pages</div><div class="wk-thumbs">${c.pages.map((pg, i) => `<figure data-wpage="${esc(c.id)}|${i}">${pg.shot ? `<img src="./data/${esc(pg.shot)}" alt="" />` : `<div class="down">down</div>`}<figcaption>${esc(pg.name)}</figcaption></figure>`).join("")}</div>` : ""}
        ${prList(c.prs)}${thumbs(extras(c.id), c.id)}${asks(c)}`);
    } else {
      const p = P.get(id.replace(/>linked$/, "")); if (!p) return;
      const left = p.deadline ? Date.parse(p.deadline) / 1000 - now() : null;
      show(`<div class="lb-line"><span>Your work</span><span>${esc(p.name)}</span>${p.role ? `<span>${esc(p.role)}</span>` : ""}</div>
        <h3>${esc(p.name)}</h3><p>${pill(p.status)}</p>${p.verdict ? `<p class="wk-why">${esc(p.verdict.text)} <small>from ${esc(p.verdict.source)}</small></p>` : ""}
        ${left != null ? `<p class="wk-why"><b>${left > 0 ? `${Math.floor(left / 3600)}h left` : "Deadline passed"}</b> · ${esc(p.deadlineLabel ?? p.deadline)}</p>` : ""}
        ${nums(p.metrics.slice(0, 8).map(([k, v, src]) => [v, `${k}${src === "live" ? "" : " · " + src}`]))}${spark(p.touches)}
        <p>${ci(p.repos.map((r) => r.id))}</p>${p.repos.map((r) => `<p class="wk-m"><b>${esc(r.id)}</b> ${r.ok ? `${esc(r.head)} · ${esc(r.headMsg)} <small>${ago(r.headAt, now())} ago · ${r.commits} commits in ${W.windowDays}d</small>` : `<em>${esc(r.why)}</em>`}</p>`).join("")}
        ${p.notes ? ["open", "risks", "done"].filter((k) => p.notes[k].length).map((k) => `<div class="wk-k">${k} <small>from ${esc(p.notes.source)}</small></div><ul class="wk-notes">${p.notes[k].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("") : ""}
        ${p.links.length ? `<p class="wk-links">${p.links.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`).join("")}</p>` : ""}
        ${thumbs(extras(p.id), p.id)}${asks(p)}`);
    }
  }
  function openTile(tl) {
    if (tl.kind === "post") return bm?.detail(tl.b);
    if (tl.kind === "pr") return proof(tl.key.split("#")[0].split(">").at(-1));
    openPage(tl.c, tl.i);
  }
  function openPage(c, i) {
    const pg = c.pages[i];
    show(`<div class="lb-line"><span>${esc(P.get(c.product).name)}</span><span>${esc(c.name)}</span><span>page</span></div>
      ${pg.shot ? `<img class="hero wk-hero" src="./data/${esc(pg.shot)}" alt="" />` : `<div class="down hero">down · ${esc(pg.code)}</div>`}
      <h3>${esc(pg.name)}</h3><p class="wk-src${stale({ checked: pg.checked, window: 86400 }) ? " stale" : ""}">${pg.shot ? "screenshot" : "no answer"} · ${esc(fresh({ checked: pg.checked, window: 86400 }))}</p>
      <div class="lb-act">${pg.url ? `<a class="primary" href="${esc(pg.url)}" target="_blank" rel="noopener">Open page ↗</a>` : `<span class="wk-src">from the repo: ${esc(pg.file)}</span>`}<button data-wproof="${esc(c.id)}">${esc(c.name)} proof</button></div>`);
  }
  const close = () => { box.classList.remove("on"); box.innerHTML = ""; };
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".lb-x")) close(); });

  // Links: the post detail view offers "Link to work…"; links persist via POST /api/work-links (scripts/board.mjs).
  A.postExtra = (b) => {
    const mine = links.filter((l) => l.item === b.id);
    return `<div class="wk-link" data-item="${esc(b.id)}">${mine.map((l) => `<span class="wk-chip">⟷ <a href="#work:${esc(l.node)}" data-wgo="${esc(l.node)}">${esc(name(l.node))}</a><button data-wunlink="${esc(l.node)}" data-item="${esc(b.id)}" title="Unlink">×</button></span>`).join("")}
      <select data-wpick aria-label="Link to work"><option value="">Link to work…</option>${W.products.map((p) => `<optgroup label="${esc(p.name)}"><option value="${p.id}">${esc(p.name)} (product)</option>${p.components.map((id) => `<option value="${esc(id)}">${esc(C.get(id).name)}</option>`).join("")}</optgroup>`).join("")}</select></div>`;
  };
  async function save(item, node, op) {
    const r = await fetch("/api/work-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item, node, op }) }).catch((e) => ({ ok: false, text: async () => e.message }));
    const el = document.querySelector(`.wk-link[data-item="${CSS.escape(item)}"]`);
    if (!r.ok) { const m = await r.text(); console.error("work link:", m); el?.insertAdjacentHTML("beforeend", `<small class="wk-err">Not saved: ${esc(m.slice(0, 80))}</small>`); return; }
    links = (await r.json()).links; layout();
    if (el && post(item)) el.outerHTML = A.postExtra(post(item));
    if (box.classList.contains("on") && focus) proof(focus);
    if (focus !== undefined) focusOn(focus);
  }
  document.addEventListener("change", (e) => { const s = e.target.closest?.("[data-wpick]"); if (s?.value) save(s.closest("[data-item]").dataset.item, s.value, "add"); });
  document.addEventListener("click", (e) => {
    const u = e.target.closest?.("[data-wunlink]"); if (u) { e.preventDefault(); save(u.dataset.item, u.dataset.wunlink, "remove"); return; }
    const g = e.target.closest?.("[data-wgo]"); if (g) { e.preventDefault(); document.querySelector(".lightbox.on .lb-x")?.click(); close(); focusOn(g.dataset.wgo); return; }
    const ps = e.target.closest?.("[data-pjscreen]"); if (ps && pj.on()) { e.preventDefault(); pick(ps.dataset.pjscreen || null); return; }
    const tk = e.target.closest?.("[data-take]"); if (tk) { const hero = document.querySelector(".pj-hero"); if (hero) hero.src = tk.dataset.take; document.querySelectorAll("[data-take]").forEach((x) => x.classList.toggle("on", x === tk)); return; }
    const pg = e.target.closest?.("[data-wpage]"); if (pg) { e.preventDefault(); const [cid, i] = pg.dataset.wpage.split("|"); openPage(C.get(cid), +i); return; }
    const pf = e.target.closest?.("[data-wproof]"); if (pf) { proof(pf.dataset.wproof); return; }
    const wp = e.target.closest?.("[data-wpost]"); if (wp) { close(); bm?.detail(post(wp.dataset.wpost)); }
  });
  // Esc steps out one level: lightbox → component → product → portfolio → the atlas.
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.target.tagName === "INPUT" || focus === undefined) return;
    e.stopImmediatePropagation();
    if (box.classList.contains("on")) return close();
    if (pj.on() && pj.sel()) return pick(null);
    if (C.has(focus)) focusOn(C.get(focus).product);
    else if (focus?.includes(">")) focusOn(focus.split(">")[0]);
    else if (focus) focusOn(null);
    else { blur(); window.__atlas.go("root"); }
  }, true);

  // HUD: as-of scrub and half-life re-weigh the bubbles (RepoMap's controls), plus the status lens legend.
  const hud = document.createElement("div"); hud.className = "work-hud"; hud.hidden = true; document.body.appendChild(hud);
  function drawHud() {
    const n = {}; for (const p of W.products) n[p.status.value] = (n[p.status.value] ?? 0) + 1;
    hud.innerHTML = `<b>Work</b><span class="seg" title="Bubble sizes as of">${AS_OF.map(([l, v]) => `<button data-asof="${v}" class="${v === asOf ? "on" : ""}">${l}</button>`).join("")}</span>
      <span class="seg" title="Half-life of a touch">${HALF.map(([l, v]) => `<button data-hl="${v}" class="${v === hl ? "on" : ""}">${l}</button>`).join("")}</span>
      <span class="lens">${Object.entries(ST).filter(([k]) => n[k]).map(([k, [l, c]]) => `<i style="--c:${c}"></i>${l} ${n[k]}`).join(" ")}</span>`;
  }
  hud.addEventListener("click", (e) => {
    const a = e.target.closest("[data-asof]"), h = e.target.closest("[data-hl]");
    if (a) asOf = +a.dataset.asof; if (h) hl = +h.dataset.hl; if (a || h) { layout(); drawHud(); }
  });

  const find = (q) => { const ws = q.toLowerCase().split(/\s+/).filter(Boolean); return [...W.products.map((p) => ({ id: p.id, name: p.name, sub: `work · ${ST[p.status.value]?.[0] ?? ""}`, h: `${p.name} ${p.id} work` })),
    ...W.components.map((c) => ({ id: c.id, name: c.name, sub: `work · ${P.get(c.product).name}${c.also.length ? " · also " + c.also.join(", ") : ""}`, h: `${c.name} ${c.id} ${P.get(c.product).name} ${c.also.join(" ")}` }))]
    .filter((x) => ws.every((w) => x.h.toLowerCase().includes(w))).slice(0, 5); };
  const fromHash = (h) => { if (!/^work(:|$)/.test(h)) return false; const [id, sc] = (decodeURIComponent(h.slice(5)) || "").split("@"); focusOn(id && L.has(id) ? id : null, sc); return true; };
  addEventListener("hashchange", () => fromHash(location.hash.slice(1)));
  bm?.addLayer("work", "Work", W.products.length, "#2f6fd6");
  (function loop(t) { paint(t); requestAnimationFrame(loop); })(performance.now());
  if (start) setTimeout(() => fromHash(start), 650); // after the opening zoom
  return { focus: focusOn, blur, find, proof, redraw: () => dirty++, links: () => links, loaded: () => [...imgs.values()].filter((v) => v instanceof ImageBitmap).length, tethers: () => ends.map(([, tl, node]) => ({ item: tl.b.id, node })), layout: () => L, state: () => ({ focus, asOf, hl, visible: on(), hover }), project: () => pj.state(), pick, data: W, hit: (x, y) => hit(...toWorld(x, y)), screen: (id) => { const o = L.get(id), c = A.view.cam; return o && { x: (c.cx ?? innerWidth / 2) + (o.x - c.x) * c.s, y: (c.cy ?? innerHeight / 2) + (o.y - c.y) * c.s, r: o.r * c.s }; } };
}
