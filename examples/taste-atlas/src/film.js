// Deterministic film scenes over the real Taste Atlas renderer. window.seek(t) draws frame t.
//   film.html?cut=launch   1080x1080, 18 s  (product launch: hook -> atlas -> agent -> end card)
//   film.html?cut=reel     1080x1920, 21 s  (vertical explainer: one specimen traced up its lineage)
import { createAtlas } from "./atlas.js";
import { TECHNIQUES, OPERATIONS } from "./taxonomy.js";
import { specimen, CARD } from "./specimens.js";

const cut = new URLSearchParams(location.search).get("cut") ?? "launch";
const SIZE = cut === "reel" ? [1080, 1920] : [1080, 1080];
const [W, H] = SIZE;
const stage = document.getElementById("stage");
Object.assign(stage.style, { width: W + "px", height: H + "px" });
const card = document.getElementById("card");
document.body.classList.add("cut-" + cut);
const wall = document.getElementById("wall"), fx = document.getElementById("fx");
const A = createAtlas({ svg: document.getElementById("atlas"), card, width: () => W, height: () => H });

const clamp = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = (x) => 1 - Math.pow(1 - x, 3), eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;

// Camera keyframes: [time, node id, hold]. Between keys the camera arcs (zoom dips mid-flight).
function camAt(keys, t, regions = {}) {
  const fitK = (k) => A.fit(k[1], k[2] ?? 0.8, regions[k[1]] ?? regions.default);
  let i = keys.length - 1; while (i > 0 && t < keys[i][0]) i--;
  const [t0, id0] = keys[i], next = keys[i + 1];
  const a = fitK(keys[i]);
  if (!next) return { cam: a, focus: id0 };
  const [t1, id1, pad1] = next, dur = Math.min(1.1, (t1 - t0) * 0.7), k = eio(seg(t, t1 - dur, t1));
  const b = fitK(next);
  const dip = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 1500) * 0.4;
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)) * (1 - dip * Math.sin(Math.PI * k));
  return { cam: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s, cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k) }, focus: k > 0.35 ? id1 : id0 };
}

// Specimen wall (montage). Tiles are built once; seek() only moves them.
const ALL = TECHNIQUES.flatMap((t) => t.executions);
const tiles = [];
function buildWall(cols, size, seedOrder) {
  const order = ALL.map((e, i) => [e, (i * seedOrder) % ALL.length]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const gap = 18, th = size * CARD.h / CARD.w, rows = Math.ceil((H * 2.2) / (th + gap));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const e = order[(r * cols + c) % order.length];
    const d = document.createElement("div"); d.className = "tile";
    d.innerHTML = `<svg viewBox="0 0 ${CARD.w} ${CARD.h}" preserveAspectRatio="xMidYMid slice">${specimen(e.family, e.seed, 0)}</svg>`;
    Object.assign(d.style, { width: size + "px", height: th + "px" });
    wall.appendChild(d);
    tiles.push({ d, e, c, r, x: c * (size + gap) - size * 0.35 + (r % 2) * size * 0.18, y: r * (th + gap) - 40, th });
  }
}
function drawWall(t, from, speed, alpha) {
  wall.style.opacity = alpha;
  if (alpha <= 0) return;
  for (const p of tiles) {
    const lift = (t - from) * speed + p.c * 22;
    const k = eo(seg(t, from + p.r * 0.06 + p.c * 0.04, from + 0.5 + p.r * 0.06 + p.c * 0.04));
    p.d.style.transform = `translate(${p.x}px, ${p.y - lift + (1 - k) * 60}px)`;
    p.d.style.opacity = k;
  }
}

const html = (s) => { fx.innerHTML = s; };
const tri = (k) => `opacity:${k};transform:translateY(${(1 - k) * 24}px) scale(${0.96 + 0.04 * k})`;
const typed = (s, k) => s.slice(0, Math.round(s.length * clamp(k)));
const dots = () => OPERATIONS.map((o) => `<i style="background:${o.color}"></i>`).join("");

// Graph reveal: nodes appear level by level from the centre.
function reveal(t, t0) {
  for (const [key, part] of A.parts) {
    const n = key.startsWith("e:") ? A.graph.byId.get(key.slice(2)) : part.n;
    const k = eo(seg(t, t0 + n.level * 0.22 + (n.a + Math.PI) * 0.03, t0 + 0.45 + n.level * 0.22 + (n.a + Math.PI) * 0.03));
    const el = key.startsWith("e:") ? part : part.g;
    const base = Number(el.getAttribute(key.startsWith("e:") ? "stroke-opacity" : "opacity") ?? 1);
    el.setAttribute(key.startsWith("e:") ? "stroke-opacity" : "opacity", base * k);
  }
}

const LAUNCH = {
  duration: 18,
  setup() { buildWall(5, 230, 7); },
  seek(t) {
    // 0-3.4 montage + hook callout.
    drawWall(t, 0, 70, t < 3.4 ? 1 : 0);
    const keys = [[0, "root", 0.86], [7.6, "root", 0.86], [8.4, "differentiate", 0.8], [9.2, "differentiate/feature", 0.8], [10.0, "color-isolation", 0.78], [10.8, "color-isolation--2", 0.78]];
    const { cam, focus } = camAt(keys, Math.max(t, 5.2), { root: { x: 40, y: 200, w: 1000, h: 860 }, default: { x: 400, y: 210, w: 660, h: 840 } });
    const showGraph = t >= 5.0 && t < 11.6;
    document.getElementById("atlas").style.opacity = showGraph ? 1 : 0;
    card.style.display = showGraph && t > 8.1 ? "block" : "none";
    Object.assign(card.style, { left: "48px", bottom: "48px", top: "auto", width: "340px" });
    A.render({ cam, focus, theme: "light", t, animate: true, labelScale: 1.5, cardIn: eo(seg(t, 8.1, 8.6)) });
    if (showGraph) reveal(t, 5.1);
    if (t < 3.4) {
      const k = back(seg(t, 1.0, 1.45));
      return html(`<div class="callout" style="left:110px;top:${H / 2 - 90}px;${tri(clamp(k))};transform:scale(${0.8 + 0.2 * k})">Know <em>why</em><br/>you love it.</div>`);
    }
    if (t < 5.2) {
      const a = eo(seg(t, 3.4, 3.9)), b = eo(seg(t, 4.0, 4.5));
      return html(`<div class="title"><h1 style="${tri(a)}">Taste <em>Atlas.</em></h1><p style="${tri(b)}">A taxonomy of why images work.<br/>Every reference, filed by intent.</p></div>`);
    }
    if (t < 11.6) {
      const cap = t < 7.6 ? ["01 / map", "Six things a<br/>design can do."] : ["02 / trace", "Operation → technique<br/>→ specimen."];
      const k = eo(seg(t, t < 7.6 ? 5.6 : 7.6, t < 7.6 ? 6.1 : 8.1));
      return html(`<div class="caption" style="${tri(k)}"><small>${cap[0]}</small>${cap[1]}</div>`);
    }
    if (t < 14.2) {
      const k = eo(seg(t, 11.6, 11.9)), lines = [
        [11.8, 12.2, `<span class="m">›</span> restyle my landing page`],
        [12.25, 12.5, `<span class="o">◆ atlas</span>  differentiate / color isolation`],
        [12.5, 12.75, `<span class="o">◆ atlas</span>  evoke / editorial serif · warm neutrals`],
      ];
      const body = lines.map(([a, b, s]) => `<div class="ln">${t < a ? "" : s.includes("restyle") ? `<span class="m">›</span> ` + typed("restyle my landing page", seg(t, a, b)) : `<span style="opacity:${eo(seg(t, a, b))}">${s}</span>`}</div>`).join("");
      const sk = eo(seg(t, 12.7, 13.2));
      return html(`<div class="caption" style="${tri(k)}"><small>03 / build</small>Your agent cites it.</div>
        <div class="term" style="left:70px;right:70px;top:${250 - sk * 40}px;${tri(k)}"><div class="bar"><i></i><i></i><i></i></div>${body}</div>
        <div class="site" style="left:${130 - sk * 20}px;right:${130 - sk * 20}px;top:${500 - sk * 60}px;height:470px;opacity:${sk};transform:translateY(${(1 - sk) * 80}px)">
          <div class="nav"><b>Slow Light</b><span>Work · Notes · About</span></div><span class="tag">COLOR ISOLATION</span>
          <h2>Designing<br/>quiet things.</h2><p>A studio for calm interfaces and objects that stay.</p>
          <div class="sw"><b style="background:#c7a98a"></b><b style="background:#b8c4a8"></b><b style="background:#e0442f"></b></div></div>`);
    }
    if (t < 15.6) {
      const beats = [[14.2, "#e0442f", "#14130f", "Name it."], [14.7, "#14130f", "#f2f0eb", "Cite it."], [15.15, "#f2f0eb", "#14130f", "Ship <em>taste.</em>"]];
      let b = beats[0]; for (const x of beats) if (t >= x[0]) b = x;
      const k = eo(seg(t, b[0], b[0] + 0.18));
      return html(`<div class="beat" style="background:${b[1]};color:${b[2]}"><span style="${tri(k)}">${b[3]}</span></div>`);
    }
    const a = eo(seg(t, 15.6, 16.0)), b = eo(seg(t, 15.9, 16.3)), c = eo(seg(t, 16.1, 16.5)), out = seg(t, 17.5, 18);
    html(`<div class="end"><div class="dots" style="${tri(a)}">${dots()}</div><h1 style="${tri(a)}">Taste <em>Atlas.</em></h1>
      <p style="${tri(b)}">A taxonomy of why images work. Your coding agent designs with it.</p>
      <div class="pill" style="${tri(c)}">github.com/kvnloo/taste-skill</div><div class="fine" style="opacity:${c}">WORKS WITH CLAUDE CODE &amp; CODEX</div></div>
      <div style="position:absolute;inset:0;background:#000;opacity:${out}"></div>`);
  },
};

const REEL = {
  duration: 21,
  setup() { buildWall(4, 236, 11); },
  seek(t) {
    const theme = "dark";
    drawWall(t, 0, 55, t < 4.4 ? 1 - seg(t, 4.0, 4.4) : 0);
    // Trace one specimen up its lineage, then visit two other branches.
    const keys = [[4.0, "editorial-serif--1", 0.62], [7.0, "editorial-serif", 0.78], [8.6, "evoke/cultural", 0.8], [10.2, "evoke", 0.85], [11.8, "root", 0.92], [13.6, "closure", 0.8], [15.2, "instrument-language", 0.8], [16.8, "instrument-language--3", 0.62]];
    const { cam, focus } = camAt(keys, Math.max(t, 4.0), { default: { x: 20, y: 360, w: 1040, h: 900 } });
    const show = t >= 4.0 && t < 18.4;
    document.getElementById("atlas").style.opacity = show ? eo(seg(t, 4.0, 4.6)) : 0;
    card.style.display = show && t > 4.6 ? "block" : "none";
    Object.assign(card.style, { left: "60px", right: "60px", width: "auto", bottom: "90px", top: "auto" });
    A.render({ cam, focus, theme, t, animate: true, labelScale: 1.7, cardIn: eo(seg(t, 4.6, 5.1)) });
    if (t < 4.0) {
      const k = back(seg(t, 0.9, 1.35));
      return html(`<div class="callout" style="left:80px;right:80px;top:${H / 2 - 120}px;text-align:center;opacity:${clamp(k * 1.4)};transform:scale(${0.8 + 0.2 * k})">You know it's good.<br/>Can you say <em>why?</em></div>`);
    }
    if (t < 18.4) {
      const caps = [[4.0, "specimen", "Start from<br/>what you saved."], [7.0, "technique", "Name the<br/>mechanism."], [8.6, "domain", "Find what<br/>carries it."], [10.2, "operation", "Name the<br/>intent."], [11.8, "atlas", "Six intents.<br/>Thirty techniques."], [13.6, "infer", "Closure: the eye<br/>draws what isn't there."], [15.2, "infer", "Instrument language<br/>says: precise."]];
      let c = caps[0]; for (const x of caps) if (t >= x[0]) c = x;
      const k = eo(seg(t, c[0] + 0.15, c[0] + 0.6));
      return html(`<div class="caption" style="top:120px;font-size:64px;${tri(k)}"><small>${c[1]}</small>${c[2]}</div>`);
    }
    const a = eo(seg(t, 18.4, 18.8)), b = eo(seg(t, 18.7, 19.1)), c = eo(seg(t, 18.9, 19.3)), out = seg(t, 20.5, 21);
    html(`<div class="end" style="padding:0 10%"><div class="dots" style="${tri(a)}">${dots()}</div><h1 style="${tri(a)};font-size:150px">Taste<br/><em style="font-size:160px">Atlas.</em></h1>
      <p style="${tri(b)}">Why images work, filed by intent.</p>
      <div class="pill" style="${tri(c)}">github.com/kvnloo/taste-skill</div></div>
      <div style="position:absolute;inset:0;background:#000;opacity:${out}"></div>`);
  },
};

const FILM = cut === "reel" ? REEL : LAUNCH;
FILM.setup();
window.__duration = FILM.duration;
window.seek = (t) => FILM.seek(t);
await document.fonts.ready;
FILM.seek(0);
document.body.dataset.ready = "1";
// Preview mode: plays in real time unless driven by capture.
if (!navigator.webdriver) { const t0 = performance.now(); const tick = (now) => { window.seek(((now - t0) / 1000) % FILM.duration); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
