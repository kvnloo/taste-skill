// node --test scripts/history.test.mjs — parsers for every --history format, on fixtures shaped like the real exports.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseHistory } from "./history.mjs";

const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "history-"));
const file = (name, body) => { const f = join(dir, name); writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body)); return f; };

test("YouTube Takeout HTML: likes and repeat watches rank, one-off watches and dislikes drop", () => {
  const cell = (verb, id, title, ch) => `<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">${verb} <a href="https://www.youtube.com/watch?v=${id}">${title}</a><br><a href="https://www.youtube.com/channel/UC1">${ch}</a><br>Aug 15, 2026, 12:43:51 PM CDT<br></div>`;
  const html = `<html>${cell("Watched", "aaaaaaaaaaa", "Twice &amp; liked", "Chan")}${cell("Watched", "aaaaaaaaaaa", "Twice &amp; liked", "Chan")}${cell("Liked", "aaaaaaaaaaa", "Twice &amp; liked", "Chan")}${cell("Watched", "bbbbbbbbbbb", "Once", "Chan")}${cell("Watched", "ccccccccccc", "Hated", "C")}${cell("Watched", "ccccccccccc", "Hated", "C")}${cell("Disliked", "ccccccccccc", "Hated", "C")}</html>`;
  const { kind, items } = parseHistory(file("MyActivity.html", html));
  assert.equal(kind, "youtube");
  assert.deepEqual(items.map((i) => [i.id, i.title, i.why, i.date]), [["yt-aaaaaaaaaaa", "Twice & liked", "liked, watched 2×", "2026-08-15"]]);
});

test("YouTube Takeout JSON", () => {
  const ev = (t, id) => ({ header: "YouTube", title: `${t} Some video`, titleUrl: `https://www.youtube.com/watch?v=${id}`, subtitles: [{ name: "Chan" }], time: "2026-08-01T10:00:00Z" });
  const { kind, items } = parseHistory(file("watch-history.json", [ev("Watched", "ddddddddddd"), ev("Watched", "ddddddddddd")]));
  assert.equal(kind, "youtube"); assert.equal(items[0].title, "Some video"); assert.equal(items[0].author, "Chan");
});

test("Spotify extended history: minutes rank, skips under 30 s do not count as plays, podcasts drop", () => {
  const p = (uri, track, ms, ts = "2026-07-01T10:00:00Z") => ({ ts, ms_played: ms, master_metadata_track_name: track, master_metadata_album_artist_name: "Artist", master_metadata_album_album_name: "LP", spotify_track_uri: uri });
  const { kind, items } = parseHistory(file("Streaming_History_Audio_2026.json", [
    p("spotify:track:A", "Long", 200000), p("spotify:track:A", "Long", 200000, "2026-07-02T10:00:00Z"),
    p("spotify:track:B", "Short", 90000), p("spotify:track:B", "Short", 90000),
    p("spotify:track:C", "Skipped", 5000), p("spotify:track:C", "Skipped", 5000),
    { ts: "2026-07-01T10:00:00Z", ms_played: 900000, episode_name: "A podcast", master_metadata_track_name: null },
  ]));
  assert.equal(kind, "spotify");
  assert.deepEqual(items.map((i) => [i.id, i.plays, i.date]), [["sp-A", 2, "2026-07-02"], ["sp-B", 2, "2026-07-01"]]);
  assert.equal(items[0].url, "https://open.spotify.com/track/A");
  assert.match(items[0].oembed, /open\.spotify\.com\/oembed/);
});

test("Spotify account-data history (no URIs) groups by artist and track", () => {
  const p = (t) => ({ endTime: "2026-06-01 10:00", artistName: "Band", trackName: t, msPlayed: 180000 });
  const { items } = parseHistory(file("StreamingHistory_music_0.json", [p("Song"), p("Song"), p("Other")]));
  assert.equal(items.length, 1); assert.equal(items[0].title, "Song"); assert.match(items[0].url, /open\.spotify\.com\/search\//);
});

test("Tidal CSV with quotes, commas and play counts", () => {
  const csv = '\uFEFFTrack name,Artist name,Album,Played at,Tidal ID\n"Hello, World","Some ""Band""",LP,2026-05-01T10:00:00Z,12345\n"Hello, World","Some ""Band""",LP,2026-05-03T10:00:00Z,12345\nSolo,Other,,2026-05-02,678\n';
  const { kind, items } = parseHistory(file("tidal-history.csv", csv));
  assert.equal(kind, "csv");
  assert.deepEqual(items.map((i) => [i.source, i.title, i.author, i.plays, i.date, i.url]), [
    ["tidal", "Hello, World", 'Some "Band"', 2, "2026-05-03", "https://tidal.com/browse/track/12345"],
    ["tidal", "Solo", "Other", 1, "2026-05-02", "https://tidal.com/browse/track/678"]]);
});

test("unknown files and CSVs without title/artist fail loudly", () => {
  assert.throws(() => parseHistory(file("notes.txt", "hello")), /not a YouTube Takeout/);
  assert.throws(() => parseHistory(file("x.csv", "a,b\n1,2\n")), /needs title\/track and artist/);
});
