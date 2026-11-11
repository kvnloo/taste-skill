// Board canvas: one scene per board (Excalidraw elements), two engines that read it.
// Excalidraw edits it in the browser; Ink (Inkboard, a desktop whiteboard) opens the .excalidraw or
// .canvas (JSON Canvas, jsoncanvas.org 1.0) export and its edits come back through import.
// Pure functions, shared by the server (board.mjs) and the canvas page; no Excalidraw import here:
// the page runs Excalidraw's restoreElements over these minimal elements, which fills the defaults.

export const FRAMES = [
  { key: "inspo", name: "Inspo", w: 1580 },
  { key: "kept", name: "Kept", w: 1060 },
  { key: "directions", name: "Directions", w: 1060 },
  { key: "ideas", name: "Ideas", w: 800 },
  { key: "noped", name: "Noped", w: 540 },
];
const GAP = 80, TOP = 0, H = 1400, CELL = { w: 240, h: 180, cap: 44, pad: 20 };
const frameX = (key) => { let x = 0; for (const f of FRAMES) { if (f.key === key) return x; x += f.w + GAP; } return 0; };
export const frameId = (key) => `frame-${key}`;
const keyOfFrame = (id) => (typeof id === "string" && id.startsWith("frame-") ? id.slice(6) : null);

/** Which frame a ref starts in, from its source and the owner's latest verdict. */
export const frameFor = (ref, verdict) => (verdict === "like" || verdict === "pin" ? "kept" : verdict === "nope" ? "noped" : ref.source === "variant" ? "directions" : "inspo");

let seq = 0;
const base = (o) => ({ angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1 + (seq++ % 2e9), version: 1, versionNonce: 1, isDeleted: false, boundElements: null, link: null, locked: false, ...o });
const text = (o) => base({ type: "text", fontSize: 16, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, originalText: o.text, autoResize: true, lineHeight: 1.25, ...o });
// A box with a label bound inside it (a sticky note, a ref without a picture, a JSON Canvas text node).
function labelled(id, o, label, labelOpts = {}) {
  const t = text({ id: `${id}-label`, x: o.x + 10, y: o.y + 10, width: o.width - 20, height: o.height - 20, text: label, containerId: id, textAlign: "center", verticalAlign: "middle", frameId: o.frameId ?? null, ...labelOpts });
  return [base({ id, type: "rectangle", roundness: { type: 3 }, boundElements: [{ id: t.id, type: "text" }], ...o }), t];
}

/** Elements this board needs that the scene doesn't have yet (new refs, notes, swatches, missing frames).
 *  Never moves what is already there; new items take the next free cell of their frame. */
export function plan(board, verdicts = new Map(), scene = []) {
  const have = new Set(scene.map((e) => e.id)), out = [];
  // A cell is free when nothing already on the canvas (placed by the owner or by an earlier plan) overlaps it.
  const taken = live(scene).filter((e) => e.type !== "frame").map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
  const hits = (a) => taken.some((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);
  const cols = (k) => Math.max(1, Math.floor((FRAMES.find((f) => f.key === k).w - CELL.pad) / (CELL.w + CELL.pad)));
  const cell = (k) => {
    for (let n = 0; ; n++) {
      const c = cols(k), a = { x: frameX(k) + CELL.pad + (n % c) * (CELL.w + CELL.pad), y: TOP + 60 + Math.floor(n / c) * (CELL.h + CELL.cap + CELL.pad), width: CELL.w, height: CELL.h + CELL.cap };
      if (!hits(a)) { taken.push(a); return a; }
    }
  };
  for (const f of FRAMES) if (!have.has(frameId(f.key))) out.push(base({ id: frameId(f.key), type: "frame", name: f.name, x: frameX(f.key), y: TOP, width: f.w, height: H, strokeColor: "#bbb" }));
  for (const r of board.refs ?? []) {
    const id = `ref-${r.id}`; if (have.has(id)) continue;
    const k = frameFor(r, verdicts.get(r.id)), { x, y } = cell(k), common = { x, y, width: CELL.w, height: CELL.h, frameId: frameId(k), link: r.url ?? null, customData: { ref: r.id, slot: true } };
    if (r.image) out.push(base({ id, type: "image", fileId: `img-${r.id}`, status: "pending", scale: [1, 1], crop: null, ...common }));
    else out.push(...labelled(id, { ...common, backgroundColor: "#f1f3f5" }, String(r.title ?? r.url ?? "").slice(0, 90)));
    out.push(text({ id: `cap-${r.id}`, x, y: y + CELL.h + 6, width: CELL.w, height: 34, fontSize: 13, frameId: frameId(k), text: String(r.title ?? "").slice(0, 60), customData: { caption: r.id } }));
  }
  (board.notes ?? []).forEach((n, i) => {
    const id = `note-${n.t ?? i}-${i}`; if (have.has(id)) return;
    const { x, y } = cell("ideas");
    out.push(...labelled(id, { x, y, width: CELL.w, height: CELL.h, frameId: frameId("ideas"), backgroundColor: n.who === "owner" ? "#d0ebff" : "#fff3bf", strokeColor: "transparent", customData: { note: i, who: n.who, slot: true } }, String(n.text ?? "").slice(0, 400), { fontSize: 14, textAlign: "left", verticalAlign: "top" }));
  });
  (board.palette ?? []).forEach((hex, i) => {
    const id = `swatch-${i}-${String(hex).replace(/[^0-9a-z]/gi, "")}`; if (have.has(id)) return;
    out.push(...labelled(id, { x: frameX("directions") + CELL.pad + i * 100, y: TOP + H - 140, width: 90, height: 90, frameId: frameId("directions"), backgroundColor: hex, strokeColor: "transparent", customData: { swatch: hex } }, hex, { fontSize: 11, strokeColor: "#888" }));
  });
  return out;
}

const live = (els) => els.filter((e) => !e.isDeleted);
const inside = (e, f) => e.x >= f.x && e.y >= f.y && e.x + e.width <= f.x + f.width && e.y + e.height <= f.y + f.height;
/** Frame key an element sits in: its frameId, else the frame that contains it (imports lose frameId). */
function whereIs(e, frames) { const k = keyOfFrame(e.frameId); if (k) return k; const f = frames.find((f) => inside(e, f)); return f ? keyOfFrame(f.id) : null; }

/** Picks implied by refs the owner moved since the last save: into Kept = like, Noped = nope, back to Inspo = clear.
 *  Only moves count, so a ref that stays put never overrides a verdict given on the board page. */
export function picksFromScene(elements, verdicts = new Map(), before = []) {
  const refOf = (e) => e.customData?.ref ?? (e.id.startsWith("ref-") ? e.id.slice(4) : null);
  const at = (els) => { const l = live(els), fr = l.filter((e) => e.type === "frame"), m = new Map(); for (const e of l) { const r = refOf(e); if (r && e.type !== "text") m.set(r, whereIs(e, fr)); } return m; };
  const was = at(before), now = at(elements), out = [];
  for (const [ref, k] of now) {
    if (!was.has(ref) || was.get(ref) === k) continue;
    const cur = verdicts.get(ref) ?? null, kept = cur === "like" || cur === "pin";
    if (k === "kept" && !kept) out.push({ ref, verdict: "like" });
    else if (k === "noped" && cur !== "nope") out.push({ ref, verdict: "nope" });
    else if (k === "inspo" && (kept || cur === "nope")) out.push({ ref, verdict: "clear" });
  }
  return out;
}

// ---------- JSON Canvas 1.0 (Inkboard, Obsidian)
const r = (v) => Math.round(v ?? 0);
/** Scene -> JSON Canvas: frames become groups, refs link nodes, boxes and free text text nodes, bound arrows edges. */
export function toJsonCanvas(elements) {
  const els = live(elements), byId = new Map(els.map((e) => [e.id, e])), nodes = [], edges = [];
  const labelOf = (e) => (e.boundElements ?? []).map((b) => byId.get(b.id)).find((t) => t?.type === "text")?.text;
  for (const e of els) {
    const box = { id: e.id, x: r(e.x), y: r(e.y), width: Math.max(1, r(e.width)), height: Math.max(1, r(e.height)) };
    if (e.type === "frame") nodes.push({ ...box, type: "group", label: e.name ?? "" });
    else if (e.link && /^https?:/.test(e.link) && (e.type === "image" || e.customData?.ref)) nodes.push({ ...box, type: "link", url: e.link });
    else if (["rectangle", "ellipse", "diamond", "image"].includes(e.type)) nodes.push({ ...box, type: "text", text: labelOf(e) ?? (e.customData?.swatch ?? ""), ...(e.backgroundColor?.startsWith("#") ? { color: e.backgroundColor } : {}) });
    else if (e.type === "text" && !e.containerId) nodes.push({ ...box, type: "text", text: e.text ?? "" });
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of els) if (e.type === "arrow" && ids.has(e.startBinding?.elementId) && ids.has(e.endBinding?.elementId))
    edges.push({ id: e.id, fromNode: e.startBinding.elementId, toNode: e.endBinding.elementId, toEnd: "arrow" });
  return { nodes, edges };
}

/** JSON Canvas -> minimal scene elements (Excalidraw's restore fills the rest). */
export function fromJsonCanvas(jc) {
  if (!jc || !Array.isArray(jc.nodes)) throw new Error("not a JSON Canvas file (no nodes array)");
  const out = [], groups = jc.nodes.filter((n) => n.type === "group"), id = (s) => String(s).replace(/[^\w-]/g, "_").slice(0, 60);
  for (const g of groups) out.push(base({ id: id(g.id), type: "frame", name: g.label ?? "", x: g.x, y: g.y, width: g.width, height: g.height }));
  const frameOf = (n) => { const g = groups.find((g) => inside(n, g)); return g ? id(g.id) : null; };
  for (const n of jc.nodes) {
    if (n.type === "group") continue;
    const label = n.type === "text" ? String(n.text ?? "") : n.type === "link" ? String(n.url ?? "") : n.type === "file" ? `📄 ${n.file ?? ""}` : "";
    const ref = String(n.id).startsWith("ref-") ? String(n.id).slice(4) : null;
    if (String(n.id).startsWith("cap-") && n.type === "text") { out.push(text({ id: id(n.id), x: n.x, y: n.y, width: n.width, height: n.height, fontSize: 13, frameId: frameOf(n), text: label.slice(0, 120), customData: { caption: String(n.id).slice(4) } })); continue; }
    out.push(...labelled(id(n.id), { x: n.x, y: n.y, width: n.width, height: n.height, frameId: frameOf(n), link: n.type === "link" ? n.url : null, backgroundColor: /^#/.test(n.color ?? "") ? n.color : "#f1f3f5", customData: ref ? { ref, slot: true } : undefined }, label.slice(0, 600), { fontSize: 14 }));
  }
  const at = new Map(out.map((e) => [e.id, e]));
  for (const e of jc.edges ?? []) {
    const a = at.get(id(e.fromNode)), b = at.get(id(e.toNode)); if (!a || !b) continue;
    const x = a.x + a.width / 2, y = a.y + a.height / 2;
    const arrow = base({ id: id(e.id ?? `${e.fromNode}-${e.toNode}`), type: "arrow", x, y, width: Math.abs(b.x + b.width / 2 - x), height: Math.abs(b.y + b.height / 2 - y), points: [[0, 0], [b.x + b.width / 2 - x, b.y + b.height / 2 - y]], startBinding: { elementId: a.id, focus: 0, gap: 4 }, endBinding: { elementId: b.id, focus: 0, gap: 4 }, endArrowhead: "arrow" });
    for (const s of [a, b]) s.boundElements = [...(s.boundElements ?? []), { id: arrow.id, type: "arrow" }];
    out.push(arrow);
  }
  return out;
}

/** JSON Canvas has no pictures: put each board ref back as the board draws it (picture, title), where the file left it. */
export function rehydrate(elements, board) {
  const refs = new Map((board.refs ?? []).map((r) => [r.id, r])), byId = new Map(elements.map((e) => [e.id, e])), swap = new Map();
  for (const e of elements) {
    const r = refs.get(e.customData?.ref); if (!r || e.type === "image" || e.id !== `ref-${r.id}`) continue;
    const fresh = plan({ refs: [r] }, new Map(), []).filter((x) => x.type !== "frame" && !x.id.startsWith("cap-")), main = fresh[0];
    const sx = e.width / main.width, sy = e.height / main.height;
    swap.set(e, fresh.map((f) => ({ ...f, x: e.x + (f.x - main.x) * sx, y: e.y + (f.y - main.y) * sy, width: f.width * sx, height: f.height * sy, frameId: e.frameId })));
    for (const b of e.boundElements ?? []) if (b.type === "text" && byId.get(b.id)?.containerId === e.id) swap.set(byId.get(b.id), []);
  }
  return elements.flatMap((e) => swap.get(e) ?? [e]);
}

/** Parse an imported file (.excalidraw or .canvas) into {elements, files, format}. */
export function parseImport(raw) {
  const j = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (j?.type === "excalidraw" && Array.isArray(j.elements)) return { elements: j.elements, files: j.files ?? {}, format: "excalidraw" };
  return { elements: fromJsonCanvas(j), files: {}, format: "canvas" };
}

/** Re-identify an edited file against the scene it came from. Inkboard (and other editors) save fresh ids and drop
 *  customData, links and frames (a frame comes back as a dashed box plus a title text), so match by content:
 *  frames by title, refs by picture bytes or title, captions, notes and swatches by text; the nearest wins.
 *  Matched shapes take back their board id and data at the file's position. Board shapes the file no longer has
 *  stay as deleted tombstones (so the agent doesn't re-add them), except pictures a JSON Canvas file can't carry. */
export function reconcile(imported, prev, { files = {}, prevFiles = {}, format = "excalidraw" } = {}) {
  const els = live(imported), byId = new Map(els.map((e) => [e.id, e])), done = new Set(), rename = new Map(), out = [];
  const labelOf = (e) => (e.type === "text" ? e.text : (e.boundElements ?? []).map((b) => byId.get(b.id)).find((t) => t?.type === "text" && t.containerId === e.id)?.text) ?? "";
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Nearest candidate, preferring ones of about the same size: a ref card and its caption share their text, and the
  // card may have moved far (that move is the pick).
  const near = (e, p) => Math.abs(e.width - p.width) <= p.width / 4 && Math.abs(e.height - p.height) <= p.height / 4;
  const take = (cands, p) => { const free = cands.filter((e) => !done.has(e.id)), same = free.filter((e) => near(e, p)); const c = (same.length ? same : free).sort((a, b) => dist(a, p) - dist(b, p))[0]; if (c) done.add(c.id); return c; };
  const prevLive = live(prev), prevById = new Map(prevLive.map((e) => [e.id, e])), kept = new Set();
  const role = (p) => (p.type === "frame" ? "frame" : p.customData?.ref && p.id.startsWith("ref-") ? "ref" : p.customData?.caption ? "caption" : p.customData?.note !== undefined ? "note" : p.customData?.swatch ? "swatch" : null);
  const prevLabel = (p) => (p.type === "frame" ? p.name : p.type === "text" ? p.text : (p.boundElements ?? []).map((b) => prevById.get(b.id)).find((t) => t?.type === "text")?.text);
  const dataOf = (e, fs) => fs[e.fileId]?.dataURL;
  for (const p of prevLive) {
    const r = role(p); if (!r) continue;
    let m = byId.get(p.id) && !done.has(p.id) ? byId.get(p.id) : null;  // same id: our own export came back
    if (m) done.add(m.id);
    else if (r === "frame") {
      const t = take(els.filter((e) => !e.containerId && norm(labelOf(e)) === norm(p.name) && e.width < 400), p);
      const body = t && take(els.filter((e) => ["frame", "rectangle"].includes(e.type) && e.width >= 300 && Math.abs(e.x - t.x) < 12 && e.y >= t.y - 4 && e.y - t.y < 90), p);
      if (body) { m = body; rename.set(t.id, null); }
      else if (t) done.delete(t.id);
    } else if (r === "ref" && p.type === "image") {
      const want = dataOf(p, prevFiles); m = want ? take(els.filter((e) => e.type === "image" && dataOf(e, files) === want), p) : null;
    } else {
      const want = norm(prevLabel(p)); if (want) m = take(els.filter((e) => !e.containerId && (r === "caption" ? e.type !== "image" : e.type !== "text" && e.type !== "image") && norm(labelOf(e)) === want), p);
    }
    if (m) { rename.set(m.id, p); kept.add(p.id); }
  }
  const idFor = (e) => { const p = rename.get(e.id); return p ? p.id : e.containerId && rename.get(e.containerId) ? `${rename.get(e.containerId).id}-label` : e.id; };
  for (const e of els) {
    if (rename.get(e.id) === null) continue;  // a frame title text: the frame carries its name
    const own = e.containerId && byId.has(e.containerId) ? rename.get(e.containerId) : undefined;
    if (own === null || own?.type === "frame" || own?.type === "text") continue;  // labels of title boxes, frame bodies, captions
    const p = rename.get(e.id), fix = (b) => ({ ...b, id: byId.has(b.id) ? idFor(byId.get(b.id)) : b.id });
    const n = { ...e, id: idFor(e), boundElements: e.boundElements?.map(fix) ?? null, containerId: e.containerId ? idFor(byId.get(e.containerId) ?? { id: e.containerId }) : e.containerId ?? null, frameId: null };
    if (e.startBinding?.elementId && byId.has(e.startBinding.elementId)) n.startBinding = { ...e.startBinding, elementId: idFor(byId.get(e.startBinding.elementId)) };
    if (e.endBinding?.elementId && byId.has(e.endBinding.elementId)) n.endBinding = { ...e.endBinding, elementId: idFor(byId.get(e.endBinding.elementId)) };
    if (p?.type === "text") { out.push({ ...p, x: e.x, y: e.y, frameId: null }); continue; }  // a caption that came back as a card
    if (p) Object.assign(n, { customData: p.customData, link: p.link ?? n.link ?? null }, p.type === "frame" ? { type: "frame", name: p.name, backgroundColor: "transparent", strokeStyle: "solid", boundElements: null } : {});
    out.push(n);
  }
  // Frame membership from geometry (imports lose it), so Excalidraw clips and moves children with their frame.
  const frames = out.filter((e) => e.type === "frame");
  for (const e of out) if (e.type !== "frame") { const f = frames.find((f) => inside(e, f)); e.frameId = f ? f.id : null; }
  for (const p of prevLive) {
    if (kept.has(p.id) || !role(p) || p.containerId) continue;
    if (format === "canvas" && p.type === "image") { out.push(p); continue; }  // JSON Canvas can't hold pictures: keep it
    out.push({ ...p, isDeleted: true });
  }
  return out;
}

/** A full .excalidraw document (what Inkboard and excalidraw.com open). */
export const excalidrawFile = (elements, files = {}, appState = {}) => ({ type: "excalidraw", version: 2, source: "taste-board", elements, appState: { viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff", gridSize: null }, files });
