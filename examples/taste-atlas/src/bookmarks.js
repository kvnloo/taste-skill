// Optional private layer: your saved posts classified into the atlas.
// Loads ./data/bookmarks.atlas.json if present (gitignored; never shipped). Adds count badges on
// technique nodes, a constellation of every post around the ring, a shelf listing the posts under the
// current focus (filterable by subject), "recorded examples" on the lineage card, and a detail view.
import { TECHNIQUES, opById, lineage } from "./taxonomy.js";

const NS = "http://www.w3.org/2000/svg";
const SUBJECT_NAMES = { "3d-webgl": "3D / WebGL", "ui-product": "UI", "motion-design": "Motion", "generative-art": "Generative", illustration: "Illustration", "photo-film": "Photo / film", "type-brand": "Type / brand", "ai-dev-tools": "AI tools", "hardware-robotics": "Hardware" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const techById = new Map(TECHNIQUES.map((t) => [t.id, t]));
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.decoding = "async"; i.onload = () => ok(i); i.onerror = no; i.src = src; });

export async function mountBookmarks(A, { go }) {
  let data;
  try { const r = await fetch("./data/bookmarks.atlas.json", { cache: "no-store" }); if (!r.ok) return null; data = await r.json(); } catch { return null; }
  const items = data.items.filter((b) => b.technique);
  const byId = new Map(items.map((b) => [b.id, b]));
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
  A.extraBounds = (ids) => [...ids].map((k) => ext.get(k)).filter(Boolean);
  const pairs = new Map();
  for (const b of items) if (b.also && b.also !== b.technique) { const k = [b.technique, b.also].sort().join("|"); pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  const strands = [...pairs].filter(([, c]) => c >= 3).map(([k, c]) => { const [p, q] = k.split("|").map((x) => A.graph.byId.get(x)); return { p, q, c }; });

  const cv = document.createElement("canvas"); cv.id = "bm-canvas"; document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  let sprite = null, spriteAt = new Map(), S = 64, dirty = 1, hoverTile = null;
  fetch("./data/sprite.json").then((r) => (r.ok ? r.json() : null)).then(async (m) => {
    if (!m) return; S = m.size; m.ids.forEach((id, i) => spriteAt.set(id, [(i % m.cols) * S, Math.floor(i / m.cols) * S]));
    sprite = await loadImg("./data/sprite.jpg"); dirty++;
  }).catch(() => {});

  let key = "", lit = null, litFor = null;
  function paint() {
    const c = A.view.cam, f = A.view.focus, dpr = Math.min(devicePixelRatio || 1, innerWidth <= 700 ? 1.5 : 2), W = innerWidth, H = innerHeight;
    const k = `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.s.toFixed(4)},${c.cx},${c.cy},${W},${H},${f},${A.view.theme},${dirty},${hoverTile?.b.id}`;
    if (k === key) return; key = k;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (f !== litFor) { litFor = f; lit = f === "root" ? null : new Set(under(f).map((b) => b.technique)); }
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
    let budget = 12;
    for (const t of tiles) {
      if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
      ctx.globalAlpha = !lit || lit.has(t.id) ? 1 : 0.06;
      const x = t.x - T / 2, y = t.y - T / 2, sp = spriteAt.get(t.b.id);
      if (px > 90 && ctx.globalAlpha === 1 && !t.full && budget-- > 0) { t.full = "loading"; loadImg("./data/" + t.b.thumb).then((im) => { t.full = im; dirty++; }, () => (t.full = "error")); }
      if (t.full instanceof Image) { const im = t.full, m = Math.min(im.width, im.height); ctx.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, x, y, T, T); }
      else if (sprite && sp && px >= 3) ctx.drawImage(sprite, sp[0], sp[1], S, S, x, y, T, T);
      else { ctx.fillStyle = t.b.rgb ?? opById[t.op].color; ctx.fillRect(x, y, T, T); }
    }
    if (budget < 0) dirty++; // more pictures to start next frame
    if (hoverTile) { ctx.globalAlpha = 1; ctx.strokeStyle = dark ? "#ece8df" : "#1b1a17"; ctx.lineWidth = 3 / c.s; ctx.strokeRect(hoverTile.x - T / 2, hoverTile.y - T / 2, T, T); }
    ctx.globalAlpha = 1;
  }
  const tileAtXY = (cx, cy) => {
    const c = A.view.cam, ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2;
    const wx = (cx - ox) / c.s + c.x, wy = (cy - oy) / c.s + c.y;
    return tiles.find((t) => Math.abs(t.x - wx) <= T / 2 && Math.abs(t.y - wy) <= T / 2 && (!lit || lit.has(t.id))) ?? null;
  };
  A.tileAt = (e) => { if (e.target.closest?.(".node")) return null; const t = tileAtXY(e.clientX, e.clientY); return t && { tech: t.id, id: t.b.id }; };
  A.openPost = (id) => detail(byId.get(id));
  document.getElementById("atlas").addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    const t = e.target.closest?.(".node") ? null : tileAtXY(e.clientX, e.clientY);
    if (t !== hoverTile) { hoverTile = t; document.getElementById("atlas").style.cursor = t ? "pointer" : ""; }
  });

  // Detail view: the post large, its lineage, and the way out to X.
  const box = document.createElement("div"); box.className = "lightbox"; document.body.appendChild(box);
  function detail(b) {
    if (!b) return;
    const t = techById.get(b.technique), line = lineage(A.graph.byId.get(b.technique)), op = opById[t.op], also = techById.get(b.also);
    const media = b.strip && (b.type === "video" || b.type === "animated_gif") ? `<img src="./data/${esc(b.strip)}" alt="" class="strip" />` : "";
    box.innerHTML = `<div class="lb-card"><button class="lb-x" aria-label="Close">×</button>
      ${b.thumb ? `<img src="./data/${esc(b.thumb)}" alt="" class="hero" />` : ""}${media}
      <div class="lb-body"><div class="lb-line">${line.map((n, i) => `<span><b style="color:${op.color}">0${i + 1}</b> ${esc(n.name)}</span>`).join("")}</div>
      <p>${esc(b.text)}</p><div class="lb-meta">@${esc(b.author)} · ${esc(b.date ?? "")}${also ? ` · also <a href="#${also.id}" data-go="${also.id}">${esc(also.name)}</a>` : ""}</div>
      <div class="lb-act"><a class="primary" href="${esc(b.url)}" target="_blank" rel="noopener">Open on X ↗</a><button data-go="${t.id}">Go to ${esc(t.name)}</button></div></div></div>`;
    box.classList.add("on");
  }
  box.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]")?.dataset.go;
    if (g) { e.preventDefault(); box.classList.remove("on"); go(g); return; }
    if (e.target === box || e.target.closest(".lb-x")) box.classList.remove("on");
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("on")) { box.classList.remove("on"); e.stopImmediatePropagation(); } }, true);

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
  let subject = null, open = innerWidth > 700, wide = false, last = null, shown = 60;
  const under = (id) => {
    const n = A.graph.byId.get(id) ?? A.graph.root;
    const t = n.level === 4 ? n.parent : n;
    if (t.level === 0) return items;
    const techs = new Set(); (function walk(m) { if (m.level === 3) techs.add(m.id); m.children.forEach(walk); })(t);
    return [...techs].flatMap((k) => byTech.get(k) ?? []);
  };
  function draw() {
    const focus = A.view.focus, n = A.graph.byId.get(focus) ?? A.graph.root;
    let list = under(focus); if (subject) list = list.filter((b) => b.subject === subject);
    // Posts with media first: text-only posts were classified from text alone and their scores are not comparable.
    list = [...list].sort((a, b) => !a.thumb - !b.thumb || (n.level === 0 ? (b.score ?? 0) - (a.score ?? 0) : 0));
    const title = n.level === 0 ? "All saved posts" : (n.level === 4 ? n.parent : n).name;
    shelf.className = "shelf" + (open ? " open" : "") + (wide && open ? " wide" : "");
    shelf.innerHTML = `<header><button class="tog" title="Toggle shelf (b)">${open ? "›" : "‹"}</button><div><small>YOUR BOOKMARKS</small><b>${esc(title)}</b> <span>${list.length}</span></div><button class="wid" title="Mosaic view (m)">${wide ? "▢" : "⤢"}</button></header>
      <div class="chips">${["all", ...subjects].map((s) => `<button data-s="${s}" class="${(s === "all" && !subject) || s === subject ? "on" : ""}">${s === "all" ? "All" : SUBJECT_NAMES[s] ?? s}</button>`).join("")}</div>
      <div class="grid">${list.slice(0, shown).map((b) => {
        const t = techById.get(b.technique), op = opById[t.op];
        return `<a href="${esc(b.url)}" data-post="${b.id}" target="_blank" rel="noopener" title="${esc(b.text)}">
          ${b.thumb ? `<img loading="lazy" decoding="async" src="./data/${esc(b.thumb)}" alt="" />` : `<div class="txt">${esc(b.text.slice(0, 120))}</div>`}
          ${b.type === "video" || b.type === "animated_gif" ? `<i class="play">▶</i>` : ""}
          <span class="meta"><em style="background:${op.color}"></em>${esc(t.name)} · @${esc(b.author)}</span></a>`;
      }).join("")}</div>${list.length > shown ? `<button class="more">Show ${Math.min(wide ? 180 : 60, list.length - shown)} more</button>` : ""}
      <footer>${esc(data.method)} · labels are estimates</footer>`;
  }
  shelf.addEventListener("click", (e) => {
    if (e.target.closest(".wid")) { wide = !wide; open = true; shown = wide ? 180 : 60; draw(); return; }
    if (e.target.closest(".tog") || (innerWidth <= 700 && e.target.closest("header"))) { open = !open; draw(); setTimeout(() => go(A.view.focus), 270); }
    const s = e.target.closest("[data-s]")?.dataset.s; if (s) { subject = s === "all" ? null : s; shown = 60; draw(); }
    if (e.target.closest(".more")) { shown += wide ? 180 : 60; draw(); }
    const post = e.target.closest("[data-post]"); if (post) { e.preventDefault(); detail(byId.get(post.dataset.post)); }
  });
  addEventListener("keydown", (e) => { if (e.key === "m" && e.target.tagName !== "INPUT") { wide = !wide; open = true; shown = wide ? 180 : 60; draw(); } });
  addEventListener("keydown", (e) => { if (e.key === "b" && e.target.tagName !== "INPUT") { open = !open; draw(); setTimeout(() => go(A.view.focus), 270); } });
  (function poll() { if (A.view.focus !== last) { last = A.view.focus; shown = 60; draw(); } paint(); requestAnimationFrame(poll); })();
  draw(); go(A.view.focus, 600);
  return { count: items.length, total: data.count, items, byTech, under, detail };
}
