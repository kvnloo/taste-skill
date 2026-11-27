// node --test scripts/entities.test.mjs — entity graph → Work layer, on a tiny synthetic graph (no real data).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { entitiesToWork, mergeWork, repoOf, short } from "./entities.mjs";
import { neighbours } from "../src/project.js";

// One app repo "shopfront" with two clients; client A has a site, a page and a film; client B's film was copied from
// A's; a demo page is shared by two clients that have nothing else; one prospect has nothing. Lineage leaves the repo
// to a plugin repo ("voicekit"), a film repo ("reels") and on from the film repo to the plugin.
const G = {
  meta: { generated: "2026-01-02", repo: "acme/shopfront" },
  nodes: [
    { id: "repo:shopfront", type: "repo", label: "shopfront", url: "https://github.com/acme/shopfront" },
    { id: "repo:voicekit", type: "repo", label: "voicekit", url: "https://github.com/acme/voicekit" },
    { id: "business:a", type: "business", label: "Alpha Bakery LLC (owner Ann) [CRM a]" },
    { id: "business:b", type: "business", label: "Beta Books" },
    { id: "business:c", type: "business", label: "Gamma Gym" },
    { id: "business:d", type: "business", label: "Delta Deli" },
    { id: "business:e", type: "business", label: "Echo Prospect" },
    { id: "site:a", type: "site", label: "Alpha preview site", repo: "acme/shopfront", path: "demos/a/site" },
    { id: "page:a-menu", type: "page", label: "Menu configurator", repo: "acme/shopfront" },
    { id: "video:a-film", type: "video", label: "a-film 'Fresh at six' 60 s (narrator X)", repo: "acme/shopfront", path: "demos/a/film.mp4", evidence: "demos/a/README.md:3" },
    { id: "video:b-film", type: "video", label: "b-film 'Shelf talk'", repo: "acme/shopfront" },
    { id: "site:demos", type: "site", label: "Shared demo tabs", repo: "acme/shopfront" },
    { id: "page:tab1", type: "page", label: "tab one", repo: "acme/shopfront" },
    { id: "plugin:voicekit", type: "plugin", label: "voicekit plugin 1.0", repo: "acme/voicekit@main" },
    { id: "video:reel", type: "video", label: "reels launch film", repo: "acme/reels@film/x" },
    { id: "tool:ffmpeg", type: "tool", label: "ffmpeg" },
  ],
  edges: [
    { from: "repo:shopfront", to: "site:a", type: "contains" },
    { from: "site:a", to: "business:a", type: "for_business" },
    { from: "site:a", to: "page:a-menu", type: "contains" },
    { from: "video:a-film", to: "business:a", type: "for_business" },
    { from: "video:b-film", to: "business:b", type: "for_business" },
    { from: "site:demos", to: "page:tab1", type: "contains" },
    { from: "page:tab1", to: "business:c", type: "for_business" },
    { from: "page:tab1", to: "business:d", type: "for_business" },
    { from: "site:a", to: "plugin:voicekit", type: "implements", evidence: "site/README.md:9" },
    { from: "video:a-film", to: "video:reel", type: "descends_from", evidence: "film/build.sh:2" },
    { from: "video:a-film", to: "tool:ffmpeg", type: "built_with" },
    { from: "video:b-film", to: "video:a-film", type: "descends_from", evidence: "copied from a" },
    { from: "video:reel", to: "plugin:voicekit", type: "renders" },
    { from: "video:a-film", to: "msg:404", type: "cites" },
  ],
};
const W = entitiesToWork(G);
const P = new Map(W.products.map((p) => [p.id, p])), C = new Map(W.components.map((c) => [c.id, c]));

test("helpers: repo names and short labels", () => {
  assert.equal(repoOf({ type: "repo", id: "repo:x", url: "https://github.com/o/My-Repo" }), "my-repo");
  assert.equal(repoOf({ type: "video", repo: "o/reels@film/x" }), "reels");
  assert.equal(repoOf({ type: "tool" }), null);
  assert.equal(short("Alpha Bakery LLC (owner Ann) [CRM a]"), "Alpha Bakery LLC");
});

test("the root repo is a product; groups with their own work are its components", () => {
  assert.equal(W.kind, "taste-atlas.work.v1");
  assert.equal(W.generatedAt, Date.parse("2026-01-02") / 1000);
  const root = P.get("shopfront");
  assert.ok(root && root.traced);
  assert.deepEqual(root.components, ["shopfront/a", "shopfront/b", "shopfront/demos"]);
  assert.match(root.notes.open[0], /Echo Prospect/); // nothing made yet
  const a = C.get("shopfront/a");
  assert.equal(a.name, "Alpha Bakery LLC");
  assert.deepEqual(a.pages.map((p) => [p.kind, p.name]), [["site", "Alpha preview site"], ["page", "Menu configurator"], ["film", "a-film 'Fresh at six' 60 s"]]);
  assert.ok(a.pages.every((p) => p.state === "listed" && p.shot === null), "trace pages are listed, never 'down'");
  assert.equal(a.pages[2].evidence, "demos/a/README.md:3");
});

test("shared items of groups with nothing of their own gather under their site", () => {
  const d = C.get("shopfront/demos");
  assert.deepEqual(d.pages.map((p) => p.name), ["Shared demo tabs", "tab one"]);
  assert.match(d.metrics[0][1], /Gamma Gym, Delta Deli/);
});

test("lineage out of the repo: upstream parts are shared into the root and the group lists their repos", () => {
  const a = C.get("shopfront/a");
  assert.deepEqual(a.also.sort(), ["reels", "voicekit"]);
  assert.ok(a.metrics.some(([k, v, src]) => k === "implements voicekit" && /voicekit plugin/.test(v) && src === "site/README.md:9"));
  assert.ok(!W.components.some((c) => c.id.startsWith("ffmpeg")), "tools without a repo are not lineage");
  const plugin = C.get("voicekit/voicekit"), reel = C.get("reels/reel");
  assert.ok(plugin.also.includes("shopfront") && reel.also.includes("shopfront"));
  assert.ok(reel.also.includes("voicekit"), "one hop further between outside repos (film renders plugin)");
  assert.deepEqual(reel.pages.map((p) => p.kind), ["film"]);
  assert.ok(P.get("shopfront").portals.includes("voicekit/voicekit"));
  assert.ok(P.get("voicekit").portals.includes("shopfront/a"), "the plugin's map shows who uses it");
  assert.deepEqual(P.get("voicekit").links, [["voicekit on GitHub", "https://github.com/acme/voicekit"]]);
});

test("lineage inside the repo: a group's film copied from another group's reads as 'built from', and inherits its upstream", () => {
  const b = C.get("shopfront/b");
  assert.ok(b.metrics.some(([k, v]) => k === "built from" && v === "Alpha Bakery LLC"));
  assert.match(b.status.why, /built from Alpha Bakery LLC/);
  assert.ok(b.also.includes("reels"), "b-film → a-film → reels");
});

test("project focus greys the 1–2 repos the product shares the most parts with", () => {
  assert.deepEqual(neighbours(W, "shopfront").map((n) => n.id).sort(), ["reels", "voicekit"]);
});

test("every component has the fields the Work layer reads", () => {
  for (const c of W.components) {
    for (const k of ["id", "product", "name", "also", "repos", "touches", "status", "prs", "pages", "metrics", "asks", "films"]) assert.ok(k in c, `${c.id} lacks ${k}`);
    assert.ok(P.has(c.product));
  }
  for (const p of W.products) for (const id of [...p.components, ...p.portals]) assert.ok(C.has(id), `${p.id} → ${id}`);
});

test("mergeWork replaces same ids and keeps the rest; the CLI writes data/work.atlas.json", () => {
  const base = { kind: "taste-atlas.work.v1", products: [{ id: "keep", components: [] }, { id: "shopfront", components: [] }], components: [{ id: "keep/x", product: "keep" }] };
  const m = mergeWork(base, W);
  assert.deepEqual(m.products.map((p) => p.id).slice(0, 2), ["keep", "shopfront"]);
  assert.equal(m.products.filter((p) => p.id === "shopfront").length, 1);
  assert.ok(m.components.some((c) => c.id === "keep/x"));
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "entities-")), f = join(dir, "g.json");
  writeFileSync(f, JSON.stringify(G));
  execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "entities.mjs"), f, "--out", dir], { encoding: "utf8" });
  const w = JSON.parse(readFileSync(join(dir, "work.atlas.json"), "utf8"));
  assert.deepEqual(w.products.map((p) => p.id), W.products.map((p) => p.id));
});
