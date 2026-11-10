// History view (/history): what you watched, played and built, from the importers in scripts/history.mjs.
// One card per source: a day-by-day calendar for every year it covers, its top channels/artists/languages, and the
// covers of what you came back to (which also sit in the Library under the source's chip).
import { mountNav, getTheme, saveTheme } from "./nav.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".bar .brand"));
const NAMES = { youtube: "YouTube", spotify: "Spotify", tidal: "TIDAL", music: "Music", github: "GitHub" };
const COLORS = { youtube: "#e0453a", spotify: "#1db954", tidal: "#33b6c9", music: "#c98a33", github: "#3f9d55" };
const fmt = (n) => Number(n).toLocaleString();
const IMPORT = `<p class="hint">Add more: <code>node scripts/history.mjs &lt;export&gt;... [--github &lt;user&gt;]</code>. Accepts a YouTube Takeout
  (<code>MyActivity.html</code> or <code>.json</code>), Spotify's <em>Extended streaming history</em> (<code>Streaming_History*.json</code>), a TIDAL or
  other music CSV, and any GitHub user through your <code>gh</code> login.</p>`;

const r = await fetch("./data/history.atlas.json", { cache: "no-store" });
if (!r.ok) { $("#history").innerHTML = `<p class="empty-boards">No history imported yet (${r.status}).</p>${IMPORT}`; throw new Error(`history.atlas.json ${r.status}`); }
const data = await r.json(), series = data.series ?? {};
const bySrc = Object.groupBy(data.items, (i) => i.source);
const srcs = Object.keys(series).sort((a, b) => series[b].events - series[a].events);
$("#history").innerHTML = (srcs.length ? srcs.map(card).join("") : `<p class="empty-boards">History has items but no series: re-run the importer.</p>`) + IMPORT;
for (const s of srcs) calendar(s);
const theme = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); for (const s of srcs) calendar(s); };
$("#theme").onclick = theme;
addEventListener("keydown", (e) => { if (e.key === "t") theme(); });

function card(s) {
  const v = series[s], items = bySrc[s] ?? [], max = v.top[0]?.n || 1;
  const days = Object.keys(v.daily).length, peak = Object.entries(v.daily).sort((a, b) => b[1] - a[1])[0];
  return `<section class="hcard" style="--c:${COLORS[s] ?? "var(--accent)"}">
    <header><h2>${NAMES[s] ?? esc(s)}</h2><p><b>${fmt(v.events)}</b> ${esc(v.unit)} on ${fmt(days)} days · ${esc(v.from)} → ${esc(v.to)}${peak ? ` · busiest ${esc(peak[0])} (${fmt(peak[1])})` : ""}${v.starred ? ` · ${fmt(v.starred)} starred repos` : ""}</p>
    <a href="/library?layer=${encodeURIComponent(s)}">${fmt(items.length)} in the Library →</a></header>
    <div class="cal" data-s="${esc(s)}"><canvas></canvas><div class="tip" hidden></div><div class="legend"></div></div>
    <div class="hrow"><div class="top"><h3>${esc(v.topLabel)}</h3>${v.top.slice(0, 12).map((t) => `<div class="bar-row"><span>${esc(t.name)}</span><i style="width:${(100 * t.n) / max}%"></i><b>${fmt(t.n)}</b></div>`).join("")}</div>
    <div class="covers"><h3>${s === "github" ? "Recently starred" : "What you came back to"}</h3><div>${items.filter((i) => i.thumb).slice(0, 24).map((i) =>
      `<a href="${esc(i.url)}" target="_blank" rel="noopener" title="${esc(i.title)} · ${esc(i.author)} · ${esc(i.why)}"><img src="./data/${esc(i.thumb)}" alt="" /></a>`).join("")}</div></div></div>
  </section>`;
}

// GitHub-style calendar, one row of weeks per year, newest year on top; colour steps are quantiles of active days.
function calendar(s) {
  const v = series[s], box = document.querySelector(`.cal[data-s="${s}"]`), cv = box.querySelector("canvas"), tip = box.querySelector(".tip");
  const y0 = +v.from.slice(0, 4), y1 = +v.to.slice(0, 4), years = [];
  for (let y = y1; y >= y0; y--) years.push(y);
  const L = 40, G = 2, C = Math.max(6, Math.min(18, Math.floor((box.clientWidth - L) / 53) - G)), ROW = 7 * (C + G) + 22, W = L + 53 * (C + G), H = years.length * ROW, dpr = devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  const vals = Object.values(v.daily).sort((a, b) => a - b), q = [0.25, 0.5, 0.75, 0.95].map((p) => vals[Math.floor(p * (vals.length - 1))]);
  const css = getComputedStyle(box), line = css.getPropertyValue("--line").trim(), mute = css.getPropertyValue("--mute").trim(), col = COLORS[s] ?? "#2f6fd6";
  const cells = [], step = (k) => `<i style="background:${k ? col : line};opacity:${k ? 0.25 + 0.75 * (k / 5) : 1}"></i>`;
  box.querySelector(".legend").innerHTML = `less ${[0, 1, 2, 3, 4, 5].map(step).join("")} more <span>· darkest = top 5% of active days (over ${fmt(q[3])} ${esc(v.unit)})</span>`;
  const ink = css.getPropertyValue("--ink").trim();
  ctx.textBaseline = "middle";
  years.forEach((y, r) => {
    const top = r * ROW + 14, jan1 = new Date(Date.UTC(y, 0, 1)), off = jan1.getUTCDay();
    const total = Object.entries(v.daily).reduce((a, [k, n]) => a + (k.startsWith(y) ? n : 0), 0);
    ctx.font = "600 12px 'IBM Plex Mono', monospace"; ctx.fillStyle = ink; ctx.fillText(String(y), 0, top + 3 * (C + G));
    ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.fillStyle = mute; ctx.fillText(total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total), 0, top + 4.6 * (C + G));
    for (let m = 0; m < 12; m++) { // month labels above each year row
      const d = new Date(Date.UTC(y, m, 1)), i = Math.round((d - jan1) / 864e5) + off;
      ctx.fillText(d.toLocaleString("en", { month: "short", timeZone: "UTC" }), L + Math.floor(i / 7) * (C + G), top - 8);
    }
    for (let d = new Date(jan1); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const i = Math.round((d - jan1) / 864e5) + off, x = L + Math.floor(i / 7) * (C + G), yy = top + (i % 7) * (C + G);
      const key = d.toISOString().slice(0, 10), n = v.daily[key] ?? 0, k = n ? 1 + q.filter((t) => n > t).length : 0;
      ctx.globalAlpha = k ? 0.25 + 0.75 * (k / 5) : 1; ctx.fillStyle = k ? col : line;
      ctx.beginPath(); ctx.roundRect(x, yy, C, C, 2); ctx.fill();
      cells.push([x, yy, key, n]);
    }
    ctx.globalAlpha = 1;
  });
  cv.onmousemove = (e) => {
    const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    const c = cells.find(([x, y]) => mx >= x && mx < x + C && my >= y && my < y + C);
    tip.hidden = !c; if (!c) return;
    tip.textContent = `${c[2]} · ${fmt(c[3])} ${v.unit}`; tip.style.transform = `translate(${c[0] + 14}px, ${c[1] - 6}px)`;
  };
  cv.onmouseleave = () => { tip.hidden = true; };
}
