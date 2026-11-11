// End-to-end check of the board canvas in a real browser, against its own board server in a temp home
// (never the live board). Needs the build (npm run build) and a Chromium: playwright's, or $CHROME.
//   npm --prefix canvas run e2e            -> asserts every step, prints a JSON summary, screenshots in $SHOTS (default: temp)
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url)), board = join(here, "../scripts/board.mjs");
if (!existsSync(join(here, "dist/index.html"))) { console.error("e2e: build first (npm run build)"); process.exit(2); }
const home = mkdtempSync(join(tmpdir(), "taste-canvas-e2e-")), port = 18700 + Math.floor(Math.random() * 90), base = `http://127.0.0.1:${port}`;
const shots = process.env.SHOTS ?? join(home, "shots"); mkdirSync(shots, { recursive: true });
const env = { ...process.env, TASTE_BOARD_HOME: home, TASTE_BOARD_PORT: String(port), TASTE_BOARD_URL: base };
const cli = (args, input) => JSON.parse(execFileSync("node", [board, ...args], { env, input, encoding: "utf8" }));
const server = spawn("node", [board, "serve"], { env, stdio: "ignore" });
const summary = {}, log = (k, v) => { summary[k] = v; };
let browser;
try {
  for (let i = 0; i < 50 && !(await fetch(`${base}/api/boards`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));
  const id = cli(["start", "Canvas e2e", "--goal", "check the canvas", "--no-pane"]).id;
  // Pictures are data: URLs so the check needs no network.
  const px = (c) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${c}"/><circle cx="200" cy="150" r="90" fill="#fff"/></svg>`).toString("base64")}`;
  cli(["push", id, "-"], JSON.stringify({ palette: ["#e8590c", "#1971c2"], notes: [{ who: "agent", text: "Try warmer type" }], refs: [
    { title: "Swiss poster", url: "https://example.com/a", image: px("#e8590c") }, { title: "Text only ref", url: "https://example.com/b" }, { title: "Grid study", url: "https://example.com/c", image: px("#1971c2") }] }));
  const refs = (await (await fetch(`${base}/s/${id}/board.json`)).json()).refs, [A, B] = refs.map((r) => r.id);

  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" }), pg = await ctx.newPage();
  const errors = []; pg.on("pageerror", (e) => errors.push(String(e))); pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const scene = () => pg.evaluate(() => window.tasteCanvas.getSceneElements().map((e) => ({ id: e.id, type: e.type, ref: e.customData?.ref, fileId: e.fileId })));

  // 1. Excalidraw is the default engine; ref pictures load; light theme follows the browser.
  await pg.goto(`${base}/s/${id}/canvas`); await pg.waitForFunction(() => window.tasteCanvas, null, { timeout: 30000 });
  await pg.waitForFunction(() => Object.keys(window.tasteCanvas.getFiles()).length >= 2, null, { timeout: 15000 });
  assert.equal(await pg.$eval("[role=radio][aria-checked=true]", (e) => e.textContent), "Excalidraw");
  assert.equal(await pg.evaluate(() => window.tasteCanvas.getAppState().theme), "light");
  await pg.waitForTimeout(800); await pg.screenshot({ path: join(shots, "canvas-excalidraw.png") }); log("excalidraw", "default, pictures loaded, light");

  // 2. Drag a ref into Kept with the mouse: the board records a like.
  const drag = await pg.evaluate((A) => { const x = window.tasteCanvas, st = x.getAppState(), els = x.getSceneElements(), r = els.find((e) => e.id === `ref-${A}`), k = els.find((e) => e.id === "frame-kept"), s = (sx, sy) => [(sx + st.scrollX) * st.zoom.value + st.offsetLeft, (sy + st.scrollY) * st.zoom.value + st.offsetTop]; return { from: s(r.x + r.width / 2, r.y + r.height / 2), to: s(k.x + k.width / 2, k.y + 300), vw: innerWidth }; }, A);
  assert.ok(drag.to[0] < drag.vw, "Kept is on screen at the opening zoom");
  await pg.mouse.move(...drag.from); await pg.mouse.down(); await pg.mouse.move(...drag.to, { steps: 15 }); await pg.mouse.up();
  await pg.waitForFunction(() => /saved · like/.test(document.querySelector("[data-testid=status]").textContent), null, { timeout: 10000 });
  assert.equal(cli(["status", id]).all.find((r) => r.id === A).verdict, "like"); log("drag_to_kept", "like");

  // 3. The agent pushes a ref while the canvas is open: it appears without a reload.
  const n0 = (await scene()).filter((e) => e.ref).length;
  cli(["push", id, "-"], JSON.stringify({ refs: [{ title: "Live agent ref", url: `https://example.com/live-${Date.now()}` }] }));
  await pg.waitForFunction((n0) => window.tasteCanvas.getSceneElements().filter((e) => e.customData?.ref).length > n0, n0, { timeout: 15000 }); log("live_merge", "ok");

  // 4. Switch to Ink: view only, the panel explains the Inkboard round trip, both files download.
  await pg.click('[role=radio]:has-text("Ink")'); await pg.waitForSelector("[data-testid=ink-panel]");
  assert.equal(await pg.evaluate(() => window.tasteCanvas.getAppState().viewModeEnabled), true);
  const ex = await (await fetch(`${base}/s/${id}/board.excalidraw`)).json(), jc = await (await fetch(`${base}/s/${id}/board.canvas`)).json();
  assert.equal(ex.type, "excalidraw"); assert.ok(Object.keys(ex.files).length >= 2, "pictures embedded in .excalidraw");
  assert.ok(jc.nodes.every((n) => ["text", "file", "link", "group"].includes(n.type)), "JSON Canvas node types");

  // 5. Import a .canvas "saved from Inkboard" with ref B moved into Noped: B is noped, pictures survive.
  const nope = jc.nodes.find((n) => n.id === "frame-noped"), nb = jc.nodes.find((n) => n.id === `ref-${B}`);
  nb.x = nope.x + 20; nb.y = nope.y + 80; jc.nodes.push({ id: "ink-note", type: "text", text: "added in Ink", x: nope.x + 20, y: nope.y + 400, width: 220, height: 60 });
  const f = join(home, "edited.canvas"); writeFileSync(f, JSON.stringify(jc));
  await pg.setInputFiles("[data-testid=ink-panel] input[type=file]", f);
  await pg.waitForFunction(() => /imported|failed/.test(document.querySelector("[data-testid=ink-msg]")?.textContent ?? ""), null, { timeout: 15000 });
  assert.match(await pg.textContent("[data-testid=ink-msg]"), /imported \d+ shapes · 1 pick from moved refs/);
  await pg.waitForTimeout(1500);
  const st = cli(["status", id]).all; assert.equal(st.find((r) => r.id === B).verdict, "nope"); assert.equal(st.find((r) => r.id === A).verdict, "like", "a pending browser save didn't overwrite the import");
  const after = await scene(); assert.equal(after.find((e) => e.id === `ref-${A}`).type, "image", "picture refs stay pictures after a JSON Canvas import");
  assert.ok(after.some((e) => e.id === "ink-note"));
  await pg.evaluate(() => window.tasteCanvas.scrollToContent(window.tasteCanvas.getSceneElements().filter((e) => e.id === "frame-noped"), { fitToViewport: true, viewportZoomFactor: 0.8 }));
  await pg.waitForTimeout(500); await pg.screenshot({ path: join(shots, "canvas-ink.png") }); log("ink_import", "nope recorded, pictures kept");

  // 6. The engine choice survives a reload; dark theme follows the board's theme key.
  await pg.reload(); await pg.waitForSelector("[data-testid=ink-panel]", { timeout: 15000 });
  assert.equal(await pg.$eval("[role=radio][aria-checked=true]", (e) => e.textContent), "Ink"); log("engine_persisted", "Ink");
  const dk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dk.goto(`${base}/s/${id}/canvas?engine=excalidraw&theme=dark`); await dk.waitForFunction(() => window.tasteCanvas);
  assert.equal(await dk.evaluate(() => window.tasteCanvas.getAppState().theme), "dark");
  await dk.waitForTimeout(1500); await dk.screenshot({ path: join(shots, "canvas-dark.png") }); log("dark", "ok");

  // Excalidraw registers an unload listener; Chrome reports that as a policy notice on reload. Anything else fails.
  assert.deepEqual(errors.filter((e) => !/Permissions policy violation: unload/.test(e)), []);
  console.log(JSON.stringify({ ok: true, ...summary, shots }, null, 1));
} catch (e) {
  console.error("e2e FAILED:", e.message, JSON.stringify(summary)); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill();
  if (!process.env.SHOTS && !process.exitCode) rmSync(home, { recursive: true, force: true });
}
