// Mission canvas (/mission): one pannable canvas for a multi-chat push, in two arrangements of the same nodes.
//   Brainstorm: the ask in the middle, the cut as a ring of scenes around it, each workstream a cluster of its chats
//               and ideas, so you see what the work is about.
//   Product:    goal + acceptance, the roadmap as a time axis, the storyboard strip, the cut's version rail, and one
//               swimlane per workstream with every chat placed at the time it ran, so you see where it stands.
// The replay bar scrubs the day: chats spawn, owner steers, scenes light up in the colour of the lane that touched
// them, PRs land. LIVE pins the clock to now and re-reads the snapshot. The Insights lens overlays duplicates,
// recurring failures, scene churn and context rot.
// Data: data/mission.json (local snapshot, gitignored) or mission.example.json (public-safe sample).
import { mountNav, getTheme, saveTheme } from "../nav.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const hhmm = (m) => { m = Math.max(0, m); const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60); return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
const dur = (m) => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`);
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".m-chrome .brand"));

// ---------- data
async function load() {
  const sources = [["./data/mission.json", "local snapshot"], ["./mission.example.json", "public sample"]];
  for (const [url, src] of new URLSearchParams(location.search).has("sample") ? sources.slice(1) : sources) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (r?.ok) return { data: await r.json(), src, url };
  }
  throw new Error("no mission data (data/mission.json or mission.example.json)");
}
let { data: D, src: SRC, url: URL_ } = await load();
$("#srcbadge").textContent = `${SRC} · ${D.generatedAt?.slice(0, 16).replace("T", " ") ?? ""}`;
const M = D.mission, STREAM = new Map(D.streams.map((s) => [s.id, s])), SCENE = new Map(D.scenes.map((s) => [s.id, s]));
let SES = new Map(D.sessions.map((s) => [s.id, s]));
const col = (streamId) => STREAM.get(streamId)?.color ?? "#999";
const PRS = new Map(D.prs.map((p) => [p.n, p]));

// ---------- state
const S = {
  mode: localStorage.getItem("mission-mode") ?? "pm", lens: false, follow: false, live: false,
  T: M.now, playing: false, speed: 15, sel: null, cam: { x: 0, y: 0, k: 0.3 },
};

// ---------- time scale for the roadmap (piecewise: the night is short, the afternoon push is wide)
const KNOTS = [[M.dayStart, 0], [8 * 60, 640], [13 * 60, 1500], [14 * 60 + 30, 1950], [18 * 60 + 20, 5400]];
const X = (t) => { for (let i = 1; i < KNOTS.length; i++) { const [t0, x0] = KNOTS[i - 1], [t1, x1] = KNOTS[i]; if (t <= t1 || i === KNOTS.length - 1) return x0 + ((t - t0) / (t1 - t0)) * (x1 - x0); } return 0; };

// ---------- nodes
const nodes = new Map(); // id -> {el, kind, pos:{pm,bs}, cur:{x,y,w}, data}
const W = { session: 268, scene: 300, idea: 200, version: 150, stream: 0 };
function node(id, kind, html, data, cls = "") {
  const el = document.createElement("div");
  el.className = `n n-${kind} ${cls}`; el.dataset.id = id; el.innerHTML = html;
  $("#nodes").appendChild(el);
  const n = { id, el, kind, data, pos: {}, cur: { x: 0, y: 0, w: W[kind] ?? 260, o: 1 } };
  nodes.set(id, n); return n;
}

const OUT = { done: "Done", running: "Running", duplicate: "Duplicate", failed: "Failed" };
function clauseHtml(s) { return s.clauses.map((c, i) => `<u style="--c:${["#e8a33d", "#6fb3ff", "#ff7a9c", "#4fd1a5"][i % 4]}">${esc(c)}</u>`).join(" "); }
function sparkSvg(s, w = 120, h = 22) {
  const a = s.spark, mx = Math.max(1, ...a);
  const bw = w / Math.max(a.length, 1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${a.map((v, i) => `<rect data-b="${s.spark0 + i * 5}" x="${(i * bw).toFixed(1)}" y="${(h - (v / mx) * h).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${((v / mx) * h).toFixed(1)}"/>`).join("")}</svg>`;
}
function latestLine(s) {
  let t = s.latest ?? "";
  if (t.startsWith("{")) { try { const j = JSON.parse(t); t = j.pr_url ? `PR ${j.pr_url.split("/").pop()} opened` : Object.entries(j).slice(0, 1).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)[0]; } catch { t = t.replace(/[{}"]/g, " "); } }
  return t.replace(/`/g, "").replace(/\*\*/g, "");
}
function sessionHtml(s) {
  const prev = s.scenes.map((id) => SCENE.get(id)).filter(Boolean)[0];
  const rot = s.handoffs ? `<span class="rot" title="${s.handoffs} handoff(s): context was compacted">${"●".repeat(Math.min(3, s.handoffs))} rot</span>` : "";
  const prs = s.prs.map((n) => PRS.get(n)).filter(Boolean).map((p) => `<a class="pr ${p.state.toLowerCase()}" data-pr="${p.n}" href="${p.url}" target="_blank" rel="noopener">#${p.n}</a>`).join("");
  return `<div class="bar" style="--c:${col(s.stream)}"></div>
  <header><span class="who">${s.subagent ? "subagent" : "chat"} · ${hhmm(s.start)}</span><span class="out o-${s.outcome}">${OUT[s.outcome] ?? s.outcome}</span></header>
  <h3>${esc(s.label)}</h3>
  <p class="ask" title="${esc(s.ask)}"><span class="q">“</span>${clauseHtml(s)}</p>
  <div class="prog">${sparkSvg(s)}<span class="tc"><b>${s.tool_calls}</b> calls</span>${rot}</div>
  <div class="foot">${prs}<span class="sc">${s.scenes.length ? s.scenes.map((id) => `<i data-scene="${id}">${id.replace("s", "S")}</i>`).join("") : ""}</span></div>
  <p class="latest near">${esc(latestLine(s))}</p>
  ${prev ? `<img class="thumb" loading="lazy" src="${prev.work[0] ?? prev.thumb}" alt="">` : ""}
  <span class="dupb" hidden>×2</span><span class="warn" hidden>⚠</span>`;
}
function sceneHtml(c) {
  const st = { live: "Live take", still: "Still", "at-risk": "At risk" }[c.state] ?? c.state;
  return `<div class="frame"><img loading="lazy" src="${c.thumb}" alt=""><span class="tc">${c.t0.toFixed(0)}–${c.t1.toFixed(0)}s</span><span class="st st-${c.state}">${st}</span><span class="flash"></span></div>
  <header><b>${c.id.replace("s", "S")}</b> ${esc(c.name)}</header>
  <p class="note">${esc(c.note)}</p>
  <div class="by"></div>
  <div class="work near">${c.work.slice(0, 3).map((w) => `<img loading="lazy" src="${w}" alt="">`).join("")}</div>
  <span class="heat" hidden></span>`;
}

function build() {
  $("#nodes").innerHTML = ""; nodes.clear();
  // goal / ask
  const acc = M.acceptance.map((a, i) => `<li data-i="${i}"><span class="ck"></span>${esc(a)}</li>`).join("");
  node("goal", "goal", `<span class="kicker">Mission · AODL intent</span><h1>${esc(M.title)}</h1>
    <blockquote>“${esc(M.ask)}”</blockquote><p class="goaltext">${esc(M.goal)}</p>
    <div class="countdown"><b id="cd">—</b><span id="cdl">to deadline</span></div>
    <ul class="acc">${acc}</ul>`);
  // the full artifact
  node("film", "film", `<span class="kicker">Artifact · ${esc(M.film.name)} · ${M.film.duration}s</span>
    <video id="film" src="${M.film.src}" muted playsinline preload="metadata" controls></video>
    <div class="filmbar">${D.scenes.map((c) => `<i data-scene="${c.id}" class="st-${c.state}" style="flex:${c.t1 - c.t0}" title="${esc(c.name)}"></i>`).join("")}</div>`);
  // roadmap axis (PM) — one long node
  const hours = []; let lastHx = -1e9;
  for (let h = Math.ceil(M.dayStart / 60); h <= 18; h++) { const hx = X(h * 60); if (hx - lastHx >= 150) { hours.push(h * 60); lastHx = hx; } }
  let msLast = [], msRows = M.milestones.map((m) => { const x = X(m.t); let r = 0; while (msLast[r] != null && x - msLast[r] < 420) r++; msLast[r] = x; return r; });
  node("axis", "axis", `<div class="hours">${hours.map((t) => `<i style="left:${X(t) - X(M.dayStart)}px">${hhmm(t)}</i>`).join("")}</div>
    ${M.milestones.map((m) => `<div class="ms ${m.hard ? "hard" : ""}" style="left:${X(m.t) - X(M.dayStart)}px;top:${-msRows[M.milestones.indexOf(m)] * 64}px"><span>◆</span><b>${esc(m.label)}</b><em>${hhmm(m.t)}</em></div>`).join("")}
    <div class="nowline"></div>`);
  nodes.get("axis").cur.w = X(18 * 60 + 20) - X(M.dayStart);
  // streams (lane headers / cluster labels)
  for (const st of D.streams) node(`st:${st.id}`, "stream", `<span class="sw" style="background:${st.color}"></span><b>${esc(st.name)}</b><em>${esc(st.theme)}</em><span class="cnt"></span>`, st);
  for (const c of D.scenes) node(c.id, "scene", sceneHtml(c), c);
  for (const s of D.sessions) node(s.id, "session", sessionHtml(s), s, `o-${s.outcome}${s.scenes.length ? " has-thumb" : ""}`);
  for (const v of D.versions) node(`v:${v.id}`, "version", `<b>${esc(v.id)}</b><span>${hhmm(v.t)}</span><em>${esc(v.label)}</em>`, v);
  for (const i of D.ideas ?? []) node(`i:${i.id}`, "idea", `<span class="k k-${i.kind}">${i.kind}</span>${esc(i.text)}`, i, `idea-${i.kind}`);
  for (const p of D.insights?.patterns ?? []) node(`p:${p.slice(0, 12)}`, "pattern", `<span class="k">pattern</span>${esc(p)}`, { text: p });
  layoutPM(); layoutBS();
  for (const n of nodes.values()) { const p = n.pos[S.mode] ?? n.pos.pm ?? { x: 0, y: 0, w: n.cur.w, o: 0 }; n.cur = { ...p }; place(n); }
}

// ---------- layouts
const R1 = 1200; // brainstorm: radius of the scene ring around the ask
const SES_H = 178, LANE_GAP = 70;
function layoutPM() {
  const x0 = X(M.dayStart);
  const P = (n, x, y, w, o = 1) => { if (n) n.pos.pm = { x, y, w: w ?? n.cur.w, o }; };
  P(nodes.get("goal"), -1260, -40, 560);
  P(nodes.get("film"), -1260, 640, 560);
  P(nodes.get("axis"), 0, 0, X(18 * 60 + 20) - x0);
  // storyboard strip, aligned to the afternoon (where the cut was made)
  const sx = X(14 * 60 + 20) - x0;
  D.scenes.forEach((c, i) => P(nodes.get(c.id), sx + i * 260, 170, 240));
  // cut lineage on the time axis, between the strip and the lanes
  let lastX = -1e9, row = 0;
  for (const v of D.versions) { const x = X(v.t) - x0; row = x - lastX < 170 ? (row + 1) % 3 : 0; lastX = x; P(nodes.get(`v:${v.id}`), x, 520 + row * 70, 150); }
  // swimlanes
  let y = 760;
  for (const st of D.streams) {
    const list = D.sessions.filter((s) => s.stream === st.id).sort((a, b) => a.start - b.start);
    const rows = [];
    for (const s of list) {
      const x = X(s.start) - x0, w = clamp(X(s.end) - X(s.start), 268, 560);
      let r = rows.findIndex((end) => end + 18 <= x); if (r < 0) { r = rows.length; rows.push(0); }
      rows[r] = x + w; P(nodes.get(s.id), x, y + 46 + r * (SES_H + 16), w);
    }
    const h = 46 + Math.max(1, rows.length) * (SES_H + 16);
    P(nodes.get(`st:${st.id}`), -420, y, 380);
    nodes.get(`st:${st.id}`).laneH = h; nodes.get(`st:${st.id}`).laneY = y;
    y += h + LANE_GAP;
  }
  S.pmLanesBottom = y;
  for (const i of D.ideas ?? []) P(nodes.get(`i:${i.id}`), 0, 0, 200, 0); // ideas live in brainstorm
  // PM shows patterns as a risk register under the film
  (D.insights?.patterns ?? []).forEach((p, i) => P(nodes.get(`p:${p.slice(0, 12)}`), -1260 + (i % 2) * 290, 1180 + Math.floor(i / 2) * 170, 270));
}
function layoutBS() {
  const P = (n, x, y, w, o = 1) => { if (n) n.pos.bs = { x, y, w: w ?? n.cur.w, o }; };
  P(nodes.get("goal"), -470, -640, 940);
  P(nodes.get("film"), -280, 130, 560);
  P(nodes.get("axis"), -2600, -1800, nodes.get("axis").cur.w, 0);
  // the cut as a ring around the ask
  
  D.scenes.forEach((c, i) => { const a = -Math.PI / 2 + (i / D.scenes.length) * Math.PI * 2; P(nodes.get(c.id), Math.cos(a) * R1 - 120, Math.sin(a) * R1 * 0.78 - 90, 240); });
  // each stream a cluster, placed toward the scenes it touched most
  const streams = D.streams;
  const ang = new Map();
  streams.forEach((st, i) => {
    const touched = D.sessions.filter((s) => s.stream === st.id).flatMap((s) => s.scenes);
    let a = -Math.PI / 2 + (i / streams.length) * Math.PI * 2;
    if (touched.length) { let sx = 0, sy = 0; for (const id of touched) { const k = D.scenes.findIndex((c) => c.id === id); const b = -Math.PI / 2 + (k / D.scenes.length) * Math.PI * 2; sx += Math.cos(b); sy += Math.sin(b); } a = Math.atan2(sy, sx) * 0.5 + a * 0.5; }
    ang.set(st.id, a);
  });
  // spread angles so clusters don't collide
  const order = [...ang.entries()].sort((a, b) => a[1] - b[1]);
  order.forEach(([id], i) => ang.set(id, -Math.PI / 2 + (i / order.length) * Math.PI * 2 + 0.25));
  // pack: each cluster sizes itself, then slides outward along its angle until it clears the ring and earlier clusters
  const placed = [], ringOuter = R1 + 460;
  for (const st of [...streams].sort((x, y) => D.sessions.filter((s) => s.stream === y.id).length - D.sessions.filter((s) => s.stream === x.id).length)) {
    const list = D.sessions.filter((s) => s.stream === st.id).sort((x, y) => x.start - y.start);
    const ideas = (D.ideas ?? []).filter((i) => i.stream === st.id);
    const items = [...list.map((s) => ({ id: s.id, w: 268 })), ...ideas.map((i) => ({ id: `i:${i.id}`, w: 200 }))];
    const cols = Math.max(2, Math.ceil(Math.sqrt(items.length * 1.6))), rows = Math.ceil(items.length / cols), CW = 300, CH = 214;
    const rad = Math.hypot((cols * CW + CW / 2) / 2, (rows * CH) / 2 / 0.78) + 60, a = ang.get(st.id);
    let d = ringOuter + rad, cx, cy;
    for (let guard = 0; guard < 200; guard++) {
      cx = Math.cos(a) * d; cy = Math.sin(a) * d;
      if (!placed.some((q) => Math.hypot(q.cx - cx, (q.cy - cy) * 1.15) < q.r + rad + 140)) break;
      d += 70;
    }
    placed.push({ cx, cy, r: rad });
    // staggered hex grid, sessions first (oldest top-left), then the cluster's ideas as notes
    items.forEach((it, k) => { const r = Math.floor(k / cols), q = k % cols, n = r === rows - 1 ? items.length - r * cols : cols;
      const x = cx + (q - (n - 1) / 2) * CW + (r % 2 ? CW / 4 : -CW / 4), y = cy + (r - (rows - 1) / 2) * CH;
      P(nodes.get(it.id), x - it.w / 2, y - 90, it.w); });
    const sn = nodes.get(`st:${st.id}`); sn.blob = { cx, cy: cy + 40, r: rad };
    P(sn, cx - 190, cy - rad * 0.78 - 30, 380); // bottom-anchored (css translate -100%)
  }
  for (const v of D.versions) P(nodes.get(`v:${v.id}`), -75, -40, 150, 0);
  // patterns sit inside the ring, beside the ask: what the day taught, next to what it was for
  (D.insights?.patterns ?? []).forEach((p, i) => P(nodes.get(`p:${p.slice(0, 12)}`), i % 2 ? -610 : 340, 110 + Math.floor(i / 2) * 215, 270));
}

function place(n) {
  const c = n.cur;
  n.el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
  if (n.kind !== "axis") n.el.style.width = `${c.w}px`;
  n.el.style.opacity = c.o;
  n.el.style.pointerEvents = c.o < 0.2 ? "none" : "";
}

// ---------- mode morph (all nodes travel, staggered by distance, wires follow every frame)
let morph = null;
function setMode(mode, { animate = true } = {}) {
  S.mode = mode; localStorage.setItem("mission-mode", mode);
  root.dataset.mode = mode;
  $$(".m-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  const from = new Map([...nodes.values()].map((n) => [n.id, { ...n.cur }]));
  const t0 = performance.now(), D_ = animate ? 1100 : 0;
  const order = [...nodes.values()].map((n) => [n, Math.hypot(n.pos[mode].x, n.pos[mode].y)]).sort((a, b) => a[1] - b[1]).map(([n], i, arr) => [n, (i / arr.length) * 320]);
  cancelAnimationFrame(morph);
  const step = (now) => {
    let done = true;
    for (const [n, delay] of order) {
      const a = from.get(n.id), b = n.pos[mode], k = D_ ? ease(clamp((now - t0 - delay) / D_, 0, 1)) : 1;
      if (k < 1) done = false;
      n.cur = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, o: a.o + (b.o - a.o) * k };
      place(n);
    }
    drawWires(); drawMini();
    if (!done) morph = requestAnimationFrame(step);
  };
  morph = requestAnimationFrame(step);
  if (animate) setTimeout(() => home(true), 120); else home(false);
}

// ---------- camera
const world = $("#world"), stage = $("#stage");
function applyCam() {
  const { x, y, k } = S.cam;
  world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  root.style.setProperty("--inv", String(clamp(1 / k, 1, 6)));
  world.dataset.lod = k < 0.32 ? "far" : k < 0.75 ? "mid" : "near";
  drawMini();
}
function bounds(mode = S.mode) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes.values()) { const p = n.pos[mode]; if (!p || p.o < 0.5) continue; const h = n.el.offsetHeight || 150, w = n.kind === "axis" ? nodes.get("axis").cur.w : p.w; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + w); y1 = Math.max(y1, p.y + h); }
  if (mode === "bs") for (const st of D.streams) { const b = nodes.get(`st:${st.id}`).blob; if (b) { x0 = Math.min(x0, b.cx - b.r); x1 = Math.max(x1, b.cx + b.r); y0 = Math.min(y0, b.cy - b.r); y1 = Math.max(y1, b.cy + b.r); } }
  return { x0, y0, x1, y1 };
}
let flight = null;
function flyTo(target, ms = 800) {
  const a = { ...S.cam }, t0 = performance.now();
  cancelAnimationFrame(flight);
  const f = (now) => {
    const k = ease(clamp((now - t0) / ms, 0, 1));
    const s = Math.exp(Math.log(a.k) + (Math.log(target.k) - Math.log(a.k)) * k);
    S.cam = { x: a.x + (target.x - a.x) * k, y: a.y + (target.y - a.y) * k, k: s }; applyCam();
    if (k < 1) flight = requestAnimationFrame(f);
  };
  flight = requestAnimationFrame(f);
}
function camFor(b, pad = 80) {
  const vw = innerWidth, vh = innerHeight - 150, k = clamp(Math.min((vw - pad * 2) / (b.x1 - b.x0), (vh - pad * 2) / (b.y1 - b.y0)), 0.04, 2.2);
  return { k, x: vw / 2 - ((b.x0 + b.x1) / 2) * k, y: 70 + vh / 2 - ((b.y0 + b.y1) / 2) * k };
}
function fit(anim = true) { const c = camFor(bounds()); anim ? flyTo(c) : ((S.cam = c), applyCam()); }
// home: Product opens on the afternoon push (legible cards), Brainstorm on the whole map; f still fits everything
function home(anim = true) {
  if (S.mode !== "pm") return fit(anim);
  const x0 = X(M.dayStart), xr = X(Math.min(M.now, 18 * 60 + 20)) - x0 + 240, b = { x0: xr - 3200, x1: xr, y0: -150, y1: 1750 };
  const c = camFor(b, 40); anim ? flyTo(c) : ((S.cam = c), applyCam());
}
function focusNode(id, zoom = 0.9) {
  const n = nodes.get(id); if (!n) return;
  const w = n.cur.w, h = n.el.offsetHeight;
  flyTo({ k: zoom, x: innerWidth / 2 - (n.cur.x + w / 2) * zoom - (S.sel ? 180 : 0), y: innerHeight / 2 - (n.cur.y + h / 2) * zoom });
}

// pan / zoom
let drag = null;
stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("a, button, video, .n-film")) return;
  drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: false, node: e.target.closest(".n") };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.moved) { S.cam.x = drag.cx + dx; S.cam.y = drag.cy + dy; applyCam(); stage.classList.add("panning"); }
});
stage.addEventListener("pointerup", (e) => {
  stage.classList.remove("panning");
  if (drag && !drag.moved) { const n = drag.node; if (n) select(n.dataset.id); else select(null); }
  drag = null;
});
stage.addEventListener("wheel", (e) => {
  e.preventDefault(); cancelAnimationFrame(flight);
  const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), k = clamp(S.cam.k * f, 0.04, 2.5), r = k / S.cam.k;
  S.cam.x = e.clientX - (e.clientX - S.cam.x) * r; S.cam.y = e.clientY - (e.clientY - S.cam.y) * r; S.cam.k = k; applyCam();
}, { passive: false });

// ---------- wires (SVG in world space)
const svg = $("#wires");
function anchor(id, side) {
  const n = nodes.get(id); if (!n) return null;
  const h = n.el.offsetHeight || 140, w = n.cur.w;
  return side === "top" ? [n.cur.x + w / 2, n.cur.y] : side === "bottom" ? [n.cur.x + w / 2, n.cur.y + h] : [n.cur.x + w / 2, n.cur.y + h / 2];
}
function curve(a, b, bend = 0.5) {
  const my = (a[1] + b[1]) / 2, mx = (a[0] + b[0]) / 2;
  return S.mode === "pm" ? `M${a[0]},${a[1]} C${a[0]},${a[1] + (b[1] - a[1]) * bend} ${b[0]},${b[1] - (b[1] - a[1]) * bend} ${b[0]},${b[1]}` : `M${a[0]},${a[1]} Q${mx * 0.7},${my * 0.7} ${b[0]},${b[1]}`;
}
function drawWires() {
  const out = [];
  // brainstorm: blobs behind clusters, tethers scene -> cluster
  if (S.mode === "bs" || morph) {
    const o = S.mode === "bs" ? 1 : 0;
    for (const st of D.streams) { const b = nodes.get(`st:${st.id}`).blob; if (b) out.push(`<ellipse class="blob" cx="${b.cx}" cy="${b.cy - 40}" rx="${b.r}" ry="${b.r * 0.78}" style="--c:${st.color};opacity:${o}"/>`); }
    out.push(`<ellipse class="ring" cx="0" cy="0" rx="${R1}" ry="${R1 * 0.78}" style="opacity:${o}"/>`);
  }
  if (S.mode === "pm") {
    // lane bands + deadline + now line
    const x0 = X(M.dayStart), xe = X(18 * 60 + 20) - x0;
    for (const st of D.streams) { const sn = nodes.get(`st:${st.id}`); if (sn.laneY != null) out.push(`<rect class="lane" x="-440" y="${sn.laneY - 18}" width="${xe + 520}" height="${sn.laneH}" rx="22" style="--c:${st.color}"/>`); }
    const dl = X(M.deadline) - x0, nw = X(S.T) - x0;
    out.push(`<line class="deadline" x1="${dl}" y1="-20" x2="${dl}" y2="${S.pmLanesBottom}"/><text class="dlt" x="${dl + 10}" y="${S.pmLanesBottom - 20}">DEADLINE ${hhmm(M.deadline)}</text>`);
    out.push(`<line class="now" x1="${nw}" y1="-20" x2="${nw}" y2="${S.pmLanesBottom}"/>`);
    // version -> scene lineage
    for (const v of D.versions) { if (v.t > S.T) continue; const a = anchor(`v:${v.id}`, "top"); for (const sc of v.scenes) { const b = anchor(sc, "bottom"); if (a && b) out.push(`<path class="w-ver" d="${curve(a, b)}"/>`); } }
  }
  // session -> scene (selection, hover, lens; plus fresh scene events)
  const sel = S.sel, hot = S.hot;
  for (const s of D.sessions) {
    if (s.start > S.T) continue;
    const show = sel === s.id || hot === s.id || sel === s.scenes.find((x) => x === sel) || (sel && SCENE.has(sel) && s.scenes.includes(sel));
    const fresh = S.fresh.get(s.id);
    if (!show && !fresh && S.mode === "pm") continue;
    for (const sc of s.scenes) {
      const a = anchor(s.id, S.mode === "pm" ? "top" : "mid"), b = anchor(sc, S.mode === "pm" ? "bottom" : "mid"); if (!a || !b) continue;
      out.push(`<path class="w-ses ${show ? "on" : ""} ${fresh === sc ? "pulse" : ""}" d="${curve(a, b, 0.6)}" style="--c:${col(s.stream)}"/>`);
    }
  }
  // lens: duplicate twins
  if (S.lens) for (const d of D.insights?.duplicates ?? []) {
    const s = SES.get(d.session); if (!s) continue;
    const twin = D.sessions.find((o) => o.id !== s.id && o.stream === s.stream && o.outcome !== "duplicate" && Math.abs(o.start - s.start) < 60 && o.clauses[0] === s.clauses[0]) ?? D.sessions.find((o) => o.id !== s.id && o.label.split(" ")[0] === s.label.split(" ")[0] && o.stream === s.stream);
    if (!twin) continue;
    const a = anchor(s.id, "mid"), b = anchor(twin.id, "mid"); if (a && b) out.push(`<path class="w-dup" d="M${a[0]},${a[1]} L${b[0]},${b[1]}"/>`);
  }
  svg.innerHTML = out.join("");
}

// ---------- replay clock
S.fresh = new Map(); // session id -> scene id (brief pulse)
const EV = D.events;
function evLabel(e) {
  const s = SES.get(e.session), L = s ? s.label : "";
  switch (e.type) {
    case "spawn": return [`<b style="color:${col(s?.stream)}">▶</b> ${esc(L)}`, s?.stream];
    case "steer": return [`<b>Kevin</b> → ${esc(L)}: <em>“${esc(e.text)}”</em>`, s?.stream];
    case "progress": return [`<span class="dim">${esc(L)}:</span> ${esc(e.text)}`, s?.stream];
    case "scene": return [e.version ? `Cut <b>${esc(e.version)}</b> changed <b>${e.scene.replace("s", "S")}</b> ${esc(SCENE.get(e.scene)?.name)}` : `<b style="color:${col(s?.stream)}">●</b> ${esc(L)} updated <b>${e.scene.replace("s", "S")}</b> ${esc(SCENE.get(e.scene)?.name)}`, s?.stream ?? "film"];
    case "version": return [`<b>✂ Cut ${esc(e.version)}</b> ${esc(D.versions.find((v) => v.id === e.version)?.label)}`, "film"];
    case "pr": return [`<b class="prm">⇡ #${e.pr}</b> merged ${esc(PRS.get(e.pr)?.title ?? "")}`, s?.stream ?? "glide"];
    case "end": return [`${e.outcome === "failed" ? "✗" : "✓"} ${esc(L)} <span class="dim">${e.outcome}</span>`, s?.stream];
  }
  return [e.type, null];
}
let lastT = S.T;
function setT(T, { fire = false } = {}) {
  const prev = S.T; S.T = clamp(T, M.dayStart, M.now); 
  // fire events crossed going forward
  if (fire && S.T > prev) for (const e of EV) { if (e.t > prev && e.t <= S.T) fireEvent(e); }
  renderTime();
}
function fireEvent(e) {
  const [html, stream] = evLabel(e);
  const li = document.createElement("div"); li.className = `tk tk-${e.type}`; li.style.setProperty("--c", col(stream)); li.innerHTML = `<time>${hhmm(e.t)}</time><span>${html}</span>`;
  const tk = $("#ticker"); tk.prepend(li); while (tk.children.length > 5) tk.lastChild.remove();
  if (e.type === "scene") {
    const n = nodes.get(e.scene); if (n) { n.el.classList.remove("flashing"); void n.el.offsetWidth; n.el.style.setProperty("--fc", col(stream)); n.el.classList.add("flashing"); }
    if (e.session) { S.fresh.set(e.session, e.scene); setTimeout(() => { S.fresh.delete(e.session); drawWires(); }, 1400); }
  }
  const target = e.type === "scene" ? e.scene : e.type === "version" ? `v:${e.version}` : e.session;
  const tn = nodes.get(target);
  if (tn && e.type !== "scene") { tn.el.classList.remove("ping"); void tn.el.offsetWidth; tn.el.classList.add("ping"); }
  if (S.follow && tn && (e.type === "spawn" || e.type === "scene" || e.type === "pr")) focusNode(target, S.mode === "pm" ? 0.55 : 0.5);
}
function renderTime() {
  const T = S.T;
  $("#clock").textContent = hhmm(T);
  const toDl = M.deadline - T;
  $("#clockSub").textContent = toDl > 0 ? `CST · T−${dur(toDl)} to deadline` : `CST · deadline +${dur(-toDl)}`;
  $("#cd") && ($("#cd").textContent = toDl > 0 ? `T−${dur(toDl)}` : `+${dur(-toDl)}`);
  $("#cdl") && ($("#cdl").textContent = toDl > 0 ? `to the ${hhmm(M.deadline)} deadline` : "past the deadline");
  const running = [];
  for (const s of D.sessions) {
    const n = nodes.get(s.id); if (!n) continue;
    const born = s.start <= T, live = born && (s.outcome === "running" ? true : T < s.end);
    n.el.classList.toggle("unborn", !born);
    n.el.classList.toggle("live", live && born);
    n.el.classList.toggle("ended", born && !live);
    if (live) running.push(s);
    // spark fill up to T
    for (const r of n.el.querySelectorAll(".spark rect")) r.classList.toggle("past", +r.dataset.b <= T);
    const prs = n.el.querySelectorAll(".pr"); prs.forEach((a) => { const p = PRS.get(+a.dataset.pr); a.classList.toggle("future", !p || p.t > T); });
  }
  // scenes: who touched them so far
  const touch = new Map();
  for (const e of EV) { if (e.t > T) break; if (e.type === "scene") { const a = touch.get(e.scene) ?? []; a.push(e); touch.set(e.scene, a); } }
  for (const c of D.scenes) {
    const n = nodes.get(c.id), list = touch.get(c.id) ?? [];
    const lanes = [...new Map(list.filter((e) => e.session).map((e) => [e.session, SES.get(e.session)])).values()].filter(Boolean);
    n.el.querySelector(".by").innerHTML = lanes.length ? lanes.slice(-7).map((s) => `<i style="background:${col(s.stream)}" title="${esc(s.label)}"></i>`).join("") + `<span>${list.length} edit${list.length === 1 ? "" : "s"} · ${lanes.length} chat${lanes.length === 1 ? "" : "s"}</span>` : `<span class="dim">untouched yet</span>`;
    n.el.classList.toggle("untouched", !list.length);
    const h = n.el.querySelector(".heat"); h.textContent = lanes.length; h.style.setProperty("--h", Math.min(1, lanes.length / 8));
  }
  for (const v of D.versions) nodes.get(`v:${v.id}`)?.el.classList.toggle("unborn", v.t > T);
  for (const st of D.streams) {
    const all = D.sessions.filter((s) => s.stream === st.id && s.start <= T), live = all.filter((s) => s.outcome === "running" || T < s.end);
    nodes.get(`st:${st.id}`).el.querySelector(".cnt").innerHTML = `<b>${all.length}</b> chats${live.length ? ` · <b class="lv">${live.length} live</b>` : ""}`;
  }
  // acceptance checklist state (from the day's ledger at final8)
  // acceptance: mission.acceptanceAt[i] = [partly met at, met at] (minutes, null = not yet)
  $$(".acc li").forEach((li, i) => { const [pt, ok] = M.acceptanceAt?.[i] ?? []; li.dataset.s = ok != null && T >= ok ? "ok" : pt != null && T >= pt ? "part" : "no"; });
  const head = $("#head"), w = $("#scrub").clientWidth; head.style.left = `${((T - M.dayStart) / (M.now - M.dayStart)) * w}px`;
  $("#live").classList.toggle("on", S.live && T >= M.now - 0.5);
  document.title = `Taste · Mission · ${running.length} live`;
  drawWires(); drawMini();
}

// play loop
let raf = null, lastFrame = 0;
function play(on = !S.playing) {
  S.playing = on; $("#play").textContent = on ? "❚❚" : "▶"; $("#play").classList.toggle("on", on);
  if (on && S.T >= M.now - 0.1) { setT(M.dayStart); $("#ticker").innerHTML = ""; }
  if (on) { S.live = false; lastFrame = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
}
function tick(now) {
  const dt = (now - lastFrame) / 1000; lastFrame = now;
  setT(S.T + dt * S.speed, { fire: true });
  if (S.T >= M.now) { play(false); return; }
  raf = requestAnimationFrame(tick);
}

// scrubber: event ticks + a tool-call trace by stream
function drawScrub() {
  const el = $("#scrub"), w = el.clientWidth, h = el.clientHeight;
  const span = M.now - M.dayStart, xt = (t) => ((t - M.dayStart) / span) * w;
  $("#ticks").innerHTML = [
    ...M.milestones.filter((m) => m.t <= M.now).map((m) => `<i class="ms ${m.hard ? "hard" : ""}" style="left:${xt(m.t)}px" title="${esc(m.label)} ${hhmm(m.t)}"></i>`),
    ...D.versions.map((v) => `<i class="ver" style="left:${xt(v.t)}px" title="Cut ${esc(v.id)}"></i>`),
    ...D.prs.filter((p) => p.state === "MERGED" && p.t <= M.now).map((p) => `<i class="pr" style="left:${xt(p.t)}px" title="#${p.n}"></i>`),
  ].join("");
  const cv = $("#trace"), dpr = devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const B = Math.ceil(span / 5), stacks = D.streams.map((st) => { const a = new Float32Array(B); for (const s of D.sessions) if (s.stream === st.id) s.spark.forEach((v, i) => { const b = Math.floor((s.spark0 + i * 5 - M.dayStart) / 5); if (b >= 0 && b < B) a[b] += v; }); return [st, a]; });
  const tot = new Float32Array(B); stacks.forEach(([, a]) => a.forEach((v, i) => (tot[i] += v)));
  const mx = Math.max(1, ...tot), base = new Float32Array(B);
  for (const [st, a] of stacks) {
    g.beginPath();
    for (let i = 0; i < B; i++) g.lineTo((i / B) * w, h - ((base[i] + a[i]) / mx) * (h - 6));
    for (let i = B - 1; i >= 0; i--) g.lineTo((i / B) * w, h - (base[i] / mx) * (h - 6));
    g.closePath(); g.fillStyle = st.color + "aa"; g.fill();
    a.forEach((v, i) => (base[i] += v));
  }
}
const scrubEl = $("#scrub");
let scrubbing = false;
const scrubAt = (e) => { const r = scrubEl.getBoundingClientRect(); S.live = false; setT(M.dayStart + clamp((e.clientX - r.left) / r.width, 0, 1) * (M.now - M.dayStart)); };
scrubEl.addEventListener("pointerdown", (e) => { scrubbing = true; scrubEl.setPointerCapture(e.pointerId); play(false); scrubAt(e); });
scrubEl.addEventListener("pointermove", (e) => scrubbing && scrubAt(e));
scrubEl.addEventListener("pointerup", () => (scrubbing = false));

// LIVE: pin to now and re-read the snapshot; new events fire as they appear
async function goLive() {
  S.live = true; play(false); setT(M.now);
  const seen = new Set(EV.map((e) => `${e.t}|${e.type}|${e.session ?? ""}|${e.scene ?? ""}`));
  clearInterval(S.poll);
  S.poll = setInterval(async () => {
    if (!S.live) return clearInterval(S.poll);
    const r = await fetch(URL_, { cache: "no-store" }).catch(() => null); if (!r?.ok) return;
    const nd = await r.json(); if (nd.generatedAt === D.generatedAt) return;
    const fresh = nd.events.filter((e) => !seen.has(`${e.t}|${e.type}|${e.session ?? ""}|${e.scene ?? ""}`));
    D = nd; location.hash = location.hash; // keep selection
    rebuildFrom(nd); fresh.forEach(fireEvent);
  }, 15000);
}
function rebuildFrom(nd) {
  Object.assign(M, nd.mission); D.sessions = nd.sessions; SES = new Map(nd.sessions.map((s) => [s.id, s]));
  EV.length = 0; EV.push(...nd.events); build(); setMode(S.mode, { animate: false }); drawScrub(); setT(M.now);
}

// ---------- selection drawer
function select(id) {
  S.sel = id;
  $$(".n.sel").forEach((e) => e.classList.remove("sel"));
  const dr = $("#drawer");
  if (!id || id === "axis") { dr.hidden = true; history.replaceState(null, "", location.pathname + location.search); drawWires(); return; }
  const n = nodes.get(id); if (!n) return;
  n.el.classList.add("sel");
  history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  dr.hidden = false; dr.innerHTML = drawerHtml(n); dr.scrollTop = 0;
  dr.querySelector(".x").onclick = () => select(null);
  dr.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { select(b.dataset.go); focusNode(b.dataset.go); }));
  const v = dr.querySelector("video[data-t0]");
  if (v) { const t0 = +v.dataset.t0, t1 = +v.dataset.t1; v.currentTime = t0; v.play().catch(() => {}); v.ontimeupdate = () => { if (v.currentTime >= t1 || v.currentTime < t0 - 0.2) v.currentTime = t0; }; }
  drawWires();
}
function drawerHtml(n) {
  const x = `<button class="x" title="Close (esc)">✕</button>`;
  if (n.kind === "session") {
    const s = n.data, st = STREAM.get(s.stream);
    const prs = s.prs.map((k) => PRS.get(k)).filter(Boolean);
    const maxT = Math.max(1, ...s.tools.map((t) => t[1]));
    return `${x}<span class="kicker" style="color:${st.color}">${esc(st.name)} · ${s.subagent ? "subagent" : "chat"} · ${hhmm(s.start)}–${s.outcome === "running" ? "now" : hhmm(s.end)} · ${dur((s.outcome === "running" ? M.now : s.end) - s.start)}</span>
      <h2>${esc(s.label)}</h2><span class="out o-${s.outcome}">${OUT[s.outcome]}</span>
      <section><h4>Declare · the ask, in your words</h4><blockquote>${esc(s.ask || s.title || s.label)}</blockquote><div class="clauses">${clauseHtml(s)}</div></section>
      <section><h4>Contract · what done means</h4><ul class="acc mini">${s.clauses.map((c) => `<li data-s="${s.outcome === "done" ? "ok" : s.outcome === "failed" ? "no" : "part"}"><span class="ck"></span>${esc(c)}</li>`).join("")}${prs.length ? `<li data-s="${prs.every((p) => p.state === "MERGED") ? "ok" : "part"}"><span class="ck"></span>PR merged into main</li>` : ""}</ul></section>
      <section><h4>Work · agent progress</h4><div class="bigspark">${sparkSvg(s, 340, 46)}</div>
        <div class="stats"><span><b>${s.tool_calls}</b> tool calls</span><span><b>${s.msgs}</b> messages</span><span class="${s.handoffs ? "warn" : ""}"><b>${s.handoffs}</b> handoffs</span></div>
        <div class="tools">${s.tools.map(([k, v]) => `<div><span>${esc(k)}</span><i style="width:${(v / maxT) * 100}%"></i><b>${v}</b></div>`).join("")}</div>
        <ol class="steps">${s.steps.map((p) => `<li><time>${hhmm(p.t)}</time>${esc(p.say)}</li>`).join("")}</ol></section>
      ${s.owner_msgs.length > 1 ? `<section><h4>Your steering</h4><ol class="steps owner">${s.owner_msgs.map((m) => `<li><time>${hhmm(m.t)}</time>${esc(m.text)}</li>`).join("")}</ol></section>` : ""}
      <section><h4>Proof · receipts</h4>${prs.length ? prs.map((p) => `<a class="prrow ${p.state.toLowerCase()}" href="${p.url}" target="_blank" rel="noopener"><b>#${p.n}</b> ${esc(p.title)} <em>${p.state.toLowerCase()} ${hhmm(p.t)}</em></a>`).join("") : `<p class="dim">No PR from this chat.</p>`}</section>
      ${s.scenes.length ? `<section><h4>Scenes it touched</h4><div class="scthumbs">${s.scenes.map((id) => SCENE.get(id)).filter(Boolean).map((c) => `<button data-go="${c.id}"><img src="${c.thumb}" alt=""><span>${c.id.replace("s", "S")} ${esc(c.name)}</span></button>`).join("")}</div></section>` : ""}
      <p class="sid">session <code>${esc(s.id)}</code></p>`;
  }
  if (n.kind === "scene") {
    const c = n.data, by = D.sessions.filter((s) => s.scenes.includes(c.id));
    const vs = D.versions.filter((v) => v.scenes.includes(c.id));
    return `${x}<span class="kicker">Storyboard · ${c.id.replace("s", "S")} · ${c.t0}–${c.t1}s of ${M.film.duration}s</span><h2>${esc(c.name)}</h2>
      <video data-t0="${c.t0}" data-t1="${c.t1}" src="${M.film.src}" muted playsinline></video>
      <p>${esc(c.note)}</p><span class="st st-${c.state}">${c.state}</span>
      <section><h4>Work in progress</h4><div class="gallery">${c.work.map((w) => `<img src="${w}" alt="">`).join("")}</div></section>
      <section><h4>Cut history</h4><ol class="steps">${vs.map((v) => `<li><time>${hhmm(v.t)}</time><b>${esc(v.id)}</b> ${esc(v.label)}</li>`).join("") || "<li>—</li>"}</ol></section>
      <section><h4>${by.length} chats touched it</h4>${by.map((s) => `<button class="sesrow" data-go="${s.id}"><i style="background:${col(s.stream)}"></i>${esc(s.label)}<em>${hhmm(s.start)} · ${OUT[s.outcome]}</em></button>`).join("")}</section>`;
  }
  if (n.kind === "stream") {
    const st = n.data, list = D.sessions.filter((s) => s.stream === st.id);
    const mins_ = list.reduce((a, s) => a + ((s.outcome === "running" ? M.now : s.end) - s.start), 0);
    return `${x}<span class="kicker" style="color:${st.color}">Workstream</span><h2>${esc(st.name)}</h2><blockquote>${esc(st.theme)}</blockquote>
      <div class="stats"><span><b>${list.length}</b> chats</span><span><b>${list.filter((s) => s.subagent).length}</b> subagents</span><span><b>${dur(mins_)}</b> agent time</span><span><b>${list.reduce((a, s) => a + s.tool_calls, 0)}</b> calls</span></div>
      <section>${list.map((s) => `<button class="sesrow" data-go="${s.id}"><i style="background:${st.color}"></i>${esc(s.label)}<em>${hhmm(s.start)} · ${OUT[s.outcome]}</em></button>`).join("")}</section>`;
  }
  if (n.kind === "version") { const v = n.data; return `${x}<span class="kicker">Cut lineage · ${hhmm(v.t)}</span><h2>${esc(v.id)}</h2><p>${esc(v.label)}</p><section><h4>Scenes changed</h4><div class="scthumbs">${v.scenes.map((id) => SCENE.get(id)).map((c) => `<button data-go="${c.id}"><img src="${c.thumb}" alt=""><span>${c.id.replace("s", "S")} ${esc(c.name)}</span></button>`).join("")}</div></section>`; }
  if (n.kind === "goal") return `${x}<span class="kicker">Mission</span><h2>${esc(M.title)}</h2><blockquote>${esc(M.ask)}</blockquote><p>${esc(M.goal)}</p><section><h4>Roadmap</h4><ol class="steps">${M.milestones.map((m) => `<li><time>${hhmm(m.t)}</time>${esc(m.label)}${m.hard ? " · hard" : ""}</li>`).join("")}</ol></section>`;
  return `${x}<p>${esc(n.data?.text ?? n.id)}</p>`;
}

// ---------- insights lens + panel
function renderInsights() {
  const I = D.insights ?? {}, p = $("#insights");
  p.hidden = !S.lens; root.classList.toggle("lens", S.lens);
  for (const s of D.sessions) {
    const n = nodes.get(s.id); if (!n) continue;
    n.el.querySelector(".dupb").hidden = !(S.lens && s.outcome === "duplicate");
    const rec = (I.recurring ?? []).filter((r) => r.sessions?.includes(s.id) || r.prs?.some((x) => s.prs.includes(x)));
    const w = n.el.querySelector(".warn"); w.hidden = !(S.lens && rec.length); w.title = rec.map((r) => r.name).join("\n");
  }
  for (const c of D.scenes) nodes.get(c.id).el.querySelector(".heat").hidden = !S.lens;
  drawWires();
  if (!S.lens) return;
  const dupMin = (I.duplicates ?? []).reduce((a, d) => { const s = SES.get(d.session); return a + (s ? s.end - s.start : 0); }, 0);
  const subs = D.sessions.filter((s) => s.subagent).length, tc = D.sessions.reduce((a, s) => a + s.tool_calls, 0);
  p.innerHTML = `<span class="kicker">Insights lens · from the event trace</span><h2>Where the day went</h2>
    <div class="kpis"><div><b>${D.sessions.length}</b><span>chats</span></div><div><b>${subs}</b><span>subagents</span></div><div><b>${tc.toLocaleString()}</b><span>tool calls</span></div><div><b>${D.prs.filter((x) => x.state === "MERGED").length}</b><span>PRs merged</span></div></div>
    <section><h4>Wasted effort</h4><div class="waste"><div><b>${dur(dupMin)}</b><span>in ${(I.duplicates ?? []).length} duplicate chats (same ask twice)</span></div><div><b>${dur(I.side_quest_minutes ?? 0)}</b><span>side quests during the push</span></div></div>
      ${(I.duplicates ?? []).map((d) => `<button class="sesrow" data-go="${d.session}"><i style="background:${col(SES.get(d.session)?.stream)}"></i>${esc(d.label)}<em>×2</em></button>`).join("")}</section>
    <section><h4>Recurring failures</h4>${(I.recurring ?? []).map((r, i) => `<button class="rec" data-rec="${i}"><b>${r.count}×</b><span>${esc(r.name)}<em>${esc(r.fix)}</em></span></button>`).join("")}</section>
    <section><h4>Scene churn</h4>${(I.churn ?? []).map((c) => { const sc = SCENE.get(c.scene); return `<button class="sesrow" data-go="${c.scene}"><img src="${sc.thumb}" alt="">${c.scene.replace("s", "S")} ${esc(sc.name)}<em>${c.sessions} chats · ${sc.state}</em></button>`; }).join("")}</section>
    <section><h4>Context rot</h4><p class="dim">Chats that hit the context cap and were handed off: long chats lose the thread.</p>${(I.rot ?? []).map((r) => { const s = SES.get(r.session); return s ? `<button class="sesrow" data-go="${s.id}"><i style="background:${col(s.stream)}"></i>${esc(s.label)}<em>${r.msgs} msgs · ${"●".repeat(r.handoffs)}</em></button>` : ""; }).join("")}</section>
    <section><h4>Patterns</h4>${(I.patterns ?? []).map((x) => `<p class="pat">${esc(x)}</p>`).join("")}</section>`;
  p.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { select(b.dataset.go); focusNode(b.dataset.go, 0.7); }));
  p.querySelectorAll("[data-rec]").forEach((b) => (b.onclick = () => {
    const r = I.recurring[+b.dataset.rec], ids = [...(r.sessions ?? []), ...(r.scenes ?? []), ...D.sessions.filter((s) => r.prs?.some((x) => s.prs.includes(x))).map((s) => s.id)];
    $$(".n.hl").forEach((e) => e.classList.remove("hl")); ids.forEach((id) => nodes.get(id)?.el.classList.add("hl"));
    const bs = ids.map((id) => nodes.get(id)).filter(Boolean);
    if (bs.length) { const b = { x0: Math.min(...bs.map((n) => n.cur.x)), y0: Math.min(...bs.map((n) => n.cur.y)), x1: Math.max(...bs.map((n) => n.cur.x + n.cur.w)), y1: Math.max(...bs.map((n) => n.cur.y + 160)) }; flyTo(camFor(b, 160)); }
  }));
}

// ---------- minimap
function drawMini() {
  const cv = $("#mini"), g = cv.getContext("2d"), b = bounds(), w = cv.width, h = cv.height;
  const k = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)) * 0.92, ox = (w - (b.x1 - b.x0) * k) / 2, oy = (h - (b.y1 - b.y0) * k) / 2;
  const mx = (x) => ox + (x - b.x0) * k, my = (y) => oy + (y - b.y0) * k;
  g.clearRect(0, 0, w, h);
  for (const n of nodes.values()) {
    if (n.cur.o < 0.3 || n.kind === "axis") continue;
    const c = n.kind === "session" ? col(n.data.stream) : n.kind === "scene" ? "#e8e2d4" : n.kind === "stream" ? col(n.data.id) : "#777";
    g.globalAlpha = n.el.classList.contains("unborn") ? 0.25 : 0.9; g.fillStyle = c;
    g.fillRect(mx(n.cur.x), my(n.cur.y), Math.max(2, n.cur.w * k), Math.max(2, (n.kind === "scene" ? 220 : 140) * k));
  }
  g.globalAlpha = 1; g.strokeStyle = getComputedStyle(root).getPropertyValue("--ink"); g.lineWidth = 1.5;
  const vx0 = -S.cam.x / S.cam.k, vy0 = -S.cam.y / S.cam.k;
  g.strokeRect(mx(vx0), my(vy0), (innerWidth / S.cam.k) * k, (innerHeight / S.cam.k) * k);
  cv._map = { b, k, ox, oy };
}
$("#mini").addEventListener("click", (e) => {
  const { b, k, ox, oy } = e.currentTarget._map, r = e.currentTarget.getBoundingClientRect();
  const wx = b.x0 + (e.clientX - r.left - ox) / k, wy = b.y0 + (e.clientY - r.top - oy) / k;
  flyTo({ k: S.cam.k, x: innerWidth / 2 - wx * S.cam.k, y: innerHeight / 2 - wy * S.cam.k }, 500);
});

// ---------- film <-> canvas: the playing scene glows where it sits
function wireFilm() {
  const v = $("#film"); if (!v || !M.film.src) return;
  v.addEventListener("timeupdate", () => {
    const t = v.currentTime, c = D.scenes.find((s) => t >= s.t0 && t < s.t1);
    $$(".n-scene.playing").forEach((e) => e.classList.remove("playing")); $$(".filmbar i.on").forEach((e) => e.classList.remove("on"));
    if (c) { nodes.get(c.id).el.classList.add("playing"); $(`.filmbar i[data-scene="${c.id}"]`)?.classList.add("on"); }
  });
  $$(".filmbar i").forEach((i) => i.addEventListener("click", (e) => { e.stopPropagation(); const c = SCENE.get(i.dataset.scene); v.currentTime = c.t0 + 0.05; v.play(); }));
  // hover a scene card: preview its slice of the film in place
  $$(".n-scene").forEach((el) => {
    let pv = null;
    el.addEventListener("pointerenter", () => {
      if (world.dataset.lod === "far") return;
      const c = SCENE.get(el.dataset.id); pv = document.createElement("video"); pv.src = M.film.src; pv.muted = true; pv.playsInline = true; pv.className = "pv";
      pv.currentTime = c.t0; pv.ontimeupdate = () => { if (pv.currentTime >= c.t1) pv.currentTime = c.t0; }; el.querySelector(".frame").appendChild(pv); pv.play().catch(() => {});
    });
    el.addEventListener("pointerleave", () => { pv?.remove(); pv = null; });
  });
  // hover a session: show its tethers
  $$(".n-session").forEach((el) => { el.addEventListener("pointerenter", () => { S.hot = el.dataset.id; drawWires(); }); el.addEventListener("pointerleave", () => { S.hot = null; drawWires(); }); });
}

// ---------- controls
$$(".m-seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("#lens").onclick = () => { S.lens = !S.lens; $("#lens").classList.toggle("on", S.lens); renderInsights(); };
$("#follow").onclick = () => { S.follow = !S.follow; $("#follow").classList.toggle("on", S.follow); };
$("#play").onclick = () => play();
$("#live").onclick = () => goLive();
$$(".m-speed button").forEach((b) => (b.onclick = () => { S.speed = +b.dataset.speed; $$(".m-speed button").forEach((x) => x.classList.toggle("on", x === b)); }));
$("#theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); drawMini(); };
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  const k = e.key;
  if (k === "1") setMode("bs"); else if (k === "2") setMode("pm");
  else if (k === "i") $("#lens").click(); else if (k === "g") $("#follow").click(); else if (k === "l") goLive();
  else if (k === " ") { e.preventDefault(); play(); } else if (k === "f") fit(); else if (k === "t") $("#theme").click();
  else if (k === "Escape") { select(null); $$(".n.hl").forEach((x) => x.classList.remove("hl")); home(); }
  else if (k === "h") home();
  else if (k === "ArrowRight") setT(S.T + 10, { fire: true }); else if (k === "ArrowLeft") setT(S.T - 10);
});
addEventListener("resize", () => { drawScrub(); renderTime(); });

// boot
build();
if (S.mode !== "bs" && S.mode !== "pm") S.mode = "pm";
const q = new URLSearchParams(location.search);
if (q.get("mode")) S.mode = q.get("mode") === "brainstorm" || q.get("mode") === "bs" ? "bs" : "pm";
root.dataset.mode = S.mode; $$(".m-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode));
for (const n of nodes.values()) { n.cur = { ...n.pos[S.mode] }; place(n); }
$$(".m-speed button").forEach((b) => b.classList.toggle("on", +b.dataset.speed === S.speed));
wireFilm(); drawScrub();
if (q.get("t")) { const [h, m] = q.get("t").split(":").map(Number); S.T = h * 60 + m; }
renderTime();
requestAnimationFrame(() => { home(false); if (q.get("lens")) $("#lens").click(); const h = decodeURIComponent(location.hash.slice(1)); if (h && nodes.has(h)) { select(h); focusNode(h); } if (q.get("play")) play(true); if (q.get("follow")) $("#follow").click(); });
window.__mission = { S, nodes, setMode, setT, select, fit, home, play };
