// Procedural specimens: one small SVG per execution, a pure function of (family, seed, t).
// Coordinates are a 160x200 card. Motion families use t (seconds) so films can play them.
const W = 160, H = 200;
const rng = (seed) => { let a = seed * 2654435761 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const PAL = [
  { bg: "#efeae0", ink: "#1b1a17", mute: "#c9c2b4", hot: "#e0442f", cool: "#2f5fd0" },
  { bg: "#14161a", ink: "#ece8df", mute: "#3a3d44", hot: "#ff7a3d", cool: "#5fd6c2" },
  { bg: "#e7ecdf", ink: "#20261d", mute: "#b9c4ae", hot: "#d9a400", cool: "#3b7a57" },
  { bg: "#f4e1d2", ink: "#2a1712", mute: "#dcc0ad", hot: "#b8322c", cool: "#26408b" },
];
const pal = (s) => PAL[(s - 1) % PAL.length];
const r = (x, y, w, h, f, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`;
const c = (x, y, rad, f, extra = "") => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${f}" ${extra}/>`;
const tx = (x, y, s, f, str, extra = "") => `<text x="${x}" y="${y}" font-size="${s}" fill="${f}" ${extra}>${str}</text>`;
const SERIF = `font-family="Instrument Serif, Georgia, serif"`, MONO = `font-family="IBM Plex Mono, monospace"`, SANS = `font-family="Archivo Black, Inter, sans-serif"`;
const loop = (t, p = 2.4) => ((t % p) + p) % p / p;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

const F = {
  isolate(s, p, R) { let o = ""; const k = Math.floor(R() * 20); for (let i = 0; i < 20; i++) o += c(28 + (i % 4) * 35, 32 + Math.floor(i / 4) * 34, 11, i === k ? p.hot : p.mute); return o; },
  scale(s, p) { const n = ["7", "31", "04", "$9"][s - 1] ?? "7"; return tx(10, 160, 150, p.ink, n, `${SANS} letter-spacing="-6"`) + tx(12, 30, 9, p.ink, "ISSUE NO.", MONO) + r(12, 176, 60, 2, p.hot); },
  texture(s, p, R) { let o = ""; const k = Math.floor(R() * 12); for (let i = 0; i < 12; i++) { const x = 14 + (i % 3) * 46, y = 16 + Math.floor(i / 3) * 44; o += r(x, y, 40, 38, i === k ? p.ink : p.mute); if (i === k) for (let j = 0; j < 9; j++) o += `<path d="M${x} ${y + j * 5} L${x + 40} ${y + j * 5 - 10}" stroke="${p.bg}" stroke-width="1.4"/>`; } return o; },
  juxta(s, p) { const w = [["SOFT", "HARD"], ["BEFORE", "AFTER"], ["YES", "NO"], ["DAY", "NIGHT"]][s - 1]; return r(0, 0, 80, H, p.bg) + r(80, 0, 80, H, p.ink) + c(40, 84, 26, p.hot) + r(100, 58, 44, 52, p.bg) + tx(40, 158, 11, p.ink, w[0], `${MONO} text-anchor="middle"`) + tx(120, 158, 11, p.bg, w[1], `${MONO} text-anchor="middle"`); },
  whitespace(s, p) { const pos = [[120, 160], [80, 100], [24, 30]][(s - 1) % 3]; return c(pos[0], pos[1], 4, p.hot) + tx(pos[0] + 8, pos[1] + 3, 7, p.ink, "here", MONO); },
  complement(s) { const pr = [["#ff7a1a", "#1f3fbf"], ["#2f9a4a", "#d42e2e"], ["#7a3fc4", "#f4d21f"]][(s - 1) % 3]; return r(0, 0, W, H, pr[1]) + c(80, 100, 44, pr[0]) + r(30, 160, 100, 10, pr[0]); },
  metaphor(s, p) {
    if (s === 1) return c(80, 96, 44, "none", `stroke="${p.ink}" stroke-width="2"`) + c(80, 96, 3, p.ink) + c(80 + 44 * Math.cos(1), 96 + 44 * Math.sin(1), 7, p.hot) + `<path d="M80 96 L80 64 M80 96 L102 108" stroke="${p.ink}" stroke-width="2"/>`;
    if (s === 2) { let o = ""; for (let i = 1; i < 8; i++) o += `<ellipse cx="80" cy="100" rx="${i * 9 + Math.sin(i) * 2}" ry="${i * 8}" fill="none" stroke="${i === 5 ? p.hot : p.ink}" stroke-width="1.2"/>`; return o; }
    if (s === 3) { let o = ""; for (let j = 0; j < 6; j++) { let d = `M0 ${70 + j * 18}`; for (let x = 0; x <= W; x += 10) d += ` L${x} ${70 + j * 18 + Math.sin(x / 14 + j) * 7}`; o += `<path d="${d}" fill="none" stroke="${j === 2 ? p.hot : p.ink}" stroke-width="1.4"/>`; } return o; }
    return c(80, 84, 34, p.hot) + r(66, 118, 28, 22, p.ink) + `<path d="M70 84 q10 -16 20 0" stroke="${p.bg}" stroke-width="2" fill="none"/>`;
  },
  substitute(s, p) {
    const clip = s === 1 ? `<path d="M66 20h28v26q20 16 20 44v94H46V90q0-28 20-44z"/>` : s === 2 ? `<path d="M80 20C130 50 140 130 80 186C20 130 30 50 80 20z"/>` : `<circle cx="80" cy="90" r="56"/>`;
    let fill = ""; for (let i = 0; i < 24; i++) fill += s === 2 ? r(30 + i * 4, 186 - (20 + ((i * 37) % 120)), 3, 20 + ((i * 37) % 120), i % 5 ? p.ink : p.hot) : s === 3 ? `<path d="M0 ${i * 9} H160 M${i * 9} 0 V200" stroke="${p.ink}" stroke-width="0.8"/>` : r(0, i * 9, W, 4.5, i % 2 ? p.hot : p.ink);
    return `<clipPath id="sub${s}">${clip}</clipPath><g clip-path="url(#sub${s})">${fill}</g>`;
  },
  crop(s, p) { if (s === 1) { let o = c(150, 190, 120, "none", `stroke="${p.ink}" stroke-width="2"`); for (let i = 0; i < 12; i++) { const a = Math.PI + i * 0.13; o += `<path d="M${150 + 108 * Math.cos(a)} ${190 + 108 * Math.sin(a)} L${150 + 118 * Math.cos(a)} ${190 + 118 * Math.sin(a)}" stroke="${p.ink}" stroke-width="2"/>`; } return o + `<path d="M150 190 L60 120" stroke="${p.hot}" stroke-width="3"/>`; } if (s === 2) return tx(-30, 190, 230, p.ink, "R", SANS); return c(80, 330, 230, p.cool) + c(80, 330, 230, "none", `stroke="${p.hot}" stroke-width="3"`); },
  closure(s, p) {
    if (s === 1) return [[80, 40], [30, 140], [130, 140]].map(([x, y]) => c(x, y, 20, p.ink)).join("") + `<path d="M80 40 L30 140 L130 140 Z" fill="${p.bg}"/>`;
    if (s === 2) { let o = ""; for (let i = 0; i < 10; i++) { const a0 = i * 0.628 + 0.12, a1 = a0 + 0.42; o += `<path d="M${80 + 50 * Math.cos(a0)} ${100 + 50 * Math.sin(a0)} A50 50 0 0 1 ${80 + 50 * Math.cos(a1)} ${100 + 50 * Math.sin(a1)}" fill="none" stroke="${i === 3 ? p.hot : p.ink}" stroke-width="5"/>`; } return o; }
    let o = ""; for (let i = 0; i < 16; i++) { const k = i / 4, side = Math.floor(k), f = k - side; const pts = [[30, 50], [130, 50], [130, 150], [30, 150]]; const [a, b] = [pts[side], pts[(side + 1) % 4]]; o += c(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 4, p.ink); } return o;
  },
  quote(s, p) {
    if (s === 1) return r(0, 0, W, H, "#e5e1d8") + c(104, 70, 40, "#e2231a") + r(14, 128, 132, 3, "#111") + tx(14, 156, 22, "#111", "Kunst", `${SANS}`) + tx(14, 176, 9, "#111", "ZÜRICH 1959", MONO);
    if (s === 2) return r(0, 0, W, H, "#f1ead8") + c(54, 64, 30, "#e4b419") + r(84, 34, 52, 52, "#d6301f") + `<path d="M30 180 L80 100 L130 180Z" fill="#1d3d8f"/>`;
    if (s === 3) return r(0, 0, W, H, "#ece2cf") + `<path d="M-10 170 L170 40 L170 80 L-10 210Z" fill="#c9221a"/>` + c(48, 64, 26, "#111") + tx(20, 186, 18, "#111", "ВПЕРЁД", `${SANS} transform="rotate(-36 20 186)"`);
    return r(0, 0, W, H, "#f6efe6") + c(64, 90, 46, "#ff5ea0", `opacity="0.85"`) + c(98, 104, 46, "#2b7bd6", `opacity="0.75" style="mix-blend-mode:multiply"`) + tx(14, 186, 12, "#2b2b2b", "ZINE 03", MONO);
  },
  hud(s, p) {
    const k = "#c9c3b5", br = `<path d="M10 24V10H24M136 10H150V24M10 176V190H24M136 190H150V176" fill="none" stroke="${k}" stroke-width="1.4"/>`;
    const bg = r(0, 0, W, H, "#0e0f0d");
    if (s === 1) return bg + br + tx(30, 22, 7, k, "SYS / 01", MONO) + tx(80, 108, 30, "#ece8df", "84%", `${SANS} text-anchor="middle"`) + tx(80, 126, 7, "#8f8a80", "BURN PACE", `${MONO} text-anchor="middle"`);
    if (s === 2) { let o = bg + br; for (let i = 0; i < 26; i++) o += r(14 + i * 5, 150 - ((i * 53) % 70), 3, (i * 53) % 70, i === 19 ? "#ff7a3d" : "#6d6a62"); return o + tx(14, 40, 7, k, "TPS · 26 SAMPLES", MONO); }
    if (s === 3) return bg + br + c(80, 100, 44, "none", `stroke="${k}" stroke-width="1"`) + c(80, 100, 18, "none", `stroke="#ff7a3d" stroke-width="1.4"`) + `<path d="M80 44V70M80 130V156M24 100H50M110 100H136" stroke="${k}"/>` + tx(86, 70, 6, k, "LOCK", MONO);
    let o = bg + br; ["groot  OK", "mbp    OK", "s25    BUSY", "s22    OK", "k3s    OK"].forEach((l, i) => { o += tx(18, 46 + i * 22, 9, i === 2 ? "#ff7a3d" : "#ece8df", l, `${MONO} xml:space="preserve"`); }); return o;
  },
  proximity(s, p) { let o = ""; const groups = s === 1 ? [[40, 50], [110, 70], [70, 150]] : s === 2 ? [[40, 40], [120, 40], [40, 120], [120, 120]] : [[46, 90]]; groups.forEach(([gx, gy], gi) => { for (let i = 0; i < (s === 3 ? 14 : s === 2 ? 2 : 5); i++) o += c(gx + (i % 3) * 13 + (s === 3 ? (i % 5) * 4 : 0), gy + Math.floor(i / 3) * 13, 5, p.ink); }); if (s === 3) for (let i = 0; i < 3; i++) o += c(126, 50 + i * 50, 5, p.hot); return o; },
  similarity(s, p) { let o = ""; for (let i = 0; i < 25; i++) { const x = 22 + (i % 5) * 29, y = 30 + Math.floor(i / 5) * 32, g = (i * 7) % 3 === 0; o += s === 2 ? (g ? r(x - 8, y - 8, 16, 16, p.ink) : c(x, y, 8, p.ink)) : s === 3 ? c(x, y, 8, g ? p.ink : "none", `stroke="${p.ink}" stroke-width="1.6"`) : c(x, y, 8, g ? p.hot : p.cool); } return o; },
  region(s, p) { let o = ""; const boxes = s === 2 ? [[8, 14, 144, 52], [8, 74, 144, 52], [8, 134, 144, 52]] : s === 3 ? [[20, 40, 80, 120]] : [[10, 20, 66, 160], [84, 20, 66, 160]]; boxes.forEach(([x, y, w, h], i) => o += r(x, y, w, h, i % 2 ? p.mute : p.bg, `rx="8" stroke="${p.ink}" stroke-opacity="0.25"`)); for (let i = 0; i < 12; i++) o += c(24 + (i % 4) * 36, 40 + Math.floor(i / 4) * 54, 6, i % 5 === 0 ? p.hot : p.ink); return o; },
  continuity(s, p) { let o = ""; for (let i = 0; i < 28; i++) { const k = i / 27; const [x, y] = s === 1 ? [10 + k * 140, 100 + Math.sin(k * 7) * 50] : s === 2 ? [80 + Math.cos(k * 12) * k * 66, 100 + Math.sin(k * 12) * k * 66] : [10 + k * 140, 100]; o += s === 3 ? r(x - 2, y - 30 - Math.sin(k * 6) * 20, 4, 60 + Math.sin(k * 6) * 40, p.ink) : c(x, y, 3 + k * 2, i === 20 ? p.hot : p.ink); } return o; },
  grid(s, p) { let o = ""; for (let i = 0; i <= 6; i++) o += `<path d="M${12 + i * 22.7} 0V200" stroke="${p.hot}" stroke-opacity="0.25"/>`; const blocks = [[12, 20, 113, 16], [12, 44, 68, 6], [12, 56, 68, 6], [12, 68, 45, 6], [103, 80, 45, 60], [12, 150, 136, 30]]; blocks.forEach(([x, y, w, h], i) => o += r(x, y + (s - 1) * 4, w, h, i === 4 ? p.cool : p.ink, i > 0 && i < 4 ? `opacity="0.55"` : "")); return o; },
  leading(s, p) { let o = ""; const vx = s === 3 ? 140 : 80, vy = s === 3 ? 30 : 70; for (let i = 0; i < 9; i++) { const sx = -40 + i * 30; o += `<path d="M${sx} 200 L${vx} ${vy}" stroke="${p.ink}" stroke-width="1.2"/>`; } return o + c(vx, vy, 6, p.hot); },
  zpath(s, p) { const pts = s === 1 ? [[20, 30], [140, 30], [20, 170], [140, 170]] : s === 2 ? [[20, 30], [140, 30], [20, 90], [100, 90], [20, 150]] : [[20, 20], [60, 70], [100, 120], [140, 170]]; return `<path d="M${pts.map((q) => q.join(" ")).join(" L")}" fill="none" stroke="${p.hot}" stroke-width="1.5" stroke-dasharray="4 4"/>` + pts.map(([x, y], i) => r(x - 12, y - 7, 24, 14, i ? p.ink : p.hot, `rx="2"`)).join(""); },
  figure(s, p) { if (s === 1) return r(0, 0, W, H, p.ink) + `<path d="M50 0 C50 40 70 50 60 70 C50 90 70 100 66 120 C62 140 46 150 50 200 H110 C114 150 98 140 94 120 C90 100 110 90 100 70 C90 50 110 40 110 0Z" fill="${p.bg}"/>`; if (s === 2) return r(0, 0, W, H, p.cool) + `<path d="M40 200 V100 A40 40 0 0 1 120 100 V200Z" fill="${p.bg}"/>`; return r(0, 0, W, H, p.ink) + r(20, 60, 60, 80, p.bg) + r(100, 60, 40, 80, p.bg) + `<path d="M80 60 L100 100 L80 140Z" fill="${p.bg}"/>`; },
  hierarchy(s, p) { const sizes = s === 2 ? [34, 34, 34] : [36, 18, 9]; const weights = s === 2 ? [p.ink, p.mute, p.mute] : [p.ink, p.ink, p.ink]; return tx(12, 60, sizes[0], weights[0], "Title", SANS) + tx(12, 96, sizes[1], weights[1], s === 3 ? "" : "Subhead", SANS) + (s === 3 ? [p.ink, "#5a5750", "#9a968c", p.mute].map((f, i) => r(12 + i * 36, 120, 30, 60, f)).join("") : [0, 1, 2, 3].map((i) => r(12, 120 + i * 12, 136 - i * 18, sizes[2] * 0.6, p.mute)).join("")); },
  ease(s, p, R, t) { const k = easeOut(Math.min(1, loop(t) * 1.6)); let o = `<path d="M14 150 H146" stroke="${p.mute}"/>`; for (let i = 0; i < 8; i++) { const q = easeOut(i / 7); o += c(16 + q * 120, 150, 3, p.mute); } const x = 16 + k * 120; return o + (s === 2 ? r(x - 20, 60, 40, 60, p.ink, `rx="4"`) : s === 1 ? r(x - 24, 70, 48, 34, p.hot, `rx="6"`) : c(x, 100, 14, p.hot)); },
  stagger(s, p, R, t) { let o = ""; for (let i = 0; i < (s === 2 ? 16 : 7); i++) { const k = easeOut(Math.max(0, Math.min(1, loop(t) * 2.4 - i * 0.12))); if (s === 2) o += r(16 + (i % 4) * 34, 24 + Math.floor(i / 4) * 40 + (1 - k) * 16, 26, 30, p.ink, `opacity="${k}"`); else if (s === 3) o += r(14, 26 + i * 22 + (1 - k) * 12, 40 + ((i * 41) % 90), 10, i === 3 ? p.hot : p.ink, `opacity="${k}"`); else o += r(16 + i * 19, 170 - k * (40 + ((i * 29) % 100)), 13, k * (40 + ((i * 29) % 100)), i === 4 ? p.hot : p.ink); } return o; },
  morph(s, p, R, t) { const k = 0.5 - 0.5 * Math.cos(loop(t, 3) * Math.PI * 2); if (s === 2) return r(80 - (20 + k * 50), 86, 2 * (20 + k * 50), 28, p.hot, `rx="14"`); if (s === 3) return k < 0.5 ? `<path d="M60 60 L110 100 L60 140Z" fill="${p.ink}" opacity="${1 - k * 2}"/>` : r(56, 62, 16, 76, p.ink, `opacity="${k * 2 - 1}"`) + r(88, 62, 16, 76, p.ink, `opacity="${k * 2 - 1}"`); return r(80 - 40, 100 - 40, 80, 80, p.cool, `rx="${40 - k * 34}"`); },
  parallax(s, p, R, t) { let o = ""; const ph = loop(t, 6) * 160; for (let L = 0; L < 4; L++) { const sp = (L + 1) * 0.5, y0 = 70 + L * 30, col = [p.mute, "#a49c8c", "#6c665a", p.ink][L]; let d = `M${-160 - ((ph * sp) % 160)} 200`; for (let x = -160; x <= 320; x += 20) d += ` L${x - ((ph * sp) % 160)} ${y0 + Math.sin((x + L * 37) / 23) * 14}`; o += `<path d="${d} L320 200Z" fill="${col}"/>`; } return o + c(120, 40, 12, p.hot); },
  ticker(s, p, R, t) { const v = Math.floor(1200 + easeOut(loop(t, 3)) * 11280); const str = s === 3 ? String(v).padStart(6, "0") : "$" + v.toLocaleString("en-US"); let o = ""; if (s === 3) [...str].forEach((d, i) => { o += r(8 + i * 24.5, 78, 22, 40, p.ink, `rx="3"`) + tx(19 + i * 24.5, 108, 26, p.bg, d, `${MONO} text-anchor="middle"`); }); else o = tx(80, 112, s === 2 ? 26 : 30, p.ink, str, `${SANS} text-anchor="middle"`) + tx(80, 136, 8, p.hot, "+ 4.2% THIS WEEK", `${MONO} text-anchor="middle"`); return o; },
  material(s) {
    const g = [["#8d8a83", "#c9c5bb", "#6f6c66"], ["#f5f7fa", "#59606b", "#e3e7ee"], ["#ff7ab6", "#ffd1e6", "#d63f86"], ["#f3eadb", "#e4d6bf", "#cdbb9c"]][s - 1];
    return `<defs><radialGradient id="mt${s}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${g[1]}"/><stop offset="0.55" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[2]}"/></radialGradient></defs>` + r(0, 0, W, H, s === 4 ? "#efe7d8" : "#d9d5cc") + (s === 4 ? r(26, 30, 108, 140, `url(#mt${s})`, `transform="rotate(-4 80 100)"`) + `<path d="M26 120 l108 -6" stroke="#c9b48f" stroke-width="0.6"/>` : `<ellipse cx="80" cy="104" rx="${s === 3 ? 52 : 48}" ry="${s === 3 ? 44 : 56}" fill="url(#mt${s})"/>`) + (s === 2 ? `<ellipse cx="62" cy="76" rx="14" ry="6" fill="#fff" opacity="0.9"/>` : "");
  },
  tone(s) { const sets = [["#efe6d8", "#c7a98a", "#8a5a44", "#2a211d"], ["#e5eadf", "#b8c4a8", "#6f8a68", "#26301f"], ["#0f1013", "#2a2c31", "#8f8a80", "#d7b986"]][(s - 1) % 3]; return sets.map((f, i) => r(0, i * 50, W, 50, f)).join("") + tx(10, 190, 8, s === 3 ? "#0f1013" : "#efe6d8", "PALETTE " + s, MONO); },
  serif(s, p) { const w = [["Designing", "quiet things."], ["Slow", "light."], ["Field", "notes."]][(s - 1) % 3]; return tx(12, 92, 34, p.ink, w[0], `${SERIF} font-style="italic"`) + tx(12, 128, 34, p.ink, w[1], `${SERIF} font-style="italic"`) + tx(12, 180, 7, p.hot, "VOL. 0" + s + " — AN EDITORIAL", MONO); },
  alive(s, p, R, t) {
    if (s === 1) { const b = 1 + 0.08 * Math.sin(t * 2.2); return r(0, 0, W, H, "#0e0f0d") + `<defs><radialGradient id="orb"><stop offset="0" stop-color="#ffd7a8"/><stop offset="0.5" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient></defs>` + c(80, 100, 46 * b, "url(#orb)"); }
    let o = r(0, 0, W, H, s === 2 ? "#0e0f0d" : p.bg);
    if (s === 2) for (let i = 0; i < 40; i++) { const R2 = rng(i + 3); const x = (R2() * W + t * (6 + R2() * 10)) % W, y = (R2() * H + Math.sin(t + i) * 6); o += c(x, y, 1 + R2() * 1.6, i % 9 ? "#8f8a80" : "#ff7a3d"); }
    else { const gro = 0.6 + 0.4 * loop(t, 4); const br = (x, y, a, len, d) => { if (d > 5) return ""; const x2 = x + Math.cos(a) * len * gro, y2 = y + Math.sin(a) * len * gro; return `<path d="M${x} ${y} L${x2} ${y2}" stroke="${p.ink}" stroke-width="${6 - d}" stroke-linecap="round"/>` + br(x2, y2, a - 0.45, len * 0.72, d + 1) + br(x2, y2, a + 0.4, len * 0.72, d + 1); }; o += br(80, 196, -Math.PI / 2, 50, 0); }
    return o;
  },
};

export const FAMILIES = Object.keys(F);

export function specimen(family, seed = 1, t = 0) {
  const p = pal(seed), R = rng(seed * 97 + family.length);
  const body = F[family] ? F[family](seed, p, R, t) : "";
  return `<rect width="${W}" height="${H}" fill="${p.bg}"/>${body}`;
}
export const CARD = { w: W, h: H };
