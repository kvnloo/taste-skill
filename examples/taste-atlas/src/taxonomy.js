// Taste Atlas taxonomy: why an image works, in four levels.
//   01 OPERATION  what the designer wants the viewer to do
//   02 DOMAIN     which property of the image carries it
//   03 TECHNIQUE  the named mechanism
//   04 EXECUTION  a concrete specimen of that mechanism
// Original structure built on public design theory (Gestalt grouping, visual rhetoric, motion
// principles). Specimens are procedural (src/specimens.js); no third-party images are bundled.
// Inspired by the idea in Jason Murray's Iris (Modern Art Direction); not a port of its data.

// Alternative atlases: ?atlas=<kind> swaps this whole taxonomy for ./data/<kind>.taxonomy.json (scripts/skills.mjs
// writes the skills one). Same four levels and shapes, so every view, layer and lens works unchanged.
export const MODE = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("atlas");
const ALT = MODE ? await fetch(`./data/${MODE}.taxonomy.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
export const LEVELS = ALT?.levels ?? ["OPERATION", "DOMAIN", "TECHNIQUE", "EXECUTION"];
export const NOUN = { operation: LEVELS[0].toLowerCase() + "s", technique: "techniques", execution: "specimens", ...ALT?.noun };
export const INTRO = ALT?.intro ?? { eyebrow: "A TAXONOMY OF TASTE", h1: "Why an image <em>works.</em>", p: "Every specimen is filed by what it asks the viewer to do, the property that carries it, and the named technique." };

const OPERATIONS0 = [
  { id: "differentiate", name: "Differentiate", color: "#d6453d", night: "#ff6b5f", ask: "make one thing stand out" },
  { id: "infer", name: "Infer", color: "#7b3fa0", night: "#c38bff", ask: "let the viewer complete the meaning" },
  { id: "group", name: "Group", color: "#2f6fd6", night: "#6ea8ff", ask: "make things read as one" },
  { id: "direct", name: "Direct", color: "#c27c0e", night: "#ffbf4d", ask: "lead the eye in an order" },
  { id: "animate", name: "Animate", color: "#1f8a5b", night: "#4fd69a", ask: "give the surface time" },
  { id: "evoke", name: "Evoke", color: "#c2457a", night: "#ff86b8", ask: "set a mood the viewer can feel" },
];

export const OPERATIONS = ALT?.operations ?? OPERATIONS0;

const DOMAINS0 = {
  feature: { name: "Feature", icon: "feature" },
  semantic: { name: "Semantic", icon: "semantic" },
  space: { name: "Space", icon: "space" },
  grouping: { name: "Grouping", icon: "grouping" },
  cultural: { name: "Cultural", icon: "cultural" },
  time: { name: "Time", icon: "time" },
  material: { name: "Material", icon: "material" },
};

export const DOMAINS = ALT?.domains ?? DOMAINS0;

// [operation, domain, technique id, name, specimen family, one-line mechanism, executions[]]
// Each execution: [title, seed]. Seeds vary palette and composition inside the family.
const T = [
  ["differentiate", "feature", "color-isolation", "Color isolation", "isolate", "One hue in a field of neutrals wins the eye.", [["Signal in grey", 1], ["Last lamp on", 2], ["Red ticket", 3], ["One awake", 4]]],
  ["differentiate", "feature", "scale-jump", "Scale jump", "scale", "A sudden change of size sets the hierarchy.", [["Giant numeral", 1], ["Small caption, huge date", 2], ["04", 3], ["Price as headline", 4]]],
  ["differentiate", "feature", "texture-break", "Texture break", "texture", "One surface refuses the pattern around it.", [["Rough tile", 1], ["Hatched outlier", 2], ["Grain in the grid", 3]]],
  ["differentiate", "semantic", "semantic-contrast", "Semantic contrast", "juxta", "Opposed meanings side by side sharpen both.", [["Soft / Hard", 1], ["Before / After", 2], ["Yes / No", 3], ["Day / Night", 4]]],
  ["differentiate", "space", "isolation", "Isolation by space", "whitespace", "Emptiness around a mark makes it precious.", [["Lone mark", 1], ["Quiet room", 2], ["Corner note", 3]]],
  ["differentiate", "feature", "complementary-pairing", "Complementary pairing", "complement", "Opposite hues vibrate at their border.", [["Orange on blue", 1], ["Green on red", 2], ["Violet on yellow", 3]]],

  ["infer", "semantic", "visual-metaphor", "Visual metaphor", "metaphor", "One thing drawn as another carries its meaning across.", [["Clock as orbit", 1], ["Growth rings", 2], ["Signal as tide", 3], ["Idea as bulb", 4]]],
  ["infer", "semantic", "form-substitution", "Form substitution", "substitute", "A familiar silhouette, filled with something else.", [["Bottle of stripes", 1], ["Leaf as chart", 2], ["Head of grid", 3]]],
  ["infer", "semantic", "synecdoche", "Part for whole", "crop", "Show the edge and the mind supplies the object.", [["Corner of a dial", 1], ["Half a letter", 2], ["Arc of a planet", 3]]],
  ["infer", "grouping", "closure", "Closure", "closure", "Gaps the eye closes into a shape that isn't drawn.", [["Missing triangle", 1], ["Broken ring", 2], ["Dotted square", 3]]],
  ["infer", "cultural", "genre-quotation", "Genre quotation", "quote", "Borrow a movement's grammar to borrow its voice.", [["Swiss poster", 1], ["Bauhaus primer", 2], ["Constructivist slant", 3], ["Risograph zine", 4]]],
  ["infer", "cultural", "instrument-language", "Instrument language", "hud", "Brackets, ticks and mono labels say: this is precise.", [["Corner brackets", 1], ["Telemetry strip", 2], ["Scope reticle", 3], ["Status ledger", 4]]],

  ["group", "grouping", "proximity", "Proximity", "proximity", "Near things read as one group.", [["Three clusters", 1], ["Pairs", 2], ["Island and coast", 3]]],
  ["group", "grouping", "similarity", "Similarity", "similarity", "Shared color or shape forms a set across distance.", [["Hue teams", 1], ["Shape families", 2], ["Filled vs open", 3]]],
  ["group", "grouping", "common-region", "Common region", "region", "A shared boundary binds whatever is inside it.", [["Card wells", 1], ["Tinted lanes", 2], ["Framed pair", 3]]],
  ["group", "grouping", "continuity", "Continuity", "continuity", "Elements on one path read as one line.", [["Dotted river", 1], ["Spiral run", 2], ["Wave of bars", 3]]],
  ["group", "space", "shared-grid", "Shared grid", "grid", "Common edges make unrelated blocks a system.", [["Twelve columns", 1], ["Baseline rhythm", 2], ["Index cards", 3]]],

  ["direct", "space", "leading-lines", "Leading lines", "leading", "Converging lines deliver the eye to a point.", [["Vanishing road", 1], ["Rays to a dot", 2], ["Stair rail", 3]]],
  ["direct", "space", "reading-path", "Reading path", "zpath", "Placement follows the Z the eye already scans.", [["Z sweep", 1], ["F column", 2], ["Diagonal cascade", 3]]],
  ["direct", "grouping", "figure-ground", "Figure-ground", "figure", "Which shape is object and which is hole decides focus.", [["Two faces", 1], ["Cut-out arch", 2], ["Negative arrow", 3]]],
  ["direct", "feature", "value-hierarchy", "Value hierarchy", "hierarchy", "Darkest and largest first, then down the scale.", [["Headline stack", 1], ["Three weights", 2], ["Tone ladder", 3]]],

  ["animate", "time", "ease-settle", "Ease-out settle", "ease", "Fast start, soft landing: the object has weight.", [["Card lands", 1], ["Drawer stops", 2], ["Dot slows", 3]]],
  ["animate", "time", "stagger", "Stagger", "stagger", "Small delays turn a list into a wave.", [["Bars cascade", 1], ["Grid ripple", 2], ["Words arrive", 3]]],
  ["animate", "time", "morph", "Morph", "morph", "One shape becomes the next, so state reads as continuity.", [["Circle to square", 1], ["Pill expands", 2], ["Play to pause", 3]]],
  ["animate", "space", "parallax-depth", "Parallax depth", "parallax", "Layers moving at different speeds build space.", [["Ridge layers", 1], ["Card stack", 2], ["Fog planes", 3]]],
  ["animate", "time", "ticker", "Number ticker", "ticker", "Digits roll so change is felt, not read.", [["Counter roll", 1], ["Odometer", 2], ["Split flap", 3]]],

  ["evoke", "material", "tactile-surface", "Tactile surface", "material", "A surface you can almost touch: stone, chrome, jelly, paper.", [["Stone", 1], ["Chrome", 2], ["Jelly", 3], ["Paper", 4]]],
  ["evoke", "feature", "warm-neutrals", "Warm neutrals", "tone", "Bone, clay and sage: calm without going cold.", [["Bone and clay", 1], ["Sage room", 2], ["Night ink", 3]]],
  ["evoke", "cultural", "editorial-serif", "Editorial serif", "serif", "A large italic serif slows the reader down.", [["Quiet things", 1], ["Slow light", 2], ["Field notes", 3]]],
  ["evoke", "time", "alive-canvas", "Alive canvas", "alive", "Calm chrome around something that moves on its own.", [["Orb breath", 1], ["Particle drift", 2], ["Growth sim", 3]]],
];

// How each technique lands on a web page or UI component: the recipe an agent builds from.
export const UI = {
  "color-isolation": "Neutral palette (2-3 greys) plus one saturated accent used only on the primary action or key number.",
  "scale-jump": "One element 4-8x the body size (hero numeral, price, date) beside small captions; skip the middle sizes.",
  "texture-break": "Flat surfaces everywhere except one card with grain, noise or a pattern fill that marks it special.",
  "semantic-contrast": "Two panels side by side with opposed states (before/after, free/pro, day/night) and a shared axis.",
  "isolation": "One element alone in generous whitespace (>= 40% of the viewport) with nothing competing.",
  "complementary-pairing": "Two complementary hues meet at a hard edge (button on panel, badge on banner); keep both saturated.",
  "visual-metaphor": "Represent the abstract metric as a familiar object (progress as a filling glass, uptime as a pulse).",
  "form-substitution": "A known silhouette (logo, device, letter) used as a mask, filled with photos, data or a pattern.",
  "synecdoche": "Crop the product so only a recognisable part shows (a corner of the UI, one key, a hand) and let the edge bleed off.",
  "closure": "Imply shapes with gaps: dashed outlines, partial rings, icons drawn from a few strokes.",
  "genre-quotation": "Borrow one movement's grammar wholesale (Swiss grid, Bauhaus primaries, Y2K chrome, terminal green).",
  "instrument-language": "Mono labels, tick marks, corner brackets, coordinates and units: the UI reads as a precise instrument.",
  "proximity": "Group by spacing alone: tight gaps inside a group, at least 2x that gap between groups, no borders needed.",
  "similarity": "Same colour or shape marks the same kind of thing across the page (all live items green, all links one style).",
  "common-region": "Cards, tinted panels or outlined boxes bind related controls; one region per idea.",
  "continuity": "Align steps on one line or curve (timeline, stepper, connector line) so the eye travels through them.",
  "shared-grid": "Every block snaps to one 12-column grid with shared edges and a fixed gutter; unrelated content reads as a system.",
  "leading-lines": "Diagonals, arrows or converging gradients that point at the call to action.",
  "reading-path": "Lay out on the Z (logo, nav, headline, CTA) or F for text-heavy pages; put the action at the path's end.",
  "figure-ground": "Strong contrast between subject and field; reverse it once (light card on dark section) to mark focus.",
  "value-hierarchy": "Darkest and largest first: headline at full ink, body at 70%, meta at 45%; one level per job.",
  "ease-settle": "Enter with a fast-out, slow-in curve (cubic-bezier(.2,.8,.2,1), 300-500ms) and a tiny overshoot or settle.",
  "stagger": "Reveal list items with 30-60ms delays between them so the list arrives as a wave.",
  "morph": "Animate shared elements between states (FLIP or View Transitions) instead of cutting.",
  "parallax-depth": "Two to four layers scroll at different rates (0.2x to 1x); keep it subtle and respect reduced motion.",
  "ticker": "Numbers roll digit by digit (odometer) when values change; tabular numerals so width holds.",
  "tactile-surface": "Material you can almost touch: soft shadows plus inner highlight, glass blur, chrome gradients, paper grain.",
  "warm-neutrals": "Bone, clay, sage and ink palette (#f4f2ed, #c9b8a3, #9aa58c, #1b1a17) with low-contrast borders.",
  "editorial-serif": "A large italic display serif for headlines over a quiet sans body; generous leading and line length ~60ch.",
  "alive-canvas": "Quiet chrome around one live element (shader, generative canvas, looping video) that moves by itself.",
};

export const TECHNIQUES = ALT?.techniques ?? T.map(([op, domain, id, name, family, mech, ex]) => ({
  id, op, domain, name, family, mech, ui: UI[id],
  executions: ex.map(([title, seed], i) => ({ id: `${id}--${i + 1}`, title, seed, family })),
}));

// Tree used by layout and search. Domains are scoped to their operation ("differentiate/feature").
export function buildTree() {
  const root = { id: "root", level: 0, name: ALT ? "Skills Atlas" : "Taste Atlas", children: [] };
  const byId = new Map([["root", root]]);
  for (const o of OPERATIONS) {
    const on = { id: o.id, level: 1, kind: "operation", name: o.name, op: o.id, parent: root, children: [] };
    root.children.push(on); byId.set(on.id, on);
  }
  for (const t of TECHNIQUES) {
    const opNode = byId.get(t.op);
    const did = `${t.op}/${t.domain}`;
    let dn = byId.get(did);
    if (!dn) {
      dn = { id: did, level: 2, kind: "domain", name: DOMAINS[t.domain].name, domain: t.domain, op: t.op, parent: opNode, children: [] };
      opNode.children.push(dn); byId.set(did, dn);
    }
    const tn = { id: t.id, level: 3, kind: "technique", name: t.name, op: t.op, domain: t.domain, mech: t.mech, parent: dn, children: [] };
    dn.children.push(tn); byId.set(tn.id, tn);
    for (const e of t.executions) {
      const en = { id: e.id, level: 4, kind: "execution", name: e.title, op: t.op, family: e.family, seed: e.seed, status: e.status, parent: tn, children: [] };
      tn.children.push(en); byId.set(en.id, en);
    }
  }
  return { root, byId };
}

export const opById = Object.fromEntries(OPERATIONS.map((o) => [o.id, o]));

// Path from the root to a node, root excluded: [operation, domain, technique, execution].
export function lineage(node) {
  const out = [];
  for (let n = node; n && n.level > 0; n = n.parent) out.unshift(n);
  return out;
}
