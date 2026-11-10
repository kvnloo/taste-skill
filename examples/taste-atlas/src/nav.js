// One app, four views: Atlas (/), Library (/library), History (/history), Boards (/boards, /s/<id>/).
// Shared top nav and one theme key, so moving between views feels like one tool, not three sites.
// Atlas and Library are the same page: switching between them is a URL change plus a "taste:view" event, no reload.
const KEY = "taste-theme";
const VIEWS = [["atlas", "/", "Atlas"], ["library", "/library", "Library"], ["history", "/history", "History"], ["boards", "/boards", "Boards"]];

export const viewOf = (p = location.pathname) => (p.startsWith("/library") ? "library" : p.startsWith("/history") ? "history" : p.startsWith("/boards") || p.startsWith("/s/") ? "boards" : "atlas");
export const getTheme = () => new URLSearchParams(location.search).get("theme") ?? localStorage.getItem(KEY) ?? localStorage.getItem("atlas-theme") ?? localStorage.getItem("board-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
export const saveTheme = (t) => localStorage.setItem(KEY, t);

// Switch between the two same-page views (atlas, library); returns false when the target needs a page load.
export function setView(view, { push = true } = {}) {
  const here = viewOf();
  if ([here, view].some((v) => v === "boards" || v === "history")) return false; // separate pages
  if (push && view !== here) history.pushState(null, "", (view === "library" ? "/library" : "/") + location.hash);
  dispatchEvent(new CustomEvent("taste:view", { detail: { view } }));
  return true;
}

export function mountNav(after) {
  const nav = document.createElement("nav");
  nav.className = "views"; nav.setAttribute("aria-label", "Views");
  nav.innerHTML = VIEWS.map(([k, href, label]) => `<a href="${href}" data-view="${k}">${label}${k === "boards" ? `<i class="n" hidden></i>` : ""}</a>`).join("");
  after.after(nav);
  const mark = (v) => nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.view === v));
  mark(viewOf());
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-view]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (setView(a.dataset.view)) e.preventDefault();
  });
  addEventListener("taste:view", (e) => mark(e.detail.view));
  addEventListener("popstate", () => setView(viewOf(), { push: false }));
  // Boards badge: how many boards exist; a pulsing dot if one changed in the last 15 minutes.
  fetch("/api/boards", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`/api/boards ${r.status}`); return r.json(); }).then((list) => {
    const n = nav.querySelector(".n"); if (!list.length) return;
    n.hidden = false; n.textContent = list.length;
    n.classList.toggle("live", list.some((b) => Date.now() - b.updated < 15 * 60e3));
  }).catch((e) => console.error("taste nav:", e));
  return nav;
}
