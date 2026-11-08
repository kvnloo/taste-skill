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
console.log("errors:", JSON.stringify(errs));
await b.close();
