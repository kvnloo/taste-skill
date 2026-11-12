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
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let EPOCH = new Date(2026, 10, 11); // replaced by mission.epoch on load; times are minutes since its local midnight
const dayOf = (m) => new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate() + Math.floor(m / 1440));
const hhmm = (m) => { m = Math.max(0, m); const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60), s = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; return WIN.multi ? `${DOW[dayOf(m).getDay()]} ${s}` : s; };
const dur = (x) => { const m = Math.round(x); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
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
let { data: D0, src: SRC, url: URL_ } = await load(), D = D0;
$("#srcbadge").textContent = `${SRC} · ${D.generatedAt?.slice(0, 16).replace("T", " ") ?? ""}`;
const M = D0.mission; if (M.epoch) { const [y, mo, d] = M.epoch.split("-").map(Number); EPOCH = new Date(y, mo - 1, d); }
M.today ??= 0; M.projectStart ??= M.dayStart;
const STREAM = new Map(D.streams.map((s) => [s.id, s])), SCENE = new Map(D.scenes.map((s) => [s.id, s]));
let SES = new Map(D0.sessions.map((s) => [s.id, s]));
const col = (streamId) => STREAM.get(streamId)?.color ?? "#999";
const PRS = new Map(D0.prs.map((p) => [p.n, p]));

// ---------- time window: today / week / project / custom, all cut from one snapshot
const WIN = { id: "today", a: M.dayStart, b: M.now, multi: false };
const dateMin = (iso) => { const [y, mo, d] = iso.split("-").map(Number); return Math.round((new Date(y, mo - 1, d) - EPOCH) / 60000); };
function spanFor(id, from, to) {
  if (id === "week") return [Math.max(M.projectStart, M.now - 7 * 1440), M.now];
  if (id === "project") return [M.projectStart, M.now];
  if (id === "custom" && from) return [Math.max(M.projectStart, dateMin(from)), Math.min(M.now, to ? dateMin(to) + 1440 : M.now)];
  return [M.dayStart, M.now];
}
function windowed(id, from, to) {
  const [a, b] = spanFor(id, from, to);
  Object.assign(WIN, { id, a, b, multi: b - a > 1440 || Math.floor(a / 1440) !== Math.floor(M.today / 1440) });
  const inW = (t) => t >= a && t <= b, I = D0.insights ?? {}, day = I.day ?? [M.today, M.today + 1440], hasDay = a < day[1] && b > day[0];
  const sessions = D0.sessions.filter((s) => s.start <= b && (s.outcome === "running" ? M.now : s.end) >= a), ids = new Set(sessions.map((s) => s.id));
  const streams = D0.streams.filter((st) => sessions.some((s) => s.stream === st.id));
  return { ...D0, streams, sessions, events: D0.events.filter((e) => inW(e.t)), prs: D0.prs.filter((p) => inW(p.t)), versions: D0.versions.filter((v) => inW(v.t)),
    renders: (D0.renders ?? []).filter((r) => inW(r.t) && (r.session == null || ids.has(r.session))), commits: (D0.commits ?? []).filter((c) => inW(c.t)), ideas: hasDay ? D0.ideas : [],
    insights: { ...I, patterns: hasDay ? I.patterns : [], recurring: (I.recurring ?? []).filter((r) => !r.sessions || r.sessions.some((x) => ids.has(x))), duplicates: sessions.filter((s) => s.outcome === "duplicate").map((s) => ({ session: s.id, label: s.label })),
      rot: sessions.filter((s) => s.handoffs).sort((x, y) => y.reorient - x.reorient || y.msgs - x.msgs).slice(0, 10).map((s) => ({ session: s.id, handoffs: s.handoffs, msgs: s.msgs })),
      churn: Object.entries(sessions.flatMap((s) => s.scenes).reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {})).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([scene, n]) => ({ scene, sessions: n })) } };
}

// ---------- state
const S = {
  mode: localStorage.getItem("mission-mode") ?? "pm", lens: false, follow: false, live: false,
  T: M.now, playing: false, speed: 15, sel: null, cam: { x: 0, y: 0, k: 0.3 },
};

// ---------- time scale for the roadmap (piecewise: the night is short, the afternoon push is wide)
// Data-driven: the window is cut into buckets, each as wide as the work in it (tool calls, chats spawned, renders), so quiet
// nights and empty days fold away and the busy hours get the room. Rebuilt whenever the window changes.
let KNOTS = [[0, 0], [1, 1]];
// a day label's tally: chats started that day and their agent time
function dayStat(t) {
  const ss = D.sessions.filter((s) => s.start >= t && s.start < t + 1440 && !s.continues), a = ss.reduce((x, s) => x + (s.active ?? 0), 0);
  return ss.length ? `<small>${ss.length} chats · ${dur(a)}</small>` : "";
}
function makeScale() {
  const span = WIN.b - WIN.a, bs = span <= 2 * 1440 ? 15 : span <= 10 * 1440 ? 60 : 360, n = Math.max(1, Math.ceil(span / bs)), act = new Float32Array(n);
  for (const s of D.sessions) { s.spark.forEach((v, i) => { const k = Math.floor((s.spark0 + i * 5 - WIN.a) / bs); if (k >= 0 && k < n) act[k] += v; }); const k = Math.floor((s.start - WIN.a) / bs); if (k >= 0 && k < n) act[k] += 25; }
  const w = [...act].map((v) => 4 + Math.sqrt(v) * 14), tot = w.reduce((x, y) => x + y, 0), TW = clamp(D.sessions.length * 105, 5400, 60000);
  KNOTS = [[WIN.a, 0]]; let x = 0; w.forEach((v, i) => { x += (v / tot) * TW; KNOTS.push([WIN.a + Math.min(span, (i + 1) * bs), x]); });
}
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
  // at most 40 bars: chats that span days would otherwise carry thousands of 5-minute rects
  const g = Math.max(1, Math.ceil(s.spark.length / 40)), a = [];
  for (let i = 0; i < s.spark.length; i += g) a.push(s.spark.slice(i, i + g).reduce((x, y) => x + y, 0));
  const mx = Math.max(1, ...a);
  const bw = w / Math.max(a.length, 1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${a.map((v, i) => `<rect data-b="${s.spark0 + i * 5 * g}" x="${(i * bw).toFixed(1)}" y="${(h - (v / mx) * h).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${((v / mx) * h).toFixed(1)}"/>`).join("")}</svg>`;
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
  ${costHtml(s)}${s.renders ? `<span class="rbadge" title="${s.renders} full renders">⟳ ${s.renders}</span>` : ""}
  <span class="dupb" hidden>×2</span><span class="warn" hidden>⚠</span>`;
}
// where a chat's wall time went: tool time by kind, the rest is the model thinking/writing
const COST = { render: ["Rendering", "#e8a33d"], encode: ["Encoding", "#c98a2e"], probe: ["Frame probes", "#d9b36a"], vision: ["Vision checks", "#c58cff"], capture: ["Captures", "#9b7bd6"],
  wait: ["Polling / sleep", "#d6453d"], ci: ["CI waits", "#e46a5e"], test: ["Tests", "#4fd1a5"], build: ["Builds", "#3fae8a"], shell: ["Shell", "#8f8a80"], edit: ["Edits", "#6fb3ff"],
  read: ["Reading", "#9cc8ff"], delegate: ["Delegating", "#ff7a9c"], other: ["Other tools", "#b5aea0"], think: ["Model turns", "#5b5750"] };
function costOf(s) { const c = { ...(s.cost ?? {}) }, tool = Object.values(c).reduce((a, b) => a + b, 0); c.think = Math.max(0, (s.active ?? 0) - tool); return c; }
function costHtml(s) {
  const c = costOf(s), tot = Object.values(c).reduce((a, b) => a + b, 0); if (!tot) return "";
  return `<div class="cost" title="${Object.entries(c).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${COST[k]?.[0] ?? k} ${dur(v)}`).join(" · ")}">${Object.entries(c).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<i style="flex:${v};background:${COST[k]?.[1] ?? "#999"}"></i>`).join("")}<b>${dur(tot)}</b></div>`;
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
  makeScale();
  const hours = []; let lastHx = -1e9;
  // midnights first (multi-day), then hours wherever there is room: busy hours get labels, folded nights don't
  const cand = []; for (let h = Math.ceil(WIN.a / 60); h * 60 <= WIN.b; h++) cand.push(h * 60);
  for (const t of WIN.multi ? cand.filter((t) => t % 1440 === 0) : []) if (!hours.some((u) => Math.abs(X(u) - X(t)) < 110)) hours.push(t);
  for (const t of cand) if (!hours.some((u) => Math.abs(X(u) - X(t)) < 150)) hours.push(t);
  hours.sort((p, q) => p - q); void lastHx;
  const MS = M.milestones.filter((m) => m.t >= WIN.a && m.t <= WIN.b);
  let msLast = [], msRows = MS.map((m) => { const x = X(m.t); let r = 0; while (msLast[r] != null && x - msLast[r] < 420) r++; msLast[r] = x; return r; });
  S._dayK = null; // new day ticks: re-run the label spacing on the next camera apply
  node("axis", "axis", `<div class="hours">${hours.map((t) => `<i class="${t % 1440 === 0 ? "day" : ""}" style="left:${X(t) - X(WIN.a)}px">${t % 1440 === 0 && WIN.multi ? `${DOW[dayOf(t).getDay()]} ${dayOf(t).getMonth() + 1}/${dayOf(t).getDate()}${dayStat(t)}` : hhmm(t)}</i>`).join("")}</div>
    ${MS.map((m, i) => `<div class="ms ${m.hard ? "hard" : ""}" style="left:${X(m.t) - X(WIN.a)}px;top:${-msRows[i] * 64}px"><span>◆</span><b>${esc(m.label)}</b><em>${hhmm(m.t)}</em></div>`).join("")}
    <div class="nowline"></div>`);
  nodes.get("axis").cur.w = X(WIN.b) - X(WIN.a) + 200;
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
  const x0 = X(WIN.a), axW = X(WIN.b) - x0 + 200;
  const P = (n, x, y, w, o = 1) => { if (n) n.pos.pm = { x, y, w: w ?? n.cur.w, o }; };
  P(nodes.get("goal"), -1260, -40, 560);
  P(nodes.get("film"), -1260, 640, 560);
  P(nodes.get("axis"), 0, 0, axW);
  // storyboard strip, aligned to the afternoon (where the cut was made)
  const sx = clamp(X(M.today + 14 * 60 + 20) - x0, 0, Math.max(0, axW - D.scenes.length * 260));
  D.scenes.forEach((c, i) => P(nodes.get(c.id), sx + i * 260, 170, 240));
  // cut lineage on the time axis, between the strip and the lanes
  let lastX = -1e9, row = 0;
  for (const v of D.versions) { const x = X(v.t) - x0; row = x - lastX < 170 ? (row + 1) % 3 : 0; lastX = x; P(nodes.get(`v:${v.id}`), x, 520 + row * 70, 150); }
  // swimlanes
  S.renderY = 740; // render strip: every full-film render as a tick on the roadmap
  let y = 830;
  for (const st of D.streams) {
    const list = D.sessions.filter((s) => s.stream === st.id).sort((a, b) => a.start - b.start);
    const rows = [];
    for (const s of list) {
      const s0 = Math.max(s.start, WIN.a), x = X(s0) - x0, w = clamp(X(Math.min(s.end, WIN.b)) - X(s0), 268, 560); // chats carried in from before the window start at its edge
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
  root.style.setProperty("--invf", String(clamp(1 / k, 1, 40))); world.dataset.vfar = k < 0.12 ? "1" : ""; // day labels stay legible on a week overview
  // a day label too close to the next one (on screen) drops its text and keeps its line; the busier day wins the space
  if (k !== S._dayK) { S._dayK = k; const ds = [...document.querySelectorAll(".hours i.day")], gap = 170 / k;
    ds.forEach((e, i) => { const nx = ds[i + 1]; e.classList.toggle("tight", !!nx && parseFloat(nx.style.left) - parseFloat(e.style.left) < gap); }); }
  const lod = k < 0.32 ? "far" : k < 0.75 ? "mid" : "near";
  if (world.dataset.lod !== lod) { world.dataset.lod = lod; for (const n of nodes.values()) n.h = null; }
  drawMini();
}
function bounds(mode = S.mode) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes.values()) { const p = n.pos[mode]; if (!p || p.o < 0.5) continue; const h = (n.h ??= n.el.offsetHeight) || 150, w = n.kind === "axis" ? nodes.get("axis").cur.w : p.w; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + w); y1 = Math.max(y1, p.y + h); }
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
// phone: never open below a legible zoom (titles >= ~10px); Product keeps the newest work in view, Brainstorm the sun
const PHONE_K = 0.3, phone = () => innerWidth <= 760;
function home(anim = true) {
  let c;
  if (S.mode !== "pm") {
    c = camFor(bounds()); const g = nodes.get("goal");
    if (phone() && g) { const p = g.pos[S.mode], h = (g.h ??= g.el.offsetHeight), k = Math.min(0.5, (innerWidth - 32) / p.w); c = { k, x: innerWidth / 2 - (p.x + p.w / 2) * k, y: 130 + (innerHeight - 220) / 2 - (p.y + h / 2) * k }; }
  }
  else {
    // one day opens on the latest push (legible cards); a multi-day window on all of it (day labels, lanes, render strip)
    const x0 = X(WIN.a), xr = X(WIN.b) - x0 + 240, b = { x0: WIN.multi ? -440 : Math.max(-440, xr - 3200), x1: xr, y0: -150, y1: 1820 };
    c = camFor(b, 40);
    if (phone() && !WIN.multi && c.k < PHONE_K) c = { k: PHONE_K, x: innerWidth - 16 - xr * PHONE_K, y: 128 - b.y0 * PHONE_K };
  }
  anim ? flyTo(c) : ((S.cam = c), applyCam());
}
function focusNode(id, zoom = 0.9) {
  const n = nodes.get(id); if (!n) return;
  const w = n.cur.w, h = n.el.offsetHeight;
  // the open drawer is a side panel on desktop and a bottom sheet on phones: centre the card in what's left
  const sheet = $("#drawer:not([hidden])")?.getBoundingClientRect().top ?? innerHeight, dx = S.sel && !phone() ? 180 : 0, cy = S.sel && phone() ? (132 + sheet) / 2 : innerHeight / 2;
  if (S.sel && phone()) zoom = Math.min(zoom, (sheet - 132 - 16) / h, (innerWidth - 24) / w);
  flyTo({ k: zoom, x: innerWidth / 2 - (n.cur.x + w / 2) * zoom - dx, y: cy - (n.cur.y + h / 2) * zoom });
}

// pan / zoom (one pointer pans, two pointers pinch-zoom about their midpoint)
let drag = null, pinch = null;
const touches = new Map();
const zoomAt = (cx, cy, k) => { k = clamp(k, 0.04, 2.5); const r = k / S.cam.k; S.cam.x = cx - (cx - S.cam.x) * r; S.cam.y = cy - (cy - S.cam.y) * r; S.cam.k = k; applyCam(); };
const pinchState = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("a, button, video, .n-film")) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);
  if (touches.size === 2) { cancelAnimationFrame(flight); pinch = { ...pinchState(), k: S.cam.k }; if (drag) drag.moved = true; return; }
  drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: false, node: e.target.closest(".n") };
});
stage.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2) {
    const p = pinchState(); S.cam.x += p.mx - pinch.mx; S.cam.y += p.my - pinch.my;
    zoomAt(p.mx, p.my, pinch.k * p.d / pinch.d); pinch.mx = p.mx; pinch.my = p.my; stage.classList.add("panning"); return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > (e.pointerType === "touch" ? 8 : 4)) drag.moved = true;
  if (drag.moved) { S.cam.x = drag.cx + dx; S.cam.y = drag.cy + dy; applyCam(); stage.classList.add("panning"); }
});
const release = (e) => {
  touches.delete(e.pointerId);
  if (pinch) { if (touches.size < 2) pinch = null; if (!touches.size) { drag = null; stage.classList.remove("panning"); } else { const [q] = touches.values(); drag = { x: q.x, y: q.y, cx: S.cam.x, cy: S.cam.y, moved: true }; } return; }
  stage.classList.remove("panning");
  if (e.type === "pointerup" && drag && !drag.moved) { const n = drag.node; if (n) { select(n.dataset.id); if (phone() && n.getBoundingClientRect().top + 40 > $("#drawer").getBoundingClientRect().top) focusNode(n.dataset.id, Math.max(S.cam.k, 0.5)); } else select(null); }
  drag = null;
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("wheel", (e) => {
  e.preventDefault(); cancelAnimationFrame(flight);
  zoomAt(e.clientX, e.clientY, S.cam.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
}, { passive: false });

// ---------- wires (SVG in world space)
const svg = $("#wires");
function anchor(id, side) {
  const n = nodes.get(id); if (!n) return null;
  const h = (n.h ??= n.el.offsetHeight) || 140, w = n.cur.w;
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
    const x0 = X(WIN.a), xe = X(WIN.b) - x0 + 200;
    for (const st of D.streams) { const sn = nodes.get(`st:${st.id}`); if (sn.laneY != null) out.push(`<rect class="lane" x="-440" y="${sn.laneY - 18}" width="${xe + 520}" height="${sn.laneH}" rx="22" style="--c:${st.color}"/>`); }
    const dl = X(M.deadline) - x0, nw = X(S.T) - x0;
    if (M.deadline >= WIN.a && M.deadline <= WIN.b) out.push(`<line class="deadline" x1="${dl}" y1="-20" x2="${dl}" y2="${S.pmLanesBottom}"/><text class="dlt" x="${dl + 10}" y="${S.pmLanesBottom - 20}">DEADLINE ${hhmm(M.deadline)}</text>`);
    // render strip: one tick per full render, red when nothing new from you since that chat's last render
    const R = D.renders ?? [], ry = S.renderY;
    out.push(`<text class="rlab" x="-430" y="${ry + 30}">RENDERS · ${R.length}</text><text class="rlab sub" x="-430" y="${ry + 58}">${R.filter((r) => !r.reviewed).length} with no new feedback</text><rect class="rband" x="-440" y="${ry - 6}" width="${xe + 520}" height="76" rx="18"/>`);
    for (const r of R) { if (r.t > S.T) continue; const a = X(r.t) - x0, w = Math.max(3, X(r.t + r.d) - X(r.t)); out.push(`<rect class="rtick ${r.reviewed ? "ok" : "waste"} ${S.retroHl?.has(r.session) ? "hl" : ""}" data-s="${r.session}" x="${a}" y="${ry + (r.concurrent ? 0 : 20)}" width="${w}" height="${r.concurrent ? 64 : 24}" rx="2"><title>${hhmm(r.t)} · ${dur(r.d)} · ${esc(SES.get(r.session)?.label ?? "")}${r.reviewed ? "" : " · no new feedback since the last render"}${r.concurrent ? ` · ${r.concurrent} other render(s) at once` : ""}</title></rect>`); }
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
let EV = D.events;
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
  const prev = S.T; S.T = clamp(T, WIN.a, WIN.b); 
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
  const head = $("#head"), w = $("#scrub").clientWidth; head.style.left = `${((T - WIN.a) / (WIN.b - WIN.a)) * w}px`;
  $("#live").classList.toggle("on", S.live && T >= M.now - 0.5);
  document.title = `Taste · Mission · ${running.length} live`;
  drawWires(); drawMini();
}

// play loop
let raf = null, lastFrame = 0;
function play(on = !S.playing) {
  S.playing = on; $("#play").textContent = on ? "❚❚" : "▶"; $("#play").classList.toggle("on", on);
  if (on && S.T >= WIN.b - 0.1) { setT(WIN.a); $("#ticker").innerHTML = ""; }
  if (on) { S.live = false; lastFrame = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
}
function tick(now) {
  const dt = (now - lastFrame) / 1000; lastFrame = now;
  setT(S.T + dt * S.speed, { fire: true });
  if (S.T >= WIN.b) { play(false); return; }
  raf = requestAnimationFrame(tick);
}

// scrubber: event ticks + a tool-call trace by stream
function drawScrub() {
  const el = $("#scrub"), w = el.clientWidth, h = el.clientHeight;
  const span = WIN.b - WIN.a, xt = (t) => ((t - WIN.a) / span) * w;
  $("#ticks").innerHTML = [
    ...M.milestones.filter((m) => m.t >= WIN.a && m.t <= WIN.b).map((m) => `<i class="ms ${m.hard ? "hard" : ""}" style="left:${xt(m.t)}px" title="${esc(m.label)} ${hhmm(m.t)}"></i>`),
    ...D.versions.map((v) => `<i class="ver" style="left:${xt(v.t)}px" title="Cut ${esc(v.id)}"></i>`),
    ...(D.renders ?? []).map((r) => `<i class="rnd ${r.reviewed ? "" : "waste"}" style="left:${xt(r.t)}px"></i>`), ...D.prs.filter((p) => p.state === "MERGED").map((p) => `<i class="pr" style="left:${xt(p.t)}px" title="#${p.n}"></i>`),
  ].join("");
  const cv = $("#trace"), dpr = devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const bsz = Math.max(5, Math.ceil(span / 400 / 5) * 5), B = Math.ceil(span / bsz), stacks = D.streams.map((st) => { const a = new Float32Array(B); for (const s of D.sessions) if (s.stream === st.id) s.spark.forEach((v, i) => { const b = Math.floor((s.spark0 + i * 5 - WIN.a) / bsz); if (b >= 0 && b < B) a[b] += v; }); return [st, a]; });
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
const scrubAt = (e) => { const r = scrubEl.getBoundingClientRect(); S.live = false; setT(WIN.a + clamp((e.clientX - r.left) / r.width, 0, 1) * (WIN.b - WIN.a)); };
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
  D0 = nd; Object.assign(M, nd.mission); SES = new Map(nd.sessions.map((s) => [s.id, s])); PRS.clear(); nd.prs.forEach((p) => PRS.set(p.n, p));
  applySpan(WIN.id, S.from, S.to, { keepCam: true });
}
// switch the window: re-cut the snapshot, rebuild both layouts, re-run the retro
function applySpan(id, from, to, { keepCam = false } = {}) {
  S.from = from; S.to = to; D = windowed(id, from, to); EV = D.events;
  const cam = { ...S.cam }; build(); setMode(S.mode, { animate: false }); wireFilm(); drawScrub(); setT(WIN.b); renderInsights();
  if (keepCam) { S.cam = cam; applyCam(); }
  applySpanUi();
  const q = new URLSearchParams(location.search); id === "today" ? q.delete("span") : q.set("span", id); if (id === "custom") { q.set("from", from); to ? q.set("to", to) : q.delete("to"); } else { q.delete("from"); q.delete("to"); }
  history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}${location.hash}`);
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
  if (!S.lens) { S.retroHl = null; $$(".n.hl").forEach((e) => e.classList.remove("hl")); }
  drawWires();
  if (!S.lens) return;
  const R = retro(), subs = D.sessions.filter((s) => s.subagent).length;
  const cats = Object.entries(R.cats).filter(([, v]) => v >= 1).sort((x, y) => y[1] - x[1]), ctot = cats.reduce((x, [, v]) => x + v, 0) || 1, top = R.sinks[0]?.min || 1;
  p.innerHTML = `<span class="kicker">Retro · ${esc({ today: "today", week: "last 7 days", project: "whole project", custom: "custom range" }[WIN.id])} · from the event trace</span><h2>Where the time went</h2>
    <div class="kpis"><div><b>${D.sessions.filter((s) => !s.continues).length}</b><span>chats · +${D.sessions.filter((s) => s.continues).length} after handoffs · ${subs} sub</span></div><div><b>${dur(R.active)}</b><span>agent time · ${dur(R.wall)} with a chat open</span></div><div><b>${R.passes}</b><span>render passes · ${R.eq.toFixed(1)}× the cut</span></div><div><b>${D.prs.filter((x) => x.state === "MERGED").length + (D.commits ?? []).length}</b><span>PRs + commits</span></div></div>
    <section><h4>Agent time by activity</h4><div class="catbar">${cats.map(([k, v]) => `<i style="flex:${v};background:${COST[k][1]}" title="${COST[k][0]} ${dur(v)}"></i>`).join("")}</div>
      <div class="catkey">${cats.slice(0, 8).map(([k, v]) => `<span><i style="background:${COST[k][1]}"></i>${COST[k][0]} <b>${dur(v)}</b> ${Math.round((v / ctot) * 100)}%</span>`).join("")}</div></section>
    <section><h4>Time sinks · ranked</h4>${R.sinks.map((k, i) => `<button class="sink sev-${k.sev}" data-sink="${i}"><span class="bar" style="--w:${(k.min / top) * 100}%"></span><b>${dur(k.min)}</b><span class="what">${esc(k.name)}<em>${esc(k.why)}</em><strong>${esc(k.fix)}</strong></span></button>`).join("") || `<p class="dim">Nothing stands out in this window.</p>`}</section>
    ${(I.recurring ?? []).length ? `<section><h4>Recurring failures</h4>` : "<section hidden>"}${(I.recurring ?? []).map((r, i) => `<button class="rec" data-rec="${i}"><b>${r.count}×</b><span>${esc(r.name)}<em>${esc(r.fix)}</em></span></button>`).join("")}</section>
    ${(I.churn ?? []).length ? "<section><h4>Scene churn</h4>" : "<section hidden>"}${(I.churn ?? []).map((c) => { const sc = SCENE.get(c.scene); return `<button class="sesrow" data-go="${c.scene}"><img src="${sc.thumb}" alt="">${c.scene.replace("s", "S")} ${esc(sc.name)}<em>${c.sessions} chats · ${sc.state}</em></button>`; }).join("")}</section>
    <section><h4>Context rot</h4><p class="dim">Chats that hit the context cap and were handed off: long chats lose the thread.</p>${(I.rot ?? []).map((r) => { const s = SES.get(r.session); return s ? `<button class="sesrow" data-go="${s.id}"><i style="background:${col(s.stream)}"></i>${esc(s.label)}<em>${r.msgs} msgs · ${"●".repeat(r.handoffs)}</em></button>` : ""; }).join("")}</section>
    ${(I.patterns ?? []).length ? `<section><h4>Patterns</h4>${I.patterns.map((x) => `<p class="pat">${esc(x)}</p>`).join("")}</section>` : ""}`;
  p.querySelectorAll("[data-sink]").forEach((b) => (b.onclick = () => { const k = R.sinks[+b.dataset.sink]; $$(".sink.on").forEach((x) => x.classList.remove("on")); b.classList.add("on"); if (phone()) { p.classList.add("peek"); p.scrollTop = b.offsetTop - 12; } highlight(k.sessions); }));
  // phone: a picked sink folds the sheet to a peek so its chats show above it; tapping the peek unfolds it
  p._peek ||= (p.addEventListener("click", (e) => { if (p.classList.contains("peek")) { p.classList.remove("peek"); e.stopPropagation(); } }, { capture: true }), true);
  p.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { select(b.dataset.go); focusNode(b.dataset.go, 0.7); }));
  p.querySelectorAll("[data-rec]").forEach((b) => (b.onclick = () => {
    const r = I.recurring[+b.dataset.rec], ids = [...(r.sessions ?? []), ...(r.scenes ?? []), ...D.sessions.filter((s) => r.prs?.some((x) => s.prs.includes(x))).map((s) => s.id)];
    highlight(ids);
  }));
}
function highlight(ids) {
  $$(".n.hl").forEach((e) => e.classList.remove("hl")); ids.forEach((id) => nodes.get(id)?.el.classList.add("hl"));
  S.retroHl = new Set(ids); drawWires();
  const bs = ids.map((id) => nodes.get(id)).filter((n) => n && n.cur.o > 0.5);
  if (bs.length) { const b = { x0: Math.min(...bs.map((n) => n.cur.x)), y0: Math.min(...bs.map((n) => n.cur.y)), x1: Math.max(...bs.map((n) => n.cur.x + n.cur.w)), y1: Math.max(...bs.map((n) => n.cur.y + 190)) };
    if (!phone()) flyTo(camFor(b, 160));
    else { const top = 132, bot = innerHeight - (($("#insights:not([hidden])")?.getBoundingClientRect().top) ?? innerHeight - 90) + 12, k = clamp(Math.min((innerWidth - 32) / (b.x1 - b.x0), (innerHeight - top - bot) / (b.y1 - b.y0)), 0.04, 0.9);
      flyTo({ k, x: innerWidth / 2 - ((b.x0 + b.x1) / 2) * k, y: top + (innerHeight - top - bot) / 2 - ((b.y0 + b.y1) / 2) * k }); } }
}
// wall-clock minutes (inside the window) with at least one chat open: the union of chat spans
function wallOf(SS) {
  const iv = SS.map((s) => [Math.max(WIN.a, s.start), Math.min(WIN.b, s.outcome === "running" ? M.now : s.end)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let t = 0, a = -Infinity, b = -Infinity;
  for (const [x, y] of iv) { if (x > b) { t += b - a > 0 ? b - a : 0; a = x; b = y; } else b = Math.max(b, y); }
  return t + (b - a > 0 ? b - a : 0);
}
// ---------- retro: rank the window's time sinks from per-chat cost accounting (builder) and the render log
function retro() {
  const SS = D.sessions, RR = D.renders ?? [], R0 = { wall: wallOf(SS) }, sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0), ids = (xs) => [...new Set(xs.map((x) => x.session ?? x.id))];
  const cats = {}; for (const s of SS) for (const [k, v] of Object.entries(costOf(s))) cats[k] = (cats[k] ?? 0) + v;
  const sinks = [], add = (o) => o.min >= 1 && sinks.push(o);
  // renders: one pass = a chat's back-to-back jobs (chunks of one cut). Compute is cheap; the loop around each
  // unreviewed pass (frame probes, vision checks, encodes in the chat that launched it) is the sink.
  const cut = D.fullCut || Math.max(1, ...RR.map((r) => r.total ?? 1)), passes = Object.values(RR.reduce((m, r) => ((m[r.pass ?? r.t] ??= []).push(r), m), {}));
  const wasteP = passes.filter((p) => !p[0].reviewed), eq = (xs) => sum(xs, (r) => r.frames ?? cut) / cut;
  const loopOf = (sid) => { const s = SES.get(sid), c = s?.cost ?? {}, mine = passes.filter((p) => p[0].session === sid); return s && mine.length ? ((c.probe ?? 0) + (c.vision ?? 0) + (c.encode ?? 0)) * (mine.filter((p) => !p[0].reviewed).length / mine.length) : 0; };
  const wasteIds = ids(wasteP.flat()).filter(Boolean), full = RR.filter((r) => (r.frames ?? 0) >= cut * 0.95);
  add({ name: `${wasteP.length} of ${passes.length} render passes had no new feedback`, min: sum(wasteP.flat(), (r) => r.d) + sum(wasteIds, loopOf), sessions: wasteIds, sev: 3,
    why: `${WIN.multi ? "From the render logs still on disk (older ones were overwritten). " : ""}${RR.length} render jobs drew the cut ${eq(RR).toFixed(1)}× over (${eq(wasteP.flat()).toFixed(1)}× before you had said anything new). ${full.length ? `A whole cut renders in ~${Math.round(sum(full, (r) => r.d * 60) / full.length)} s, so` : "So"} compute is cheap: the minutes are the probe → vision check → tweak loop after each pass.`,
    fix: `Batch edits and render once per review round (${passes.length - wasteP.length} rounds), then check that one render.` });
  const dead = RR.filter((r) => r.finished === false);
  add({ name: `${dead.length} renders died before the last frame`, min: sum(dead, (r) => r.d), sessions: ids(dead).filter(Boolean), sev: 2,
    why: "Killed, timed out or out of memory partway: those frames were thrown away.", fix: "Render under a memory cap in a background unit with notify-on-exit; resume from the last good chunk." });
  const cont = RR.filter((r) => r.concurrent);
  add({ name: `${cont.length} renders fought for the CPU`, min: sum(cont, (r) => r.d * (r.concurrent / (r.concurrent + 1))), sessions: ids(cont), sev: 2,
    why: "Renders from different chats overlapped, so each ran slower. Minutes are the share lost to the overlap (estimate).", fix: "One render queue (or the MBP via fleet-build), one render at a time." });
  const polls = SS.filter((s) => (s.cost?.wait ?? 0) + (s.cost?.ci ?? 0) >= 1);
  add({ name: "Polling, sleeping and CI waits", min: sum(SS, (s) => (s.cost?.wait ?? 0) + (s.cost?.ci ?? 0)), sessions: polls.map((s) => s.id), sev: 2,
    why: `${polls.length} chats blocked a turn on sleep loops, pgrep waits or gh run watch.`, fix: "Background the job with notify-on-exit; never sleep in the foreground." });
  // duplicates: chats you opened twice vs. loops on other profiles re-dispatching the same job
  const dupAll = SS.filter((s) => s.outcome === "duplicate"), mine = dupAll.filter((s) => (s.profile ?? "clean") === "clean" || s.curated), bots = dupAll.filter((s) => !mine.includes(s));
  add({ name: `${mine.length} duplicate chats`, min: sum(mine, (s) => s.active ?? s.end - s.start), sessions: mine.map((s) => s.id), sev: 3,
    why: "The same opening ask, started again within 3 h (or flagged in curation).", fix: "Before spawning, check the board for a live chat with the same ask and steer it instead." });
  const bp = [...new Set(bots.map((s) => s.profile))].join(", ");
  add({ name: `${bots.length} jobs re-dispatched by automation`, min: sum(bots, (s) => s.active ?? 0), sessions: bots.map((s) => s.id), sev: 2,
    why: `Loops on ${bp || "other profiles"} sent the same job again within 3 h instead of resuming the first run.`, fix: "Key each dispatch by its goal; resume or steer the open run instead of spawning a new one." });
  const rot = SS.filter((s) => s.reorient >= 1);
  add({ name: `Context rot: ${sum(SS, (s) => s.handoffs)} handoffs`, min: sum(rot, (s) => s.reorient), sessions: rot.map((s) => s.id), sev: 2,
    why: "Minutes from each handoff to the first edit after it: re-reading what the chat already knew.", fix: "Smaller asks per chat; capsules that carry the open diff, not a recap." });
  const ver = SS.filter((s) => (s.cost?.probe ?? 0) + (s.cost?.vision ?? 0) + (s.cost?.capture ?? 0) >= 2);
  add({ name: "Frame probes, captures and vision checks", min: sum(SS, (s) => (s.cost?.probe ?? 0) + (s.cost?.vision ?? 0) + (s.cost?.capture ?? 0)), sessions: ver.map((s) => s.id), sev: 1,
    why: "Proof work: needed, but often repeated on every small change.", fix: "Check once per review round, on the batched render." });
  const side = SS.filter((s) => s.stream === "ops");
  add({ name: `Side quests (${side.length} chats)`, min: sum(side, (s) => s.active ?? 0), sessions: side.map((s) => s.id), sev: 1,
    why: "Machine, memory and quota chats that ran during the push.", fix: "Park them on the board until after the deadline." });
  const waitYou = SS.filter((s) => (s.ownerWait ?? 0) >= 5);
  add({ name: `${waitYou.length} chats sat waiting on you`, min: sum(SS, (s) => s.ownerWait ?? 0), sessions: waitYou.map((s) => s.id), sev: 0,
    why: `Summed over parallel chats: the gap between a chat's last reply and your next message (each capped at 90 min). Blocked, not wasted; ${dur(R0.wall)} of wall clock had a chat open.`, fix: "Surface what each idle chat needs from you, ranked by what unblocks most." });
  sinks.sort((x, y) => y.min - x.min);
  return { sinks, cats, active: sum(SS, (s) => s.active ?? 0), wall: R0.wall, passes: passes.length, eq: eq(RR) };
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
function applySpanUi() {
  $$(".m-span button").forEach((b) => b.classList.toggle("on", b.dataset.span === WIN.id));
  const n = D.sessions.length; $("#spanInfo").textContent = `${n} chats · ${hhmm(WIN.a)} → ${hhmm(WIN.b)}`;
  const iso = (m) => { const d = dayOf(m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  for (const [id, v] of [["#from", S.from ?? iso(WIN.a)], ["#to", S.to ?? iso(WIN.b)]]) { const el = $(id); el.value = v; el.min = iso(M.projectStart); el.max = iso(M.now); }
}
$$(".m-span button").forEach((b) => (b.onclick = () => { applySpan(b.dataset.span, b.dataset.span === "custom" ? $("#from").value : null, b.dataset.span === "custom" ? $("#to").value : null); applySpanUi(); }));
$$("#from, #to").forEach((el) => (el.onchange = () => { applySpan("custom", $("#from").value, $("#to").value); applySpanUi(); }));
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
  else if (k === "i" || k === "r") $("#lens").click(); else if (k === "g") $("#follow").click(); else if (k === "l") goLive();
  else if (k === " ") { e.preventDefault(); play(); } else if (k === "f") fit(); else if (k === "t") $("#theme").click();
  else if (k === "Escape") { select(null); $$(".n.hl").forEach((x) => x.classList.remove("hl")); home(); }
  else if (k === "h") home();
  else if (k === "ArrowRight") setT(S.T + 10, { fire: true }); else if (k === "ArrowLeft") setT(S.T - 10);
});
addEventListener("resize", () => { drawScrub(); renderTime(); });

// boot
{ const q0 = new URLSearchParams(location.search); S.spanId = q0.get("span") ?? "today"; S.from = q0.get("from"); S.to = q0.get("to");
  if (S.spanId === "custom" && !S.from) S.spanId = "today"; D = windowed(S.spanId, S.from, S.to); EV = D.events; }
build();
if (S.mode !== "bs" && S.mode !== "pm") S.mode = "pm";
const q = new URLSearchParams(location.search);
if (q.get("mode")) S.mode = q.get("mode") === "brainstorm" || q.get("mode") === "bs" ? "bs" : "pm";
root.dataset.mode = S.mode; $$(".m-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode));
for (const n of nodes.values()) { n.cur = { ...n.pos[S.mode] }; place(n); }
$$(".m-speed button").forEach((b) => b.classList.toggle("on", +b.dataset.speed === S.speed));
wireFilm(); drawScrub(); applySpanUi();
if (q.get("t")) { const [h, m] = q.get("t").split(":").map(Number); S.T = clamp(Math.floor(WIN.b / 1440) * 1440 + h * 60 + m, WIN.a, WIN.b); }
renderTime();
requestAnimationFrame(() => { home(false); if (q.get("lens")) $("#lens").click(); const h = decodeURIComponent(location.hash.slice(1)); if (h && nodes.has(h)) { select(h); focusNode(h); } if (q.get("play")) play(true); if (q.get("follow")) $("#follow").click(); });
window.__mission = { S, nodes, setMode, setT, select, fit, home, play };
