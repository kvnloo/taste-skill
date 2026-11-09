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
  (function poll() { if (A.view.focus !== last) { last = A.view.focus; shown = 60; draw(); } requestAnimationFrame(poll); })();
  draw(); go(A.view.focus, 600);
  return { count: items.length, total: data.count };
}
