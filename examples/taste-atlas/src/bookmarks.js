// Optional private layer: your saved posts classified into the atlas.
// Loads ./data/bookmarks.atlas.json if present (gitignored; never shipped). Adds count badges on
// technique nodes and a shelf listing the posts under the current focus, filterable by subject.
import { TECHNIQUES, opById } from "./taxonomy.js";

const NS = "http://www.w3.org/2000/svg";
const SUBJECT_NAMES = { "3d-webgl": "3D / WebGL", "ui-product": "UI", "motion-design": "Motion", "generative-art": "Generative", illustration: "Illustration", "photo-film": "Photo / film", "type-brand": "Type / brand", "ai-dev-tools": "AI tools", "hardware-robotics": "Hardware" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export async function mountBookmarks(A, { go }) {
  let data;
  try { const r = await fetch("./data/bookmarks.atlas.json", { cache: "no-store" }); if (!r.ok) return null; data = await r.json(); } catch { return null; }
  const items = data.items.filter((b) => b.technique);
  const byTech = new Map(TECHNIQUES.map((t) => [t.id, []]));
  for (const b of items) byTech.get(b.technique)?.push(b);
  for (const list of byTech.values()) list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Badges on technique nodes, sized by count.
  const max = Math.max(...[...byTech.values()].map((l) => l.length), 1);
  for (const [id, list] of byTech) {
    const g = A.parts.get(id)?.g; if (!g || !list.length) continue;
    const r = 13 + 15 * Math.sqrt(list.length / max), op = opById[TECHNIQUES.find((t) => t.id === id).op];
    const b = document.createElementNS(NS, "g"); b.setAttribute("class", "bm-badge"); b.setAttribute("transform", `translate(${30} ${-30})`);
    b.innerHTML = `<circle r="${r}" fill="${op.color}" /><text text-anchor="middle" dy="0.35em" font-size="${Math.round(r * 0.8)}">${list.length}</text>`;
    g.appendChild(b);
  }

  // Constellation: every post with an image becomes a tile in a wedge behind its technique's specimens,
  // best fit nearest the centre. Zoomed out the tiles are specks in the image's average colour; they load
  // the picture once they are big enough on screen. Strands link techniques that posts share (2nd-best label).
  const T = 44, G = 6, R0 = 1840, tiles = [], ext = new Map();
  const slot = Math.min(...A.graph.leaves.slice(1).map((l, i) => Math.abs(l.a - A.graph.leaves[i].a)));
  const tileLayer = document.createElementNS(NS, "g"), strandLayer = document.createElementNS(NS, "g");
  strandLayer.setAttribute("fill", "none"); A.world.prepend(strandLayer); A.world.appendChild(tileLayer);
  for (const [id, all] of byTech) {
    const n = A.graph.byId.get(id), list = all.filter((b) => b.thumb); if (!n || !list.length) continue;
    const a0 = n.children[0].a - slot / 2, span = n.children.at(-1).a - n.children[0].a + slot;
    let r = R0, k = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (k < list.length) {
      const per = Math.max(1, Math.floor((span * r) / (T + G))), row = list.slice(k, k + per);
      row.forEach((b, j) => {
        const a = a0 + (span * (j + 0.5)) / per, x = Math.cos(a) * r, y = Math.sin(a) * r;
        const g = document.createElementNS(NS, "g"); g.setAttribute("class", "bm-tile"); g.dataset.tech = id; g.dataset.url = b.url;
        g.setAttribute("transform", `translate(${x - T / 2} ${y - T / 2})`);
        g.innerHTML = `<rect width="${T}" height="${T}" rx="4" fill="${b.rgb ?? opById[n.op].color}"/><title>${esc(b.text)}</title>`;
        tileLayer.appendChild(g); tiles.push({ g, b, x, y, id, loaded: false });
        x0 = Math.min(x0, x - T); y0 = Math.min(y0, y - T); x1 = Math.max(x1, x + T); y1 = Math.max(y1, y + T);
      });
      k += per; r += T + G;
    }
    ext.set(id, [x0, y0, x1, y1]);
  }
  A.extraBounds = (ids) => [...ids].map((k) => ext.get(k)).filter(Boolean);
  const pairs = new Map();
  for (const b of items) if (b.also && b.also !== b.technique) { const k = [b.technique, b.also].sort().join("|"); pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  const strands = [...pairs].filter(([, c]) => c >= 3).map(([k, c]) => {
    const [p, q] = k.split("|").map((x) => A.graph.byId.get(x)), path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M${p.x} ${p.y} Q${(p.x + q.x) * 0.25} ${(p.y + q.y) * 0.25} ${q.x} ${q.y}`);
    path.setAttribute("stroke", opById[p.op].color); path.setAttribute("stroke-linecap", "round"); strandLayer.appendChild(path);
    return { path, p: p.id, q: q.id, c };
  });
  let camKey = "", litKey = null;
  function paint() {
    const c = A.view.cam, f = A.view.focus, key = `${c.x | 0},${c.y | 0},${c.s.toFixed(3)},${innerWidth}`;
    if (f !== litKey) {
      litKey = f; const lit = f === "root" ? null : new Set(under(f).map((b) => b.technique));
      for (const t of tiles) t.g.setAttribute("opacity", !lit || lit.has(t.id) ? 1 : 0.06);
      for (const s of strands) { const on = lit && (lit.has(s.p) || lit.has(s.q)); s.path.setAttribute("stroke-opacity", lit ? (on ? 0.7 : 0.02) : 0.16); s.path.dataset.w = Math.min(1 + s.c / 3, 5) * (on ? 1.6 : 1); }
    }
    if (key === camKey) return; camKey = key;
    const ox = c.cx ?? innerWidth / 2, oy = c.cy ?? innerHeight / 2, big = T * c.s >= 11;
    let budget = 24; // pictures started per frame, so a zoom never queues hundreds of requests at once
    for (const s of strands) s.path.setAttribute("stroke-width", s.path.dataset.w / Math.max(c.s, 0.15));
    if (!big) return;
    for (const t of tiles) {
      if (t.loaded) continue;
      if (budget <= 0) { camKey = ""; break; }
      const sx = ox + (t.x - c.x) * c.s, sy = oy + (t.y - c.y) * c.s;
      if (sx < -80 || sy < -80 || sx > innerWidth + 80 || sy > innerHeight + 80) continue;
      t.loaded = true; budget--;
      const im = document.createElementNS(NS, "image"); im.setAttribute("href", "./data/" + t.b.thumb); im.setAttribute("width", T); im.setAttribute("height", T);
      im.setAttribute("preserveAspectRatio", "xMidYMid slice"); im.setAttribute("clip-path", "inset(0 round 4px)"); t.g.insertBefore(im, t.g.lastChild);
    }
  }
  A.tileAt = (el) => { const g = el.closest?.(".bm-tile"); return g && { tech: g.dataset.tech, url: g.dataset.url }; };

  // Shelf.
  const shelf = document.createElement("aside"); shelf.className = "shelf"; document.body.appendChild(shelf);
  const subjects = [...new Set(items.map((b) => b.subject).filter(Boolean))];
  let subject = null, open = innerWidth > 700, last = null, shown = 60;
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
    shelf.className = "shelf" + (open ? " open" : "");
    shelf.innerHTML = `<header><button class="tog" title="Toggle shelf (b)">${open ? "›" : "‹"}</button><div><small>YOUR BOOKMARKS</small><b>${esc(title)}</b> <span>${list.length}</span></div></header>
      <div class="chips">${["all", ...subjects].map((s) => `<button data-s="${s}" class="${(s === "all" && !subject) || s === subject ? "on" : ""}">${s === "all" ? "All" : SUBJECT_NAMES[s] ?? s}</button>`).join("")}</div>
      <div class="grid">${list.slice(0, shown).map((b) => {
        const t = TECHNIQUES.find((x) => x.id === b.technique), op = opById[t.op];
        return `<a href="${esc(b.url)}" target="_blank" rel="noopener" title="${esc(b.text)}">
          ${b.thumb ? `<img loading="lazy" src="./data/${esc(b.thumb)}" alt="" />` : `<div class="txt">${esc(b.text.slice(0, 120))}</div>`}
          ${b.type === "video" || b.type === "animated_gif" ? `<i class="play">▶</i>` : ""}
          <span class="meta"><em style="background:${op.color}"></em>${esc(t.name)} · @${esc(b.author)}</span></a>`;
      }).join("")}</div>${list.length > shown ? `<button class="more">Show ${Math.min(60, list.length - shown)} more</button>` : ""}
      <footer>${esc(data.method)} · labels are estimates</footer>`;
  }
  shelf.addEventListener("click", (e) => {
    if (e.target.closest(".tog") || (innerWidth <= 700 && e.target.closest("header"))) { open = !open; draw(); setTimeout(() => go(A.view.focus), 270); }
    const s = e.target.closest("[data-s]")?.dataset.s; if (s) { subject = s === "all" ? null : s; shown = 60; draw(); }
    if (e.target.closest(".more")) { shown += 60; draw(); }
  });
  addEventListener("keydown", (e) => { if (e.key === "b" && e.target.tagName !== "INPUT") { open = !open; draw(); setTimeout(() => go(A.view.focus), 270); } });
  (function poll() { if (A.view.focus !== last) { last = A.view.focus; shown = 60; draw(); } paint(); requestAnimationFrame(poll); })();
  draw(); go(A.view.focus, 600);
  return { count: items.length, total: data.count };
}
