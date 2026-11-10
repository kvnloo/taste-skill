// node --test scripts/work.test.mjs — the Work importer on a real throwaway git repo, a stubbed gh and a stub board seed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildWork, matcher, parseLog, checks, liveStatus, attachAsks, ghCache } from "./work.mjs";
import { weightAt, packCircles, fitInCircle } from "../src/pack.js";

const NOW = 1_794_000_000, H = 3600, D = 86400;
const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "work-")), repo = join(dir, "app");
mkdirSync(join(repo, "ui"), { recursive: true }); mkdirSync(join(repo, "core"));
const git = (args, t) => execFileSync("git", ["-C", repo, ...args], { env: { ...process.env, GIT_AUTHOR_DATE: `@${t} +0000`, GIT_COMMITTER_DATE: `@${t} +0000`, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }, encoding: "utf8" });
git(["init", "-q"], NOW);
const commit = (files, t) => { for (const f of files) writeFileSync(join(repo, f), String(Math.random())); git(["add", "-A"], t); git(["commit", "-qm", "c"], t); };
commit(["core/x.py", "README.md"], NOW - 40 * D);           // outside the 21-day window (git log --since stops here)
commit(["ui/a.ts", "ui/b.ts", "core/x.py"], NOW - 3 * D); // old: ui 2, core 1
commit(["ui/a.ts"], NOW - 2 * H);                           // fresh: ui 1

const cfg = (extra = {}) => ({
  windowDays: 21, halfLifeHours: 48,
  sources: { seed: { file: join(dir, "seed.json"), label: "board 11-10", windowHours: 24 }, asks: join(dir, "asks.json") },
  repos: { app: { path: repo, gh: "me/app" }, gone: { path: join(dir, "nope"), gh: "me/gone" } },
  products: [
    { id: "alpha", name: "Alpha", seed: "a", deadline: new Date((NOW + 20 * H) * 1000).toISOString(), keywords: ["alpha"],
      components: [{ id: "ui", name: "UI", also: ["beta"], keywords: ["buttons?"], paths: { app: ["ui/**"] }, pages: [{ name: "Home", url: "http://x/" }] },
        { id: "core", name: "Core", paths: { app: ["core/**"] } }] },
    { id: "beta", name: "Beta", keywords: ["beta"], components: [{ id: "svc", name: "Service", paths: { gone: ["**"] } }] },
  ], ...extra });
writeFileSync(join(dir, "seed.json"), JSON.stringify({ as_of: new Date((NOW - 2 * H) * 1000).toISOString(), panes: [{ id: "a", status: "blocked", verdict: "Waiting on review.", metrics: [["PRs", "3"]] }] }));
writeFileSync(join(dir, "asks.json"), JSON.stringify([{ ts: NOW - 100, text: "make the alpha buttons bigger" }, { ts: NOW - 50, text: "how is alpha doing?" }, { ts: NOW, text: "unrelated" }, { ts: NOW, text: "beta buttons" }]));
const prs = [
  { number: 7, title: "ui: fix", state: "OPEN", isDraft: true, updatedAt: new Date((NOW - H) * 1000).toISOString(), url: "u7", statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }, { status: "COMPLETED", conclusion: "SUCCESS" }], files: [{ path: "ui/a.ts" }] },
  { number: 6, title: "core", state: "MERGED", isDraft: false, updatedAt: new Date((NOW - D) * 1000).toISOString(), url: "u6", statusCheckRollup: [{ state: "SUCCESS" }], files: [{ path: "core/x.py" }] },
];
const ghStub = async (args) => (args[0] === "pr" && args.includes("me/app") ? { data: prs, checked: NOW } : args[0] === "run" && args.includes("me/app") ? { data: [{ status: "completed", conclusion: "success", createdAt: new Date(NOW * 1000).toISOString(), url: "r" }], checked: NOW } : { error: "HTTP 404" });
const shoot = async (pages) => pages.map((p) => ({ name: p.name, url: p.url, shot: null, state: "down", code: "refused", checked: NOW }));
const gitIo = async (cwd, args) => { try { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }); } catch { return null; } };
const build = (c = cfg(), io = {}) => buildWork(c, { now: NOW, git: gitIo, gh: ghStub, shoot, ...io });

test("touches: git log per component inside the window, decayed by the half-life, raw timestamps kept", async () => {
  const w = await build(), ui = w.components.find((c) => c.id === "alpha/ui"), core = w.components.find((c) => c.id === "alpha/core");
  assert.deepEqual(ui.touches, [[NOW - 3 * D, 2], [NOW - 2 * H, 1]]);
  assert.deepEqual(core.touches, [[NOW - 3 * D, 1]], "the 40-day-old commit is outside the window");
  assert.ok(Math.abs(ui.weight - (2 * 0.5 ** 1.5 + 0.5 ** (2 / 48))) < 1e-3);
  assert.equal(weightAt(ui.touches, NOW - 4 * D, 48), 0, "as of before the first touch, nothing exists yet");
  assert.equal(w.unmapped.app, undefined, "README.md is outside the window, so nothing unmapped");
});

test("a shared component is drawn once: canonical in its product, a portal in the other", async () => {
  const w = await build(), beta = w.products.find((p) => p.id === "beta");
  assert.equal(w.components.filter((c) => c.name === "UI").length, 1);
  assert.deepEqual(beta.portals, ["alpha/ui"]); assert.deepEqual(w.components.find((c) => c.id === "alpha/ui").also, ["beta"]);
  assert.ok(beta.weight > 0, "the portal's weight counts toward the product it also belongs to");
});

test("status: fresh board seed is labelled; failing PR checks near a deadline put a component at risk", async () => {
  const w = await build(), alpha = w.products.find((p) => p.id === "alpha"), ui = w.components.find((c) => c.id === "alpha/ui");
  assert.deepEqual([alpha.status.value, alpha.status.source], ["blocked", "board 11-10"]);
  assert.deepEqual(alpha.metrics[0], ["PRs", "3", "board 11-10"]);
  assert.equal(ui.status.value, "at-risk"); assert.match(ui.status.why, /#7 checks failing/);
  assert.deepEqual(ui.prs.map((p) => p.number), [7]); assert.deepEqual(ui.prs[0].checks, { pass: 1, fail: 1, pending: 0 });
  assert.equal(w.components.find((c) => c.id === "alpha/core").status.value, "on-track");
});

test("a stale seed is replaced by live status", async () => {
  writeFileSync(join(dir, "seed-old.json"), JSON.stringify({ as_of: new Date((NOW - 30 * H) * 1000).toISOString(), panes: [{ id: "a", status: "blocked", verdict: "old" }] }));
  const c = cfg(); c.sources.seed.file = join(dir, "seed-old.json");
  const alpha = (await build(c)).products.find((p) => p.id === "alpha");
  assert.deepEqual([alpha.status.value, alpha.status.source], ["at-risk", "live"]);
});

test("offline-tolerant: a missing repo and failing gh make that product unknown, not a crash", async () => {
  const w = await build(), beta = w.components.find((c) => c.id === "beta/svc");
  assert.equal(beta.status.value, "unknown"); assert.equal(w.repos.gone.ok, false);
  assert.ok(w.errors.some((e) => /gone/.test(e)));
  const noGh = await build(cfg(), { gh: null });
  assert.equal(noGh.components.find((c) => c.id === "alpha/ui").status.value, "on-track", "git alone still says it moved");
});

test("pages that do not answer are listed down; asks attach to the most specific node", async () => {
  const w = await build(), ui = w.components.find((c) => c.id === "alpha/ui"), alpha = w.products.find((p) => p.id === "alpha");
  assert.deepEqual(ui.pages.map((p) => [p.name, p.state, p.shot]), [["Home", "down", null]]);
  assert.deepEqual(ui.asks.map((a) => a.text), ["beta buttons", "make the alpha buttons bigger"], "via its portal in beta too");
  assert.deepEqual(alpha.asks.map((a) => a.text), ["how is alpha doing?"]);
});

test("gh cache: fresh answers without a call; a 403 backs off and later calls never hit gh", async () => {
  let calls = 0, t = NOW; const cache = join(dir, "cache");
  const exec = async () => { calls++; return calls === 1 ? { stdout: "[1]" } : { err: new Error("x"), stderr: "HTTP 403: API rate limit exceeded" }; };
  const gh = ghCache({ dir: cache, ttl: 60, now: () => t, exec });
  assert.deepEqual((await gh(["a"])).data, [1]); assert.deepEqual((await gh(["a"])).data, [1]); assert.equal(calls, 1);
  t += 120; const r = await gh(["a"]); assert.equal(calls, 2); assert.deepEqual(r.data, [1], "stale cache on failure"); assert.ok(r.error);
  assert.ok(existsSync(join(cache, "backoff.json")));
  await gh(["b"]); await gh(["a"]); assert.equal(calls, 2, "backed off: no more calls");
});

test("small parts: log parser, glob matcher (first match wins), checks, asks, packing", () => {
  assert.deepEqual(parseLog("\x01100\n\na.ts\nb.ts\n\x01090\n\nc.ts\n"), [{ t: 100, files: ["a.ts", "b.ts"] }, { t: 90, files: ["c.ts"] }]);
  const m = matcher({ products: [{ id: "p", components: [{ id: "t", paths: { r: ["**/__tests__/**"] } }, { id: "f", paths: { r: ["src/**"] } }] }] });
  assert.equal(m("r", "src/__tests__/a.ts"), "p/t"); assert.equal(m("r", "src/a.ts"), "p/f"); assert.equal(m("r", "x.md"), null); assert.equal(m("other", "src/a.ts"), null);
  assert.deepEqual(checks([{ status: "IN_PROGRESS" }, { state: "ERROR" }]), { pass: 0, fail: 1, pending: 1 });
  assert.equal(liveStatus({ prs: [], ci: { conclusion: "failure", t: NOW - D }, last: NOW, now: NOW }).value, "watch");
  assert.equal(attachAsks([{ ts: 1, text: "galpha" }], [{ id: "a", keywords: ["alpha"], nodes: [] }]).size, 0, "keywords match whole words");
  const packed = fitInCircle(packCircles([{ id: "a", r: 30 }, { id: "b", r: 20 }, { id: "c", r: 10 }, { id: "d", r: 10 }]), 0, 0, 100);
  for (const [i, p] of packed.entries()) {
    assert.ok(Math.hypot(p.x, p.y) + p.r <= 100 + 1e-6, `${p.id} inside`);
    for (const q of packed.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r - 1e-6, `${p.id}/${q.id} overlap`);
  }
});

test("never writes a file into the repo it reads", async () => {
  const before = execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" });
  await build(); assert.equal(execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" }), before);
  assert.ok(!readFileSync(join(repo, ".git/HEAD"), "utf8").includes("work"));
});
