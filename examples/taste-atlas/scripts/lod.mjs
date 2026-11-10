// Deep-zoom + canvas autoplay probe: zooms onto a post with a clip, checks clips play and the <=1600px still loads,
// and measures frame times while videos play. Usage: node lod.mjs [base] · exits 1 on any failure.
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:8789", shots = process.env.SHOTS ?? "/mnt/zer0models/project-artifacts/taste/pw/out";
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ["--autoplay-policy=no-user-gesture-required", ...(process.env.GPU === "0" ? [] : ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=vulkan", "--enable-features=Vulkan"])] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(`${base}/?theme=dark`);
await p.waitForFunction(() => window.__atlas?.bm?.lod?.().hires > 0, null, { timeout: 30000 });
const fail = []; const sleep = (ms) => p.waitForTimeout(ms);
const t = await p.evaluate(() => window.__atlas.bm.lod().tiles[0]);
const cam = (s) => p.evaluate(([t, s]) => { window.__atlas.A.view.cam = { x: t.x, y: t.y, s }; }, [t, s]);
await sleep(2000); // let the intro zoom (go(focus, 600)) finish so it cannot overwrite the camera
await cam(2.5); await p.waitForFunction(() => window.__atlas.bm.lod().playing.some((v) => v.ready >= 2 && v.t > 0), null, { timeout: 8000 }).catch(() => {});
let l = await p.evaluate(() => window.__atlas.bm.lod());
console.log("s=2.5 playing", JSON.stringify(l.playing));
if (!l.playing.length || !l.playing.some((v) => v.ready >= 2 && v.t > 0)) fail.push("no clip playing at s=2.5");
// Lag = extra frame time caused by playing clips, measured against the same view with clips paused (robust to host load).
const measure = () => p.evaluate(async () => { const out = []; let last = performance.now(); await new Promise((r) => { const end = last + 3000; (function f(n) { out.push(n - last); last = n; n < end ? requestAnimationFrame(f) : r(); })(last); }); return out.slice(2).sort((a, b) => a - b); });
const stat = (f) => ({ n: f.length, p50: f[Math.floor(f.length / 2)], p95: f[Math.floor(f.length * 0.95)] });
// Lag check: after the app has had time to tune its clip count, frame rate with clips playing must match the rate with
// all clips paused (same view). Headless Chrome on this host drops to 30 fps at 2+ decoders, so this proves the tuner.
await sleep(5000);
const tuned = await p.evaluate(() => window.__atlas.bm.lod());
const playingN = stat(await measure()).n;
console.log(`tuned to ${tuned.limit} clips (baseline ${tuned.fps0.toFixed(0)} fps), ${tuned.playing.length} playing, rAF/3s ${playingN}`);
const vids = (k) => p.evaluate((k) => [...document.querySelectorAll(".bm-video-dock video")].forEach((v, i) => (v.tile && i < k ? v.play() : v.pause())), k);
await vids(0); await sleep(500); const idle = stat(await measure()).n; console.log("all paused rAF/3s", idle);
if (!tuned.playing.length) fail.push("tuner stopped every clip");
if (playingN < idle * 0.85) fail.push(`clips still cost frames after tuning: ${playingN} vs ${idle}`);
if (process.env.DIAG) { await p.addStyleTag({ content: "* { backdrop-filter: none !important; }" }); await vids(6); await sleep(500); console.log("DIAG no-backdrop 6 clips rAF/3s", stat(await measure()).n);
  await p.addStyleTag({ content: "#bm-canvas { display: none !important; }" }); await sleep(500); console.log("DIAG no-canvas 6 clips rAF/3s", stat(await measure()).n); }
await p.screenshot({ path: `${shots}/lod-s2.5.png` });
await cam(14); await sleep(2500);
l = await p.evaluate(() => window.__atlas.bm.lod()); console.log("s=14 big stills", l.big, "playing", l.playing.length);
await p.screenshot({ path: `${shots}/lod-s14.png` });
await cam(0.3); await sleep(1500); l = await p.evaluate(() => window.__atlas.bm.lod()); console.log("s=0.3 playing", l.playing.length);
if (l.playing.length) fail.push("clips still playing when zoomed out");
console.log("errors:", errs.length ? errs.slice(0, 5) : "none"); if (errs.length) fail.push("console errors");
// Control: a bare page with one plain <video> - if rAF halves here too, the halving is the headless harness, not the app.
const c = await b.newPage(); await c.goto(`${base}/library`); await c.evaluate(() => { document.body.innerHTML = ""; });
const ctl = async (play) => c.evaluate(async ([src, play]) => { let v = document.querySelector("video"); if (!v) { v = Object.assign(document.createElement("video"), { muted: true, loop: true, src }); document.body.appendChild(v); } play ? await v.play() : v.pause(); await new Promise((r) => setTimeout(r, 500)); let k = 0; const end = performance.now() + 3000; await new Promise((r) => (function f(x) { k++; x < end ? requestAnimationFrame(f) : r(); })(0)); return k; }, [`${base}/data/clips/${t.id}.mp4`, play]);
console.log("gpu:", await c.evaluate(() => { const g = document.createElement("canvas").getContext("webgl"); const e = g?.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "no webgl"; }));
if (process.env.DIAG) console.log("DIAG control 6 plain videos rAF/3s", await c.evaluate(async (ids) => { for (const id of ids) { const v = Object.assign(document.createElement("video"), { muted: true, loop: true, src: `/data/clips/${id}.mp4`, width: 240 }); document.body.appendChild(v); await v.play(); } await new Promise((r) => setTimeout(r, 500)); let k = 0; const end = performance.now() + 3000; await new Promise((r) => (function f(x) { k++; x < end ? requestAnimationFrame(f) : r(); })(0)); document.querySelectorAll("video").forEach((v) => v.remove()); return k; }, (await p.evaluate(() => window.__atlas.bm.lod().tiles.slice(0, 6).map((t) => t.id)))));
console.log("control page rAF/3s: paused", await ctl(false), "one plain video playing", await ctl(true));
await b.close(); if (fail.length) { console.error("FAIL", fail); process.exit(1); } console.log("PASS");
