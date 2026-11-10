// Frame-time probe: idle main-thread load and frame times during zoom tours, desktop and a throttled
// phone. Usage: node perf.mjs [base]  ·  exits 1 if the phone tour p95 frame exceeds BUDGET_MS (default 34).
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:8789";
const budget = +(process.env.BUDGET_MS ?? 34);
// Real phones raster on the GPU; headless Chromium defaults to software raster, which inflates
// paint-heavy frames. GPU=0 measures the software path instead.
const GPU_ARGS = process.env.GPU === "0" ? ["--enable-gpu-rasterization"]
  : ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=vulkan", "--enable-features=Vulkan"];
const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: GPU_ARGS });

async function run(name, ctx, throttle) {
  const p = await b.newPage(ctx), cdp = await p.context().newCDPSession(p);
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  if (throttle) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await cdp.send("Performance.enable");
  await p.goto(`${base}/?theme=dark`);
  await p.waitForFunction(() => window.__atlas?.bm !== undefined, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const busy = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value;
  const t0 = await busy(); await p.waitForTimeout(2000); const idle = ((await busy()) - t0) / 2;
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const m0 = await metrics(); if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
  const frames = await p.evaluate(async () => {
    const out = [], { go } = window.__atlas; let last = performance.now(), on = true;
    (function tick(now) { out.push(now - last); last = now; if (on) requestAnimationFrame(tick); })(last);
    for (const id of ["evoke", "tactile-surface", "differentiate", "color-isolation", "root", "animate"]) { go(id, 900); await new Promise((r) => setTimeout(r, 1100)); }
    on = false; return out.slice(2);
  });
  const m1 = await metrics(), split = Object.fromEntries(["Task", "Script", "Layout", "RecalcStyle"].map((k) => [k, +(m1[k + "Duration"] - m0[k + "Duration"]).toFixed(2)]).concat([["layouts", m1.LayoutCount - m0.LayoutCount], ["styles", m1.RecalcStyleCount - m0.RecalcStyleCount]]));
  if (process.env.PROFILE) { // top self-time JS functions during the tour
    const { profile } = await cdp.send("Profiler.stop"), node = new Map(profile.nodes.map((n) => [n.id, n.callFrame])), self = new Map();
    profile.samples.forEach((s, i) => { const f = node.get(s), k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0)); });
    console.log([...self].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `  ${(v / 1000).toFixed(0)}ms ${k}`).join("\n"));
  }
  frames.sort((x, y) => x - y);
  const q = (k) => frames[Math.min(frames.length - 1, Math.floor(frames.length * k))].toFixed(1);
  const dom = await p.evaluate(() => document.getElementsByTagName("*").length);
  const r = { name, idleBusy: `${(idle * 100).toFixed(0)}%`, frames: frames.length, p50: q(0.5), p95: q(0.95), max: q(0.999), over50ms: frames.filter((f) => f > 50).length, split, dom, errs };
  console.log(JSON.stringify(r)); await p.close(); return r;
}
await run("desktop", { viewport: { width: 1440, height: 900 } });
const phone = await run("phone-4x", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 4);
await b.close();
process.exit(+phone.p95 > budget || phone.errs.length ? 1 : 0);
