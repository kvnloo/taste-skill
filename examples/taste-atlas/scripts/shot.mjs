// Screenshot the live app in a few states; report console errors. Usage: node shot.mjs <outdir>
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const out = process.argv[2] ?? ".";
// CHROME=/path picks the browser; Google Chrome has the H.264 codec X's mp4s need, Playwright's Chromium does not.
const b = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const shots = [["root", "", "light"], ["op", "#differentiate", "light"], ["tech", "#color-isolation", "light"], ["exec", "#tactile-surface--2", "dark"], ["hud", "#instrument-language", "dark"]];
for (const [name, hash, theme] of shots) {
  await p.goto(`http://127.0.0.1:8787/?theme=${theme}${hash}`); await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}/${name}.png` });
}
// Interaction check: search + enter.
await p.goto("http://127.0.0.1:8787/?theme=light"); await p.waitForTimeout(500);
await p.fill("#q", "closure"); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
console.log("after search focus:", await p.evaluate(() => window.__atlas.A.view.focus), "hash:", await p.evaluate(() => location.hash));
await p.keyboard.press("Escape"); await p.waitForTimeout(1200);
console.log("after esc focus:", await p.evaluate(() => window.__atlas.A.view.focus));
// Private bookmarks layer (only when ./data is present): shelf follows focus, thumbnails load.
const base = process.env.BASE ?? "http://127.0.0.1:8787";
await p.goto(`${base}/?theme=light`);
if (await p.waitForFunction(() => window.__atlas?.bm, null, { timeout: 15000 }).catch(() => null)) {
  for (const [name, id] of [["bm-root", "root"], ["bm-op", "evoke"], ["bm-tech", "tactile-surface"]]) {
    await p.evaluate((id) => window.__atlas.go(id), id); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(name, JSON.stringify(await p.evaluate(() => ({ title: document.querySelector(".shelf header b")?.textContent, tiles: document.querySelectorAll(".shelf .grid a").length, broken: [...document.querySelectorAll(".shelf img")].filter((i) => i.complete && !i.naturalWidth).length }))));
  }
  // Mid-flight and wheel-zoom frames: the SVG moves by a composited CSS transform between commits, so the
  // canvas tiles must stay registered with the graph while the camera is in motion.
  await p.evaluate(() => window.__atlas.go("root", 10)); await p.waitForTimeout(800);
  await p.evaluate(() => window.__atlas.go("differentiate", 1600)); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/bm-mid.png` });
  await p.waitForTimeout(1500); await p.mouse.move(700, 450); for (let i = 0; i < 4; i++) await p.mouse.wheel(0, -120);
  await p.waitForTimeout(60); await p.screenshot({ path: `${out}/bm-wheel.png` });
  // Registration invariant: SVG node centre on screen (CSS transform included) == canvas camera projection.
  const drift = await p.evaluate(async () => {
    const { A, go } = window.__atlas, out = []; go("root", 10); await new Promise((r) => setTimeout(r, 300)); go("tactile-surface", 1200);
    for (let i = 0; i < 14; i++) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const n = A.graph.byId.get("tactile-surface"), c = A.view.cam, r = A.parts.get(n.id).shape.getBoundingClientRect();
      const ex = (c.cx ?? innerWidth / 2) + (n.x - c.x) * c.s, ey = (c.cy ?? innerHeight / 2) + (n.y - c.y) * c.s;
      out.push(Math.hypot(r.x + r.width / 2 - ex, r.y + r.height / 2 - ey) + (document.getElementById("atlas").style.transform ? 1000 : 0));
    }
    return out.map((d) => (d >= 1000 ? "css:" : "svg:") + (d % 1000).toFixed(1));
  });
  console.log("registration drift px:", JSON.stringify(drift));
  // Feature journeys: post detail from a tile, card examples, brief copy, mosaic.
  await p.evaluate(() => window.__atlas.go("tactile-surface", 10)); await p.waitForTimeout(1500);
  const feats = await p.evaluate(async () => {
    const r = {}, { A } = window.__atlas;
    r.examples = document.querySelectorAll(".card .ex-row img").length;
    document.querySelector(".card .ex-row img")?.click(); await new Promise((x) => setTimeout(x, 300));
    r.detail = document.querySelector(".lightbox.on .lb-act a")?.href ?? null; document.querySelector(".lb-x")?.click();
    const b = window.__atlas.brief(["tactile-surface"], "component"); r.brief = [b.kind, b.techniques[0].id, b.techniques[0].references.length];
    r.briefButtons = document.querySelectorAll(".card [data-brief]").length;
    document.querySelector(".shelf .wid").click(); await new Promise((x) => setTimeout(x, 400));
    r.mosaic = [document.querySelector(".shelf").classList.contains("wide"), document.querySelectorAll(".shelf .grid a").length];
    return r;
  });
  console.log("features:", JSON.stringify(feats));
  // Clicking a video bookmark plays it at once (real mouse click = user gesture).
  const vid = await p.evaluate(() => { const a = [...document.querySelectorAll(".shelf .grid a")].find((x) => x.querySelector(".play")); return a?.dataset.post; });
  if (vid) {
    await p.click(`.shelf .grid [data-post="${vid}"]`); await p.waitForTimeout(3500);
    const v = await p.evaluate(() => { const v = document.querySelector(".lightbox.on video"); return v ? { playing: !v.paused && v.currentTime > 0, t: +v.currentTime.toFixed(1), muted: v.muted, err: v.error?.code ?? null } : (document.querySelector(".lightbox.on .strip") ? "strip-fallback" : null); });
    await p.screenshot({ path: `${out}/bm-video.png` });
    await p.keyboard.press("Escape");
    console.log("video autoplay:", JSON.stringify(v), "closed+stopped:", await p.evaluate(() => !document.querySelector(".lightbox video")));
  }
  await p.screenshot({ path: `${out}/bm-mosaic.png` });
  await p.evaluate(() => document.querySelector(".shelf .wid").click());
  await p.evaluate(() => document.querySelector(".card .ex-row img")?.click()); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/bm-detail.png` }); await p.keyboard.press("Escape");
  console.log("svg transform mid-wheel:", await p.evaluate(() => document.getElementById("atlas").style.transform || "(committed)"));
  console.log("stat:", await p.evaluate(() => document.getElementById("stat").textContent));
}
// Phone viewport (MOBILE=1): overview, technique, shelf open.
if (process.env.MOBILE) {
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  m.on("pageerror", (e) => errs.push(String(e)));
  for (const [name, hash] of [["m-root", ""], ["m-op", "#evoke"], ["m-tech", "#tactile-surface"]]) {
    await m.goto(`${base}/?theme=light${hash}`); await m.waitForTimeout(3000); await m.screenshot({ path: `${out}/${name}.png` });
  }
  await m.tap(".shelf header"); await m.waitForTimeout(1200); await m.screenshot({ path: `${out}/m-shelf.png` });
  // Real-phone repro: dark theme, sheet open at the overview, Android-sized viewport.
  await m.setViewportSize({ width: 360, height: 780 }); await m.goto(`${base}/?theme=dark`); await m.waitForTimeout(2500);
  await m.tap(".shelf header"); await m.waitForTimeout(3500); await m.screenshot({ path: `${out}/m-dark-shelf.png` });
  console.log("tiles", JSON.stringify(await m.evaluate(() => [...document.querySelectorAll(".shelf .grid a")].slice(0, 6).map((a) => { const r = a.getBoundingClientRect(), i = a.querySelector("img")?.getBoundingClientRect(); return [r.width | 0, r.height | 0, i ? [i.width | 0, i.height | 0] : null]; }))));
}
console.log("errors:", JSON.stringify(errs));
await b.close();
