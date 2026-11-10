// Boards index: every brainstorm board, newest first, each opening its live board.
import { mountNav, getTheme, saveTheme } from "./nav.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".bar .brand"));
const theme = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); };
$("#theme").onclick = theme;
addEventListener("keydown", (e) => { if (e.key === "t") theme(); });

const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const r = await fetch("/api/boards", { cache: "no-store" });
if (!r.ok) { $("#boards").innerHTML = `<p class="empty-boards">Could not list boards: ${r.status} ${esc(await r.text())}</p>`; throw new Error(`/api/boards ${r.status}`); }
const list = await r.json();
$("#boards").innerHTML = list.length ? list.map((b, i) => `<a class="bcard" href="/s/${esc(b.id)}/" style="animation-delay:${i * 40}ms">
  <div class="shot">${b.preview ? `<iframe src="/s/${esc(b.id)}/preview/?rev=${b.preview}" title="" loading="lazy" tabindex="-1"></iframe>` : mosaic(b.images)}</div>
  <div class="meta"><h2>${esc(b.title)}</h2>${b.goal ? `<p>${esc(b.goal)}</p>` : ""}
  <div class="nums"><span>${n(b.refs, "ref")}</span><span>${b.kept} kept</span><span>${n(b.notes, "note")}</span>${b.preview ? `<span>pass ${b.preview}</span>` : ""}<span class="${Date.now() - b.updated < 15 * 60e3 ? "live" : ""}">${ago(b.updated)}</span></div></div></a>`).join("")
  : `<p class="empty-boards">No boards yet. In a Hermes chat, ask to brainstorm with the taste skill, or run <code>node scripts/board.mjs start "title"</code>.</p>`;
// Fill the cover with no gaps: 6+ pictures as 3x2, 4-5 as 2x2, fewer in one row.
function mosaic(images) {
  const k = images.length >= 6 ? 6 : images.length >= 4 ? 4 : images.length, cols = k === 6 ? 3 : k === 4 ? 2 : Math.max(k, 1);
  return `<div class="mosaic" style="grid-template-columns:repeat(${cols},1fr)">${images.slice(0, k).map((src) => `<img loading="lazy" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'" />`).join("")}</div>`;
}
