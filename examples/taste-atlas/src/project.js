// Project focus: opening a product that has a storyboard (data/project.<id>.json, from scripts/project.mjs) turns the
// atlas into that project. Everything else hides (body.project-focus), the one or two products it shares the most
// parts with stay greyed at the edge, and the camera flies onto its screens: real captures in journey order, wired by
// the flow between them, each badged with its critic verdict. Drawn on the Work canvas in world units, so the atlas's
// own pan, zoom and fly drive it. Picking a screen fills the shelf with what shaped it: the critic's issues and fix,
// takes over time, your asks, board pins and ideas, commits, and the colours, fonts and libraries in its code now.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : "");
const src = (p) => (/^(https?:|\/)/.test(p) ? p : `./data/${p}`);
export const VERDICT = { works: "#1f8a5b", rough: "#c27c0e", broken: "#d6453d" };
const SCENE = { live: "#1f8a5b", still: "#c27c0e", fix: "#d6453d" };
const FW = 12; // frame width in world units; the camera zooms to it

// Rows of screens in journey order, as many per row as frames the viewport best (aspect = free width / height).
export function grid(n, [fw, fh], aspect) {
  const w = FW, h = (FW * fh) / fw, gx = w * 0.5, gy = w * 0.8; // gy: room for two label lines under a frame and a phase name over the next
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols), gw = cols * w + (cols - 1) * gx, gh = rows * h + rows * gy, k = Math.min(aspect / gw, 1 / gh);
    if (!best || k > best.k + 1e-9) best = { k, cols, rows, gw, gh };
  }
  return { ...best, w, h, gx, gy };
}

// The 1–2 products this one shares the most components with (its parts that live on in them, or theirs in it).
export function neighbours(W, pid) {
  const n = new Map(), bump = (q, cid) => { if (q === pid) return; const v = n.get(q) ?? { id: q, shared: new Set() }; v.shared.add(cid); n.set(q, v); };
  for (const c of W.components) { if (c.product === pid) c.also.forEach((q) => bump(q, c.id)); else if (c.also.includes(pid)) bump(c.product, c.id); }
  return [...n.values()].sort((a, b) => b.shared.size - a.shared.size).slice(0, 2);
}

export function createProject(W, { P, C }) {
  const data = new Map();
  let D = null, sel = null, G = null, frames = new Map(), ghosts = [], box = null, anchor = null;
  const load = (pid) => fetch(`./data/project.${encodeURIComponent(pid)}.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((d) => { if (d?.screens?.length) data.set(pid, d); });

  function layout(o, aspect) {
    G = grid(D.screens.length, D.frame ?? [16, 10], aspect); frames = new Map();
    const x0 = o.x - G.gw / 2, y0 = o.y - G.gh / 2 + G.gy;
    D.screens.forEach((s, i) => frames.set(s.id, { s, i, x: x0 + (i % G.cols) * (G.w + G.gx), y: y0 + Math.floor(i / G.cols) * (G.h + G.gy), w: G.w, h: G.h }));
    const nb = neighbours(W, D.id).filter((n) => P.has(n.id)), gr = G.w * 0.62, gx = x0 + G.gw + G.gx * 2.2 + gr;
    ghosts = nb.map((n, i) => ({ ...n, p: P.get(n.id), x: gx, y: o.y - ((nb.length - 1) / 2 - i) * gr * 2.8, r: gr,
      to: [...frames.values()].filter((f) => n.shared.has(`${D.id}/${f.s.component}`)).slice(0, 4) }));
    box = [x0 - G.gx * 0.5, y0 - G.gy, x0 + G.gw + (ghosts.length ? G.gx * 2.2 + gr * 2.2 : G.gx * 0.5), y0 + G.gh - G.gy * 0.4];
  }

  function paint(ctx, { text, img, lw, dark, ink, mute, bg, px, hover }) {
    const halo = (x, y, w, h) => { ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }; // labels sit on the page, over any arrow
    const lit = sel ? new Set([sel, ...(frames.get(sel)?.s.next.map(([to]) => to) ?? []), ...D.screens.filter((s) => s.next.some(([to]) => to === sel)).map((s) => s.id)]) : null;
    const mono = '"IBM Plex Mono", monospace', blue = dark ? "#9db4ff" : "#2f6fd6";
    // Greyed neighbours and the parts they share.
    for (const g of ghosts) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = mute; ctx.lineWidth = lw(1.2); ctx.setLineDash([lw(3), lw(5)]);
      for (const f of g.to) { ctx.beginPath(); ctx.moveTo(g.x - g.r, g.y); ctx.bezierCurveTo(g.x - g.r - G.gx * 1.5, g.y, f.x + f.w + G.gx, f.y + f.h / 2, f.x + f.w, f.y + f.h / 2); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = hover === `ghost:${g.id}` ? 0.8 : 0.45; ctx.fillStyle = dark ? "#ffffff10" : "#0000000a"; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.fill(); ctx.strokeStyle = mute; ctx.lineWidth = lw(1.5); ctx.stroke();
      text(g.p.name, g.x, g.y - lw(2), 13, mute, { weight: 600, max: g.r * 1.8 });
      text(`shares ${[...g.shared].map((c) => C.get(c)?.name ?? c).join(", ")}`, g.x, g.y + lw(13), 10, mute, { max: g.r * 1.8 });
      ctx.globalAlpha = 1;
    }
    // Flow: the next screen in the row is a straight arrow; a wrap or a jump curves under and over.
    for (const f of frames.values()) for (const [to] of f.s.next) {
      const b = frames.get(to); if (!b) continue;
      const on = sel && (f.s.id === sel || to === sel), row = Math.abs(b.y - f.y) < 1e-6 && b.x > f.x;
      ctx.globalAlpha = on ? 0.95 : sel ? 0.18 : 0.5; ctx.strokeStyle = on ? blue : ink; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = lw(on ? 2.4 : 1.5);
      let ex, ey, ang; ctx.beginPath();
      if (row) { const y = f.y + f.h / 2; ctx.moveTo(f.x + f.w + lw(4), y); ctx.lineTo((ex = b.x - lw(4)), (ey = y)); ang = 0; }
      else { const ax = f.x + f.w / 2, bx = b.x + b.w / 2, by = b.y - lw(34), ay = f.y + f.h + lw(36), my = (ay + by) / 2; ctx.moveTo(ax, ay); ctx.bezierCurveTo(ax, my + G.gy * 0.3, bx, my - G.gy * 0.3, (ex = bx), (ey = by)); ang = Math.PI / 2; }
      ctx.stroke(); const k = lw(7); ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - k * Math.cos(ang - 0.45), ey - k * Math.sin(ang - 0.45)); ctx.lineTo(ex - k * Math.cos(ang + 0.45), ey - k * Math.sin(ang + 0.45)); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Phase names where the phase changes, and at each row start.
    let last = null;
    for (const f of frames.values()) {
      if (f.s.phase !== last || f.i % G.cols === 0) halo(f.x - lw(2), f.y - lw(24), Math.min(G.w * 2, lw(110)), lw(19));
      if (f.s.phase !== last || f.i % G.cols === 0) text((D.phases.find((p) => p.id === f.s.phase)?.name ?? f.s.phase).toUpperCase(), f.x, f.y - lw(10), 11, mute, { weight: 600, align: "left", font: mono, max: G.w * 2 });
      last = f.s.phase;
    }
    // Screens.
    for (const f of frames.values()) {
      const { s, x, y, w, h } = f, on = s.id === sel, hv = hover === `screen:${s.id}`, v = s.critic?.verdict, vc = VERDICT[v] ?? SCENE[s.scene?.state] ?? mute;
      ctx.globalAlpha = lit && !lit.has(s.id) ? 0.35 : 1;
      ctx.fillStyle = dark ? "#22282b" : "#e4e0d6"; ctx.fillRect(x, y, w, h);
      const im = px(w) > 8 ? img(src(s.shot)) : null;
      if (im) { const k = Math.min(w / im.width, h / im.height), dw = im.width * k, dh = im.height * k; ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
      ctx.strokeStyle = on ? blue : hv ? ink : vc; ctx.lineWidth = lw(on ? 3.5 : hv ? 2.5 : 1.5); ctx.setLineDash(s.branch ? [lw(5), lw(4)] : []); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      halo(x - lw(2), y + h + lw(3), w + G.gx * 0.8, lw(31)); ctx.globalAlpha = lit && !lit.has(s.id) ? 0.35 : 1;
      text(`${String(f.i + 1).padStart(2, "0")}  ${s.name}`, x, y + h + lw(15), 12, ink, { weight: 600, align: "left", max: w + G.gx * 0.8 });
      const n = s.critic?.issues?.length;
      if (px(w) > 60) text(`${n ? `${n} issue${n > 1 ? "s" : ""} · ` : ""}${s.commits.length} commits · ${s.asksTotal} asks`, x, y + h + lw(29), 10, mute, { align: "left", font: mono, max: w + G.gx * 0.8 });
      const tag = v ?? s.scene?.state;
      if (tag && px(w) > 40) { const tw = lw(tag.length * 7.5 + 12), th = lw(17); ctx.fillStyle = vc; ctx.fillRect(x + lw(4), y + lw(4), tw, th); text(tag, x + lw(4) + tw / 2, y + lw(4) + th * 0.72, 11, "#fff", { weight: 600, font: mono }); }
    }
    ctx.globalAlpha = 1;
  }

  function hit(wx, wy) {
    for (const f of frames.values()) if (wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) return `screen:${f.s.id}`;
    for (const g of ghosts) if (Math.hypot(wx - g.x, wy - g.y) <= g.r) return `ghost:${g.id}`;
    return null;
  }

  // Shelf: the journey list with critic totals, or one screen's story.
  function shelf() {
    const p = P.get(D.id), title = D.title ?? p?.name ?? D.id, s = sel && frames.get(sel)?.s;
    const tally = Object.keys(VERDICT).map((k) => [k, D.screens.filter((x) => x.critic?.verdict === k).length]).filter(([, n]) => n);
    if (!s) return { kind: "PROJECT · JOURNEY", title, n: D.screens.length, items: [], html: `<div class="pj-ctx">
      <p class="pj-flow">${D.screens.length} screens in journey order${tally.length ? ` · critic ${tally.map(([k, n]) => `<b style="color:${VERDICT[k]}">${n} ${k}</b>`).join(" · ")}` : ""}${D.critic?.source ? `<br><small>${esc(D.critic.source)}</small>` : ""}</p>
      <ol class="pj-list">${D.screens.map((x, i) => `<li><a href="#" data-pjscreen="${esc(x.id)}"><img loading="lazy" src="${esc(src(x.shot))}" alt="" /><span><b>${String(i + 1).padStart(2, "0")} ${esc(x.name)}</b><small>${esc(D.phases.find((q) => q.id === x.phase)?.name ?? x.phase)}${x.critic ? ` · <em style="--c:${VERDICT[x.critic.verdict]}">${esc(x.critic.verdict)}</em> ${esc(x.critic.issues[0] ?? "")}` : x.brief?.lede ? ` · ${esc(x.brief.lede)}` : ""}</small></span></a></li>`).join("")}</ol></div>` };
    const i = D.screens.indexOf(s), pins = D.pins.filter((x) => x.screens.includes(s.id)), next = s.next.map(([to, why]) => [D.screens.find((x) => x.id === to), why]).filter(([x]) => x);
    const from = D.screens.filter((x) => x.next.some(([to]) => to === s.id));
    const tl = [...s.asks.map((a) => ({ t: a.t, k: "ask", h: `<b>You asked</b> ${esc(a.text)}` })), ...s.notes.map((n) => ({ t: n.t, k: "note", h: `<b>Board note</b> ${esc(n.text)}` })),
      ...s.commits.slice(0, 18).map((c) => ({ t: c.t, k: c.design ? "design" : "commit", h: `<a href="https://github.com/${esc(c.gh)}/commit/${esc(c.h)}" target="_blank" rel="noopener"><code>${esc(c.h)}</code></a> ${esc(c.s)}` }))].sort((a, b) => b.t - a.t);
    const lum = (c) => { const v = parseInt(c.slice(1), 16); return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255); };
    const cr = s.critic, bf = s.brief, shots = [s.shot, ...s.takes];
    return { kind: `${esc(title.toUpperCase())} · ${String(i + 1).padStart(2, "0")} OF ${D.screens.length}`, title: s.name, n: "", items: [], html: `<div class="pj-ctx">
      <p class="pj-flow"><a href="#" data-pjscreen="">← journey</a> · ${esc(D.phases.find((q) => q.id === s.phase)?.name)} · ${esc(C.get(`${D.id}/${s.component}`)?.name ?? s.component)}</p>
      ${cr ? `<div class="pj-critic" style="--c:${VERDICT[cr.verdict]}"><div class="pj-k">Critic · <em>${esc(cr.verdict)}</em></div>${cr.who ? `<p><b>${esc(cr.who)}</b> ${esc(cr.did)}</p>` : ""}${cr.goal ? `<p class="pj-goal">${esc(cr.goal)}</p>` : ""}
        <ul>${cr.issues.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p><b>Fix</b> ${esc(cr.fix)}</p></div>` : ""}
      ${bf ? `<div class="pj-brief">${bf.lede ? `<p class="pj-goal">${esc(bf.lede)}</p>` : ""}${bf.facts?.length ? `<ul>${bf.facts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${bf.links?.length ? `<p class="pj-flow">${bf.links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(" · ")}</p>` : ""}</div>` : ""}
      ${s.scene ? `<p class="pj-scene"><em style="--c:${SCENE[s.scene.state] ?? "#8a857a"}">${esc(s.scene.state)}</em> film beat “${esc(s.scene.name)}” · ${esc(s.scene.note)}</p>` : ""}
      <img class="pj-hero" src="${esc(src(s.shot))}" alt="" />
      ${shots.length > 1 ? `<div class="pj-k">Takes over time · ${shots.length}</div><div class="pj-takes">${shots.map((x, j) => `<figure><img data-take="${esc(src(x))}" class="${j ? "" : "on"}" src="${esc(src(x))}" alt="" /><figcaption>${j ? esc(x.split("/").at(-1).replace(/\.\w+$/, "")) : "current"}</figcaption></figure>`).join("")}</div>` : ""}
      <p class="pj-flow">${from.length ? `from ${from.map((x) => `<a href="#" data-pjscreen="${esc(x.id)}">${esc(x.name)}</a>`).join(", ")}` : "start of the journey"}${next.length ? ` · next ${next.map(([x, why]) => `<a href="#" data-pjscreen="${esc(x.id)}">${esc(x.name)}</a> <small>(${esc(why)})</small>`).join(", ")}` : ""}</p>
      ${pins.length ? `<div class="pj-k">Inspo pinned on the board · ${pins.length}</div><div class="pj-inspo">${pins.map((x) => `<a href="${esc(x.url ?? "#")}" target="_blank" rel="noopener" title="${esc(x.title)}">${x.image ? `<img src="${esc(x.image)}" alt="" />` : ""}<span>${esc(x.title || x.source)}</span></a>`).join("")}</div>` : ""}
      ${s.colors.length ? `<div class="pj-k">Colours in its code now</div><div class="pj-sws">${s.colors.map(([c, n]) => `<span class="pj-sw" style="--c:${esc(c)};color:${lum(c) > 150 ? "#1b1a17" : "#fff"}" title="${esc(c)} · ${n}×">${esc(c)}</span>`).join("")}</div>` : ""}
      ${s.fonts.length ? `<div class="pj-k">Fonts</div><p class="pj-tags">${s.fonts.map(([f, n]) => `<span style="font-family:'${esc(f)}'">${esc(f)} <small>${n}×</small></span>`).join("")}</p>` : ""}
      ${s.libs.length ? `<div class="pj-k">Libraries it imports</div><p class="pj-tags">${s.libs.map(([l, n]) => `<span>${esc(l)} <small>${n}</small></span>`).join("")}</p>` : ""}
      ${s.ideas.length ? `<div class="pj-k">Ideas</div><ul class="pj-ideas">${s.ideas.map((x) => `<li>${esc(x.text)} <small>${esc(x.kind)} · ${esc(x.stream)}</small></li>`).join("")}</ul>` : ""}
      <div class="pj-k">Design choices over time · ${s.asksTotal} asks · ${s.commits.length} commits in ${D.windowDays}d</div><ol class="pj-tl">${tl.map((x) => `<li class="${x.k}"><time>${day(x.t)}</time>${x.h}</li>`).join("") || "<li>Nothing in the window yet.</li>"}</ol>
      ${s.sessions.length ? `<div class="pj-k">Conversations it came up in</div><ul class="pj-sess">${s.sessions.map((x) => `<li>${esc(x.title ?? x.id)} <small>${x.n}× · ${esc(x.id.slice(0, 15))}</small></li>`).join("")}</ul>` : ""}
      <div class="pj-k">Code</div><p class="pj-tags">${s.code.map((c) => `<a href="https://github.com/${esc(c.gh)}" target="_blank" rel="noopener">${esc(c.repo)} · ${c.files} files · ${c.commits} commits</a>`).join("")}</p></div>` };
  }

  return {
    load: () => fetch("./data/projects.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((ids) => Promise.all(ids.filter((id) => P.has(id)).map(load))),
    has: (pid) => data.has(pid),
    on: () => !!D,
    id: () => D?.id ?? null,
    sel: () => sel,
    // Enter (or re-lay out) project pid around its node o; returns the world box to fly to.
    enter(pid, o, aspect) { if (D?.id !== pid) sel = null; D = data.get(pid); anchor = o; layout(o, aspect); return box; },
    relayout: (aspect) => { if (D) layout(anchor, aspect); return box; },
    exit() { D = null; sel = null; frames = new Map(); ghosts = []; },
    pick(id) { sel = id && frames.has(id) ? id : null; const f = sel && frames.get(sel); return f ? [f.x - G.gx * 0.6, f.y - G.gy * 0.9, f.x + f.w + G.gx * 0.6, f.y + f.h + G.gy * 0.9] : box; },
    box: () => box, paint, hit, shelf,
    state: () => ({ open: D?.id ?? null, sel, screens: D?.screens.length ?? 0, cols: G?.cols ?? 0, frames: [...frames.values()].map((f) => ({ id: f.s.id, x: f.x, y: f.y, w: f.w, h: f.h, verdict: f.s.critic?.verdict ?? null })), ghosts: ghosts.map((g) => g.id), box }),
  };
}
