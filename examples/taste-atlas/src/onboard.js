// Import view (/onboard): one checklist for every personal source, a drop zone that takes any export (zip, folder or
// files) and the two sources that need no file (GitHub user, X sync). The server runs scripts/onboard.mjs for each.
import { mountNav, getTheme, saveTheme } from "./nav.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.documentElement;
root.dataset.theme = getTheme();
mountNav($(".bar .brand"));
$("#theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; saveTheme(root.dataset.theme); };
addEventListener("keydown", (e) => { if (e.key === "t" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) $("#theme").click(); });

const fmt = (n) => Number(n).toLocaleString();
let state = null, timer = null;

async function refresh() {
  const r = await fetch("/api/onboard", { cache: "no-store" });
  if (!r.ok) throw new Error(`/api/onboard ${r.status}`);
  state = await r.json(); render();
  clearTimeout(timer);
  if (state.jobs.some((j) => j.state === "running" || j.state === "queued")) timer = setTimeout(() => refresh().catch(fail), 1500);
}
const fail = (e) => { console.error("onboard:", e); $("#jobs").hidden = false; $("#jobs").insertAdjacentHTML("afterbegin", `<div class="ob-job failed"><b>Error</b><span>${esc(e.message)}</span></div>`); };

function render() {
  $("#done").textContent = state.done; $("#total").textContent = state.total; $("#bar").style.width = `${(100 * state.done) / state.total}%`;
  $("#sources").innerHTML = state.sources.map(card).join("");
  const jobs = state.jobs;
  $("#jobs").hidden = !jobs.length;
  $("#jobs").innerHTML = jobs.map((j) => `<div class="ob-job ${j.state}"><b>${esc(j.label)}</b><span>${j.state === "done" ? summary(j.result) : j.state === "failed" ? esc(lastLine(j.log)) : j.state === "running" ? "running…" : "waiting"}</span>
    ${j.state === "done" ? `<a href="/">See it on the Atlas →</a>` : ""}${j.log && j.state !== "done" ? `<details><summary>log</summary><pre>${esc(j.log.slice(-1500))}</pre></details>` : ""}</div>`).join("");
}
const lastLine = (log) => (log ?? "").trim().split("\n").filter((l) => /^onboard:|Error|FAIL/.test(l)).at(-1) ?? (log ?? "failed").trim().split("\n").at(-1);

function summary(r) {
  if (!r?.results) return "done";
  const one = (x) => {
    if (x.kind === "x") return `X: ${fmt(x.added)} new posts (${fmt(x.total)} total)`;
    if (x.kind === "web") return `${fmt(x.read)} links in ${fmt(x.folders)} folders (${fmt(x.total)} total)`;
    if (x.kind === "linkedin") return `LinkedIn: ${fmt(x.connections)} connections, ${fmt(x.hubs)} company hubs`;
    const srcs = Object.entries(x).filter(([, v]) => v && typeof v === "object" && "kept" in v);
    return srcs.map(([k, v]) => `${k}: ${fmt(v.kept)} kept of ${fmt(v.of)}`).join(" · ") || `${x.kind} done`;
  };
  return esc(r.results.map(one).join(" · ") + (r.skipped ? ` · ${r.skipped} other files skipped` : ""));
}

function card(s) {
  const t = state.tools, action = s.action === "github"
    ? `<form class="ob-act" data-cmd="github"><input name="user" placeholder="GitHub username" autocomplete="off" spellcheck="false" required pattern="[A-Za-z0-9-]{1,39}" /><button ${t.gh ? "" : "disabled title=\"Run gh auth login first\""}>${s.done ? "Refresh" : "Import"}</button></form>${t.gh ? "" : `<p class="ob-need">Needs <code>gh auth login</code> on this machine.</p>`}`
    : s.action === "x" ? `<form class="ob-act" data-cmd="x"><button ${t.twitterCli ? "" : "disabled"}>${s.done ? "Sync new bookmarks" : "Sync X bookmarks"}</button></form>${t.twitterCli ? "" : `<p class="ob-need">Needs twitter-cli: <code>pipx install twitter-cli</code>.</p>`}` : "";
  return `<article class="ob-card ${s.done ? "in" : ""}" data-source="${esc(s.id)}">
    <header><i></i><h2>${esc(s.label)}</h2>${s.done ? `<em>${fmt(s.items)}</em>` : `<em class="no">not yet</em>`}</header>
    ${s.done ? `<p class="ob-stat">${esc(s.detail ?? "")}${s.imported ? ` · imported ${esc(s.imported)}` : ""}</p>` : ""}
    <p class="ob-how">${s.how}</p>
    ${action}${s.link ? `<a class="ob-link" href="${esc(s.link)}" target="_blank" rel="noopener">Get the export ↗</a>` : ""}
  </article>`;
}

$("#sources").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target.closest("form[data-cmd]"); if (!f) return;
  const body = { cmd: f.dataset.cmd, user: f.user?.value.trim() };
  const r = await fetch("/api/onboard/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return fail(new Error((await r.json().catch(() => ({}))).error ?? `run ${r.status}`));
  refresh().catch(fail);
});

// ---------- drop: files and whole folders (webkitGetAsEntry), uploaded into one batch, then imported together
async function entries(items) {
  const out = [];
  const walk = async (en, path) => {
    if (en.isFile) { out.push({ file: await new Promise((ok, no) => en.file(ok, no)), path: path + en.name }); return; }
    const rd = en.createReader(); let batch;
    do { batch = await new Promise((ok, no) => rd.readEntries(ok, no)); for (const c of batch) await walk(c, `${path}${en.name}/`); } while (batch.length);
  };
  for (const it of items) { const en = it.webkitGetAsEntry?.(); if (en) await walk(en, ""); else if (it.getAsFile()) out.push({ file: it.getAsFile(), path: it.getAsFile().name }); }
  return out;
}
async function upload(files) {
  if (!files.length) return;
  const batch = Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, "x").padEnd(8, "0"), drop = $("#drop");
  drop.classList.add("busy");
  try {
    let i = 0;
    for (const { file, path } of files) {
      drop.querySelector("b").textContent = `Uploading ${++i} of ${files.length}: ${file.name}`;
      const r = await fetch(`/api/onboard/upload?batch=${batch}&name=${encodeURIComponent(path)}`, { method: "POST", body: file });
      if (!r.ok) throw new Error(`${file.name}: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
    }
    const r = await fetch(`/api/onboard/run?batch=${batch}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd: "import" }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `import ${r.status}`);
  } finally { drop.classList.remove("busy", "over"); drop.querySelector("b").textContent = "Drop exports here"; }
  await refresh();
}
const drop = $("#drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", async (e) => { e.preventDefault(); upload(await entries([...e.dataTransfer.items])).catch(fail); });
$("#file").addEventListener("change", (e) => upload([...e.target.files].map((file) => ({ file, path: file.name }))).catch(fail));
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });

window.__onboard = { refresh, upload, get state() { return state; } };
refresh().catch(fail);
