// node --test scripts/onboard.test.mjs — detection and the two new importers (browser links, X merge), and a full
// `add` of a zip and a folder into an empty data dir, on fixtures shaped like the real exports. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classify, parseNetscape, parseLinks, mergeLinks, mergeX, add, status, expand } from "./onboard.mjs";

const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "onboard-"));
const file = (name, body) => { const f = join(dir, name); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body)); return f; };

const NETSCAPE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<DL><p>
  <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><H3>Design</H3>
    <DL><p>
      <DT><A HREF="https://linear.app/method" ADD_DATE="1760000000">Linear &amp; method</A>
      <DT><A HREF="javascript:void(0)">bookmarklet</A>
    </DL><p>
    <DT><A HREF="https://www.example.com/a" ADD_DATE="1760000000000">Top level</A>
  </DL><p>
</DL>`;
const TW = [{ id: "111", text: "a post", author: { screenName: "maker", name: "M" }, metrics: { likes: 9 }, createdAtISO: "2026-10-01T10:00:00+00:00", media: [{ type: "photo", url: "https://pbs.twimg.com/media/X.jpg" }] },
  { id: "222", text: "text only", author: { screenName: "other" }, createdAtISO: "2026-10-02T10:00:00+00:00", media: [] }];

test("classify: every export by content, unused export files skipped", () => {
  assert.equal(classify("bookmarks_10_1_26.html", NETSCAPE), "web");
  assert.equal(classify("watch-history.html", '<div><a href="https://www.youtube.com/watch?v=aaaaaaaaaaa">x</a></div>'), "history");
  assert.equal(classify("search-history.html", '<a href="https://www.youtube.com/watch?v=aaaaaaaaaaa">'), null);
  assert.equal(classify("bookmarks.json", JSON.stringify(TW)), "x");
  assert.equal(classify("StreamingHistory_music_0.json", '[{"endTime":"2026-01-01 10:00","msPlayed":40000}]'), "history");
  assert.equal(classify("tidal.csv", "Title,Artist,Album\nA,B,C\n"), "history");
  assert.equal(classify("raindrop.csv", "id,title,url,folder,created\n1,A,https://a.dev,Design,2026-01-01\n"), "web");
  assert.equal(classify("Invitations.csv", "From,To,Sent At\n"), null);
  assert.equal(classify("links.txt", "https://a.dev\nhttps://b.dev\n"), "web");
  assert.equal(classify("README.txt", "hello"), null);
});

test("Netscape HTML: folders become groups, bookmarklets drop, s/ms dates both parse", () => {
  const rows = parseNetscape(NETSCAPE);
  assert.deepEqual(rows.map((r) => [r.url, r.title, r.folder, r.date]), [
    ["https://linear.app/method", "Linear & method", "Bookmarks bar / Design", "2025-10-09"],
    ["https://www.example.com/a", "Top level", "Bookmarks bar", "2025-10-09"]]);
  const out = mergeLinks(null, rows, "b.html");
  assert.deepEqual(out.items.map((i) => [i.layer, i.author, i.technique]).sort(), [["web", "Design", null], ["web", "example.com", null]]);
  assert.match(out.items[0].id, /^web-[0-9a-f]{12}$/);
  const again = mergeLinks(out, parseLinks("x.txt", "https://linear.app/method https://new.dev/x"), "x.txt");
  assert.equal(again.items.length, 3, "re-import dedupes by URL");
});

test("X merge keeps already-classified posts untouched and adds new ones unsorted", () => {
  const prev = { source: "x", items: [{ id: "111", technique: "closure", thumb: "thumbs/111.jpg", seen: "label" }] };
  const { out, added } = mergeX(prev, TW);
  assert.equal(out.items.length, 2); assert.deepEqual(out.items.find((b) => b.id === "111"), prev.items[0]);
  assert.deepEqual(added.map((b) => [b.id, b.author, b.url, b.type, b.technique, b.date]), [["222", "other", "https://x.com/other/status/222", "text", null, "2026-10-02"]]);
});

test("add: a Takeout-style zip and a loose folder land in an empty data dir, status reflects them", async () => {
  const data = join(dir, "data"); process.env.ATLAS_DATA = data;
  const cell = (verb, id) => `<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">${verb} <a href="https://www.youtube.com/watch?v=${id}">Video ${id}</a><br><a href="https://www.youtube.com/channel/UC1">Chan</a><br>Aug 15, 2026, 12:43:51 PM CDT<br></div>`;
  file("takeout/Takeout/YouTube and YouTube Music/history/watch-history.html", `<html>${cell("Watched", "aaaaaaaaaaa")}${cell("Watched", "aaaaaaaaaaa")}</html>`);
  file("takeout/Takeout/YouTube and YouTube Music/history/search-history.html", "<html>searched</html>");
  file("takeout/Takeout/archive_browser.html", "<html></html>");
  execFileSync("zip", ["-qr", join(dir, "takeout.zip"), "Takeout"], { cwd: join(dir, "takeout") });
  file("drop/bookmarks.html", NETSCAPE); file("drop/notes.md", "no links here"); file("drop/bookmarks.json", [TW[1]]);
  // the zip: only the watch history is extracted and routed to history.mjs (which then fetches covers, so not run here)
  const z = expand(join(dir, "takeout.zip"), data);
  assert.deepEqual(z.map((x) => [x.path.split("/").slice(-1)[0], x.kind]), [["watch-history.html", "history"]]);
  const r = await add([join(dir, "drop")]);
  assert.deepEqual(r.results.map((x) => [x.kind, x.total]).sort(), [["web", 2], ["x", 1]]);
  assert.equal(r.skipped, 1);
  const s = status(data);
  assert.deepEqual(s.sources.filter((x) => x.done).map((x) => [x.id, x.items]), [["x", 1], ["web", 2]]);
  assert.equal(JSON.parse(readFileSync(join(data, "links.atlas.json"), "utf8")).kind, "taste-atlas.links.v1");
  await assert.rejects(add([join(dir, "drop/notes.md")]), /nothing to import: notes\.md/);
});
