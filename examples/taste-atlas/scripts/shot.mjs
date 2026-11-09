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
console.log("errors:", JSON.stringify(errs));
await b.close();
