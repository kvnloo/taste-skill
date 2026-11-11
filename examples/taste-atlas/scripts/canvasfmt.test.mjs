// Board canvas formats: layout plan, picks from moved refs, JSON Canvas 1.0 round trip (Ink/Inkboard, Obsidian).
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, fit, picksFromScene, toJsonCanvas, fromJsonCanvas, parseImport, rehydrate, reconcile, excalidrawFile, frameId, FRAMES } from "../src/canvasfmt.js";

const board = { refs: [{ id: "a", title: "Alpha", url: "https://dribbble.com/shots/1", image: "https://cdn/x.png", source: "dribbble" }, { id: "b", title: "Beta", url: "https://x.com/u/status/2" }, { id: "v", title: "Variant", source: "variant" }], notes: [{ who: "owner", text: "warmer", t: 1 }], palette: ["#ff0000"] };
const els = (o) => o.filter((e) => !e.isDeleted);
const byId = (xs) => new Map(xs.map((e) => [e.id, e]));

test("plan lays out frames, refs by verdict, notes and swatches", () => {
  const s = plan(board, new Map([["b", "like"]])), m = byId(s);
  assert.equal(s.filter((e) => e.type === "frame").length, FRAMES.length);
  assert.equal(m.get("ref-a").type, "image"); assert.equal(m.get("ref-a").frameId, frameId("inspo"));
  assert.equal(m.get("ref-b").frameId, frameId("kept"));
  assert.equal(m.get("ref-v").frameId, frameId("directions"));
  assert.ok(s.some((e) => e.customData?.note === 0)); assert.ok(s.some((e) => e.customData?.swatch === "#ff0000"));
  assert.equal(new Set(s.map((e) => e.id)).size, s.length, "ids unique");
});
test("frames grow to hold every ref, so none is clipped", () => {
  const many = { ...board, refs: Array.from({ length: 41 }, (_, i) => ({ id: `r${i}`, title: `R${i}` })) };
  const s = fit(plan(many)), m = byId(s), inspo = m.get(frameId("inspo"));
  for (const e of s.filter((e) => e.frameId === inspo.id)) assert.ok(e.y + e.height <= inspo.y + inspo.height, `${e.id} inside Inspo`);
  assert.ok(inspo.height > 1400 && inspo.version > 1, "grew and bumped its version");
  assert.equal(fit(s), s, "a scene that fits is returned as is");
});
test("plan is incremental: nothing new for a full scene, new refs avoid owner-placed shapes", () => {
  const s = plan(board);
  assert.deepEqual(plan(board, new Map(), s), []);
  const moved = s.map((e) => (e.id === "ref-a" ? { ...e, x: 5000 } : e));
  const more = { ...board, refs: [...board.refs, { id: "c", title: "Gamma" }] }, add = plan(more, new Map(), moved);
  const c = add.find((e) => e.id === "ref-c"), b = byId(s).get("ref-b");
  assert.ok(c && add.every((e) => !e.id.startsWith("frame-")));
  assert.ok(!(c.x === b.x && c.y === b.y), "does not stack on an existing ref");
});
test("moving a ref between frames yields picks; staying put does not", () => {
  const s = plan(board), kept = byId(s).get(frameId("kept")), noped = byId(s).get(frameId("noped"));
  const moveTo = (xs, id, f) => xs.map((e) => (e.id === id ? { ...e, frameId: f.id, x: f.x + 30, y: f.y + 80 } : e));
  assert.deepEqual(picksFromScene(s, new Map(), s), []);
  assert.deepEqual(picksFromScene(moveTo(s, "ref-a", kept), new Map(), s), [{ ref: "a", verdict: "like" }]);
  const after = moveTo(s, "ref-a", noped), noFrame = after.map((e) => (e.id === "ref-a" ? { ...e, frameId: null } : e));
  assert.deepEqual(picksFromScene(noFrame, new Map(), s), [{ ref: "a", verdict: "nope" }], "falls back to geometry when frameId is lost");
  const back = moveTo(moveTo(s, "ref-b", kept), "ref-b", byId(s).get(frameId("inspo")));
  assert.deepEqual(picksFromScene(back, new Map([["b", "like"]]), moveTo(s, "ref-b", kept)), [{ ref: "b", verdict: "clear" }]);
});
test("JSON Canvas export follows spec 1.0 and round-trips", () => {
  const s = plan(board), jc = toJsonCanvas(s);
  const TYPES = new Set(["text", "file", "link", "group"]);
  for (const n of jc.nodes) {
    assert.ok(TYPES.has(n.type), n.type); assert.equal(typeof n.id, "string");
    for (const k of ["x", "y", "width", "height"]) assert.ok(Number.isInteger(n[k]), `${n.id}.${k}`);
    if (n.type === "text") assert.equal(typeof n.text, "string");
    if (n.type === "link") assert.match(n.url, /^https?:/);
    if (n.type === "group") assert.equal(typeof n.label, "string");
  }
  assert.equal(jc.nodes.filter((n) => n.type === "group").length, FRAMES.length);
  assert.ok(jc.nodes.some((n) => n.id === "ref-a" && n.type === "link"));
  assert.ok(!jc.nodes.some((n) => n.id.endsWith("-label")), "bound labels fold into their box");
  const back = fromJsonCanvas(jc), m = byId(back);
  assert.equal(m.get("ref-a").customData.ref, "a");
  assert.equal(m.get("ref-a").frameId, "frame-inspo", "frame recovered from geometry");
  assert.deepEqual(picksFromScene(back, new Map(), s), []);
});
test("JSON Canvas edges become bound arrows and come back as edges", () => {
  const jc = { nodes: [{ id: "n1", type: "text", text: "hi", x: 0, y: 0, width: 100, height: 50 }, { id: "n2", type: "file", file: "a.png", x: 300, y: 0, width: 100, height: 50 }], edges: [{ id: "e1", fromNode: "n1", toNode: "n2" }] };
  const s = fromJsonCanvas(jc), arrow = s.find((e) => e.type === "arrow");
  assert.equal(arrow.startBinding.elementId, "n1"); assert.equal(arrow.endBinding.elementId, "n2");
  assert.deepEqual(toJsonCanvas(s).edges, [{ id: "e1", fromNode: "n1", toNode: "n2", toEnd: "arrow" }]);
});
test("parseImport takes .excalidraw and .canvas, rejects junk", () => {
  const s = plan(board), x = excalidrawFile(s, { f: { id: "f" } });
  assert.equal(x.type, "excalidraw"); assert.equal(x.version, 2);
  assert.equal(parseImport(JSON.stringify(x)).elements.length, s.length);
  assert.ok(parseImport(toJsonCanvas(s)).elements.length > 0);
  assert.throws(() => parseImport({ hello: 1 }), /JSON Canvas/);
  assert.equal(els(s).length, s.length);
});
test("rehydrate restores ref pictures and titles after a JSON Canvas round trip, at the file's position", () => {
  const s = plan(board), jc = toJsonCanvas(s), n = jc.nodes.find((x) => x.id === "ref-a"); n.x += 500; n.y += 40;
  const back = rehydrate(fromJsonCanvas(jc), board), m = byId(back);
  assert.equal(m.get("ref-a").type, "image"); assert.equal(m.get("ref-a").x, n.x); assert.equal(m.get("ref-a").y, n.y);
  assert.ok(!m.has("ref-a-label"), "the URL label of the link node is gone");
  assert.equal(m.get("ref-b-label").text, "Beta", "text refs show their title, not the URL");
  assert.equal(m.get("cap-a").type, "text", "captions stay plain text");
  assert.equal(new Set(back.map((e) => e.id)).size, back.length, "ids unique");
});

// What Inkboard (VictorLetirand/inkboard, `ink convert`) writes back, checked against its real output: fresh ids,
// no customData or links, and each frame as an empty body card plus a small title card above it.
const inkboardCanvas = (s) => {
  let k = 0; const nodes = [];
  for (const n of toJsonCanvas(s).nodes) {
    if (n.type === "group") { nodes.push({ id: `i${k++}`, type: "text", text: "", x: n.x, y: n.y, width: n.width, height: n.height }, { id: `i${k++}`, type: "text", text: n.label, x: n.x, y: n.y - 26, width: 60, height: 40 }); continue; }
    if (n.type === "link" && n.id.startsWith("ref-") && s.find((e) => e.id === n.id).type === "image") continue;  // pictures are skipped
    const text = n.type === "link" ? board.refs.find((r) => `ref-${r.id}` === n.id).title : n.text;
    nodes.push({ id: `i${k++}`, type: "text", text, x: n.x, y: n.y, width: n.id.startsWith("cap-") ? 60 : n.width, height: n.id.startsWith("cap-") ? 40 : n.height });
  }
  return { nodes, edges: [] };
};
test("reconcile maps an Inkboard-edited file back onto board ids, so a moved card is a pick", () => {
  const s = plan(board), noped = byId(s).get(frameId("noped")), jc = inkboardCanvas(s);
  const beta = jc.nodes.find((n) => n.text === "Beta" && n.width === 240); beta.x = noped.x + 20; beta.y = noped.y + 60;
  const p = parseImport(jc), back = rehydrate(reconcile(p.elements, s, { format: p.format }), board), m = byId(els(back));
  for (const f of FRAMES) assert.equal(m.get(frameId(f.key))?.type, "frame", `frame ${f.key} restored`);
  assert.ok(!els(back).some((e) => /^i\d/.test(e.id) && !e.containerId), "no stray title or body cards");
  assert.equal(m.get("ref-b").frameId, frameId("noped")); assert.equal(m.get("ref-b").link, board.refs[1].url, "link restored");
  assert.equal(m.get("cap-b").type, "text"); assert.equal(m.get("cap-b").frameId, frameId("inspo"), "the same-text caption stays");
  assert.equal(m.get("ref-a").type, "image", "a picture JSON Canvas dropped is kept");
  assert.deepEqual(picksFromScene(back, new Map(), s), [{ ref: "b", verdict: "nope" }]);
});
test("reconcile keeps own-id files as they are and tombstones board shapes the owner deleted", () => {
  const s = plan(board), x = excalidrawFile(s.filter((e) => e.id !== "note-0" && e.id !== "note-0-label" && !e.id.startsWith("note-")), {});
  const back = reconcile(parseImport(x).elements, s);
  assert.deepEqual(els(back).map((e) => e.id).sort(), s.filter((e) => !e.id.startsWith("note-")).map((e) => e.id).sort());
  assert.ok(back.some((e) => e.id.startsWith("note-") && e.isDeleted), "deleted note stays as a tombstone");
  assert.deepEqual(plan(board, new Map(), back).filter((e) => e.id.startsWith("note-")), [], "the agent does not re-add it");
});
