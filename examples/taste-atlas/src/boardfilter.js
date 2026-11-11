// Board as an Atlas filter: ?board=<id> lights only that board's posts and lists the whole board on the shelf.
// Board refs that are your bookmarks light their tiles; the rest (web pages, storyboards) show as cards.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const urlKey = (u) => { const m = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/.exec(u ?? ""); return m ? "x:" + m[1] : String(u ?? "").split(/[?#]/)[0].replace(/\/$/, ""); };

export async function mountBoardFilter(A, { bm, fly }) {
  const boards = await fetch("/api/boards", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!bm || !boards.length) return null;
  const byUrl = new Map(bm.items.map((b) => [urlKey(b.url), b]));
  const bar = document.querySelector(".layers"), sel = document.createElement("select");
  sel.className = "boardpick"; sel.title = "Filter the atlas to one board";
  sel.innerHTML = `<option value="">Board: none</option>` + boards.map((b) => `<option value="${esc(b.id)}">${esc(b.title)} · ${b.refs}</option>`).join("");
  const place = () => { if (!bar.contains(sel)) bar.appendChild(sel); };
  new MutationObserver(place).observe(bar, { childList: true }); place();
  let cur = null;
  async function show(id) {
    cur = id || null; sel.value = cur ?? "";
    const u = new URL(location.href); cur ? u.searchParams.set("board", cur) : u.searchParams.delete("board"); history.replaceState(null, "", u);
    if (!cur) return bm.setCustom(null);
    const b = await fetch(`/s/${cur}/board.json`, { cache: "no-store" }).then((r) => r.json());
    const posts = [], cards = [];
    for (const r of b.refs) { const hit = byUrl.get(urlKey(r.url)); hit ? posts.push(hit) : cards.push(r); }
    bm.setCustom({ title: b.title, kind: "BOARD", ids: new Set(posts.map((p) => p.id)), items: posts, n: posts.length + cards.length,
      html: `<a href="/s/${esc(cur)}/" class="txt-card"><div class="txt">Open board<br><b>${esc(b.title)}</b></div></a>` + cards.map((r) => `<a href="${esc(r.url ?? `/s/${cur}/`)}" target="_blank" rel="noopener" title="${esc(r.title)}">${r.image ? `<img loading="lazy" src="${esc(r.image.startsWith("http") || r.image.startsWith("/") ? r.image : `/s/${cur}/${r.image}`)}" alt="" />` : `<div class="txt">${esc(r.title)}</div>`}<span class="meta">${esc(r.title)}</span></a>`).join("") });
    const ts = posts.map((p) => bm.tileOf(p.id)).filter(Boolean);
    if (ts.length) fly(ts.reduce((m, t) => [Math.min(m[0], t.x - 30), Math.min(m[1], t.y - 30), Math.max(m[2], t.x + 30), Math.max(m[3], t.y + 30)], [Infinity, Infinity, -Infinity, -Infinity]), 900, 6);
  }
  sel.addEventListener("change", () => show(sel.value));
  const want = new URLSearchParams(location.search).get("board");
  if (want && boards.some((b) => b.id === want)) await show(want);
  return { show, current: () => cur, boards };
}
