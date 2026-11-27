// node --test scripts/lensphone.test.mjs — phone layout of the project lens and storyboard (N73, 11-23).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grid } from "../src/project.js";

test("phone storyboard rows hold at most 3 portrait frames, so each frame is readable", () => {
  // 33 phone screens (9:19.5) into a phone-shaped free area: uncapped, the fit picks 9 stamp-sized columns.
  const free = 390 / (844 * 0.45);
  assert.ok(grid(33, [9, 19.5], free).cols > 3, "baseline: the uncapped fit is wide");
  const g = grid(33, [9, 19.5], free, false, 3);
  assert.equal(g.cols, 3);
  assert.equal(g.rows, 11);
  assert.equal(grid(2, [9, 19.5], free, false, 3).cols, 2, "fewer screens than the cap keeps them all on one row");
});

test("the lens shelf's 44vw desktop width is scoped to desktop, so the phone sheet stays full width", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  // Every rule that sets the lens shelf width must sit inside a min-width media query.
  const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ""); // strip all media blocks
  assert.doesNotMatch(top, /body\.lens \.shelf\.open[^{]*\{[^}]*width:\s*min\(560px/, "unscoped lens width beats the phone sheet's width:auto");
  assert.match(css, /@media \(min-width: 701px\) \{ body\.lens \.shelf\.open:not\(\.wide\) \{ width: min\(560px, 44vw\); \} \}/);
});
