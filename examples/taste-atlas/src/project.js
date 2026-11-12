// Project mode: opening a product in the Work layer (#work:glide) swaps the whole atlas for that product's storyboard.
// Its user journey runs left to right in phases, each screen a real capture wired to the next by prototype arrows; the
// one or two products it shares the most components with wait greyed out at the edge. Below runs the Board lane with
// every pin on the project's boards. Pick a screen (#work:glide@lanes) for what shaped it: earlier takes, your asks and
// the sessions they came from, commits on its code, the colours, fonts and libraries in that code now, and the pins,
// board notes and ideas that name it. Data: data/project.<id>.json from scripts/project.mjs.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const get = (f) => fetch(f, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : "");
const ago = (t) => { const d = Date.now() / 1000 - t; return d < 3600 ? `${Math.max(1, Math.round(d / 60))}m` : d < 86400 ? `${Math.round(d / 3600)}h` : `${Math.round(d / 86400)}d`; };
const src = (p) => (/^(https?:|\/)/.test(p) ? p : `./data/${p}`);
const FW = 320, FH = 200, CW = 400, ROW = FH + 150, TOP = 84, PIN = 176; // world units: frame, column, row, pin card
const STATE = { live: "#1f8a5b", still: "#c27c0e", fix: "#d6453d", todo: "#8a857a" };

export async function mountProject(A, { work }) {
  if (!work) return null;
  const cache = new Map(), load = (id) => (cache.has(id) ? cache.get(id) : cache.set(id, get(`./data/project.${encodeURIComponent(id)}.json`)).get(id));
  const W = work.data, P = new Map(W.products.map((p) => [p.id, p])), C = new Map(W.components.map((c) => [c.id, c]));
  const root = document.createElement("section"); root.id = "project"; root.hidden = true; document.body.appendChild(root);
  let D = null, sel = null, cam = { x: 0, y: 0, s: 1 }, boxes = new Map(), size = [0, 0], journeyBottom = 0;

  // The 1–2 products this one shares the most components with (its own parts that live on in them, or theirs in it).
  function neighbours(pid) {
    const n = new Map(), bump = (q, cid) => { if (q === pid || !P.has(q)) return; const v = n.get(q) ?? { id: q, shared: new Set() }; v.shared.add(cid); n.set(q, v); };
    for (const c of W.components) { if (c.product === pid) c.also.forEach((q) => bump(q, c.id)); else if (c.also.includes(pid)) bump(c.product, c.id); }
    return [...n.values()].sort((a, b) => b.shared.size - a.shared.size).slice(0, 2);
  }

  function layout() {
    boxes = new Map(); const col = new Map(D.phases.map((p, i) => [p.id, i])), rows = new Map();
    for (const s of D.screens) { const i = col.get(s.phase) ?? 0, j = rows.get(i) ?? 0; rows.set(i, j + 1); boxes.set(s.id, { x: i * CW, y: TOP + j * ROW, w: FW, h: FH }); }
    const bottom = TOP + Math.max(...rows.values()) * ROW + 30, width = D.phases.length * CW - (CW - FW);
    const per = Math.max(1, Math.floor((width + 12) / (PIN + 12))); let y = bottom + 60;
    const lanes = D.boards.map((b) => { const pins = D.pins.filter((p) => p.board === b.id), y0 = y; y += 48 + Math.ceil(pins.length / per) * (PIN * 0.82 + 12) + 40; return { b, pins, y: y0 }; });
    size = [width + 420, y]; journeyBottom = bottom; return { bottom, width, per, lanes };
  }

  function render() {
    const L = layout(), nb = neighbours(D.id), p = P.get(D.id);
    const pinsOf = (sid) => D.pins.filter((x) => x.screens.includes(sid));
    const frame = (s) => { const b = boxes.get(s.id), pins = pinsOf(s.id), st = s.scene?.state;
      return `<button class="pj-frame${s.branch ? " branch" : ""}" data-screen="${esc(s.id)}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px">
        <span class="pj-shot" style="height:${b.h}px"><img loading="lazy" src="${esc(src(s.shot))}" alt="" />${st ? `<em style="--c:${STATE[st] ?? STATE.todo}">${esc(st)}</em>` : ""}${s.takes.length ? `<i>${s.takes.length + 1} takes</i>` : ""}</span>
        <b>${esc(s.name)}</b><small>${esc(C.get(`${D.id}/${s.component}`)?.name ?? s.component)} · ${s.commits.length} commits · ${s.asksTotal} asks · ${pins.length} pins</small>
        ${pins.length ? `<span class="pj-mini">${pins.slice(0, 5).map((x) => x.image ? `<img loading="lazy" src="${esc(x.image)}" alt="" />` : `<span>${esc(x.title.slice(0, 18))}</span>`).join("")}</span>` : ""}</button>`; };
    const arrows = D.screens.flatMap((s) => s.next.map(([to, why]) => { const a = boxes.get(s.id), b = boxes.get(to); if (!b) return "";
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, back = x2 <= x1;
      const d = back ? `M${a.x + a.w / 2},${a.y + a.h + 52} C${a.x + a.w / 2},${a.y + a.h + 90} ${b.x + b.w / 2},${b.y - 40} ${b.x + b.w / 2},${b.y - 4}` : `M${x1},${y1} C${x1 + 50},${y1} ${x2 - 50},${y2} ${x2 - 6},${y2}`;
      return `<path d="${d}" class="${back || D.screens.find((x) => x.id === to)?.branch ? "loop" : ""}" data-from="${esc(s.id)}" data-to="${esc(to)}" marker-end="url(#pj-head)"/>`; })).join("");
    const labels = D.screens.flatMap((s) => s.next.map(([to, why]) => { const a = boxes.get(s.id), b = boxes.get(to); if (!b) return "";
      const back = b.x <= a.x + a.w, mx = back ? (a.x + b.x + a.w) / 2 : (a.x + a.w + b.x) / 2, my = back ? (a.y + a.h + b.y) / 2 + 30 : (a.y + b.y + a.h) / 2 - 8;
      return `<text x="${mx}" y="${my}" data-from="${esc(s.id)}" data-to="${esc(to)}">${esc(why)}</text>`; })).join("");
    const nx = L.width + 90;
    const ghosts = nb.map((n, i) => { const q = P.get(n.id), y = TOP + 40 + i * 260, hit = D.screens.filter((s) => n.shared.has(`${D.id}/${s.component}`));
      const lines = hit.slice(0, 4).map((s) => { const b = boxes.get(s.id); return `<path class="ghost" d="M${nx},${y + 60} C${nx - 80},${y + 60} ${b.x + b.w + 60},${b.y + b.h / 2} ${b.x + b.w},${b.y + b.h / 2}"/>`; }).join("");
      return { html: `<a class="pj-ghost" href="#work:${esc(n.id)}" style="left:${nx}px;top:${y}px" title="Open ${esc(q.name)}"><span>connected</span><b>${esc(q.name)}</b><small>shares ${[...n.shared].map((c) => esc(C.get(c)?.name ?? c)).join(", ")}</small><span>open →</span></a>`, lines }; });
    const lanes = L.lanes.map(({ b, pins, y }) => `<div class="pj-lane-h" style="top:${y}px;width:${L.width}px"><b>Board</b> ${esc(b.title)} · ${pins.length} pins <a href="/s/${esc(b.id)}/" target="_blank" rel="noopener">open board ↗</a></div>`
      + pins.map((x, i) => `<a class="pj-pin" data-pin="${esc(x.id)}" data-screens="${esc(x.screens.join(" "))}" href="${esc(x.url ?? `/s/${x.board}/`)}" target="_blank" rel="noopener" title="${esc(x.title)}${x.screens.length ? ` → ${esc(x.screens.map((sid) => D.screens.find((s) => s.id === sid)?.name).join(", "))}` : ""}"
        style="left:${(i % L.per) * (PIN + 12)}px;top:${y + 48 + Math.floor(i / L.per) * (PIN * 0.82 + 12)}px;width:${PIN}px;height:${PIN * 0.82}px">${x.image ? `<img loading="lazy" src="${esc(x.image)}" alt="" />` : `<span class="t">${esc(x.title)}</span>`}<span class="m">${esc(x.title || x.source)}</span>${x.screens.length ? `<i>${x.screens.length}</i>` : ""}</a>`).join("")).join("");
    root.innerHTML = `<header class="pj-top"><button class="pj-back" title="Back to the whole atlas (Esc)">← Atlas</button><div><b>${esc(p?.name ?? D.id)}</b> <span>storyboard · ${D.screens.length} screens · ${D.pins.length} pins on ${D.boards.length} boards · ${D.asksTotal} of your asks · ${D.screens.reduce((a, s) => a + s.commits.length, 0)} commits in ${D.windowDays}d</span></div>
      <span class="pj-legend">${Object.entries(STATE).map(([k, c]) => `<i style="--c:${c}"></i>${k}`).join(" ")} · <small>built ${ago(D.generatedAt)} ago</small></span><button class="pj-fit" title="Frame the journey">Journey</button><button class="pj-board" title="Frame every pin">Board · ${D.pins.length}</button></header>
      <div class="pj-view"><div class="pj-stage" style="width:${size[0]}px;height:${size[1]}px">
        ${D.phases.map((ph, i) => `<div class="pj-phase" style="left:${i * CW}px;width:${FW}px"><small>${String(i + 1).padStart(2, "0")}</small> ${esc(ph.name)}</div>`).join("")}
        <svg class="pj-wires" width="${size[0]}" height="${size[1]}"><defs><marker id="pj-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${ghosts.map((g) => g.lines).join("")}${arrows}</svg>
        ${D.screens.map(frame).join("")}<svg class="pj-wires pj-labels" width="${size[0]}" height="${size[1]}">${labels}</svg>${ghosts.map((g) => g.html).join("")}${lanes}</div></div><aside class="pj-panel" hidden></aside>`;
    root.querySelectorAll("img").forEach((im) => im.addEventListener("error", () => { const t = document.createElement("span"); t.className = "t"; t.textContent = im.closest("[title]")?.title ?? ""; im.replaceWith(t); }, { once: true }));
    fit(0); if (sel) pick(sel);
  }

  // Camera: wheel zooms about the pointer, drag pans, Fit frames the journey beside the panel.
  const view = () => root.querySelector(".pj-view"), stage = () => root.querySelector(".pj-stage");
  const apply = () => { const s = stage(); if (s) s.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.s})`; };
  function fit(ms = 300, box) {
    const v = view().getBoundingClientRect(), panel = !root.querySelector(".pj-panel").hidden ? Math.min(460, innerWidth * 0.5) : 0;
    const [x0, y0, x1, y1] = box ?? [-20, 0, size[0], journeyBottom + 80], w = v.width - panel - 40, h = v.height - 30;
    const s = Math.min(w / (x1 - x0), h / (y1 - y0), 1.6); cam = { s, x: 20 + (w - (x1 - x0) * s) / 2 - x0 * s, y: 12 + Math.max(0, (h - (y1 - y0) * s) / 2) - y0 * s };
    stage().style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.7,.2,1)` : ""; apply(); setTimeout(() => (stage().style.transition = ""), ms);
  }
  root.addEventListener("wheel", (e) => { if (!e.target.closest(".pj-view")) return; e.preventDefault(); const v = view().getBoundingClientRect(), k = Math.exp(-e.deltaY * 0.0015), s = Math.min(3, Math.max(0.15, cam.s * k)), mx = e.clientX - v.left, my = e.clientY - v.top;
    cam = { s, x: mx - ((mx - cam.x) * s) / cam.s, y: my - ((my - cam.y) * s) / cam.s }; apply(); }, { passive: false });
  let drag = null;
  root.addEventListener("pointerdown", (e) => { if (!e.target.closest(".pj-view") || e.button) return; drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; });
  addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; apply(); } });
  addEventListener("pointerup", () => setTimeout(() => (drag = null)));
  root.addEventListener("click", (e) => {
    if (drag?.moved) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest(".pj-back")) return close();
    if (e.target.closest(".pj-fit")) return fit();
    if (e.target.closest(".pj-board")) return fit(300, [-20, journeyBottom + 20, size[0] - 420, size[1]]);
    const f = e.target.closest("[data-screen]"); if (f) { e.preventDefault(); return pick(f.dataset.screen === sel ? null : f.dataset.screen); }
    if (e.target.closest(".pj-x")) return pick(null);
    const t = e.target.closest("[data-take]"); if (t) { root.querySelector(".pj-hero").src = t.dataset.take; root.querySelectorAll("[data-take]").forEach((x) => x.classList.toggle("on", x === t)); return; }
    if (e.target.closest(".pj-view") && !e.target.closest("a,button")) pick(null);
  }, true);

  // A screen's story: what it looks like over time, why (your words, notes, pins), and what it's made of.
  function pick(id, move = true) {
    sel = id || null; const panel = root.querySelector(".pj-panel"), s = D.screens.find((x) => x.id === sel);
    root.classList.toggle("pj-sel", !!s);
    root.querySelectorAll("[data-screen]").forEach((f) => f.classList.toggle("on", f.dataset.screen === sel));
    root.querySelectorAll(".pj-pin").forEach((x) => x.classList.toggle("on", !!s && x.dataset.screens.split(" ").includes(sel)));
    root.querySelectorAll(".pj-wires [data-from]").forEach((x) => x.classList.toggle("on", !!s && (x.dataset.from === sel || x.dataset.to === sel)));
    history.replaceState(null, "", `#work:${D.id}${sel ? "@" + sel : ""}`);
    if (!s) { panel.hidden = true; panel.innerHTML = ""; if (move) fit(); return; }
    const pins = D.pins.filter((x) => x.screens.includes(s.id)), next = s.next.map(([to, why]) => [D.screens.find((x) => x.id === to), why]).filter(([x]) => x);
    const from = D.screens.filter((x) => x.next.some(([to]) => to === s.id));
    const tl = [...s.asks.map((a) => ({ t: a.t, k: "ask", h: `<b>You asked</b> ${esc(a.text)}` })), ...s.notes.map((n) => ({ t: n.t, k: "note", h: `<b>Board note</b> ${esc(n.text)}` })),
      ...s.commits.slice(0, 18).map((c) => ({ t: c.t, k: c.design ? "design" : "commit", h: `<a href="https://github.com/${esc(c.gh)}/commit/${esc(c.h)}" target="_blank" rel="noopener"><code>${esc(c.h)}</code></a> ${esc(c.s)}` }))].sort((a, b) => b.t - a.t);
    const lum = (c) => { const v = parseInt(c.slice(1), 16); return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255); };
    const sw = (l) => l.map(([c, n]) => `<span class="pj-sw" style="--c:${esc(c)};color:${lum(c) > 150 ? "#1b1a17" : "#fff"}" title="${esc(c)} · ${n}×">${esc(c)}</span>`).join("");
    const shots = [s.shot, ...s.takes];
    panel.innerHTML = `<button class="pj-x" aria-label="Close">×</button>
      <div class="pj-k">${esc(D.phases.find((p) => p.id === s.phase)?.name)} · ${esc(C.get(`${D.id}/${s.component}`)?.name ?? s.component)}</div><h3>${esc(s.name)}</h3>
      ${s.scene ? `<p class="pj-scene"><em style="--c:${STATE[s.scene.state] ?? STATE.todo}">${esc(s.scene.state)}</em> film beat “${esc(s.scene.name)}” · ${esc(s.scene.note)}</p>` : ""}
      <img class="pj-hero" src="${esc(src(s.shot))}" alt="" />
      ${shots.length > 1 ? `<div class="pj-k">Takes over time · ${shots.length}</div><div class="pj-takes">${shots.map((x, i) => `<figure><img data-take="${esc(src(x))}" class="${i ? "" : "on"}" src="${esc(src(x))}" alt="" /><figcaption>${i ? esc(x.split("/").at(-1).replace(/\.\w+$/, "")) : "current"}</figcaption></figure>`).join("")}</div>` : ""}
      <p class="pj-flow">${from.length ? `from ${from.map((x) => `<a href="#" data-screen="${esc(x.id)}">${esc(x.name)}</a>`).join(", ")}` : "start of the journey"}${next.length ? ` · next ${next.map(([x, why]) => `<a href="#" data-screen="${esc(x.id)}">${esc(x.name)}</a> <small>(${esc(why)})</small>`).join(", ")}` : ""}</p>
      ${pins.length ? `<div class="pj-k">Inspo pinned on the board · ${pins.length}</div><div class="pj-inspo">${pins.map((x) => `<a href="${esc(x.url ?? "#")}" target="_blank" rel="noopener" title="${esc(x.title)}">${x.image ? `<img src="${esc(x.image)}" alt="" />` : ""}<span>${esc(x.title || x.source)}</span></a>`).join("")}</div>` : ""}
      ${s.colors.length ? `<div class="pj-k">Colours in its code now</div><div class="pj-sws">${sw(s.colors)}</div>` : ""}
      ${s.fonts.length ? `<div class="pj-k">Fonts</div><p class="pj-tags">${s.fonts.map(([f, n]) => `<span style="font-family:'${esc(f)}'">${esc(f)} <small>${n}×</small></span>`).join("")}</p>` : ""}
      ${s.libs.length ? `<div class="pj-k">Libraries it imports</div><p class="pj-tags">${s.libs.map(([l, n]) => `<span>${esc(l)} <small>${n}</small></span>`).join("")}</p>` : ""}
      ${s.ideas.length ? `<div class="pj-k">Ideas</div><ul class="pj-ideas">${s.ideas.map((i) => `<li>${esc(i.text)} <small>${esc(i.kind)} · ${esc(i.stream)}</small></li>`).join("")}</ul>` : ""}
      <div class="pj-k">Design choices over time · ${s.asksTotal} asks · ${s.commits.length} commits</div><ol class="pj-tl">${tl.map((x) => `<li class="${x.k}"><time>${day(x.t)}</time>${x.h}</li>`).join("") || "<li>Nothing in the window yet.</li>"}</ol>
      ${s.sessions.length ? `<div class="pj-k">Conversations it came up in</div><ul class="pj-sess">${s.sessions.map((x) => `<li>${esc(x.title ?? x.id)} <small>${x.n}× · ${esc(x.id.slice(0, 15))}</small></li>`).join("")}</ul>` : ""}
      <div class="pj-k">Code</div><p class="pj-tags">${s.code.map((c) => `<a href="https://github.com/${esc(c.gh)}" target="_blank" rel="noopener">${esc(c.repo)} · ${c.files} files · ${c.commits} commits</a>`).join("")}</p>`;
    panel.hidden = false; panel.scrollTop = 0;
    if (move) { const b = boxes.get(s.id); fit(300, [b.x - 40, b.y - 60, b.x + b.w + 40, b.y + b.h + 90]); }
  }

  // Entry: Work focus on a product with a storyboard (or one of its components) opens it; anything else closes.
  let open = null;
  async function show(pid, screen) {
    const d = await load(pid); if (!d) return false;
    if (open !== pid) { D = d; open = pid; sel = screen ?? null; root.hidden = false; document.body.classList.add("project-on"); render(); }
    else if (screen !== undefined && screen !== sel) pick(screen);
    return true;
  }
  function close(toAtlas = true) { if (!open) return; open = null; root.hidden = true; root.innerHTML = ""; document.body.classList.remove("project-on"); if (toAtlas) work.focus(null); }
  A.onWorkFocus = (id) => {
    if (id === undefined || id === null) return close(false);
    const [base, screen] = String(id).split("@"), pid = C.get(base)?.product ?? (P.has(base) ? base : null);
    if (!pid) return close(false);
    load(pid).then((d) => { if (!d) return close(false); const sc = screen ?? (C.has(base) ? d.screens.find((s) => `${pid}/${s.component}` === base)?.id : undefined); show(pid, sc); });
  };
  A.projectKey = (e) => { if (!open || e.key !== "Escape") return false; if (sel) pick(null); else close(); return true; };
  addEventListener("resize", () => open && fit(0));
  return { show, close, state: () => ({ open, sel, cam: { ...cam }, screens: D?.screens.length ?? 0, pins: D?.pins.length ?? 0 }), data: () => D };
}
