// Screenshot the live app in a few states; report console errors. Usage: node shot.mjs <outdir>
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const out = process.argv[2] ?? ".";
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
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
