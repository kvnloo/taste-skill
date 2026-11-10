// Taste board page: renders board.json, re-renders on every server-sent change, sends the owner's picks back.
import { techById } from "./brief.js";
import { opById } from "./taxonomy.js";
import { specimen, CARD } from "./specimens.js";
import { mountNav, getTheme, saveTheme } from "./nav.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SRC = { mine: "yours", "mine:ask": "you asked", "mine:film": "your film", "mine:project": "your repo", "mine:idea": "your idea", "mine:portfolio": "your work", x: "X", dribbble: "Dribbble", behance: "Behance", mobbin: "Mobbin", web: "web" };
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".bar .brand"));

let board = null, filter = "all", previewRev = -1, seenRefs = new Set(), seenNotes = 0, first = true;

async function pick(ref, verdict, text) {
  const r = await fetch("./pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref, verdict, text }) });
  if (!r.ok) throw new Error(await r.text());
}
const verdicts = () => { const m = new Map(); for (const p of board.picks ?? []) if (p.ref) m.set(p.ref, p.verdict); return m; };

function renderHead() {
  $("#title").textContent = board.title; $("#goal").textContent = board.goal || "";
  document.title = `${board.title} · Taste`;
}

function renderPreview() {
  const rev = board.preview?.rev ?? 0;
  if (rev === previewRev) return;
  previewRev = rev;
  const box = $("#preview");
  if (!rev) return;
  box.classList.remove("empty");
  // A new iframe per revision, faded in over the old one, so the design never flashes blank.
  const f = document.createElement("iframe");
  f.src = `./preview/?rev=${rev}`; f.title = "Design preview"; f.className = "frame";
  f.onload = () => { f.classList.add("in"); setTimeout(() => [...box.querySelectorAll("iframe")].slice(0, -1).forEach((o) => o.remove()), 450); };
  box.querySelector("p")?.remove();
  box.append(f);
  box.dataset.rev = `pass ${rev}`;
}

function renderDirection() {
  const ts = board.techniques.map((id) => techById.get(id)).filter(Boolean);
  const pal = board.palette.map((c) => `<i style="background:${esc(c)}" title="${esc(c)}"><b>${esc(c)}</b></i>`).join("");
  const type = board.type.map((f) => `<span style="font-family:'${esc(f)}',serif">${esc(f)}</span>`).join("");
  $("#direction").innerHTML = ts.length || pal || type ? `
    ${ts.map((t) => { const op = opById[t.op]; return `<a class="tech" href="/#${esc(t.id)}" title="Open ${esc(t.name)} in the atlas" style="--op:${op.color}">
      <svg viewBox="0 0 ${CARD.w} ${CARD.h}">${specimen(t.family, 3, 0)}</svg>
      <div><small>${esc(op.name)} · ${esc(t.domain)}</small><h3>${esc(t.name)}</h3><p>${esc(t.mech)}</p><p class="ui">${esc(t.ui ?? "")}</p></div></a>`; }).join("")}
    ${pal ? `<div class="pal">${pal}</div>` : ""}${type ? `<div class="type">${type}</div>` : ""}` : `<p class="hint">Techniques, palette and type land here as the direction firms up.</p>`;
}

function renderRefs() {
  const v = verdicts(), counts = {};
  for (const r of board.refs) counts[r.source] = (counts[r.source] ?? 0) + 1;
  const liked = board.refs.filter((r) => v.get(r.id) === "like" || v.get(r.id) === "pin").length;
  $("#filters").innerHTML = [["all", `All ${board.refs.length}`], ["kept", `Kept ${liked}`], ...Object.entries(counts).map(([k, n]) => [k, `${SRC[k] ?? k} ${n}`])]
    .map(([k, l]) => `<button data-f="${esc(k)}" class="${filter === k ? "on" : ""}">${esc(l)}</button>`).join("");
  const shown = board.refs.filter((r) => filter === "all" || (filter === "kept" ? ["like", "pin"].includes(v.get(r.id)) : r.source === filter))
    .sort((a, b) => (v.get(b.id) === "pin") - (v.get(a.id) === "pin") || (v.get(a.id) === "nope") - (v.get(b.id) === "nope") || b.t - a.t);
  $("#wall").innerHTML = shown.length ? shown.map((r) => {
    const s = v.get(r.id) ?? "", fresh = !first && !seenRefs.has(r.id);
    return `<figure class="ref ${s} ${fresh ? "fresh" : ""}" data-id="${r.id}">
      <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${r.image ? `<img loading="lazy" src="${esc(r.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'${esc(r.source)}'}))" />` : `<div class="noimg">${esc(new URL(r.url).hostname.replace(/^www\./, ""))}</div>`}</a>
      <figcaption><span class="src">${esc(SRC[r.source] ?? r.source)}</span>${r.technique ? `<a class="tq" href="/#${esc(r.technique)}" title="See this technique in the atlas">${esc(techById.get(r.technique)?.name ?? r.technique)}</a>` : ""}<b>${esc(r.title)}</b>${r.text ? `<p>${esc(r.text)}</p>` : ""}</figcaption>
      <div class="acts"><button data-v="like" title="More like this">♥</button><button data-v="pin" title="Pin: use this">⌖</button><button data-v="nope" title="Not this">✕</button></div>
    </figure>`;
  }).join("") : `<p class="hint">${board.refs.length ? "Nothing in this filter." : "References appear here: your bookmarks, links you sent, and Dribbble, Behance and Mobbin finds."}</p>`;
  for (const r of board.refs) seenRefs.add(r.id);
}

function renderNotes() {
  const items = [...board.notes.map((n) => ({ ...n, kind: n.who })), ...(board.picks ?? []).filter((p) => p.verdict === "note").map((p) => ({ who: "owner", text: p.text, t: p.t, kind: "owner" }))].sort((a, b) => a.t - b.t);
  $("#notes").innerHTML = items.map((n, i) => `<li class="${n.kind} ${!first && i >= seenNotes ? "fresh" : ""}"><small>${n.who === "owner" ? "you" : "agent"} · ${new Date(n.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>${esc(n.text)}</li>`).join("") || `<li class="hint">The agent's notes and your replies collect here.</li>`;
  seenNotes = items.length; $("#notes").scrollTop = 1e6;
}

async function load() {
  const r = await fetch("./board.json", { cache: "no-store" });
  if (!r.ok) { $("#title").textContent = "This board has ended"; return; }
  board = await r.json();
  renderHead(); renderPreview(); renderDirection(); renderRefs(); renderNotes();
  first = false;
}

let t; const later = () => { clearTimeout(t); t = setTimeout(load, 80); };
function connect() {
  const es = new EventSource("./events");
  es.onmessage = later;
  es.onopen = () => $("#live").classList.add("on");
  es.onerror = () => { $("#live").classList.remove("on"); es.close(); setTimeout(connect, 2000); };
}

$("#wall").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  const id = b.closest(".ref").dataset.id, cur = verdicts().get(id);
  await pick(id, cur === b.dataset.v ? "clear" : b.dataset.v); load();
});
$("#filters").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (b) { filter = b.dataset.f; renderRefs(); } });
$("#say").addEventListener("submit", async (e) => { e.preventDefault(); const i = $("#sayText"); if (!i.value.trim()) return; await pick(null, "note", i.value.trim()); i.value = ""; load(); });
const theme = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); };
$("#theme").onclick = theme;
addEventListener("keydown", (e) => { if (e.key === "t" && e.target.tagName !== "INPUT") theme(); });
window.__board = { load, get state() { return board; } };
load().then(connect);
