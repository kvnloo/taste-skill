// Post viewer e2e: a post opened from the shelf walks that list with prev / next, the arrow keys and a sideways
// swipe, without closing; a vertical drag does nothing; Esc closes.
// Usage: BASE=http://127.0.0.1:8789 node scripts/viewer.e2e.mjs [outdir]   (exit 1 on any failed check)
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const base = process.env.BASE ?? "http://127.0.0.1:8789", out = process.argv[2] ?? ".", bad = [], ok = (c, m) => (c ? console.log("ok  ", m) : (bad.push(m), console.log("FAIL", m)));
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome-stable" }), errs = [];
for (const [vw, vh] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } }), tag = vw < 700 ? "phone" : "desktop";
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(base + "/", { waitUntil: "domcontentloaded" }); await p.waitForFunction(() => window.__atlas?.work, null, { timeout: 30000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = document.querySelector(".shelf"); if (!s.classList.contains("open")) s.querySelector("header button, header")?.click(); });
  await p.waitForTimeout(600);
  const first = p.locator(".shelf .grid [data-post]").first();
  if (!(await first.count())) { ok(false, `${tag}: shelf has posts`); continue; }
  await first.scrollIntoViewIfNeeded(); await first.click(); await p.waitForTimeout(500);
  const q = () => p.evaluate(() => document.querySelector(".lightbox.on .lb-q span")?.textContent ?? null);
  const n = (await q())?.split(" / ")[1];
  ok((await q())?.startsWith("1 / "), `${tag}: the post opens as 1 of its list (${await q()})`);
  await p.screenshot({ path: `${out}/viewer-${tag}.png` });
  await p.click(".lightbox.on [data-lbstep='1']"); await p.waitForTimeout(300); ok((await q()) === `2 / ${n}`, `${tag}: › goes to the next post`);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300); ok((await q()) === `3 / ${n}`, `${tag}: ArrowRight goes to the next post`);
  const sw = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400); };
  await sw(vw * 0.15, vh * 0.5, vw * 0.85, vh * 0.52); ok((await q()) === `2 / ${n}`, `${tag}: swipe right goes back (${await q()})`);
  await sw(vw * 0.85, vh * 0.5, vw * 0.15, vh * 0.48); ok((await q()) === `3 / ${n}`, `${tag}: swipe left goes forward (${await q()})`);
  await sw(vw * 0.5, vh * 0.3, vw * 0.52, vh * 0.8); ok((await q()) === `3 / ${n}`, `${tag}: a vertical drag keeps the post`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300); ok(!(await q()), `${tag}: Esc closes the viewer`);
  await p.close();
}
ok(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);
await b.close();
console.log(bad.length ? `${bad.length} failed` : "all passed"); process.exit(bad.length ? 1 : 0);
