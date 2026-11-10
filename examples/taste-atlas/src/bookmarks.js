// Optional private layer: your saved posts classified into the atlas, plus "sources" -- links you asked an agent
// to recreate or triage, films you made, your GitHub projects and ideas (scripts/sources.mjs).
// Loads ./data/bookmarks.atlas.json and ./data/sources.atlas.json if present (gitignored; never shipped). Adds count badges on
// technique nodes, a constellation of every post around the ring, a shelf listing the posts under the
// current focus (filterable by subject), "recorded examples" on the lineage card, and a detail view.
import { TECHNIQUES, opById, lineage } from "./taxonomy.js";
import { viewOf, setView } from "./nav.js";

const NS = "http://www.w3.org/2000/svg";
const SUBJECT_NAMES = { "3d-webgl": "3D / WebGL", "ui-product": "UI", "motion-design": "Motion", "generative-art": "Generative", illustration: "Illustration", "photo-film": "Photo / film", "type-brand": "Type / brand", "ai-dev-tools": "AI tools", "hardware-robotics": "Hardware" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const techById = new Map(TECHNIQUES.map((t) => [t.id, t]));
const LAYERS = { saved: "X bookmarks", portfolio: "Portfolio", ask: "Asked about", film: "Films", ref: "Studied", project: "Projects", idea: "Ideas", youtube: "YouTube", spotify: "Spotify", tidal: "Tidal", music: "Music", github: "GitHub stars", linkedin: "LinkedIn" };
// Layer colours: the outer ring's tiles before their picture loads, the layer bar's dots, LinkedIn's initials tiles.
const LCOL = { saved: "#d24b2a", youtube: "#e62117", github: "#6e5494", linkedin: "#0a66c2", spotify: "#1db954" };
const lcol = (l) => LCOL[l] ?? "#8a857a";
const OPEN = { portfolio: "Open ↗", ask: "Open source ↗", film: "Open film ↗", ref: "Open ↗", project: "Open on GitHub ↗", idea: "Open ↗", youtube: "Watch on YouTube ↗", spotify: "Play on Spotify ↗", tidal: "Play on TIDAL ↗", music: "Open ↗", github: "Open on GitHub ↗", linkedin: "Open on LinkedIn ↗" };
const OWN = new Set(["film", "idea", "portfolio"]); // your own work: show its name, not an @handle
const NAMED = new Set(["youtube", "spotify", "tidal", "music", "linkedin"]); // channels and artists are names, not @handles
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.decoding = "async"; i.onload = () => ok(i); i.onerror = no; i.src = src; });

export async function mountBookmarks(A, { go, fly }) {
  const get = (f) => fetch(f, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [data0, src0, hist, net] = await Promise.all([get("./data/bookmarks.atlas.json"), get("./data/sources.atlas.json"), get("./data/history.atlas.json"), get("./data/network.atlas.json")]);
  // Watch/listen history (scripts/history.mjs) joins the sources layers; it is unlabelled, so it lists in the shelf.
  // LinkedIn connections (scripts/network.mjs) join as one more layer: a person is a tile, grouped by company hub.
  const hubs = new Map((net?.nodes ?? []).filter((n) => n.type === "company").map((n) => [n.label, n.reach]));
  const people = (net?.nodes ?? []).filter((n) => n.type === "person" || n.type === "fof").map((n) => ({
    id: "li-" + n.id, nid: n.id, layer: "linkedin", url: n.url, title: n.label, author: n.company ?? "", date: n.since ?? "", warmth: n.warmth,
    group: hubs.has(n.company) ? n.company : "Other", text: [n.label, [n.position, n.company].filter(Boolean).join(" @ "), n.warmth > 1 ? `warmth ${n.warmth}` : ""].filter(Boolean).join(" · "), technique: null }));
  const extra = [...(src0?.items ?? []), ...(hist?.items ?? []), ...people];
  const src = extra.length ? { ...src0, items: extra } : null;
  if (!data0 && !src) return null;
  const data = data0 ?? { items: [], count: 0, method: src.method };
  // everything: shelf "All" includes sources not yet placed on a technique; items: what sits on the graph.
  const everything = [...data.items.map((b) => ({ layer: "saved", ...b })), ...(src?.items ?? [])];
  const items = everything.filter((b) => b.technique);
  const layers = Object.keys(LAYERS).filter((l) => everything.some((b) => b.layer === l));
  const byId = new Map(everything.map((b) => [b.id, b]));
  const byTech = new Map(TECHNIQUES.map((t) => [t.id, []]));
  for (const b of items) byTech.get(b.technique)?.push(b);
  for (const list of byTech.values()) list.sort((a, b) => !a.thumb - !b.thumb || (b.score ?? 0) - (a.score ?? 0));

  // Badges on technique nodes, sized by count.
  const max = Math.max(...[...byTech.values()].map((l) => l.length), 1);
  for (const [id, list] of byTech) {
    const g = A.parts.get(id)?.g; if (!g || !list.length) continue;
    const r = 13 + 15 * Math.sqrt(list.length / max), op = opById[techById.get(id).op];
    const b = document.createElementNS(NS, "g"); b.setAttribute("class", "bm-badge"); b.setAttribute("transform", `translate(${30} ${-30})`);
    b.innerHTML = `<circle r="${r}" fill="${op.color}" /><text text-anchor="middle" dy="0.35em" font-size="${Math.round(r * 0.8)}">${list.length}</text>`;
    g.appendChild(b);
  }

  // Constellation, drawn on one canvas behind the graph (SVG DOM for ~930 images was the lag):
  // each post with an image is a tile in a wedge behind its technique, best fit nearest the centre.
  // Tiles come from one 64px sprite sheet; tiles bigger than ~90px on screen swap to the full thumbnail.
  const T = 44, G = 6, R0 = 1840, tiles = [], ext = new Map();
  const slot = Math.min(...A.graph.leaves.slice(1).map((l, i) => Math.abs(l.a - A.graph.leaves[i].a)));
  for (const [id, all] of byTech) {
    const n = A.graph.byId.get(id), list = all.filter((b) => b.thumb); if (!n || !list.length) continue;
    const a0 = n.children[0].a - slot / 2, span = n.children.at(-1).a - n.children[0].a + slot;
    let r = R0, k = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (k < list.length) {
      const per = Math.max(1, Math.floor((span * r) / (T + G))), row = list.slice(k, k + per);
      row.forEach((b, j) => {
        const a = a0 + (span * (j + 0.5)) / per, x = Math.cos(a) * r, y = Math.sin(a) * r;
        tiles.push({ b, x, y, id, op: n.op, full: null });
        x0 = Math.min(x0, x - T); y0 = Math.min(y0, y - T); x1 = Math.max(x1, x + T); y1 = Math.max(y1, y + T);
      });
      k += per; r += T + G;
    }
    ext.set(id, [x0, y0, x1, y1]);
  }
  // Outer ring: every item with no technique (watch history, stars, LinkedIn, unsorted saves, sources) sits in its
  // layer's sector beyond the constellation, grouped by category (channel, language, company) in reading order.
  const hidden = new Set(JSON.parse(localStorage.getItem("taste:hidden") ?? "[]"));
  const GROUP = { youtube: (b) => b.author, github: (b) => b.why?.split(" · ")[1] ?? "Other", linkedin: (b) => b.group, saved: () => "Unsorted" };
  const outer = new Map();
  // Big layers get a sector each; the small ones (portfolio, asks, films, studied, projects, ideas) share one.
  const SECTORS = { saved: "X bookmarks · unsorted", youtube: "YouTube", github: "GitHub stars", linkedin: "LinkedIn", sources: "Your work & sources" };
  const sectorOf = (l) => (SECTORS[l] ? l : "sources");
  for (const b of everything) if (!b.technique) { const k = sectorOf(b.layer ?? "saved"); outer.get(k)?.push(b) ?? outer.set(k, [b]); }
  const groups = new Map(); // "layer:name" -> { key, layer, name, items, box, at }
  const R1 = Math.max(R0, ...tiles.map((t) => Math.hypot(t.x, t.y))) + 5 * T, nOut = [...outer.values()].reduce((a, l) => a + l.length, 0), GAP = 0.05;
  let a0 = -Math.PI / 2;
  // Small sectors sit between big ones so their titles never meet.
  for (const [layer, list] of ["linkedin", "saved", "youtube", "sources", "github"].filter((l) => outer.has(l)).map((l) => [l, outer.get(l)])) {
    const by = new Map();
    for (const b of list) { const g = String((GROUP[layer] ?? (() => LAYERS[layer] ?? layer))(b) || "Other"); by.get(g)?.push(b) ?? by.set(g, [b]); }
    if (layer === "youtube" || layer === "github") for (const [g, l] of by) if (l.length < 3 && g !== "Other") { by.delete(g); by.get("Other")?.push(...l) ?? by.set("Other", [...l]); }
    const rank = (g, l) => (g === "Other" ? -1 : layer === "linkedin" ? hubs.get(g) ?? 0 : l.length);
    const ordered = [...by].sort(([g, l], [h, m]) => rank(h, m) - rank(g, l));
    const span = Math.max(0.25, (2 * Math.PI - GAP * outer.size - 0.5) * (list.length / nOut));
    let r = R1, k = 0, flat = ordered.flatMap(([g, l]) => l.map((b) => [g, b]));
    while (k < flat.length) {
      const per = Math.max(1, Math.floor((span * r) / (T + G)));
      flat.slice(k, k + per).forEach(([g, b], j) => {
        const a = a0 + (span * (j + 0.5)) / per, x = Math.cos(a) * r, y = Math.sin(a) * r, key = `${layer}:${g}`;
        let grp = groups.get(key); if (!grp) groups.set(key, (grp = { key, sector: layer, layer: b.layer ?? "saved", name: g, items: [], box: [Infinity, Infinity, -Infinity, -Infinity], at: { x, y } }));
        grp.items.push(b); const bx = grp.box; bx[0] = Math.min(bx[0], x - T); bx[1] = Math.min(bx[1], y - T); bx[2] = Math.max(bx[2], x + T); bx[3] = Math.max(bx[3], y + T);
        tiles.push({ b, x, y, id: key, op: null, color: layer === "linkedin" && b.warmth > 1 ? `hsl(${210 - Math.min(1, b.warmth / 14) * 30}, 70%, ${52 - Math.min(1, b.warmth / 14) * 14}%)` : lcol(layer), full: null, outer: true });
      });
      k += per; r += T + G;
    }
    groups.set("L:" + layer, { key: "L:" + layer, sector: layer, layer, name: SECTORS[layer], layerRow: true, at: { x: Math.cos(a0 + span / 2) * (R1 - 3 * T), y: Math.sin(a0 + span / 2) * (R1 - 3 * T) }, items: list, a: a0 + span / 2 });
    a0 += span + GAP;
  }
  const boxOf = (key) => {
    const ks = key.startsWith("L:") ? [...groups.values()].filter((g) => !g.layerRow && g.sector === key.slice(2)) : [groups.get(key)];
    return ks.filter(Boolean).reduce((m, g) => [Math.min(m[0], g.box[0]), Math.min(m[1], g.box[1]), Math.max(m[2], g.box[2]), Math.max(m[3], g.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  };
  const visible = (t) => !hidden.has(t.b.layer ?? "saved");
  // The overview fits every visible outer layer as well as the taxonomy.
  const outerBox = () => [...groups.values()].filter((g) => !g.layerRow && !hidden.has(g.layer)).map((g) => g.box);
  A.extraBounds = (ids) => [...[...ids].map((k) => ext.get(k)).filter(Boolean), ...(ids.has?.(A.graph.root.id) ? outerBox() : [])];
  // A picked category (from search or the layer bar): its tiles stay lit and the shelf lists it until focus changes.
  let pickKey = null;
  const pickSet = (key) => (key.startsWith("L:") ? new Set([...groups.values()].filter((g) => !g.layerRow && g.sector === key.slice(2)).map((g) => g.key)) : new Set([key]));
  function pick(key, quiet) {
    if (key === pickKey) return; pickKey = key; dirty++; litFor = null;
    if (key) { for (const g of groups.values()) if (g.key === key || (key.startsWith("L:") && g.sector === key.slice(2))) hidden.delete(g.layer); saveHidden(); fly?.(boxOf(key)); }
    if (!quiet) draw();
  }
  const saveHidden = () => { localStorage.setItem("taste:hidden", JSON.stringify([...hidden])); drawBar(); };
  // Layer bar: one toggle per data layer, with its count.
  const bar = document.createElement("nav"); bar.className = "layers"; document.body.appendChild(bar);
  const counts = new Map(); for (const b of everything) counts.set(b.layer ?? "saved", (counts.get(b.layer ?? "saved") ?? 0) + 1);
  function drawBar() {
    bar.innerHTML = `<b>Layers</b>` + Object.keys(LAYERS).filter((l) => counts.has(l)).map((l) => `<button data-layer="${l}" class="${hidden.has(l) ? "" : "on"}" title="${hidden.has(l) ? "Show" : "Hide"} ${esc(LAYERS[l])}"><i style="background:${lcol(l)}"></i>${esc(LAYERS[l])}<small>${counts.get(l).toLocaleString()}</small></button>`).join("");
  }
  drawBar();
  bar.addEventListener("click", (e) => {
    const l = e.target.closest("[data-layer]")?.dataset.layer; if (!l) return;
    hidden.has(l) ? hidden.delete(l) : hidden.add(l);
    if (pickKey && groups.get(pickKey)?.layer === l && hidden.has(l)) pickKey = null;
    saveHidden(); dirty++; litFor = null; draw();
  });
  const pairs = new Map();
  for (const b of items) if (b.also && b.also !== b.technique) { const k = [b.technique, b.also].sort().join("|"); pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  const strands = [...pairs].filter(([, c]) => c >= 3).map(([k, c]) => { const [p, q] = k.split("|").map((x) => A.graph.byId.get(x)); return { p, q, c }; });

  const cv = document.createElement("canvas"); cv.id = "bm-canvas"; document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  let sprite = null, spriteAt = new Map(), S = 64, dirty = 1, hoverTile = null;
  fetch("./data/sprite.json").then((r) => (r.ok ? r.json() : null)).then(async (m) => {
    if (!m) return; S = m.size; m.ids.forEach((id, i) => spriteAt.set(id, [(i % m.cols) * S, Math.floor(i / m.cols) * S]));
    sprite = await loadImg("./data/sprite.jpg"); dirty++;
  }).catch((e) => console.error("sprite:", e));
  // Deep zoom (gigapixel-style level of detail): 64px sprite -> 480px thumb -> <=1600px still -> the original file at full
  // resolution (X's upload, or a native-size video frame), each fetched only when a
  // tile is big enough on screen to need it, decoded off the main thread (createImageBitmap) so zooming never stalls.
  let hires = {};
  fetch("./data/hires.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((m) => { hires = m; dirty++; }).catch((e) => console.error("hires:", e));
  const bitmap = (src) => fetch(src).then((r) => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.blob(); }).then((b) => createImageBitmap(b));
  const big = new Map(); // tile -> ImageBitmap of the <=1600px still or the original; least recently drawn are closed past BIG_MAX
  const BIG_MAX = innerWidth <= 700 ? 12 : 40; // ~40 tiles of 240+ css px fit a desktop screen: never evict what is visible
  const useBig = (t) => { const im = big.get(t); big.delete(t); big.set(t, im); while (big.size > BIG_MAX) { const [k, v] = big.entries().next().value; big.delete(k); v?.close?.(); k.big = null; k.bigW = 0; } };
  // Which file a tile of `dp` device pixels needs: the original once the 1600px still would be upscaled.
  const stillFor = (h, dp) => (h.orig && dp > 1400 && (h.w ?? 9999) > 1700 ? [h.orig, h.w ?? 9999] : h.full ? [h.full, 1600] : h.orig ? [h.orig, h.w ?? 9999] : null);
  // Clips: the 480px loop while a tile is small, the native-size loop once it is bigger than that on screen.
  const clipFor = (h, dp) => "./data/" + (h.clip_hd && dp > 520 ? h.clip_hd : h.clip ?? h.clip_hd);
  // Videos autoplay on the canvas: muted 4 s loops (480px, local) for the few largest video tiles nearest the centre.
  // A small fixed pool of <video> elements is reused and laid over their tiles, so the compositor plays them and the
  // canvas never repaints for a video frame: the cost stays bounded however many posts are on screen.
  const POOL = innerWidth <= 700 ? 2 : 4, MIN_PX = 72;
  // Self-tuning: every second compare the frame rate with clips playing to the rate with none; if clips cost more than
  // 20%, play one fewer (never below 1). Machines with hardware decode keep all of them, slow ones settle without lag.
  let limit = POOL, fps0 = 60, win = { t: 0, n: 0 };
  function tune(now) {
    if (!win.t) win.t = now; win.n++;
    if (now - win.t < 1000) return;
    const fps = (win.n * 1000) / (now - win.t), live = [...playing.values()].filter((v) => !v.paused).length; win = { t: now, n: 0 };
    if (!live) fps0 = Math.max(fps0 * 0.9, fps); // track the no-video baseline (decays so a busy start does not stick)
    else if (fps < fps0 * 0.8 && limit > 1) { limit = Math.min(limit, live) - 1; dirty++; console.info(`taste: ${fps.toFixed(0)} fps with ${live} clips (baseline ${fps0.toFixed(0)}), playing at most ${limit}`); }
  }
  const dock = document.createElement("div"); dock.className = "bm-video-dock"; cv.after(dock);
  const pool = Array.from({ length: POOL }, () => {
    const v = Object.assign(document.createElement("video"), { muted: true, loop: true, playsInline: true, preload: "auto" });
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); dock.appendChild(v);
    v.onplaying = () => { dirty++; };
    v.onerror = () => { if (v.tile) { console.error("clip failed:", v.currentSrc); v.tile.clipBad = true; } };
    return v;
  });
  const playing = new Map(); // tile -> video
  function assignVideos(cands) {
    const want = new Set(cands.slice(0, limit));
    for (const [t, v] of playing) if (!want.has(t)) { v.pause(); v.style.visibility = "hidden"; v.removeAttribute("src"); v.load(); v.tile = null; playing.delete(t); }
    for (const t of want) {
      const v0 = playing.get(t), src = clipFor(hires[t.b.id], t.dp);
      if (v0 && !v0.src.endsWith(src.slice(1))) { const at = v0.currentTime; v0.src = src; v0.currentTime = at; v0.play().catch((e) => { if (e.name !== "AbortError") console.error("autoplay:", e.message); }); }
      if (playing.has(t)) continue;
      const v = pool.find((x) => !x.tile); if (!v) break;
      v.tile = t; v.src = clipFor(hires[t.b.id], t.dp); playing.set(t, v);
      v.play().catch((e) => { if (e.name !== "AbortError") console.error("autoplay:", e.message); });
    }
  }

  let key = "", lit = null, litFor = null;
  function paint() {
    const c = A.view.cam, f = A.view.focus, dpr = Math.min(devicePixelRatio || 1, innerWidth <= 700 ? 1.5 : 2), W = innerWidth, H = innerHeight;
    const k = `${pickKey},${c.x.toFixed(1)},${c.y.toFixed(1)},${c.s.toFixed(4)},${c.cx},${c.cy},${W},${H},${f},${A.view.theme},${dirty},${hoverTile?.b.id}`;
    if (k === key) return; key = k;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (f + pickKey !== litFor) { litFor = f + pickKey; lit = pickKey ? pickSet(pickKey) : f === "root" ? null : new Set(under(f).map((b) => b.technique)); }
    const ox = c.cx ?? W / 2, oy = c.cy ?? H / 2, px = T * c.s, dark = A.view.theme === "dark";
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * c.s, 0, 0, dpr * c.s, dpr * (ox - c.x * c.s), dpr * (oy - c.y * c.s));
    // Cross-technique strands (posts that also fit a second technique).
    ctx.lineCap = "round";
    for (const s of strands) {
      const on = lit && (lit.has(s.p.id) || lit.has(s.q.id));
      ctx.globalAlpha = lit ? (on ? 0.7 : 0.03) : 0.16; ctx.strokeStyle = opById[s.p.op][dark ? "night" : "color"] ?? opById[s.p.op].color;
      ctx.lineWidth = (Math.min(1 + s.c / 3, 5) * (on ? 1.6 : 1)) / Math.max(c.s, 0.15);
      ctx.beginPath(); ctx.moveTo(s.p.x, s.p.y); ctx.quadraticCurveTo((s.p.x + s.q.x) * 0.25, (s.p.y + s.q.y) * 0.25, s.q.x, s.q.y); ctx.stroke();
    }
    // Focused technique fans out to each of its posts.
    const vx0 = c.x - ox / c.s - T, vy0 = c.y - oy / c.s - T, vx1 = c.x + (W - ox) / c.s + T, vy1 = c.y + (H - oy) / c.s + T;
    const fn = A.graph.byId.get(f), fanTech = fn && (fn.level === 3 ? fn : fn.level === 4 ? fn.parent : null);
    if (fanTech) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = opById[fanTech.op].color; ctx.lineWidth = 1 / c.s; ctx.beginPath();
      for (const t of tiles) if (t.id === fanTech.id) { ctx.moveTo(fanTech.x, fanTech.y); ctx.lineTo(t.x, t.y); }
      ctx.stroke();
    }
    // Pick each tile's level from its size in device pixels: sprite until 64, thumb until 480, then the hi-res still.
    let budget = 12, bigBudget = 3;
    const dp = px * dpr, cands = [];
    const crop = (im, x, y, w = im.width, h = im.height) => { const m = Math.min(w, h); ctx.drawImage(im, (w - m) / 2, (h - m) / 2, m, m, x, y, T, T); };
    for (const t of tiles) {
      if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1 || !visible(t)) continue;
      const on = !lit || lit.has(t.id);
      ctx.globalAlpha = on ? 1 : 0.06;
      const x = t.x - T / 2, y = t.y - T / 2, sp = spriteAt.get(t.b.id), h = hires[t.b.id];
      if (on && t.b.thumb && (dp > 180 || (!sp && px >= 6)) && !t.full && budget-- > 0) { t.full = "loading"; bitmap("./data/" + t.b.thumb).then((im) => { t.full = im; dirty++; }, (e) => { t.full = "error"; console.error("thumb:", e.message); }); }
      const want = on && dp > 520 && px > 240 && h && stillFor(h, dp);
      if (want && t.big !== "loading" && t.big !== "error" && (t.bigW ?? 0) < want[1] && bigBudget-- > 0) {
        const prev = t.big; t.big = "loading";
        bitmap("./data/" + want[0]).then((im) => { if (prev instanceof ImageBitmap) { big.delete(t); prev.close(); } t.big = im; t.bigW = want[1]; big.set(t, im); useBig(t); dirty++; },
          (e) => { t.big = prev instanceof ImageBitmap ? prev : "error"; console.error("still:", e.message); });
      }
      t.dp = dp;
      if (on && px >= MIN_PX && (h?.clip || h?.clip_hd) && !t.clipBad) cands.push(t);
      const v = playing.get(t);
      if (t.big instanceof ImageBitmap && dp > 480) { useBig(t); crop(t.big, x, y); }
      else if (t.big === "loading" && big.has(t)) crop(big.get(t), x, y);
      else if (t.full instanceof ImageBitmap) crop(t.full, x, y);
      else if (sprite && sp && px >= 3) ctx.drawImage(sprite, sp[0], sp[1], S, S, x, y, T, T);
      else {
        ctx.fillStyle = t.b.rgb ?? t.color ?? opById[t.op].color; ctx.fillRect(x, y, T, T);
        if (!t.b.thumb && px >= 16) { ctx.fillStyle = "#fff"; ctx.font = `600 ${T * 0.36}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.b.title ?? t.b.author ?? "").split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase(), t.x, t.y); }
      }
      if ((h?.clip || h?.clip_hd) && on && px >= 28 && !v) { // small play mark so you can see which tiles move before they start
        ctx.globalAlpha = 0.85; ctx.fillStyle = "#000"; const r = Math.min(T * 0.12, 9 / c.s); ctx.beginPath(); ctx.arc(x + T - r * 1.6, y + r * 1.6, r, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x + T - r * 1.95, y + r * 1.15); ctx.lineTo(x + T - r * 1.95, y + r * 2.05); ctx.lineTo(x + T - r * 1.15, y + r * 1.6); ctx.fill();
      }
    }
    if (budget < 0 || bigBudget < 0) dirty++; // more pictures to start next frame
    const mx = W / 2, my = H / 2, sx = (t) => ox + (t.x - c.x) * c.s - mx, sy = (t) => oy + (t.y - c.y) * c.s - my;
    cands.sort((a, b) => Math.hypot(sx(a), sy(a)) - Math.hypot(sx(b), sy(b)));
    assignVideos(cands);
    for (const [t, v] of playing) { // lay each playing clip exactly over its tile (CSS px)
      const ready = v.readyState >= 2 && !v.paused;
      v.style.visibility = ready ? "visible" : "hidden";
      if (ready) { v.style.width = v.style.height = px + "px"; v.style.transform = `translate(${ox + (t.x - T / 2 - c.x) * c.s}px,${oy + (t.y - T / 2 - c.y) * c.s}px)`; }
    }
    // Layer titles around the ring, and category names once their tiles are big enough to read beside them.
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic"; ctx.fillStyle = dark ? "#ece8df" : "#1b1a17";
    for (const g of groups.values()) {
      if ((g.layerRow ? [...groups.values()].every((h) => h.layerRow || h.sector !== g.sector || hidden.has(h.layer)) : hidden.has(g.layer)) || (lit && !g.layerRow && !lit.has(g.key))) continue;
      const fs = g.layerRow ? 15 / c.s : 12 / c.s;
      if (!g.layerRow && px < 12) continue;
      if (g.at.x < vx0 - 400 / c.s || g.at.x > vx1 || g.at.y < vy0 || g.at.y > vy1 + fs) continue;
      ctx.font = `${g.layerRow ? 600 : 500} ${fs}px Inter, sans-serif`; ctx.textAlign = g.layerRow ? "center" : "left";
      const txt = `${g.name} · ${g.items.length.toLocaleString()}`, w = ctx.measureText(txt).width, lx = g.at.x - (g.layerRow ? w / 2 : T / 2), ly = g.at.y - (g.layerRow ? 0 : T / 2 + 5 / c.s);
      ctx.fillStyle = dark ? "rgba(20,22,23,.82)" : "rgba(250,248,243,.86)"; ctx.fillRect(lx - 4 / c.s, ly - fs, w + 8 / c.s, fs * 1.35);
      ctx.fillStyle = dark ? "#ece8df" : "#1b1a17"; ctx.textAlign = "left"; ctx.fillText(txt, lx, ly);
    }
    if (hoverTile) { ctx.globalAlpha = 1; ctx.strokeStyle = dark ? "#ece8df" : "#1b1a17"; ctx.lineWidth = 3 / c.s; ctx.strokeRect(hoverTile.x - T / 2, hoverTile.y - T / 2, T, T); }
    ctx.globalAlpha = 1;
  }
  const tileAtXY = (cx, cy) => {
    const c = A.view.cam, ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2;
    const wx = (cx - ox) / c.s + c.x, wy = (cy - oy) / c.s + c.y;
    return tiles.find((t) => Math.abs(t.x - wx) <= T / 2 && Math.abs(t.y - wy) <= T / 2 && visible(t) && (!lit || lit.has(t.id))) ?? null;
  };
  A.tileAt = (e) => { if (e.target.closest?.(".node")) return null; const t = tileAtXY(e.clientX, e.clientY); return t && { tech: t.outer ? A.view.focus : t.id, id: t.b.id }; };
  A.openPost = (id) => detail(byId.get(id));
  document.getElementById("atlas").addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    const t = e.target.closest?.(".node") ? null : tileAtXY(e.clientX, e.clientY);
    if (t !== hoverTile) { hoverTile = t; document.getElementById("atlas").style.cursor = t ? "pointer" : ""; }
  });

  // Detail view: the post large, its lineage, and the way out to X.
  const box = document.createElement("div"); box.className = "lightbox"; document.body.appendChild(box);
  // The newest board, so any post can be sent straight onto the brainstorm in progress.
  let board = null, current = null;
  fetch("/api/boards", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((l) => { board = l[0] ?? null; }).catch((e) => console.error("boards:", e));
  function detail(b) {
    if (!b) return;
    current = b;
    const t = techById.get(b.technique), line = t ? lineage(A.graph.byId.get(b.technique)) : [], op = t ? opById[t.op] : { color: "#888" }, also = techById.get(b.also);
    const src = b.layer && b.layer !== "saved", host = b.url ? b.url.split("/")[2]?.replace(/^www\./, "") : "";
    const open = !b.url ? "" : /(^|\.)x\.com$|twitter\.com$/.test(host) ? "Open on X ↗" : src ? OPEN[b.layer] : "Open on X ↗";
    const body = b.layer === "linkedin" ? `<p><b>${esc(b.title)}</b></p><p>${esc(b.text)}</p><p><a href="/network#${encodeURIComponent(b.nid)}">Warm paths in Network →</a></p>` : b.layer === "ask" ? `${b.post ? `<p>${esc(b.post)}</p>` : ""}<p class="asked"><b>You asked:</b> ${esc(b.text)}</p>` : `${b.layer === "ref" && b.title ? `<p><b>${esc(b.title)}</b></p>` : ""}<p>${esc(b.text)}</p>`;
    const n = (v) => Number(v).toLocaleString(), s = b.stats;
    const stats = s ? `<p class="asked"><b>Reach:</b> ${[s.views && `${n(s.views)} views`, s.likes && `${n(s.likes)} likes`, s.likes_per_view && `${(s.likes_per_view * 100).toFixed(2)}% likes/view`, s.generations && `${n(s.generations)} generations`].filter(Boolean).join(" · ")}${s.as_of ? ` (as of ${esc(s.as_of)})` : ""}</p>` : "";
    // Videos/GIFs play straight away from X's mp4 (the click is the user gesture, so sound is allowed);
    // the poster is the local thumb, and the frame strip remains the fallback if the mp4 fails.
    const gif = b.type === "animated_gif";
    const media = b.video ? "" : b.strip && (b.type === "video" || gif) ? `<img src="./data/${esc(b.strip)}" alt="" class="strip" />` : "";
    const hero = b.video
      ? `<video class="hero" src="${esc(b.video)}" ${b.thumb ? `poster="./data/${esc(b.thumb)}"` : ""} autoplay playsinline ${gif ? "loop muted" : "controls"} preload="auto"></video>`
      : b.thumb ? `<img src="./data/${esc(b.thumb)}" alt="" class="hero" />` : "";
    const orig = hires[b.id]?.orig ?? hires[b.id]?.full;
    box.innerHTML = `<div class="lb-card"><button class="lb-x" aria-label="Close">×</button>
      ${hero}${media}
      <div class="lb-body"><div class="lb-line">${line.map((n, i) => `<span><b style="color:${op.color}">0${i + 1}</b> ${esc(n.name)}</span>`).join("")}</div>
      ${body}${stats}<div class="lb-meta">${src ? `${LAYERS[b.layer]} · ` : ""}${OWN.has(b.layer) || NAMED.has(b.layer) ? esc(b.author) : "@" + esc(b.author)} · ${esc(b.date ?? "")}${b.seen ? ` · ${esc(b.seen)}` : ""}${also ? ` · also <a href="#${also.id}" data-go="${also.id}">${esc(also.name)}</a>` : ""}</div>
      <div class="lb-act">${open ? `<a class="primary" href="${esc(b.url)}" target="_blank" rel="noopener">${open}</a>` : ""}${t ? `<button data-go="${t.id}">Go to ${esc(t.name)}</button>` : ""}${board && b.url ? `<button data-board="${esc(board.id)}" title="Add to the board: ${esc(board.title)}">+ Board: ${esc(board.title.slice(0, 28))}</button>` : ""}</div></div></div>`;
    box.classList.add("on");
    const img = box.querySelector("img.hero");
    if (img && orig) { const hi = new Image(); hi.decoding = "async"; hi.src = "./data/" + orig; hi.decode().then(() => { if (current === b) img.src = hi.src; }, (e) => console.error("full-res:", orig, e.message)); }
    const v = box.querySelector("video");
    if (v) {
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); // blocked with sound → play muted
      v.onerror = () => { if (b.strip) v.outerHTML = `<img src="./data/${esc(b.strip)}" alt="" class="strip" />`; };
    }
  }
  const close = () => { box.querySelector("video")?.pause(); box.classList.remove("on"); box.innerHTML = ""; };
  box.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]")?.dataset.go;
    if (g) { e.preventDefault(); close(); go(g); return; }
    const bt = e.target.closest("[data-board]");
    if (bt) {
      const b = current, ref = { url: b.url, title: OWN.has(b.layer) ? b.title ?? b.author : NAMED.has(b.layer) ? `${b.title} · ${b.author}` : `@${b.author}`, text: (b.seen ?? b.text ?? "").slice(0, 280), image: b.thumb ? `/data/${b.thumb}` : null, video: b.video, source: b.layer && b.layer !== "saved" ? `mine:${b.layer}` : "mine", technique: b.technique };
      bt.disabled = true;
      fetch(`/s/${bt.dataset.board}/ref`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ref) })
        .then(async (r) => { if (!r.ok) throw new Error(await r.text()); bt.outerHTML = `<a href="/s/${esc(bt.dataset.board)}/">On the board ✓ Open it</a>`; })
        .catch((err) => { bt.textContent = `Failed: ${err.message.slice(0, 60)}`; bt.disabled = false; });
      return;
    }
    if (e.target === box || e.target.closest(".lb-x")) close();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("on")) { close(); e.stopImmediatePropagation(); } }, true);

  // Lineage card: "N recorded examples" strip for the focused technique/specimen.
  A.view.cardExtra = (f) => {
    const t = f.level === 4 ? f.parent : f; if (t.level !== 3) return "";
    const list = (byTech.get(t.id) ?? []).filter((b) => b.thumb);
    if (!list.length) return "";
    return `<div class="examples"><div class="k">${list.length} of your posts</div><div class="ex-row">${list.slice(0, 6).map((b) => `<img data-post="${b.id}" src="./data/${esc(b.thumb)}" alt="" title="${esc(b.text.slice(0, 80))}" />`).join("")}</div></div>`;
  };
  A.invalidate();
  document.getElementById("card").addEventListener("click", (e) => { const id = e.target.closest("[data-post]")?.dataset.post; if (id) detail(byId.get(id)); });

  // Shelf.
  const shelf = document.createElement("aside"); shelf.className = "shelf"; document.body.appendChild(shelf);
  const subjects = [...new Set(items.map((b) => b.subject).filter(Boolean))];
  let layer = new URLSearchParams(location.search).get("layer"); // a sources layer chip (?layer= from History), or null for every layer
  const lib = viewOf() === "library"; // Library = this shelf as a full-screen mosaic, at /library
  let subject = null, open = lib || innerWidth > 700, wide = lib, last = null, shown = lib ? 180 : 60;
  addEventListener("taste:view", (e) => { const w = e.detail.view === "library"; if (w === wide) return; wide = w; if (w) open = true; shown = w ? 180 : 60; draw(); });
  const toggleWide = () => setView(wide ? "atlas" : "library");
  const under = (id) => {
    const n = A.graph.byId.get(id) ?? A.graph.root;
    const t = n.level === 4 ? n.parent : n;
    if (t.level === 0) return everything;
    const techs = new Set(); (function walk(m) { if (m.level === 3) techs.add(m.id); m.children.forEach(walk); })(t);
    return [...techs].flatMap((k) => byTech.get(k) ?? []);
  };
  // Text search over every post: its text, the labeller's description of the picture, author and title.
  let query = "";
  const hay = new Map(everything.map((b) => [b.id, `${b.text ?? ""} ${b.post ?? ""} ${b.seen ?? ""} ${b.title ?? ""} ${b.author ?? ""} ${techById.get(b.technique)?.name ?? ""}`.toLowerCase()]));
  const matching = (q) => { const ws = q.toLowerCase().split(/\s+/).filter(Boolean); return ws.length ? everything.filter((b) => ws.every((w) => hay.get(b.id).includes(w))) : everything; };
  function draw() {
    const focus = A.view.focus, n = A.graph.byId.get(focus) ?? A.graph.root;
    let list = query ? matching(query) : pickKey ? groups.get(pickKey).items : under(focus); if (subject) list = list.filter((b) => b.subject === subject); if (layer) list = list.filter((b) => b.layer === layer);
    // Posts with media first: text-only posts were classified from text alone and their scores are not comparable.
    list = [...list].sort((a, b) => !a.thumb - !b.thumb || (n.level === 0 ? (b.score ?? 0) - (a.score ?? 0) : 0));
    const title = query ? `“${query}”` : pickKey ? (pickKey.startsWith("L:") ? groups.get(pickKey).name : `${LAYERS[groups.get(pickKey).layer]} · ${groups.get(pickKey).name}`) : n.level === 0 ? (layer ? LAYERS[layer] : "Everything") : (n.level === 4 ? n.parent : n).name;
    shelf.className = "shelf" + (open ? " open" : "") + (wide && open ? " wide" : "");
    shelf.innerHTML = `<header><button class="tog" title="Toggle shelf (b)">${open ? "›" : "‹"}</button><div><small>${query ? `SEARCH · <a href="#" class="clr">clear</a>` : "YOUR TASTE"}</small><b>${esc(title)}</b> <span>${list.length}</span></div><button class="wid" title="${wide ? "Back to the atlas" : "Library: full-screen mosaic"} (m)">${wide ? "▢" : "⤢"}</button></header>
      <div class="chips">${["all", ...subjects].map((s) => `<button data-s="${s}" class="${(s === "all" && !subject && !layer) || s === subject ? "on" : ""}">${s === "all" ? "All" : SUBJECT_NAMES[s] ?? s}</button>`).join("")}${layers.map((l) => `<button data-l="${l}" class="layer${l === layer ? " on" : ""}">${LAYERS[l]}</button>`).join("")}</div>
      <div class="grid">${list.slice(0, shown).map((b) => {
        const t = techById.get(b.technique), op = t ? opById[t.op] : { color: "#888" }, who = OWN.has(b.layer) ? b.title ?? b.author : NAMED.has(b.layer) ? b.author : "@" + b.author;
        return `<a href="${esc(b.url)}" data-post="${b.id}" target="_blank" rel="noopener" title="${esc(b.text)}">
          ${b.thumb ? `<img loading="lazy" decoding="async" src="./data/${esc(b.thumb)}"${hires[b.id]?.full ? ` srcset="./data/${esc(b.thumb)} 480w, ./data/${esc(hires[b.id].full)} 1600w" sizes="${wide ? "20vw" : "160px"}"` : ""} alt="" />` : `<div class="txt">${esc(b.text.slice(0, 120))}</div>`}
          ${b.type === "video" || b.type === "animated_gif" ? `<i class="play">▶</i>` : ""}
          <span class="meta"><em style="background:${op.color}"></em>${esc(t?.name ?? LAYERS[b.layer])} · ${esc(who)}</span></a>`;
      }).join("")}</div>${list.length > shown ? `<button class="more">Show ${Math.min(wide ? 180 : 60, list.length - shown)} more</button>` : ""}
      <footer>${esc(data.method)} · labels are estimates</footer>`;
  }
  shelf.addEventListener("click", (e) => {
    if (e.target.closest(".clr")) { e.preventDefault(); setQuery(""); document.getElementById("q").value = ""; return; }
    if (e.target.closest(".wid")) { toggleWide(); return; }
    if (e.target.closest(".tog") || (innerWidth <= 700 && e.target.closest("header"))) { if (wide) { setView("atlas"); open = false; } else open = !open; draw(); setTimeout(() => go(A.view.focus), 270); }
    const s = e.target.closest("[data-s]")?.dataset.s; if (s) { subject = s === "all" ? null : s; if (s === "all") layer = null; shown = 60; draw(); }
    const l = e.target.closest("[data-l]")?.dataset.l; if (l) { layer = layer === l ? null : l; shown = 60; draw(); }
    if (e.target.closest(".more")) { shown += wide ? 180 : 60; draw(); }
    const post = e.target.closest("[data-post]"); if (post) { e.preventDefault(); detail(byId.get(post.dataset.post)); }
  });
  addEventListener("keydown", (e) => { if (e.key === "m" && e.target.tagName !== "INPUT") toggleWide(); });
  addEventListener("keydown", (e) => { if (e.key === "b" && e.target.tagName !== "INPUT") { open = !open; draw(); setTimeout(() => go(A.view.focus), 270); } });
  (function poll(now) {
    if (A.view.focus !== last) { last = A.view.focus; pickKey = null; litFor = null; shown = 60; draw(); }
    tune(now);
    paint(); requestAnimationFrame(poll);
  })(0);
  draw(); go(A.view.focus, 600);
  function setQuery(q) { q = q.trim(); if (q === query) return; query = q; if (q) open = true; shown = wide ? 180 : 60; draw(); }
  // Category search for the top bar: layers and their categories whose name matches every word.
  const findGroups = (q) => { const ws = q.toLowerCase().split(/\s+/).filter(Boolean); if (!ws.length) return [];
    return [...groups.values()].filter((g) => { const h = `${g.name} ${LAYERS[g.layer] ?? g.layer} ${g.layer}`.toLowerCase(); return ws.every((w) => h.includes(w)); })
      .sort((x, y) => !!y.layerRow - !!x.layerRow || y.items.length - x.items.length).slice(0, 5).map((g) => ({ key: g.key, name: g.layerRow ? g.name : `${g.name}`, sub: g.layerRow ? "layer" : LAYERS[g.layer] ?? g.layer, n: g.items.length })); };
  return { pick, findGroups, groups, hidden, tilesShown: () => tiles.filter(visible).length, hires: () => hires, lod: () => ({ limit, fps0, playing: [...playing].map(([t, v]) => ({ id: t.b.id, ready: v.readyState, t: +v.currentTime.toFixed(2), src: v.src.split("/data/")[1], w: v.videoWidth })), big: big.size, bigW: Math.max(0, ...[...big.values()].map((im) => im?.width ?? 0)), hires: Object.keys(hires).length, tiles: tiles.filter((t) => hires[t.b.id]?.clip).slice(0, 40).map((t) => ({ id: t.b.id, x: t.x, y: t.y })) }), setQuery, matching, count: items.filter((b) => b.layer === "saved").length, sources: src?.items.length ?? 0, total: data.count, items, byTech, under, detail };
}
