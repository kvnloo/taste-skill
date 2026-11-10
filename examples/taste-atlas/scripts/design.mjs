// Turn a taste board into an editable design file: OpenPencil (MIT, opens/writes Figma .fig) via its headless CLI.
// Layout is plain HTML (title, goal, techniques, palette, type, the kept references as picture cards, owner notes),
// `openpencil import` turns it into editable frames/text, then `openpencil eval` drops the real pictures into the
// placeholder frames (named "img") and `openpencil export` renders a PNG. Same route as the StreetIQ r01 board.
// $TASTE_OPENPENCIL overrides the CLI (default: `openpencil` on PATH, else `npx -y @open-pencil/cli@0.16.0`).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { techById } from "../src/brief.js";
import { OPERATIONS } from "../src/taxonomy.js";
const opById = Object.fromEntries(OPERATIONS.map((o) => [o.id, o]));

const COL = 360;  // card picture width (px); heights follow each picture's aspect ratio
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function cli() {
  if (process.env.TASTE_OPENPENCIL) return process.env.TASTE_OPENPENCIL.split(" ");
  try { execFileSync("openpencil", ["--help"], { stdio: "ignore" }); return ["openpencil"]; } catch { return ["npx", "-y", "@open-pencil/cli@0.16.0"]; }
}
function op(args, opts = {}) {
  const [bin, ...pre] = cli();
  try { return execFileSync(bin, [...pre, ...args], { encoding: "utf8", maxBuffer: 256 << 20, timeout: 180000, ...opts }); }
  catch (e) { throw new Error(`openpencil ${args[0]} failed: ${(e.stderr || e.stdout || e.message).toString().trim().slice(-800)}`); }
}

/** A board picture as a local JPEG no wider than 2*COL, plus its size. Returns null (and says why) when unavailable. */
async function picture(ref, { app, data, work, i }) {
  const src = ref.image;
  if (!src) return null;
  const out = join(work, `img${i}.jpg`);
  let input = null;
  if (src.startsWith("/data/")) input = join(data, decodeURIComponent(src.slice(6)));
  else if (src.startsWith("/atlas/")) input = join(app, decodeURIComponent(src.slice(7)));
  else if (/^https?:\/\//.test(src)) {
    const r = await fetch(src, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { process.stderr.write(`design: picture ${r.status} ${src}\n`); return null; }
    input = join(work, `raw${i}`); writeFileSync(input, Buffer.from(await r.arrayBuffer()));
  }
  if (!input || !existsSync(input)) { process.stderr.write(`design: no local picture for ${ref.url} (${src})\n`); return null; }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-frames:v", "1", "-vf", `scale='min(${COL * 2},iw)':-2`, "-q:v", "3", out]);
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { encoding: "utf8" }).trim().split(",").map(Number);
  return { file: out, w, h };
}

/** Build <dir>/design/{board.html,<id>.fig,board.png}; returns {fig, png, cards, missing}. */
export async function buildDesign({ d, board, verdicts, app, data }) {
  const work = join(d, "design"), tmp = join(work, ".work");
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const kept = board.refs.filter((r) => ["like", "pin"].includes(verdicts.get(r.id)));
  const noped = new Set(board.refs.filter((r) => verdicts.get(r.id) === "nope").map((r) => r.id));
  const refs = (kept.length ? kept : board.refs.filter((r) => !noped.has(r.id))).slice(0, 24);
  const pics = [];
  for (const [i, r] of refs.entries()) pics.push(await picture(r, { app, data, work: tmp, i }).catch((e) => { process.stderr.write(`design: ${r.url}: ${e.message}\n`); return null; }));
  const cards = refs.map((r, i) => ({ r, p: pics[i] })).filter((c) => c.p);
  const techs = board.techniques.map((t) => techById.get(t)).filter(Boolean);
  const notes = [...board.notes.filter((n) => n.who === "owner").map((n) => n.text), ...(board.ownerNotes ?? [])].slice(-6);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(board.title)}</title><style>
body{margin:0;background:#0E0F11;font-family:Inter,sans-serif;color:#ECEDEF}
.board{width:2000px;padding:72px;box-sizing:border-box;background:#0E0F11}
h1{color:#ECEDEF;font-size:60px;margin:0 0 8px;font-weight:800;letter-spacing:-1px}.goal{font-size:24px;color:#9AA0A8;margin:0 0 40px;width:1400px;line-height:34px}
.row{display:flex;gap:24px;margin-bottom:40px;align-items:flex-start}
.tech{width:420px;background:#17191C;border:1px solid #2A2D32;border-radius:18px;padding:20px 24px;box-sizing:border-box}
.tech small{font-size:14px;color:#9AA0A8}.tech h3{color:#ECEDEF;font-size:24px;margin:6px 0}.tech p{font-size:16px;line-height:23px;color:#C4C8CE;margin:0}
.sw{width:120px;height:84px;border-radius:12px;border:1px solid #2A2D32;padding:10px;box-sizing:border-box;font-size:14px;color:#0E0F11}
.font{font-size:28px;background:#17191C;border:1px solid #2A2D32;border-radius:12px;padding:16px 20px}
.grid{display:flex;flex-wrap:wrap;gap:24px;width:1856px}
.card{width:${COL}px;background:#17191C;border:1px solid #2A2D32;border-radius:18px;padding:14px;box-sizing:content-box}
.card h2{color:#ECEDEF;font-size:18px;margin:12px 0 4px;line-height:24px}.card p{font-size:14px;line-height:20px;color:#9AA0A8;margin:0}
.note{font-size:20px;line-height:30px;background:#17191C;border:1px solid #2A2D32;border-radius:18px;padding:20px 24px;width:880px;box-sizing:border-box}
</style></head><body><div class="board">
<h1>${esc(board.title)}</h1>${board.goal ? `<p class="goal">${esc(board.goal)}</p>` : ""}
${techs.length ? `<div class="row">${techs.map((t) => `<div class="tech"><small>${esc(opById[t.op]?.name ?? t.op)} · ${esc(t.domain)}</small><h3>${esc(t.name)}</h3><p>${esc(t.mech)}</p></div>`).join("")}</div>` : ""}
${board.palette.length ? `<div class="row">${board.palette.map((c) => `<div class="sw" style="background:${esc(c)}">${esc(c)}</div>`).join("")}</div>` : ""}
${board.type.length ? `<div class="row">${board.type.map((f) => `<div class="font" style="font-family:'${esc(f)}'">${esc(f)}</div>`).join("")}</div>` : ""}
${notes.length ? `<div class="row">${notes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}</div>` : ""}
<div class="grid">${cards.map(({ r, p }) => `<div class="card"><div class="img" style="width:${COL}px;height:${Math.round((COL * p.h) / p.w)}px;background:#22252A;border-radius:10px"></div><h2>${esc(String(r.title).slice(0, 80))}</h2><p>${esc(String(r.text ?? "").slice(0, 140))}</p></div>`).join("")}</div>
</div></body></html>`;
  writeFileSync(join(work, "board.html"), html);
  const fig = join(work, `${board.id}.fig`), png = join(work, "board.png");
  op(["import", join(work, "board.html"), "-o", fig, "--pageName", board.title.slice(0, 60)]);
  if (cards.length) {
    const IM = cards.map(({ p }) => readFileSync(p.file).toString("base64"));
    const code = `const IM=${JSON.stringify(IM)};
const frames=figma.currentPage.findAll(n=>n.name==="img");
if(frames.length!==IM.length) throw new Error("placeholders "+frames.length+" != pictures "+IM.length);
const b64=s=>{const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;};
frames.forEach((f,i)=>{const img=figma.createImage(b64(IM[i]));f.fills=[{type:"IMAGE",imageHash:img.hash,scaleMode:"FILL"}];f.name="ref/"+(i+1);});
return frames.length;`;
    writeFileSync(join(tmp, "fill.js"), code);
    op(["eval", fig, "--stdin", "-w"], { input: code });
  }
  op(["export", fig, "-f", "png", "-o", png]);
  if (!existsSync(fig) || !existsSync(png)) throw new Error(`openpencil wrote no ${existsSync(fig) ? png : fig}`);
  rmSync(tmp, { recursive: true, force: true });
  return { fig, png, cards: cards.length, missing: refs.length - cards.length };
}
