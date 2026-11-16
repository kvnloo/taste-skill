// Slide order and swipe reading for the project deck (src/project.js stepId, src/deck.js swipe).
import assert from "node:assert/strict";
import test from "node:test";
import { stepId, deckBar } from "../src/project.js";
import { swipe } from "../src/deck.js";

const ids = ["a", "b", "c"];
test("Next from the journey opens slide 1; Prev from slide 1 returns to the journey", () => {
  assert.equal(stepId(ids, null, 1), "a");
  assert.equal(stepId(ids, null, -1), null);
  assert.equal(stepId(ids, "a", -1), null);
});
test("Next and Prev walk the deck in order and stop at the last slide", () => {
  assert.equal(stepId(ids, "a", 1), "b");
  assert.equal(stepId(ids, "c", -1), "b");
  assert.equal(stepId(ids, "c", 1), "c");
  assert.equal(stepId([], null, 1), null);
});
test("the bar disables the ends and counts n of N", () => {
  assert.match(deckBar(-1, 3), /data-pjstep="-1" disabled/);
  assert.match(deckBar(0, 3), /01 \/ 3/);
  assert.match(deckBar(2, 3), /data-pjstep="1" disabled/);
});
test("a swipe is a sideways flick of 40 px or more", () => {
  assert.equal(swipe(-80, 10), 1);
  assert.equal(swipe(90, -20), -1);
  assert.equal(swipe(-30, 0), 0);
  assert.equal(swipe(-60, 60), 0);
});
