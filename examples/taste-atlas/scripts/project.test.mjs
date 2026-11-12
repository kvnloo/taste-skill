// Asks shown on a screen must be Kevin's own words, cut to the passage about that screen.
import assert from "node:assert/strict";
import test from "node:test";
import { human, snippet, unwrap } from "./project.mjs";

test("steering messages are unwrapped to the user's text", () => {
  const s = "tool noise [OUT-OF-BAND USER MESSAGE — a direct message]\nmake lanes calmer\n[/OUT-OF-BAND USER MESSAGE]";
  assert.equal(unwrap(s).trim(), "make lanes calmer");
});

test("agent-written text is not counted as an ask", () => {
  for (const s of ["[HANDOFF] capsule", "<system>x</system>", "# Brief", "UI choice from picker: a", "FOO=bar run it", "ok"]) assert.equal(human(s), false, s);
  assert.equal(human("the orb should breathe when idle"), true);
});

test("snippet keeps the passage around the match", () => {
  const t = "a".repeat(400) + " the council view is too dense " + "b".repeat(400);
  const s = snippet(t, /council/i);
  assert.match(s, /council view is too dense/);
  assert.ok(s.startsWith("…") && s.endsWith("…") && s.length <= 342, s.length);
});
