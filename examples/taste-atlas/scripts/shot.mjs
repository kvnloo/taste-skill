// Screenshot the live app in a few states; report console errors. Usage: node shot.mjs <outdir>
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_FROM ?? "/mnt/zer0models/project-artifacts/taste/pw/package.json");
const { chromium } = require("playwright-core");
const out = process.argv[2] ?? ".";
// CHROME=/path picks the browser; Google Chrome has the H.264 codec X's mp4s need, Playwright's Chromium does not.
const b = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
// a failed load is reported by URL (the console line has none); data/*.json is optional: the public sample has no snapshot
const errs = [], OPTIONAL = /\/data\/[\w-]+\.json$/, http = (pg, tag = "") => pg.on("response", (r) => r.status() >= 400 && !OPTIONAL.test(new URL(r.url()).pathname) && errs.push(`${tag}${r.status()} ${r.url()}`));
const noisy = (m) => m.type() !== "error" || /^Failed to load resource/.test(m.text());
p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => noisy(m) || errs.push(m.text())); http(p);
// Every page names the URL behind each bare "Failed to load resource" console error (logged, so a FAIL says what broke).
const np = b.newPage.bind(b); b.newPage = async (...a) => { const q = await np(...a); q.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.url())); return q; };
// LENS=1: the overview hides posts the taxonomy never placed; #project:<id> lights only that project's posts (plus a
// few greyed neighbours) and the shelf lists the project's resources in sections, not just its journey.
if (process.env.LENS) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [];
  const q = await b.newPage({ viewport: { width: 1440, height: 900 } }); q.on("pageerror", (e) => errs.push(String(e)));
  await q.goto(`${base}/`); await q.evaluate(() => (localStorage.removeItem("taste:loose"), localStorage.removeItem("taste:hidden2"))); await q.reload();
  await q.waitForFunction(() => window.__atlas?.lens, null, { timeout: 30000 });
  const root = await q.evaluate(() => ({ shown: window.__atlas.bm.tilesShown(), loose: document.querySelector(".layers [data-loose]")?.className, linkedin: !!document.querySelector('.layers [data-layer="linkedin"]') }));
  if (root.loose !== "" || root.linkedin) bad.push("overview shows unsorted layers: " + JSON.stringify(root));
  await q.screenshot({ path: `${out}/lens-root.png` });
  await q.goto(`${base}/#project:glide`); await q.reload(); await q.waitForFunction(() => document.querySelectorAll(".ln h4").length, null, { timeout: 30000 });
  const lens = await q.evaluate(() => ({ kind: document.querySelector(".shelf header small")?.innerText, secs: [...document.querySelectorAll(".ln h4")].map((h) => h.firstChild.textContent.trim()), lit: document.querySelectorAll(".node.on").length, body: document.body.classList.contains("lens") }));
  console.log("lens", JSON.stringify({ root, lens }));
  if (lens.kind !== "PROJECT" || !lens.body) bad.push("project lens did not open");
  for (const s of ["User journey", "Repos", "Pull requests", "Components", "Inspiration"]) if (!lens.secs.includes(s)) bad.push("lens lacks section " + s);
  if (!lens.lit) bad.push("no technique lit for the project's posts");
  await q.screenshot({ path: `${out}/lens-glide.png` });
  await q.selectOption(".layers select.projpick", ""); if (await q.evaluate(() => document.body.classList.contains("lens") || location.hash.startsWith("#project:"))) bad.push("clearing the project picker left the lens on");
  if (errs.length) bad.push(...errs);
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// ONBOARD=1: the import page on a fresh data dir (run the server with an empty $ATLAS_DATA): 8 source cards, upload
// fixture exports through the real file input (FIXTURES=<dir> of files), the import job finishes, the cards turn on,
// and the Atlas shows each imported layer in the Layers bar. Desktop + phone screenshots.
// SKILLS=1: picking the Skillshub project (work.config.json "atlas": "skills") reopens the atlas on the skill taxonomy
// (scripts/skills.mjs): skill domains in the legend, the project's sections in the shelf, skill records as tiles, no
// greyed-out canvas; picking "none" returns to the taste taxonomy.
if (process.env.SKILLS) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [], q = await b.newPage({ viewport: { width: 1440, height: 900 } });
  q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => noisy(m) || errs.push(m.text())); http(q);
  await q.goto(`${base}/`); await q.waitForFunction(() => window.__atlas?.lens, null, { timeout: 60000 }).catch(async (e) => { console.error("FAIL atlas did not mount", errs, await q.evaluate(() => Object.keys(window.__atlas ?? {}))); throw e; });
  await q.selectOption("select.projpick", "skillshub"); await q.waitForURL(/atlas=skills/, { timeout: 15000 });
  await q.waitForFunction(() => window.__atlas?.lens?.current?.() === "skillshub", null, { timeout: 60000 }).catch(async (e) => { console.error("FAIL lens did not open", q.url(), errs, await q.evaluate(() => Object.keys(window.__atlas ?? {}))); throw e; }); await q.waitForTimeout(2500);
  const s = await q.evaluate(() => ({ stat: document.getElementById("stat").innerText, legend: document.getElementById("legend").innerText.split("\n").filter(Boolean),
    kind: document.querySelector(".shelf header small")?.innerText, secs: [...document.querySelectorAll(".ln h4")].map((h) => h.firstChild.textContent.trim()),
    layers: [...document.querySelectorAll(".layers [data-layer]")].map((x) => x.innerText.replace(/\n/g, " ")), tiles: window.__atlas.bm.tilesShown(), intro: document.querySelector("#card .eyebrow")?.innerText,
    // Domain labels sit round the hub; with ~400 leaves the small domains used to pile up there.
    clash: (() => { const L = [...document.querySelectorAll("text.l1")].filter((t) => getComputedStyle(t).display !== "none").map((t) => [t.textContent, t.getBoundingClientRect()]), h = [];
      for (const [i, [a, r]] of L.entries()) for (const [b, c] of L.slice(i + 1)) if (r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom) h.push(a + "×" + b); return h; })() }));
  await q.screenshot({ path: `${out}/skills-project.png` });
  await q.evaluate(() => window.__atlas.go("j:design-taste")); await q.waitForTimeout(1500);
  const job = await q.evaluate(() => document.getElementById("card").innerText.replace(/\n+/g, " | ").slice(0, 400));
  await q.screenshot({ path: `${out}/skills-job.png` });
  await q.evaluate(() => window.__atlas.go("agents")); await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/skills-domain.png` });
  await q.selectOption("select.projpick", ""); await q.waitForURL((u) => !/atlas=/.test(u.search), { timeout: 15000 }); await q.waitForFunction(() => window.__atlas?.bm, null, { timeout: 60000 });
  const back = await q.evaluate(() => document.getElementById("stat").innerText);
  console.log("skills", JSON.stringify({ s, job, back }, null, 1));
  if (!/domains .* jobs .* skills/.test(s.stat)) bad.push("stat is not the skills taxonomy: " + s.stat);
  if (!s.legend.includes("Agents") || s.legend.includes("Differentiate")) bad.push("legend is not the skill domains");
  if (s.kind !== "PROJECT" || !s.secs.includes("Components")) bad.push("Skillshub project shelf did not open");
  if (!s.tiles) bad.push("no skill tiles on the canvas");
  if (s.clash.length) bad.push("domain labels overlap: " + s.clash.join(", "));
  if (!/Design Taste/.test(job) || !/USE CASES/.test(job)) bad.push("job card wrong: " + job);
  if (!/operations/.test(back)) bad.push("leaving the project did not return to the taste atlas: " + back);
  if (errs.length) bad.push(...errs);
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}

if (process.env.ONBOARD) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [], { readdirSync } = await import("node:fs");
  const files = readdirSync(process.env.FIXTURES).map((f) => `${process.env.FIXTURES}/${f}`);
  for (const [name, vp] of [["onboard-desk", { width: 1440, height: 900 }], ["onboard-phone", { width: 390, height: 844 }]]) {
    const q = await b.newPage({ viewport: vp }); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && errs.push(m.text()));
    q.on("response", (r) => r.status() === 404 && !/\/data\//.test(r.url()) && errs.push(`404 ${r.url()}`)); // absent optional data files 404 by design
    await q.goto(`${base}/onboard?theme=dark`); await q.waitForSelector(".ob-card");
    const before = await q.evaluate(() => ({ cards: document.querySelectorAll(".ob-card").length, done: window.__onboard.state.done }));
    if (name === "onboard-desk") {
      await q.screenshot({ path: `${out}/${name}-empty.png`, fullPage: true });
      const n0 = await q.evaluate(() => window.__onboard.state.jobs.length);
      await q.setInputFiles("#file", files);
      await q.waitForFunction((n) => { const j = window.__onboard.state?.jobs; return j.length > n && ["done", "failed"].includes(j[0].state); }, n0, { timeout: 60000 });
    }
    const head = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, ...Object.fromEntries([".views", ".bar h1", "#theme"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [Math.round(r.left), Math.round(r.right), Math.round(r.height)]]; })) }));
    console.log(name, "header", JSON.stringify(head));
    if (head.sw > vp.width || head["#theme"][1] > vp.width) bad.push(`${name}: header overflows (${JSON.stringify(head)})`);
    const after = await q.evaluate(() => ({ done: window.__onboard.state.done, on: [...document.querySelectorAll(".ob-card.in")].map((c) => c.dataset.source), job: window.__onboard.state.jobs[0]?.state, drop: document.querySelector("#drop").getBoundingClientRect().width }));
    console.log(name, JSON.stringify({ before, after }));
    if (before.cards !== 8) bad.push(`${name}: ${before.cards} cards`);
    if (name === "onboard-desk" && (after.job !== "done" || after.done <= before.done)) bad.push(`${name}: import ${after.job}, ${before.done} -> ${after.done} sources`);
    if (after.drop < Math.min(vp.width, 1180) * 0.8) bad.push(`${name}: drop zone ${after.drop}px wide`);
    await q.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    const want = after.on;
    await q.goto(`${base}/?theme=dark`); await q.evaluate(() => localStorage.setItem("taste:loose", "1")); await q.reload(); await q.waitForFunction(() => window.__atlas?.bm, null, { timeout: 30000 }).catch(() => bad.push(`${name}: atlas never mounted the imported layers`));
    const layers = await q.evaluate(() => [...document.querySelectorAll(".layers [data-layer]")].map((x) => x.dataset.layer));
    const map = { x: "saved", web: "web" };
    for (const s of want) if (map[s] && !layers.includes(map[s])) bad.push(`${name}: layer ${map[s]} missing from the Layers bar (${layers})`);
    await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/${name}-atlas.png` });
  }
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// HISTORY=1: check /history (desktop + phone): one card per imported source, calendars drawn, covers load, no errors.
if (process.env.HISTORY) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [];
  for (const [name, vp] of [["history-desk", { width: 1440, height: 900 }], ["history-phone", { width: 390, height: 844 }]]) {
    const q = await b.newPage({ viewport: vp }); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await q.goto(`${base}/history?theme=dark`); await q.waitForSelector(".hcard canvas", { timeout: 15000 });
    await q.waitForFunction(() => [...document.querySelectorAll(".covers img")].every((i) => i.complete), null, { timeout: 20000 }).catch(() => bad.push(`${name}: covers never finished loading`));
    const r = await q.evaluate(async () => {
      const want = Object.keys((await (await fetch("/data/history.atlas.json")).json()).series);
      return { want, cards: [...document.querySelectorAll(".hcard")].map((c) => ({ src: c.querySelector(".cal").dataset.s, w: c.querySelector("canvas").width, imgs: c.querySelectorAll(".covers img").length,
        broken: [...c.querySelectorAll(".covers img")].filter((i) => !i.complete || !i.naturalWidth).length })) };
    });
    console.log(name, JSON.stringify(r));
    if (r.cards.length !== r.want.length) bad.push(`${name}: ${r.cards.length} cards for ${r.want.length} sources`);
    for (const c of r.cards) { if (!c.w) bad.push(`${name}: ${c.src} calendar empty`); if (!c.imgs) bad.push(`${name}: ${c.src} no covers`); if (c.broken) bad.push(`${name}: ${c.src} ${c.broken} broken covers`); }
    await q.screenshot({ path: `${out}/${name}.png`, fullPage: name.endsWith("desk") });
  }
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// MISSION=1: check /mission on the local snapshot and the public sample: in both modes no two visible nodes overlap,
// replay fires events into the ticker, LIVE pins the clock to now, an Insights failure highlights its nodes, no errors.
// Retro: every time window (today/week/project) lays out without overlaps, wider windows hold more chats, the ranked
// time sinks render, and clicking the top sink highlights its chats.
if (process.env.MISSION) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [], chats = {};
  for (const q of ["", "&sample=1", "&span=week", "&span=project"]) for (const mode of ["pm", "bs"]) {
    const name = `mission-${mode}${q ? `-${q === "&sample=1" ? "sample" : q.split("=")[1]}` : ""}`;
    await p.goto(`${base}/mission?mode=${mode}&theme=dark${q}`); await p.waitForFunction(() => window.__mission?.nodes.size > 10, null, { timeout: 15000 }); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const bs = document.documentElement.dataset.mode === "bs", ns = [...window.__mission.nodes.values()].filter((n) => n.cur.o > 0.5 && n.kind !== "axis");
      const box = (n) => { const h = n.el.offsetHeight; return [n.cur.x, n.cur.y - (bs && n.kind === "stream" ? h : 0), n.cur.w, h]; }, hits = [];
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const [ax, ay, aw, ah] = box(ns[i]), [bx, by, bw, bh] = box(ns[j]);
        if (Math.min(ax + aw, bx + bw) - Math.max(ax, bx) > 4 && Math.min(ay + ah, by + bh) - Math.max(ay, by) > 4) hits.push(`${ns[i].id} x ${ns[j].id}`);
      }
      return { nodes: ns.length, chats: ns.filter((n) => n.kind === "session").length, hits, src: document.getElementById("srcbadge").textContent };
    });
    console.log(name, JSON.stringify({ ...r, hits: r.hits.slice(0, 5) }));
    if (r.hits.length) bad.push(`${name}: ${r.hits.length} overlapping nodes, e.g. ${r.hits[0]}`);
    if (q === "&sample=1" && !r.src.startsWith("public sample")) bad.push(`${name}: ?sample did not load the public sample`);
    chats[`${mode}${q}`] = r.chats;
    if (q.includes("span=")) { const days = await p.evaluate(() => [...document.querySelectorAll(".hours i.day:not(.tight)")].map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.right > 0 && b.left < innerWidth));
      if (mode === "pm" && r.chats > chats.pm && days.length < 2) bad.push(`${name}: a multi-day window shows ${days.length} day labels`);
      if (days.some((b, i) => i && b.left < days[i - 1].right)) bad.push(`${name}: day labels overlap`); }
    await p.screenshot({ path: `${out}/${name}.png` });
  }
  if (!(chats["pm&span=project"] >= chats["pm&span=week"] && chats["pm&span=week"] >= chats.pm)) bad.push(`windows: chats today/week/project ${chats.pm}/${chats["pm&span=week"]}/${chats["pm&span=project"]} should not shrink`);
  await p.goto(`${base}/mission?mode=pm&theme=dark&lens=1`); await p.waitForFunction(() => document.querySelectorAll("#insights .sink").length > 0, null, { timeout: 15000 });
  const sinks = await p.evaluate(() => [...document.querySelectorAll("#insights .sink")].map((b) => b.querySelector("b").textContent + " " + b.querySelector(".what").firstChild.textContent));
  await p.click("#insights .sink"); await p.waitForTimeout(1000);
  const shl = await p.evaluate(() => document.querySelectorAll(".n.hl").length); if (!shl) bad.push("retro: the top time sink highlighted nothing");
  await p.screenshot({ path: `${out}/mission-retro.png` }); console.log("retro sinks", JSON.stringify(sinks.slice(0, 4)), "highlighted", shl);
  await p.goto(`${base}/mission?mode=pm&theme=dark&t=14:00`); await p.waitForTimeout(1000);
  await p.click('[data-speed="45"]'); await p.click("#play"); await p.waitForTimeout(2000);
  const tk = await p.evaluate(() => document.querySelectorAll("#ticker .tk").length); if (!tk) bad.push("replay: no events reached the ticker");
  await p.keyboard.press("l"); await p.waitForTimeout(400);
  if (!(await p.evaluate(() => document.getElementById("live").classList.contains("on")))) bad.push("LIVE did not pin the clock to now");
  await p.keyboard.press("i"); await p.waitForTimeout(400); await p.click("#insights .rec"); await p.waitForTimeout(900);
  const hl = await p.evaluate(() => document.querySelectorAll(".n.hl").length); if (!hl) bad.push("insights: a recurring failure highlighted nothing");
  await p.screenshot({ path: `${out}/mission-insights.png` }); console.log("replay ticker", tk, "highlighted", hl);
  // Phones (touch, DPR 3): every state passes ux(), and each control works by touch, not only by key or mouse.
  // ux(): no sideways scroll; every visible control on screen (or inside an on-screen scroller), >= 36px to tap
  // (44 for standalone buttons); chrome text >= 11px; fixed surfaces never overlap; an open sheet ends above the
  // replay bar; and the camera shows at least 3 cards.
  const ux = (pg, tag) => pg.evaluate((tag) => {
    const vw = innerWidth, vh = innerHeight, out = [], vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0" ? r : null; };
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    const ui = [...document.querySelectorAll(".m-chrome, .m-panel:not([hidden]), .m-replay")];
    for (const e of ui.flatMap((u) => [...u.querySelectorAll("button, a, input, [role=tab]")])) {
      const r = vis(e); if (!r || e.closest("[hidden]")) continue; const name = (e.id ? "#" + e.id : "") + (e.textContent.trim().slice(0, 18) || e.title || e.className);
      const sc = e.closest(".m-span, .m-panel"), box = sc ? sc.getBoundingClientRect() : { left: 0, right: vw, top: 0, bottom: vh };
      if (!sc && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)) out.push(`off screen: ${name}`);
      if (sc && (box.left < -1 || box.right > vw + 1)) out.push(`scroller off screen: ${sc.className}`);
      // a control must sit inside every drawn box around it (segment, row, sheet): content spilling past a border reads as broken
      for (let a = e.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a);
        if (parseFloat(cs.borderLeftWidth) > 0 || cs.backgroundColor !== "rgba(0, 0, 0, 0)") { const ab = a.getBoundingClientRect();
          if (r.left < ab.left - 1 || r.right > ab.right + 1) { out.push(`clipped in its ${a.className.split(" ")[0] || a.tagName.toLowerCase()}: ${name} (${Math.round(Math.max(ab.left - r.left, r.right - ab.right))}px out)`); break; } }
        if (ui.includes(a)) break; }
      const min = e.matches(".m-pill, #play, #live, .x") ? 44 : 36; if (!e.closest(".m-panel .body, .m-panel p") && (r.height < min - 0.5 || r.width < Math.min(min, 36) - 0.5)) out.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)} < ${min}: ${name}`);
    }
    for (const u of ui) for (const e of u.querySelectorAll("*")) { if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !vis(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) { out.push(`text ${fs}px: "${e.textContent.trim().slice(0, 24)}"`); break; } }
    const fx = [...document.querySelectorAll(".m-chrome, .m-panel:not([hidden]), .m-replay, .m-ticker")].map((e) => [e, e === document.querySelector(".m-chrome") ? [...e.children].map(vis).filter(Boolean).reduce((a, r) => ({ top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom), left: 0, right: vw }), { top: 1e9, bottom: -1e9 }) : vis(e)]).filter(([, r]) => r && r.bottom > r.top);
    for (let i = 0; i < fx.length; i++) for (let j = i + 1; j < fx.length; j++) { const [a, ra] = fx[i], [b, rb] = fx[j];
      if (Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 1 && Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 1) out.push(`overlap: ${a.className.split(" ")[0]} x ${b.className.split(" ")[0]}`); }
    const cards = [...document.querySelectorAll("#nodes .n")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh && r.width > 20; }).length;
    const sheet = document.querySelector(".m-panel:not([hidden])"); // with a sheet up, the drawer check (tapped card uncovered) applies instead
    if (cards < (sheet ? 1 : 3)) out.push(`camera shows ${cards} cards`);
    // legible: on a single-day view at least 3 on-screen chat titles render >= 9px tall on the glass
    if (!document.querySelector('[data-span="today"].on') || document.querySelector(".m-panel:not([hidden])")) return out.map((m) => `${tag}: ${m}`);
    const k = window.__mission.S.cam.k, legible = [...document.querySelectorAll("#nodes .n-session h3")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh && parseFloat(getComputedStyle(e).fontSize) * k >= 9; }).length;
    if (document.documentElement.dataset.mode === "bs") { const g = document.querySelector("#nodes .n-goal"), r = g?.getBoundingClientRect(), h1 = g?.querySelector("h1");
      if (!r || r.left < -1 || r.right > vw + 1) out.push("the goal (brainstorm sun) is cropped"); else if (parseFloat(getComputedStyle(h1).fontSize) * k < 16) out.push(`goal title renders ${(parseFloat(getComputedStyle(h1).fontSize) * k).toFixed(1)}px`); }
    else if (legible < 3) out.push(`only ${legible} chat titles are legible (zoom ${k.toFixed(2)})`);
    return out.map((m) => `${tag}: ${m}`);
  }, tag);
  for (const [w, h] of [[390, 844], [360, 800]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const q = await ctx.newPage(), tag = `phone${w}`;
    q.on("pageerror", (e) => errs.push(`${tag}: ${e}`)); q.on("console", (m) => noisy(m) || errs.push(`${tag}: ${m.text()}`)); http(q, `${tag}: `);
    // reachability and responsiveness are separate verdicts: a tap fails when the control is off screen, covered or moving;
    // a tap that is dispatched but slow to finish is the page being busy, judged below by its own Event Timing (INP)
    const tap = (sel) => q.tap(sel, { timeout: 15000 }).then(() => true, (e) => { const why = e.message.split("\n").filter((l) => l.trim()).slice(-1)[0].trim();
      bad.push(`${tag}: ${/outside of the viewport/.test(e.message) ? `cannot tap ${sel}: off screen` : /performing tap action/.test(why) ? `tapping ${sel} froze the page > 15 s` : `cannot tap ${sel}: ${why}`}`); return false; });
    const check = async (t) => bad.push(...(await ux(q, `${tag} ${t}`)));
    const shot = async (t) => { const c = await ctx.newCDPSession(q); const x = await c.send("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(`${out}/mission-${tag}-${t}.png`, Buffer.from(x.data, "base64")); await c.detach(); };
    await q.addInitScript(() => { window.__inp = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__inp.push({ n: e.name, t: e.target?.closest?.("[data-span],[data-mode],[id],.n")?.dataset?.span ?? e.target?.id ?? "", run: Math.round(e.processingEnd - e.processingStart), d: e.duration }); }).observe({ type: "event", durationThreshold: 16, buffered: true }); });
    await q.goto(`${base}/mission?mode=pm`); await q.waitForFunction(() => window.__mission?.nodes.size > 10, null, { timeout: 30000 }); await q.waitForTimeout(1500);
    await check("load"); await shot("pm");
    // judge a state once every card has arrived at its layout target and the camera is still, not after a fixed delay
    // (a mode switch is a 1.1 s card tween plus a camera flight; slow software-GL frames make any fixed wait flaky)
    const settle = async () => { let last = "";
      for (let i = 0; i < 50; i++) { const s = await q.evaluate(() => { const m = window.__mission;
          const arrived = [...m.nodes.values()].every((n) => { const p = n.pos[m.S.mode]; return !p || (Math.abs(n.cur.x - p.x) < 0.5 && Math.abs(n.cur.y - p.y) < 0.5 && Math.abs(n.cur.w - p.w) < 0.5); });
          return arrived ? JSON.stringify(m.S.cam) : ""; });
        if (s && s === last) return; last = s; await q.waitForTimeout(300); }
      bad.push(`${tag}: the canvas never comes to rest`); };
    await tap('[data-mode="bs"]'); await q.waitForTimeout(400); await settle(); if ((await q.evaluate(() => document.documentElement.dataset.mode)) !== "bs") bad.push(`${tag}: tapping Brainstorm did not switch mode`); await check("bs"); await shot("bs");
    await tap('[data-mode="pm"]'); await q.waitForTimeout(600);
    await tap('[data-span="week"]'); await q.waitForTimeout(400); await settle(); if (!(await q.evaluate(() => document.querySelector('[data-span="week"]').classList.contains("on")))) bad.push(`${tag}: tapping Week did nothing`); await check("week"); await shot("week");
    // every window tap must visibly answer under the buttons, and Custom keeps a count beside its two date inputs, all on screen
    const info = () => q.evaluate(() => { const e = document.getElementById("spanInfo"), r = e.getBoundingClientRect(); return { txt: e.innerText.trim(), shown: r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 }; });
    const iw = await info(); await tap('[data-span="custom"]'); await q.waitForTimeout(800); const ic = await info();
    const dates = await q.evaluate(() => ["from", "to"].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 90 && r.left >= -1 && r.right <= innerWidth + 1 && r.height >= 36; }));
    if (!ic.shown || !/\d+ chats/.test(ic.txt)) bad.push(`${tag}: Custom drops the chat count ("${ic.txt}")`); if (!dates) bad.push(`${tag}: Custom's date inputs are clipped or too small to tap`);
    await tap('[data-span="today"]'); await q.waitForTimeout(1200); const it = await info(); if (it.txt === iw.txt) bad.push(`${tag}: the summary reads the same for Week and Today ("${it.txt}")`);
    await tap("#lens"); await q.waitForTimeout(700); if (await q.evaluate(() => document.getElementById("insights").hidden)) bad.push(`${tag}: tapping Retro opened nothing`);
    await check("retro"); await shot("retro");
    const sink = q.locator("#insights .sink").first(); await sink.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await sink.tap({ timeout: 3000 }).catch(() => bad.push(`${tag}: cannot tap a time sink`)); await q.waitForTimeout(900);
    await q.waitForTimeout(500); // the camera flies to the highlighted chats; at least one must be on screen and not under the sheet
    const seen = await q.evaluate(() => [...document.querySelectorAll(".n.hl")].filter((e) => { const r = e.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 20); return x > 0 && x < innerWidth && y > 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest(".n") === e; }).length);
    if (!(await q.evaluate(() => document.querySelectorAll(".n.hl").length))) bad.push(`${tag}: tapping a time sink highlighted nothing`); else if (!seen) bad.push(`${tag}: the sink's chats are highlighted but hidden (off screen or under the sheet)`);
    await shot("sink");
    await tap("#insights"); await q.waitForTimeout(400); if (await q.evaluate(() => document.getElementById("insights").classList.contains("peek"))) bad.push(`${tag}: the folded retro sheet does not reopen on tap`);
    if (!(await q.evaluate(() => { const s = document.getElementById("insights"); return s.scrollHeight <= s.clientHeight || getComputedStyle(s).overflowY !== "visible"; }))) bad.push(`${tag}: retro sheet cannot scroll`);
    // the sheet closes from inside itself (its own close button), and the Retro pill toggles it back
    await tap("#insights .x"); await q.waitForTimeout(500); if (!(await q.evaluate(() => document.getElementById("insights").hidden))) bad.push(`${tag}: the retro sheet's close button does not close it`);
    await tap("#lens"); await q.waitForTimeout(500); await tap("#lens"); await q.waitForTimeout(500); if (!(await q.evaluate(() => document.getElementById("insights").hidden))) bad.push(`${tag}: Retro does not close by touch`);
    // the lowest tappable chat card: the worst case, since the sheet rises over it
    const hit = await q.evaluate(() => { let best = null; for (const e of document.querySelectorAll("#nodes .n-session")) { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 30); if (x > 10 && x < innerWidth - 10 && y > 120 && y < innerHeight - 100 && document.elementFromPoint(x, y)?.closest(".n") === e && (!best || y > best[1])) best = [x, y]; } return best; });
    if (!hit) bad.push(`${tag}: no chat card is tappable on the first screen`); else {
      await q.touchscreen.tap(hit[0], hit[1]); await q.waitForTimeout(900);
      if (await q.evaluate(() => document.getElementById("drawer").hidden)) bad.push(`${tag}: tapping a chat card opened no drawer`); else { await q.waitForTimeout(500); await check("drawer"); await shot("drawer");
        if (!(await q.evaluate(() => { const e = document.querySelector(".n.sel"), r = e?.getBoundingClientRect(); if (!r) return false; const x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 24); return x > 0 && x < innerWidth && y > 0 && document.elementFromPoint(x, y)?.closest(".n") === e; }))) bad.push(`${tag}: the open drawer hides the card that was tapped`); await tap("#drawer .x").catch(() => bad.push(`${tag}: drawer has no tappable close`)); await q.waitForTimeout(500); }
    }
    const c = await ctx.newCDPSession(q), cam = () => q.evaluate(() => ({ ...window.__mission.S.cam })), t = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const k0 = await cam(); await t("touchStart", [[w / 2 - 30, h / 2], [w / 2 + 30, h / 2]]); for (let i = 1; i <= 6; i++) await t("touchMove", [[w / 2 - 30 - i * 15, h / 2], [w / 2 + 30 + i * 15, h / 2]]); await t("touchEnd", []);
    const k1 = await cam(); if (!(k1.k > k0.k * 1.5)) bad.push(`${tag}: pinch-out did not zoom (k ${k0.k.toFixed(3)} -> ${k1.k.toFixed(3)})`);
    await t("touchStart", [[w / 2, h / 2]]); for (let i = 1; i <= 6; i++) await t("touchMove", [[w / 2 + i * 20, h / 2 + i * 10]]); await t("touchEnd", []);
    const k2 = await cam(); if (Math.abs(k2.x - k1.x) < 60) bad.push(`${tag}: one-finger drag did not pan`); if (!(await q.evaluate(() => document.getElementById("drawer").hidden))) bad.push(`${tag}: a pan opened the drawer`);
    const sb = await q.locator("#scrub").boundingBox(), clk = () => q.evaluate(() => document.getElementById("clock").textContent), c0 = await clk();
    await q.touchscreen.tap(sb.x + sb.width * 0.3, sb.y + sb.height / 2); await q.waitForTimeout(500); if ((await clk()) === c0) bad.push(`${tag}: tapping the scrubber did not move the clock`);
    // responsiveness: the slowest tap's own handler time (processingStart..End, i.e. the app's work, not the host's queueing);
    // web-vitals calls an interaction over 500 ms poor. Host load inflates it, so the verdict that counts runs on Boat
    // a real slow handler repeats; a busy-host spike does not: re-tap the worst control once and fail only if it is slow again
    const worst = () => q.evaluate(() => window.__inp.sort((x, y) => y.run - x.run)[0]); let inp = await worst();
    if (inp && inp.run > 500) { const first = inp, sel = /^(today|week|project|custom)$/.test(first.t) ? `[data-span="${first.t}"]` : first.t ? `#${first.t}` : null;
      if (sel) { await q.evaluate(() => (window.__inp = [])); await tap(sel); await q.waitForTimeout(1500); inp = await worst(); }
      if (!sel || (inp && inp.run > 500)) bad.push(`${tag}: a tap on ${first.t || first.n} blocks the page ${first.run} ms, again ${inp?.run ?? "?"} ms (INP poor > 500)`); }
    console.log(tag, "slowest tap", inp ? `${inp.t || inp.n} ${inp.run}ms run / ${Math.round(inp.d)}ms total` : "n/a");
    console.log(tag, "pinch", k0.k.toFixed(3), "->", k1.k.toFixed(3), "pan", Math.round(k2.x - k1.x), "clock", c0, "->", await clk());
    await ctx.close();
  }
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// NETWORK=1: check /network (desktop + phone): the graph draws every imported node, a company click opens its
// warmest way in, search finds a company, and the page logs no errors.
if (process.env.NETWORK) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [];
  for (const [name, vp] of [["network-desk", { width: 1440, height: 900 }], ["network-phone", { width: 390, height: 844 }]]) {
    const q = await b.newPage({ viewport: vp }); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await q.goto(`${base}/network?theme=dark`); await q.waitForFunction(() => window.__network, null, { timeout: 30000 });
    const r = await q.evaluate(async () => {
      const { graph, data, focus } = window.__network, co = data.nodes.filter((n) => n.type === "company").sort((a, b) => b.reach - a.reach)[0];
      const drawn = [...document.querySelectorAll("#graph canvas")].some((c) => c.width > 0);
      focus(co.id, false); const card = document.querySelector("#card").textContent;
      const q = document.querySelector("#q"); q.value = co.label; q.dispatchEvent(new Event("input"));
      return { nodes: graph.order, want: data.nodes.length, drawn, co: co.label, card: card.includes("Best way in") && card.includes(co.label), hit: document.querySelector("#hits div")?.textContent.includes(co.label) };
    });
    console.log(name, JSON.stringify({ ...r, co: undefined }));
    if (r.nodes !== r.want) bad.push(`${name}: ${r.nodes} of ${r.want} nodes`);
    if (!r.drawn) bad.push(`${name}: no canvas`); if (!r.card) bad.push(`${name}: company card has no way in`); if (!r.hit) bad.push(`${name}: search missed the company`);
    await q.keyboard.press("Escape"); await q.locator("#q").fill(""); await q.waitForTimeout(900);
    await q.screenshot({ path: `${out}/${name}.png` });
    await q.evaluate(() => window.__network.focus(window.__network.data.nodes.filter((n) => n.type === "company").sort((a, b) => b.reach - a.reach)[0].id)); await q.waitForTimeout(1000);
    await q.screenshot({ path: `${out}/${name}-company.png` });
  }
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// LAYERS=1: the atlas canvas carries every data layer (desktop + phone): the layer bar lists them, search finds a
// category (a LinkedIn company) and picking it fills the shelf, hiding a layer removes its tiles, and no page errors.
if (process.env.LAYERS) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [];
  for (const [name, vp] of [["layers-desk", { width: 1440, height: 900 }], ["layers-phone", { width: 390, height: 844 }]]) {
    const q = await b.newPage({ viewport: vp }); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await q.goto(`${base}/?theme=dark`); await q.evaluate(() => (localStorage.setItem("taste:hidden2", "[]"), localStorage.setItem("taste:loose", "1"))); await q.reload();
    await q.waitForFunction(() => window.__atlas?.bm, null, { timeout: 30000 }); await q.waitForTimeout(2500);
    await q.screenshot({ path: `${out}/${name}.png` });
    const r0 = await q.evaluate(() => ({ bar: [...document.querySelectorAll(".layers button")].map((x) => x.dataset.layer), tiles: window.__atlas.bm.tilesShown() }));
    await q.fill("#q", "nvidia"); await q.waitForTimeout(400);
    const hit = await q.evaluate(() => document.querySelector("#hits [data-g]")?.textContent ?? "");
    await q.keyboard.press("Enter"); await q.waitForTimeout(1500);
    await q.screenshot({ path: `${out}/${name}-category.png` });
    const shelf = await q.evaluate(() => document.querySelector(".shelf header b")?.textContent ?? "");
    const view = await q.evaluate(() => location.pathname);
    if (view !== "/") bad.push(`${name}: picking a category left the canvas for ${view}`);
    await q.evaluate(() => document.querySelector('.layers [data-layer="linkedin"]').click()); await q.waitForTimeout(300);
    const t1 = await q.evaluate(() => window.__atlas.bm.tilesShown());
    await q.evaluate(() => window.__atlas.go("root")); await q.waitForTimeout(1200);
    await q.screenshot({ path: `${out}/${name}-hidden.png` });
    const rects = await q.evaluate(() => Object.fromEntries([".layers", ".legend", ".shelf", "#card", ".search"].map((s) => { const e = document.querySelector(s), r = e?.getBoundingClientRect(); return [s, r && getComputedStyle(e).display !== "none" ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null]; })));
    await q.evaluate(() => (localStorage.setItem("taste:hidden2", "[]"), localStorage.setItem("taste:loose", "1")));
    console.log(name, JSON.stringify({ ...r0, hit, shelf, hiddenTiles: t1, rects }));
    for (const l of ["saved", "youtube", "github", "linkedin"]) if (!r0.bar.includes(l)) bad.push(`${name}: no ${l} layer toggle`);
    if (!/nvidia/i.test(hit)) bad.push(`${name}: search found no NVIDIA category`); if (!/LinkedIn · NVIDIA/.test(shelf)) bad.push(`${name}: shelf not on the picked category ("${shelf}")`);
    const sr = rects[".search"]; if (!sr || sr[2] - sr[0] < 120) bad.push(`${name}: search box ${sr ? sr[2] - sr[0] : 0}px wide`);
    const cr = rects["#card"]; if (sr && cr && cr[1] < sr[3]) bad.push(`${name}: card overlaps search`);
    if (!(t1 < r0.tiles)) bad.push(`${name}: hiding LinkedIn left ${t1} of ${r0.tiles} tiles`);
    await q.close();
  }
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// WORK=1: the Work layer (desktop dark + light, phone): portfolio shows every product, a real click into a product shows
// its components, a component shows tiles with real thumbnails, clicking it again opens the proof (PRs, "You asked"),
// a post linked from its detail view is tethered after a reload, search and #work: deep links fly there, and the layer
// toggle hides it. The test link is removed again at the end.
if (process.env.WORK) {
  const base = process.env.BASE ?? "http://127.0.0.1:8789", bad = [], log = (k, v) => console.log(k, JSON.stringify(v));
  const ready = async (q) => { await q.waitForFunction(() => window.__atlas?.work && window.__atlas?.bm, null, { timeout: 30000 }); await q.waitForTimeout(1800); };
  const centre = (q, id) => q.evaluate((id) => window.__atlas.work.screen(id), id);
  const clickNode = async (q, id, dy = 0) => { const c = await centre(q, id); await q.mouse.click(c.x, c.y + dy * c.r); await q.waitForTimeout(1300); };
  const pg = async (vp, theme) => { const q = await b.newPage(vp); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await q.goto(`${base}/?theme=${theme}`); await q.evaluate(() => (localStorage.setItem("taste:hidden2", "[]"), localStorage.setItem("taste:loose", "1"))); await q.reload(); await ready(q); return q; };
  const onScreen = (q) => q.evaluate(() => { const w = window.__atlas.work; return w.data.products.filter((p) => { const s = w.screen(p.id); return s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight && s.r > 8; }).length; });
  const q = await pg({ viewport: { width: 1440, height: 900 } }, "dark");
  await q.evaluate(() => window.__atlas.work.focus(null)); await q.waitForTimeout(1300);
  await q.screenshot({ path: `${out}/work-0-portfolio-dark.png` });
  const n0 = await onScreen(q); log("portfolio products on screen", n0); if (n0 !== 7) bad.push(`portfolio shows ${n0} of 7 products`);
  await clickNode(q, "glide", -0.85); await q.screenshot({ path: `${out}/work-1-glide-dark.png` });
  const d1 = await q.evaluate(() => ({ focus: window.__atlas.work.state().focus, kids: window.__atlas.work.data.products.find((p) => p.id === "glide").components }));
  log("depth 1", d1); if (d1.focus !== "glide") bad.push(`click on glide focused ${d1.focus}`);
  await clickNode(q, "glide/taste", 0.15); await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/work-2-taste-pages-dark.png` });
  const d2 = await q.evaluate(() => ({ focus: window.__atlas.work.state().focus, loaded: window.__atlas.work.loaded(), shelf: document.querySelector(".shelf header b")?.textContent, shelfPages: document.querySelectorAll(".shelf [data-wpage] img").length }));
  log("depth 2", d2); if (d2.focus !== "glide/taste") bad.push(`click on Taste pages focused ${d2.focus}`); if (d2.loaded < 6) bad.push(`only ${d2.loaded} thumbnails drawn`); if (!d2.shelfPages) bad.push("shelf lists no pages");
  // Toggling the shelf re-fits the view: a Work node keeps its focus instead of flying back to the atlas.
  await q.keyboard.press("b"); await q.waitForTimeout(1000); const kept = await q.evaluate(() => window.__atlas.work.state().focus); await q.keyboard.press("b"); await q.waitForTimeout(1100);
  log("shelf toggle keeps focus", kept); if (kept !== "glide/taste") bad.push(`shelf toggle moved focus to ${kept}`);
  // Depth 3: clicking the focused component outside its tiles (its label) opens the proof.
  await clickNode(q, "glide/taste", -0.66); await q.waitForTimeout(500);
  const d3 = await q.evaluate(() => ({ on: !!document.querySelector(".work-lb.on"), prs: document.querySelectorAll(".work-lb.on .wk-prs li").length, asked: document.querySelectorAll(".work-lb.on p.asked").length, pages: document.querySelectorAll(".work-lb.on .wk-thumbs img").length }));
  await q.screenshot({ path: `${out}/work-3-proof-dark.png` }); log("depth 3", d3);
  if (!d3.on || !d3.prs || !d3.asked) bad.push(`proof lightbox: ${JSON.stringify(d3)}`);
  await q.keyboard.press("Escape"); await q.waitForTimeout(200);
  await q.evaluate(() => window.__atlas.work.proof("glide")); await q.waitForTimeout(400); await q.screenshot({ path: `${out}/work-3-proof-glide-dark.png` }); await q.keyboard.press("Escape");
  // Link a post to the component from its detail view, reload, and see it tethered on the component.
  const item = await q.evaluate(() => window.__atlas.bm.items.find((b) => b.thumb && b.layer === "saved").id);
  await q.evaluate((id) => window.__atlas.bm.detail(window.__atlas.bm.byId.get(id)), item); await q.waitForTimeout(400);
  await q.selectOption(".lightbox.on [data-wpick]", "glide/taste"); await q.waitForSelector(".lightbox.on .wk-chip", { timeout: 5000 }).catch(() => bad.push("link chip never appeared"));
  await q.screenshot({ path: `${out}/work-link-detail-dark.png` });
  await q.goto(`${base}/?theme=dark&reload=1#work:glide/taste`); await ready(q); // new query string: a real reload, not a hash change await q.waitForTimeout(1500);
  const tl = await q.evaluate((id) => ({ focus: window.__atlas.work.state().focus, linked: window.__atlas.work.links().some((l) => l.item === id && l.node === "glide/taste"), tethered: window.__atlas.work.tethers().some((t) => t.item === id), inShelf: !!document.querySelector(`.shelf [data-post="${id}"]`) }), item);
  await q.screenshot({ path: `${out}/work-link-tethered-dark.png` }); log("link after reload", tl);
  if (tl.focus !== "glide/taste") bad.push(`#work:glide/taste deep link focused ${tl.focus}`); if (!tl.linked || !tl.tethered || !tl.inShelf) bad.push(`link not shown after reload: ${JSON.stringify(tl)}`);
  // Search finds a component; the layer toggle hides and restores the layer.
  await q.evaluate(() => window.__atlas.go("root", 10)); await q.waitForTimeout(400);
  await q.fill("#q", "voice"); await q.waitForTimeout(300); const hit = await q.evaluate(() => document.querySelector("#hits [data-w]")?.dataset.w);
  await q.keyboard.press("Enter"); await q.waitForTimeout(1200); const sf = await q.evaluate(() => window.__atlas.work.state().focus);
  log("search", { hit, focus: sf }); if (!hit || sf !== hit) bad.push(`search: hit ${hit}, focus ${sf}`);
  await q.click('.layers [data-layer="work"]'); await q.waitForTimeout(200); const off = await q.evaluate(() => window.__atlas.work.state().visible);
  await q.click('.layers [data-layer="work"]'); await q.waitForTimeout(200); const back = await q.evaluate(() => window.__atlas.work.state().visible);
  log("toggle", { off, back }); if (off || !back) bad.push("layer toggle did not hide/show Work");
  await q.evaluate((id) => fetch("/api/work-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: id, node: "glide/taste", op: "remove" }) }), item);
  // Stale renders as stale: push hermes-tern's last check two days back; its ring goes grey and dashed, its label says so.
  await q.evaluate(() => { const w = window.__atlas.work, p = w.data.products.find((x) => x.id === "hermes-tern"); p.status.checked -= 2 * 86400; w.focus(null); w.redraw(); });
  await q.waitForTimeout(1200); await q.screenshot({ path: `${out}/work-stale-check-dark.png` });
  await q.close(); // one atlas tab at a time: each holds thousands of decoded tiles
  // Light theme, and a phone (390 px): no horizontal scroll, the HUD and lightbox fit.
  const lq = await pg({ viewport: { width: 1440, height: 900 } }, "light");
  await lq.evaluate(() => window.__atlas.work.focus("glide")); await lq.waitForTimeout(1400); await lq.screenshot({ path: `${out}/work-1-glide-light.png` });
  await lq.evaluate(() => window.__atlas.work.focus("glide/tern-ui")); await lq.waitForTimeout(1800); await lq.screenshot({ path: `${out}/work-2-tern-ui-light.png` }); await lq.close();
  const m = await pg({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "dark");
  for (const [name, id] of [["portfolio", null], ["glide", "glide"], ["taste-pages", "glide/taste"]]) {
    await m.evaluate((id) => window.__atlas.work.focus(id), id); await m.waitForTimeout(1600); await m.screenshot({ path: `${out}/work-phone-${name}.png` });
  }
  await m.evaluate(() => window.__atlas.work.proof("glide/taste")); await m.waitForTimeout(500); await m.screenshot({ path: `${out}/work-phone-proof.png` });
  const ph = await m.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth, hud: (() => { const r = document.querySelector(".work-hud").getBoundingClientRect(); return [r.left, r.right].map(Math.round); })(), lb: Math.round(document.querySelector(".work-lb .lb-card").getBoundingClientRect().right) }));
  log("phone", ph); if (ph.overflowX || ph.hud[0] < 0 || ph.hud[1] > 390 || ph.lb > 390) bad.push(`phone layout: ${JSON.stringify(ph)}`);
  if (errs.length) bad.push(...errs.slice(0, 5));
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// DESIGN=<edit url from `board.mjs design`>: the editor fetches the board's .fig and shows its layers, with no error.
if (process.env.DESIGN) {
  const bad = [], fig = [];
  p.on("response", (r) => r.url().includes(".fig") && fig.push(r.status()));
  p.on("console", (m) => /Web link|openFileFailed|Failed to open/i.test(m.text()) && bad.push(m.text()));
  await p.goto(process.env.DESIGN, { timeout: 60000 });
  // design.mjs wraps everything in one top-level frame named "board"; it shows in the layers panel once the file is open.
  const leaf = () => [...document.querySelectorAll("body *")].some((e) => !e.children.length && e.textContent.trim() === "board");
  await p.waitForFunction(leaf, null, { timeout: 60000 }).catch(() => bad.push("layer \"board\" never appeared in the editor"));
  await p.getByRole("button", { name: "Start designing" }).click({ timeout: 3000 }).catch(() => {});  // first-run welcome modal
  await p.waitForTimeout(3000);
  const layers = await p.evaluate(leaf) ? 1 : 0;
  console.log("design", JSON.stringify({ fig, layers }));
  if (!fig.includes(200)) bad.push(`.fig fetch: ${JSON.stringify(fig)}`);
  await p.screenshot({ path: `${out}/design-editor.png` });
  await b.close(); if (bad.length) { console.error("FAIL", bad); process.exit(1); } console.log("PASS"); process.exit(0);
}
// BOARD=<board session url>: check the taste board instead (desktop + phone, live update lag, a pin round-trip), then exit.
if (process.env.BOARD) {
  const { execFileSync } = await import("node:child_process");
  const id = process.env.BOARD.match(/\/s\/([a-z0-9-]+)/)[1], cli = new URL("./board.mjs", import.meta.url).pathname;
  for (const [name, vp] of [["board-desk", { width: 1600, height: 1000 }], ["board-phone", { width: 390, height: 844 }]]) {
    const q = await b.newPage({ viewport: vp }); q.on("pageerror", (e) => errs.push(String(e))); q.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await q.goto(process.env.BOARD); await q.waitForSelector(".ref"); await q.waitForFunction(() => document.querySelector("#live.on"), null, { timeout: 5000 });
    const n = await q.$$eval(".notes li:not(.hint)", (l) => l.length), t0 = Date.now();
    execFileSync(process.execPath, [cli, "say", id, `live check ${name}`], { stdio: ["ignore", "ignore", "inherit"] });
    await q.waitForFunction((n) => document.querySelectorAll(".notes li:not(.hint)").length > n, n, { timeout: 5000 });
    const lag = Date.now() - t0;
    await q.click(".ref .acts [data-v=pin]", { force: true }); await q.waitForSelector(".ref.pin", { timeout: 3000 });
    await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/${name}.png`, fullPage: name === "board-phone" });
    console.log(name, JSON.stringify(await q.evaluate((lag) => ({ lagMs: lag, refs: document.querySelectorAll(".ref").length, pinned: document.querySelectorAll(".ref.pin").length, broken: [...document.querySelectorAll(".ref img")].filter((i) => i.complete && !i.naturalWidth).length, preview: !!document.querySelector("iframe.frame.in"), overflowX: document.documentElement.scrollWidth > innerWidth }), lag)));
    await q.click(".ref.pin .acts [data-v=pin]", { force: true }); await q.waitForTimeout(300);
  }
  // Talk-to-choose UI: when the agent has set a shortlist and a pair, the wall narrows, the pair shows, key 1 picks.
  // Run the server with TASTE_AGENT=off for this check, so pressing 1 does not start a Hermes session.
  const st = JSON.parse(execFileSync(process.execPath, [cli, "status", id], { encoding: "utf8" }));
  const ids = st.all.slice(0, 6).map((r) => r.id);
  execFileSync(process.execPath, [cli, "focus", id, ...ids, "--why", "shot check"]);
  execFileSync(process.execPath, [cli, "compare", id, ids[0], ids[1], "--why", "shot check pair"]);
  const q = await b.newPage({ viewport: { width: 1600, height: 1000 } }); q.on("pageerror", (e) => errs.push(String(e)));
  await q.goto(process.env.BOARD); await q.waitForSelector(".compare:not([hidden]) figure");
  const ui = await q.evaluate(() => ({ refs: document.querySelectorAll(".ref").length, chip: document.querySelector(".filters .focus")?.textContent, pair: document.querySelectorAll(".compare figure").length, design: document.querySelector("#mkdesign")?.textContent, directions: !!document.querySelector("#directions"), talk: !!document.querySelector("#sayText") }));
  // Generated directions (source "variant", added by the agent via `board.mjs image`) show as rounds, every picture loading.
  const variants = st.all.filter((r) => r.source === "variant").length;
  if (variants) {
    await q.waitForFunction(() => [...document.querySelectorAll("#rounds img")].every((i) => i.complete), null, { timeout: 8000 });
    ui.rounds = await q.$$eval("#rounds img", (l) => l.map((i) => i.naturalWidth));
    if (ui.rounds.length !== variants || ui.rounds.some((w) => !w)) errs.push(`rounds: ${variants} variants, loaded widths ${ui.rounds}`);
  }
  await q.screenshot({ path: `${out}/board-compare.png` });
  await q.keyboard.press("1"); await q.waitForFunction((a) => document.querySelector(`.compare figure[data-id="${a}"].pin`), ids[0], { timeout: 4000 });
  const picked = JSON.parse(execFileSync(process.execPath, [cli, "status", id], { encoding: "utf8" }));
  ui.key1 = { pinned: picked.pinned?.some?.((r) => (r.id ?? r) === ids[0]) ?? null, noped: picked.noped?.some?.((r) => (r.id ?? r) === ids[1]) ?? null };
  for (const c of ["focus", "compare"]) execFileSync(process.execPath, [cli, c, id, "clear"]);
  for (const [r, v] of [[ids[0], "clear"], [ids[1], "clear"]]) await q.evaluate(([r, v]) => fetch("./pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: r, verdict: v }) }), [r, v]);
  console.log("talk-ui", JSON.stringify(ui));
  if (ui.refs !== 6 || ui.pair !== 2 || !ui.chip || !ui.design || !ui.directions || !ui.talk) errs.push(`talk-ui assertions failed: ${JSON.stringify(ui)}`);
  console.log("errors:", JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
}
const base = process.env.BASE ?? "http://127.0.0.1:8789";
const shots = [["root", "", "light"], ["op", "#differentiate", "light"], ["tech", "#color-isolation", "light"], ["exec", "#tactile-surface--2", "dark"], ["hud", "#instrument-language", "dark"]];
for (const [name, hash, theme] of shots) {
  await p.goto(`${base}/?theme=${theme}${hash}`); await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}/${name}.png` });
}
// Interaction check: search + enter.
await p.goto(`${base}/?theme=light`); await p.waitForTimeout(500);
await p.fill("#q", "closure"); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
console.log("after search focus:", await p.evaluate(() => window.__atlas.A.view.focus), "hash:", await p.evaluate(() => location.hash));
await p.keyboard.press("Escape"); await p.waitForTimeout(1200);
console.log("after esc focus:", await p.evaluate(() => window.__atlas.A.view.focus));
// Private bookmarks layer (only when ./data is present): shelf follows focus, thumbnails load.
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
    // Studied layer (--refs): the chip filters the shelf, and a ref with stats shows its reach in the detail view.
  const step = async (name, fn) => { const n = errs.length; const r = await p.evaluate(fn); await p.waitForTimeout(600); if (errs.length > n) console.log("errors in", name, errs.length - n); return r; };
  if (await p.$(".shelf [data-l=ref]")) {
    await step("root", () => window.__atlas.go("root", 10));
    await step("chip", () => document.querySelector(".shelf [data-l=ref]").click());
    await step("open", () => [...document.querySelectorAll(".shelf .grid a")].find((a) => /hell-grind/.test(a.href))?.click());
    const studied = await p.evaluate(() => ({ title: document.querySelector(".shelf header b")?.textContent, tiles: document.querySelectorAll(".shelf .grid a").length,
      reach: [...document.querySelectorAll(".lightbox.on .asked")].map((e) => e.textContent).find((t) => t.startsWith("Reach")) ?? null }));
    await p.screenshot({ path: `${out}/bm-studied.png` }); console.log("studied:", JSON.stringify(studied));
    await step("close", () => { document.querySelector(".lb-x")?.click(); document.querySelector(".shelf [data-l=ref].on")?.click(); });
  }
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
  // Sources layer (data/sources.atlas.json): each layer chip filters the shelf; an ask opens with what you asked.
  if (await p.evaluate(() => window.__atlas.bm.sources)) {
    await p.evaluate(() => window.__atlas.go("root", 10)); await p.waitForTimeout(1200);
    const src = await p.evaluate(async () => {
      const r = {}, wait = (ms) => new Promise((x) => setTimeout(x, ms));
      for (const b of document.querySelectorAll(".shelf [data-l]")) {
        const l = b.dataset.l; document.querySelector(`.shelf [data-l="${l}"]`).click(); await wait(150);
        r[l] = [document.querySelector(".shelf header b").textContent, document.querySelectorAll(".shelf .grid a").length];
      }
      document.querySelector('.shelf [data-l="ask"]').click(); await wait(150);
      document.querySelector(".shelf .grid a[data-post]").click(); await wait(400);
      r.askDetail = [!!document.querySelector(".lightbox.on .asked"), document.querySelector(".lightbox.on .lb-act a")?.textContent ?? null];
      return r;
    });
    await p.screenshot({ path: `${out}/src-ask.png` }); await p.keyboard.press("Escape");
    await p.evaluate(() => document.querySelector('.shelf [data-l="film"]').click()); await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/src-films.png` });
    console.log("sources:", JSON.stringify(src));
  }
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
