// Project focus e2e: selecting a project hides the rest of the atlas, zooms onto its journey (every screen on screen,
// in order, critic-badged), a screen fills the shelf with its story, and Esc brings the whole atlas back.
// Usage: BASE=http://127.0.0.1:8789 node scripts/project.e2e.mjs [outdir]   (exit 1 on any failed check)
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const base = process.env.BASE ?? "http://127.0.0.1:8789", out = process.argv[2] ?? ".", bad = [], ok = (c, m) => (c ? console.log("ok  ", m) : (bad.push(m), console.log("FAIL", m)));
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome-stable" });
const errs = [];
async function page(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(base + "/", { waitUntil: "domcontentloaded" }); await p.waitForFunction(() => window.__atlas?.work, null, { timeout: 30000 }); await p.waitForTimeout(1200);
  return p;
}
const look = (p) => p.evaluate(() => { const w = window.__atlas.work, c = window.__atlas.A.view.cam, op = (q) => +getComputedStyle(document.querySelector(q)).opacity;
  const pj = w.project?.() ?? { open: null, frames: [] }, scr = (f) => ({ id: f.id, verdict: f.verdict, x: c.cx + (f.x - c.x) * c.s, y: c.cy + (f.y - c.y) * c.s, w: f.w * c.s, h: f.h * c.s });
  return { focus: document.body.classList.contains("project-focus"), graph: op("#atlas > g"), tiles: op("#bm-canvas"), chrome: [...document.querySelectorAll("#card, .layers")].filter((e) => { const k = getComputedStyle(e); return k.visibility !== "hidden" && k.display !== "none" && +k.opacity > 0.05 && e.getBoundingClientRect().width > 0; }).map((e) => e.id || e.className), s: c.s, hash: location.hash, pj: { ...pj, frames: pj.frames.map(scr) }, shelf: document.querySelector(".shelf")?.innerText ?? "" }; });
const go = async (p, h) => { await p.evaluate((h) => (location.hash = h), h); await p.waitForTimeout(1600); };

const p = await page(1440, 900), before = await look(p);
ok(!before.focus && before.graph > 0.9 && before.tiles > 0.9, "atlas starts whole (graph + tiles visible)");
for (const [pid, n] of [["fframestudio", 17], ["glide", 15]]) {
  await go(p, `#work:${pid}`); const s = await look(p); await p.screenshot({ path: `${out}/pj-${pid}.png` });
  ok(s.focus && s.graph < 0.05 && s.tiles < 0.05, `${pid}: every other node hidden (graph ${s.graph}, tiles ${s.tiles})`);
  ok(s.chrome.length === 0, `${pid}: atlas explainer card and layer bar hidden (${s.chrome.join(",") || "none visible"})`);
  ok(s.pj.open === pid && s.pj.frames.length === n, `${pid}: ${s.pj.frames.length}/${n} screens drawn`);
  ok(s.s > before.s * 3, `${pid}: zoomed in (scale ${before.s.toFixed(2)} → ${s.s.toFixed(2)})`);
  const off = s.pj.frames.filter((f) => f.x < 0 || f.y < 40 || f.x + f.w > 1440 || f.y + f.h > 900);
  ok(!off.length, `${pid}: whole journey on screen${off.length ? ` (off: ${off.map((f) => f.id)})` : ""}`);
  const order = s.pj.frames.every((f, i, a) => !i || f.y > a[i - 1].y + 1 || (Math.abs(f.y - a[i - 1].y) < 1 && f.x > a[i - 1].x));
  ok(order, `${pid}: screens laid out in journey order (rows, left to right)`);
  ok(/JOURNEY/i.test(s.shelf) && s.shelf.includes(String(n)), `${pid}: shelf lists the journey`);
}
// Sound Atlas: critic on every node; click a broken screen → its story in the shelf, camera on it.
await go(p, "#work:fframestudio"); let s = await look(p);
ok(s.pj.frames.every((f) => f.verdict), "every Sound Atlas screen carries a critic verdict");
const f = s.pj.frames.find((x) => x.id === "swap-layer"); if (!f) { console.log(`${bad.length} failed (no project focus)`); process.exit(1); }
await p.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await p.waitForTimeout(1200);
s = await look(p); await p.screenshot({ path: `${out}/pj-screen.png` });
ok(s.pj.sel === "swap-layer" && s.hash === "#work:fframestudio@swap-layer", `click selects the screen (${s.pj.sel}, ${s.hash})`);
ok(/Critic/i.test(s.shelf) && /broken/i.test(s.shelf) && /Fix/.test(s.shelf) && /commits/.test(s.shelf), "shelf shows critic verdict, issues, fix and history");
const g = s.pj.frames.find((x) => x.id === "swap-layer"); ok(g.w > f.w * 1.5, `camera zooms onto the screen (${f.w.toFixed(0)} → ${g.w.toFixed(0)} px)`);
await p.keyboard.press("Escape"); await p.waitForTimeout(900); s = await look(p); ok(s.focus && !s.pj.sel, "Esc: back to the whole journey");
await p.keyboard.press("Escape"); await p.waitForTimeout(1200); s = await look(p); await p.screenshot({ path: `${out}/pj-after.png` });
ok(!s.focus && s.graph > 0.9 && s.tiles > 0.9, "Esc again: the whole atlas returns");
// Glide keeps its greyed neighbours; deep links open on a screen.
await go(p, "#work:glide@council"); s = await look(p);
ok(s.pj.ghosts.length >= 1 && s.pj.ghosts.length <= 2, `glide: ${s.pj.ghosts.length} greyed connected node(s): ${s.pj.ghosts}`);
ok(s.pj.sel === "council", "deep link #work:glide@council opens that screen");
// Phone.
const m = await page(390, 844); await go(m, "#work:fframestudio"); s = await look(m); await m.screenshot({ path: `${out}/pj-phone.png` });
ok(s.focus && s.pj.frames.length === 17, "phone: project focus opens");
ok(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);
await b.close();
console.log(bad.length ? `${bad.length} failed` : "all passed"); process.exit(bad.length ? 1 : 0);
