// canvas-verify.mjs - Verify canvas functionality
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_HOME = join("/mnt/zer0models/worktrees/taste-board-canvas/tests/fixtures/canvas-test");
const BOARD_ID = "canvas-test-board";
const PORT = 8798;

function cleanup() {
  rmSync(FIXTURE_HOME, { recursive: true, force: true });
}

function setupBoard() {
  mkdirSync(FIXTURE_HOME, { recursive: true });
  const boardDir = join(FIXTURE_HOME, BOARD_ID);
  mkdirSync(boardDir, { recursive: true });
  writeFileSync(
    join(boardDir, "board.json"),
    JSON.stringify({
      kind: "taste-board.v1",
      id: BOARD_ID,
      title: "Canvas Test Board",
      goal: "Test canvas functionality",
      created: Date.now(),
      updated: Date.now(),
      notes: [
        { id: "note1", who: "agent", text: "Test note from agent", t: Date.now() - 1000 },
        { id: "note2", who: "owner", text: "Test note from owner", t: Date.now() - 500 },
      ],
      refs: [
        { id: "ref1", url: "https://example.com/ref1", title: "Reference 1", text: "First ref", image: "https://via.placeholder.com/300", source: "web", t: Date.now() - 2000 },
        { id: "ref2", url: "https://example.com/ref2", title: "Reference 2", text: "Second ref", image: "https://via.placeholder.com/300", source: "dribbble", t: Date.now() - 3000 },
      ],
      techniques: [],
      palette: [],
      type: [],
      preview: null,
    }, null, 1)
  );
}

function die(m) { process.stderr.write(`board: ${m}\n`); process.exit(2); }

function cli(...args) {
  const env = { ...process.env, TASTE_BOARD_HOME: FIXTURE_HOME, TASTE_BOARD_PORT: String(PORT) };
  const result = execFileSync(process.execPath, [join("/mnt/zer0models/worktrees/taste-board-canvas/examples/taste-atlas/scripts", "board.mjs"), ...args], {
    env,
    encoding: "utf8",
    timeout: 30000,
  });
  return JSON.parse(result.trim());
}

let serverProcess = null;

async function startServer() {
  const env = { ...process.env, TASTE_BOARD_HOME: FIXTURE_HOME, TASTE_BOARD_PORT: String(PORT) };
  serverProcess = spawn(process.execPath, [join("/mnt/zer0models/worktrees/taste-board-canvas/examples/taste-atlas/scripts", "board.mjs"), "serve"], {
    env,
    stdio: "ignore",
    detached: true,
  });
  serverProcess.unref();
}

async function waitForServer(retries = 40) {
  while (retries--) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/s/${BOARD_ID}/`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  die("Server did not start");
}

async function main() {
  try {
    cleanup();
    setupBoard();
    await startServer();
    await waitForServer();

    // Test 1: canvas command
    console.log("Test 1: canvas command...");
    const canvasResult = cli("canvas", BOARD_ID);
    assert.ok(canvasResult.ok, "canvas command ok");
    assert.ok(canvasResult.url.includes("/canvas"), "URL should contain /canvas");
    assert.equal(canvasResult.shapes.refs, 2, "Should have 2 refs");
    assert.equal(canvasResult.shapes.notes, 2, "Should have 2 notes");
    console.log("  PASS: canvas command works");

    // Test 2: export command
    console.log("Test 2: export command...");
    const exportResult = cli("export", BOARD_ID, "--format", "canvas");
    assert.equal(exportResult.an, "jsoncanvas.org/");
    assert.ok(Array.isArray(exportResult.shapes));
    assert.ok(exportResult.shapes.length >= 2, "Should have shapes from refs");
    const hasImage = exportResult.shapes.some(s => s.shapeType === "image");
    assert.ok(hasImage, "Should have image shape");
    console.log("  PASS: export command works");

    // Test 3: canvas POST persistence
    console.log("Test 3: canvas POST persistence...");
    const postResult = await fetch(`http://127.0.0.1:${PORT}/s/${BOARD_ID}/canvas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        refs: [{ id: "persist-ref", url: "https://example.com/persist", title: "Persisted Ref", text: "From canvas POST" }],
        notes: [],
      }),
    });
    const postJson = await postResult.json();
    assert.ok(postJson.ok, "Canvas POST should succeed");
    console.log("  PASS: canvas POST persistence works");

    // Verify persistence
    const board = await (await fetch(`http://127.0.0.1:${PORT}/s/${BOARD_ID}/board.json`)).json();
    assert.ok(board.refs.some(r => r.id === "persist-ref"), "Persisted ref should be in board");
    console.log("  PASS: canvas persistence verified");

    // Test 4: JSON Canvas round-trip
    console.log("Test 4: JSON Canvas round-trip...");
    // Export
    const exportRes = await fetch(`http://127.0.0.1:${PORT}/s/${BOARD_ID}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const canvas = await exportRes.json();

    // Import
    const importRes = await fetch(`http://127.0.0.1:${PORT}/s/${BOARD_ID}/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(canvas),
    });
    const importResult = await importRes.json();
    assert.ok(importResult.ok, "Import should succeed");
    assert.ok(importResult.refs >= 2, "Should have imported refs");
    console.log("  PASS: JSON Canvas round-trip works");

    console.log("\nAll tests PASSED!");
  } finally {
    if (serverProcess) {
      try { process.kill(-serverProcess.pid); } catch {}
    }
    cleanup();
  }
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });