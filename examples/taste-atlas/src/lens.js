// Project lens: #project:<id> opens a project in the Atlas's own format. The taxonomy stays, only the project's
// posts light up (plus two greyed neighbours per technique), and the shelf carries every resource the project has:
// status, journey screens, inspiration, repos & PRs, components, open notes, your asks, boards and links.
import { urlKey } from "./boardfilter.js";
import { MODE } from "./taxonomy.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const src = (p) => (/^(https?:|\/)/.test(p) ? p : `./data/${p}`);
const ago = (t) => { const d = (Date.now() / 1000 - t) / 86400; return d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : `${Math.round(d)}d`; };
const NEAR = 2;
const HASH0 = location.hash; // read at import: the Atlas rewrites the hash for its own focus before the lens mounts

export async function mountLens(A, { bm, fly }) {
  const get = (f) => fetch(f, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [W, ids] = await Promise.all([get("./data/work.atlas.json"), get("./data/projects.json")]);
  if (!bm || !W?.products?.length) return null;
  const byUrl = new Map(bm.items.map((b) => [urlKey(b.url), b]));
  const products = new Map(W.products.map((p) => [p.id, p]));

  // Projects sit in the layer bar as one picker, beside the board picker.
  const bar = document.querySelector(".layers"), sel = document.createElement("select");
  sel.className = "boardpick projpick"; sel.title = "Open a project in the atlas";
  sel.innerHTML = `<option value="">Project: none</option>` + W.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const place = () => { if (!bar.contains(sel)) bar.prepend(sel); };
  new MutationObserver(place).observe(bar, { childList: true }); place();

  let cur = null;
  async function show(id) {
    const p = products.get(id);
    // A project with its own atlas (work.config.json "atlas": "skills") reopens the page on that taxonomy; leaving it returns.
    if ((p?.atlas ?? null) !== MODE) { location.href = `${location.pathname}${p?.atlas ? `?atlas=${encodeURIComponent(p.atlas)}` : ""}${p ? `#project:${encodeURIComponent(id)}` : ""}`; return; }
    cur = p ? id : null; sel.value = cur ?? "";
    document.body.classList.toggle("lens", !!cur);
    if (!cur) { if (location.hash.startsWith("#project:")) history.replaceState(null, "", location.pathname + location.search); return bm.setCustom(null); }
    history.replaceState(null, "", `${location.pathname}${location.search}#project:${cur}`);
    const J = ids?.includes(cur) ? await get(`./data/project.${cur}.json`) : null;
    const comps = W.components.filter((c) => c.product === cur);
    // Posts: pinned refs that are your bookmarks, plus posts your asks and components link.
    const posts = new Map(), cards = [];
    for (const r of J?.pins ?? []) { const b = byUrl.get(urlKey(r.url)); b ? posts.set(b.id, b) : cards.push(r); }
    for (const c of comps) for (const pg of c.pages ?? []) { const b = pg.url && byUrl.get(urlKey(pg.url)); if (b) posts.set(b.id, b); }
    document.querySelectorAll(".node.on").forEach((n) => n.classList.remove("on"));
    for (const b of posts.values()) if (b.technique) document.querySelector(`.node[data-id="${CSS.escape(b.technique)}"]`)?.classList.add("on");
    const near = new Set();
    for (const t of new Set([...posts.values()].map((b) => b.technique).filter(Boolean)))
      (bm.byTech.get(t) ?? []).filter((b) => !posts.has(b.id)).slice(0, NEAR).forEach((b) => near.add(b.id));

    const prs = comps.flatMap((c) => c.prs ?? []).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i).sort((a, b) => (a.state === "OPEN") - (b.state === "OPEN") || b.t - a.t).reverse();
    const asks = [...(p.asks ?? []), ...comps.flatMap((c) => c.asks ?? [])].filter((x, i, a) => a.findIndex((y) => y.text === x.text) === i).sort((a, b) => b.t - a.t);
    const st = p.live ?? p.status;
    const sec = (title, n, body) => (n ? `<section class="pj-ctx ln"><h4>${title} <small>${n}</small></h4>${body}</section>` : "");
    const phases = J ? J.phases.map((ph) => [ph, J.screens.filter((s) => s.phase === ph.id)]).filter(([, l]) => l.length) : [];
    const html = [
      `<section class="pj-ctx ln head"><p class="ln-role">${esc(p.role ?? "")}</p>
        ${st ? `<p><em class="st-${esc(st.value)}">${esc(st.value)}</em> ${esc(st.why ?? "")} <small>· ${esc(st.source)} ${st.checked ? ago(st.checked) + " ago" : ""}</small></p>` : ""}
        ${p.deadlineLabel ? `<p><small>Due</small> ${esc(p.deadlineLabel)}</p>` : ""}
        ${p.metrics?.length ? `<div class="ln-metrics">${p.metrics.map(([k, v]) => `<span><b>${esc(v)}</b>${esc(k)}</span>`).join("")}</div>` : ""}</section>`,
      sec("User journey", J?.screens.length, `<a class="ln-open" href="#work:${esc(cur)}">Open the storyboard →</a><div class="ln-phases">${phases.map(([ph, l]) => `<div><small>${esc(ph.name)}</small><div class="ln-shots">${l.map((s) => `<a href="#work:${esc(cur)}@${esc(s.id)}" title="${esc(s.name)}">${s.shot ? `<img loading="lazy" src="${esc(src(s.shot))}" alt="" />` : ""}<span>${esc(s.name)}</span></a>`).join("")}</div></div>`).join("")}</div>`),
      sec("Repos", p.repos?.length, `<ul class="ln-list">${(p.repos ?? []).map((r) => { const ci = W.ci?.[r.gh]; return `<li><a href="https://github.com/${esc(r.gh)}" target="_blank" rel="noopener"><b>${esc(r.gh)}</b></a> ${ci ? `<a href="${esc(ci.url)}" target="_blank" rel="noopener"><em class="st-${ci.conclusion === "success" ? "ok" : "at-risk"}">CI ${esc(ci.conclusion ?? "?")}</em></a>` : ""}<small>${esc(r.head ?? "")} · ${esc(r.headMsg ?? "")} · ${r.headAt ? ago(r.headAt) : ""}</small></li>`; }).join("")}</ul>`),
      sec("Pull requests", prs.length, `<ul class="ln-list">${prs.slice(0, 8).map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">#${x.number} ${esc(x.title)}</a><small>${esc(x.state.toLowerCase())}${x.draft ? " · draft" : ""} · ${x.checks ? `${x.checks.pass}✓ ${x.checks.fail ? x.checks.fail + "✗" : ""}` : ""} · ${ago(x.t)}</small></li>`).join("")}</ul>`),
      sec("Components", comps.length, `<div class="ln-chips">${comps.map((c) => `<a href="#work:${esc(c.id)}" class="${esc(c.status?.value ?? "")}" title="${esc(c.status?.why ?? "")}">${esc(c.name)}<small>${c.prs?.length ?? 0} PR · ${c.lastTouched ? ago(c.lastTouched) : "—"}</small></a>`).join("")}</div>`),
      p.notes ? ["open", "risks"].map((k) => sec(k === "open" ? "Open" : "Risks", p.notes[k]?.length, `<ul class="ln-list">${p.notes[k].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`)).join("") : "",
      sec("Inspiration", posts.size + cards.length, `<small>${posts.size} of your saved posts are lit on the atlas; the rest are web references.</small><div class="ln-cards">${cards.slice(0, 24).map((r) => `<a href="${esc(r.url ?? "#")}" target="_blank" rel="noopener" title="${esc(r.title)}">${r.image ? `<img loading="lazy" src="${esc(r.image.startsWith("http") || r.image.startsWith("/") ? r.image : `/s/${r.board}/${r.image}`)}" alt="" />` : `<div class="txt">${esc(r.title)}</div>`}<span>${esc(r.text || r.title)}</span></a>`).join("")}</div>`),
      sec("Your asks", asks.length, `<ul class="ln-list asks">${asks.slice(0, 6).map((a) => `<li>“${esc(a.text.slice(0, 220))}${a.text.length > 220 ? "…" : ""}”<small>${ago(a.t)} ago</small></li>`).join("")}</ul>`),
      sec("Boards & links", (J?.boards?.length ?? 0) + (p.links?.length ?? 0), `<ul class="ln-list">${(J?.boards ?? []).map((b) => `<li><a href="/s/${esc(b.id)}/">${esc(b.title)}</a><small>board · ${b.refs} refs</small></li>`).join("")}${(p.links ?? []).map(([k, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(k)}</a></li>`).join("")}</ul>`),
    ].join("");
    // On its own atlas everything on the canvas is the project's context: nothing greys out, the shelf lists the skills.
    if (p.atlas) { const own = bm.items.filter((b) => b.layer === "skill").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); return bm.setCustom({ title: p.name, kind: "PROJECT", ids: null, items: own, n: own.length, html }); }
    bm.setCustom({ title: p.name, kind: "PROJECT", ids: new Set(posts.keys()), near, items: [...posts.values()], n: posts.size + cards.length, html });
    const ts = [...posts.keys(), ...near].map((i) => bm.tileOf(i)).filter(Boolean);
    if (ts.length) fly(ts.reduce((m, t) => [Math.min(m[0], t.x - 30), Math.min(m[1], t.y - 30), Math.max(m[2], t.x + 30), Math.max(m[3], t.y + 30)], [Infinity, Infinity, -Infinity, -Infinity]), 900, 6);
  }
  sel.addEventListener("change", () => show(sel.value));
  const fromHash = (h = location.hash) => { const m = /^#project:(.+)$/.exec(h); if (m && m[1] !== cur) show(decodeURIComponent(m[1])); };
  addEventListener("hashchange", () => fromHash()); fromHash(HASH0);
  return { show, current: () => cur };
}
