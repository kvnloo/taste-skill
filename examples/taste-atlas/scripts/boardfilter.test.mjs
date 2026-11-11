// A board ref and a bookmark are the same post when their urlKey matches (x.com == twitter.com, query/handle ignored).
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlKey } from "../src/boardfilter.js";

test("x and twitter status urls match by id", () => {
  assert.equal(urlKey("https://x.com/a/status/123?s=20"), urlKey("https://twitter.com/b/status/123"));
  assert.notEqual(urlKey("https://x.com/a/status/123"), urlKey("https://x.com/a/status/124"));
});
test("web urls drop query, hash and trailing slash", () => {
  assert.equal(urlKey("https://github.com/kvnloo/glide/?tab=1#x"), "https://github.com/kvnloo/glide");
  assert.equal(urlKey(undefined), "");
});
