# Taste Atlas

A taxonomy of why images work, as a zoomable radial graph. Every specimen is filed four levels deep:

| Level | Question | Example |
|---|---|---|
| 01 Operation | What should the viewer do? | Differentiate |
| 02 Domain | Which property of the image carries it? | Feature |
| 03 Technique | What is the named mechanism? | Color isolation |
| 04 Execution | What does one instance look like? | "Last lamp on" |

6 operations, 30 techniques and 97 specimens. Specimens are procedural SVG (`src/specimens.js`),
so the atlas ships no third-party images. The structure takes its idea from Jason Murray's Iris
(Modern Art Direction) and its content from public design theory (Gestalt grouping, visual rhetoric,
motion principles). It is a separate, fuller take on `examples/visual-reference-atlas`
(purpose → material → decision → reference).

## Run

```sh
node scripts/board.mjs serve   # then open http://127.0.0.1:8789/
```

One app, three views sharing a nav, theme and data: **Atlas** (`/`, the taxonomy graph), **Library**
(`/library`, every saved post as a filterable mosaic; same page, no reload) and **Boards** (`/boards`,
live brainstorm boards at `/s/<id>/`). Board technique tags open the atlas at that technique, and any
post in the library has "+ Board" to drop it onto the newest board. A plain static server
(`python3 -m http.server`) still renders the atlas alone.

On a board, talk to it: the bar at the bottom (type, or hold **● Talk** / the space bar to dictate) goes
to a Hermes session over ACP (`scripts/agent.mjs`; `TASTE_AGENT=off` disables it). Say "only the dark
ones" and it narrows the wall to a shortlist; "compare the best two" puts a pair side by side and you
pick with a click or `1`/`2`. **Make design** exports the kept references, techniques, palette and type as
an editable `.fig` + PNG and links it into an OpenPencil editor (`TASTE_PENCIL_URL`; needs
`@open-pencil/cli` on PATH or `TASTE_OPENPENCIL`). CLI equivalents: `board.mjs focus|compare|design`.

**3 directions** (or just saying "give me options") has the Hermes session draw three different design
directions with its own image tool, from the references you kept, and line them up as a round (R1, R2, …)
above the wall; it then puts the strongest two side by side. "A's layout with B's colours" merges two.
Rounds and their pictures live in the board directory (`variants/`). Hermes needs `image_gen` enabled
for ACP: `platform_toolsets: { acp: [hermes-acp, image_gen] }` in its `config.yaml`.

Click a node to focus its branch, click again or press Esc to step out, `/` to search, `t` for the
theme. Deep links work: `/#color-isolation`, `/?theme=dark#instrument-language`.

With a private `data/` folder (bookmarks classified by `products/taste` scripts, never committed) the
atlas also draws every saved post around the ring, shows "N of your posts" on the card, a shelf with
subject filters (`b`), a full-screen mosaic (`m`) and a post detail view.

### Sources: what you asked for, what you made, what you build

`scripts/sources.mjs` adds a second private layer, `data/sources.atlas.json`, with these shelf chips:

- **Asked about** — links you sent an agent asking it to recreate, remake or triage the thing, with
  your words beside the post ("You asked: …"). X posts get their media through fxtwitter.
- **Films** — videos you made (the launch-videos registry), poster as the tile.
- **Studied** — other people's ads, films and open prompt corpora you learn from (`--refs`, one
  `{id, url, title, author, text, date, format, stats?}` per line). YouTube gets its poster frame, X
  its media; `stats` (views, likes, likes_per_view, as_of) shows as a Reach line in the detail view.
- **Projects** — your public GitHub repos (`"github": "<user>"`, optional `"only": [...]`).
- **Ideas** — things with no repo yet: a title, a line or two, an optional link and image.

Anyone can show their own work: copy `sources.example.json`, set your GitHub user and ideas, and run

```sh
node scripts/sources.mjs --projects my-sources.json [--asks asks.jsonl] [--films films.jsonl] [--refs refs.jsonl] [--labels labels.jsonl]
```

Items are placed on techniques only from `--labels` (`{id, techniques, seen}` per line, e.g. the
teacher labeller in `products/taste` run on these items); unlabelled items stay off the ring and list
under "All". The owner's asks and films come from `products/taste/scripts/export_owner_sources.py`.

### Watch, listen and build history

Import what you keep coming back to on YouTube, Spotify and TIDAL, and your GitHub activity. **History**
(`/history`) draws one card per source: a day-by-day calendar for every year it covers, the top
channels/artists/languages, and covers of what you returned to. Each source also gets its own chip in the
library (`/library?layer=<source>`) and its items are searchable from boards (`board.mjs search … --from mine`).

```sh
node scripts/history.mjs <export>... [--github <user>] [--top 300]
```

| Service | Where to get the export | What counts |
| --- | --- | --- |
| YouTube | [Google Takeout](https://takeout.google.com) → *My Activity* → YouTube (`MyActivity.html` or `.json`) | likes and videos watched 2+ times; dislikes dropped |
| Spotify | [Account privacy](https://www.spotify.com/account/privacy/) → *Extended streaming history* (`Streaming_History_Audio_*.json`) or *Account data* (`StreamingHistory_music_*.json`) | tracks played 2+ times (30 s+), ranked by minutes |
| TIDAL | TIDAL's data request, or a CSV from TuneMyMusic/Soundiiz (any CSV with title and artist columns) | play counts, or every saved track |
| GitHub | nothing to export: `--github <user>` reads through your `gh` login | contribution calendar since the account opened; starred repos as items; languages of your own repos |

The format is detected from the file. Covers come from YouTube's poster frame, Spotify's oEmbed, or
Apple's public catalogue search for TIDAL and other CSVs (no logins). Output goes to
`data/history.atlas.json` (gitignored); re-importing one service replaces only that service.
`node --test scripts/history.test.mjs` covers every format.

### Layers: every source on one canvas

The Atlas canvas carries every imported layer at once. X bookmarks and sources that have a technique sit in
their technique's wedge. Everything else gets a sector on an outer ring, grouped by category: watch history by
channel, GitHub stars by language, LinkedIn connections by company hub, and your work and sources by kind. The
**Layers** bar (bottom left) turns each layer on or off; the choice is kept in `localStorage`. Search matches
categories as well as techniques and posts: type `nvidia`, `youtube` or `rust`, pick the category, and the canvas
flies to it, lights it and lists it in the shelf. A LinkedIn tile opens its person, with a link to their warm
paths in Network. `LAYERS=1 node scripts/shot.mjs <dir>` checks this on desktop and phone.

### Network (LinkedIn connections)

**Network** (`/network`) draws your LinkedIn connections as one canvas graph (sigma.js on WebGL, ForceAtlas2
layout from graphology): you in the middle, connections pulled closer the warmer they are, companies as hubs of
the people who work there. Click a company for its warmest way in (*You → person → company*) and everyone there,
ranked; click a person for a warmer colleague who could introduce you, who they share threads with, and their
profile. Your own card ranks companies by reach and lists the ones you worked at.

```sh
node scripts/network.mjs Basic_LinkedInDataExport_<date>.zip   # or the unzipped folder
```

Get the export from LinkedIn → Settings → Data privacy → *Get a copy of your data* (the *larger data archive*
includes messages, which is what makes warmth meaningful). Nothing is scraped. Warmth counts messages (more
for two-way and recent conversations), endorsements and invitation notes; emails, phone numbers and message
text are never written out. LinkedIn exports only your first-degree connections, so friends of friends are
the ones your own data shows: people in a group thread with a connection, and pending invitations to you.
Output goes to `data/network.atlas.json` (gitignored). `node --test scripts/network.test.mjs` covers the importer.

### Work: your projects as a repo map

The **Work** layer puts your own projects in the empty disc at the centre of the atlas, as nested packed
bubbles (the RepoMap idea from aodl-views, ported in `src/pack.js`). Zoom is depth:

| Depth | Bubbles | Shows |
|---|---|---|
| 0 Portfolio | products | name, status ring, "checked 2h ago"; a deadline arc if the product has one |
| 1 Product | its component areas | area = decayed recent work, colour = status, "also in <product>" |
| 2 Component | its pages, linked posts, films, PRs | thumbnails first, PRs as a row of chips |
| 3 Proof | lightbox | numbers, files touched per day, PRs with checks, main CI, repo heads, "You asked: …" |

Click a bubble to fly in, click the focused one again for its proof, Esc steps out one level. Status uses four
colours (on track, watch, at risk, blocked); anything past its refresh window draws grey and dashed, never as
live. A component that belongs to two products is drawn once; the other product shows a dashed portal to it.
The HUD scrubs "as of" (now, −1d, −3d, −7d) and the half-life, and the bubbles re-weigh in place. Any post's
detail view has **Link to work…**: the link is saved in `data/work-links.json` (`POST /api/work-links` on the
board server) and the post is tethered from its tile on the ring to the component, as a faint bundle when zoomed
out. Search finds products and components; `/#work:glide/taste` deep-links one; the shelf lists its pages and
linked posts; the Layers bar has a **Work** toggle.

```sh
node scripts/work.mjs [--dry] [--no-shots] [--no-gh]   # writes data/work.atlas.json (+ data/work-shots/)
```

`scripts/work.config.json` is the only hand-written part: products → component areas as path globs per repo
(first match wins, in file order), page lists, and where the status-board seed and asks live. Private URLs go
in `data/work.config.local.json` (same shape; pages merge by component id). Everything else is measured:
`git log --since` touches per component, `gh pr list --json …,files` (one call per repo maps PRs to
components) and `gh run list` for main CI, cached in `data/work-cache/` for 15 minutes (`WORK_GH_TTL`); a 403
or 429 writes a back-off file and no further call is made until it expires. Pages that answer are screenshotted
with Playwright; the rest are listed as down. A missing repo or gh makes that part `unknown`.

`data/work.atlas.json` (`kind: "taste-atlas.work.v1"`) is shaped so a RepoMap-style consumer can read it:

```js
{ generated, generatedAt /* epoch s */, halfLifeHours, windowDays,
  products: [{ id, label, name, weight, lastTouched, touches: [[epochSeconds, files], …],
    status: { value: "on-track"|"watch"|"at-risk"|"blocked"|"unknown", why, source: "live"|"board 11-10", checked, window },
    verdict, deadline, metrics: [[label, value, source]], repos: [{ id, ok, head, headMsg, headAt, commits }],
    components: [ids], portals: [ids], notes, links, asks: [{ t, text }], films: [itemIds] }],
  components: [{ id: "product/component", product, label, name, also: [productIds], repos, weight, lastTouched, touches,
    status, prs: [{ repo, number, title, state, draft, t, url, checks: { pass, fail, pending } }],
    pages: [{ name, url | file, shot, state: "up"|"down", code, checked }], metrics, asks, films }],
  ci: { "<owner/repo>": { conclusion, t, url } }, repos, unmapped, errors }
```

`weight` is the decayed touch weight at `generatedAt`; `touches` are raw so a consumer can re-weigh at any
"as of" and half-life (`weightAt` in `src/pack.js`). Status from the board seed is labelled with its source and
only used while fresh (24 h); after that the live rule takes over. `node --test scripts/work.test.mjs` covers
the importer; `WORK=1 node scripts/shot.mjs <dir>` checks the layer end to end.

### Board canvas: Excalidraw or Ink

`/s/<id>/canvas` (the board's "canvas ↗" link) lays a board out freely in five frames: Inspo, Kept,
Directions, Ideas and Noped. The owner picks the engine at the top, and the choice is remembered:
**Excalidraw** edits it in the browser, and **Ink** ([Inkboard](https://github.com/VictorLetirand/inkboard))
edits it on the desktop through `.excalidraw` or `.canvas` ([JSON Canvas](https://jsoncanvas.org)) files.
Both are MIT and need no license key. Dragging a ref into Kept likes it, and Noped nopes it, in either
engine. Inkboard saves fresh ids and turns frames into plain cards, so an import is matched back onto
the board by content (frame titles, picture bytes, card text, nearest same-size shape); checked against
its `ink convert` output for both formats. `board.mjs canvas <id> [--ink]`, `export` and `import` do the same from the CLI. Build and
check: [`canvas/README.md`](canvas/README.md).

## Mission

`/mission` is one pannable canvas for a push that runs across many chats at once, in two arrangements of the same
nodes (`1` / `2` morphs between them):

- **Brainstorm**: the ask in the middle, the film cut as a ring of scenes around it, and each workstream as a cluster
  of its chats and ideas.
- **Product**: goal and acceptance, the roadmap as a time axis, the storyboard strip, the cut's version rail, and one
  swimlane per workstream with each chat placed at the time it ran.

Each chat card shows its ask (declare), its done clauses (contract), tool-call progress, PRs (proof) and the scenes it
touched. Click a card for the full intent contract, steering and receipts; hover a scene to play its slice of the film.
The replay bar scrubs the day: chats spawn, owner steering lands, scenes flash in the colour of the lane that touched
them, PRs merge. **LIVE** (`l`) pins the clock to now and re-reads the snapshot every 15 s.

**Windows**: Today / Week / Project / Custom (`?span=today|week|project|custom&from=YYYY-MM-DD&to=…`) cut one
snapshot (minutes since `mission.epoch`) to a range. The time axis is weighted by activity, so quiet nights fold away;
multi-day windows open on the whole range with a tally per day.

**Retro** (`r`) answers "where did the time go" for the window: agent time by activity (model turns, shell, polling,
tests, vision checks, renders, CI), and time sinks ranked by minutes, each with its cause and a fix. Click a sink to
highlight its chats. Sinks: chats waiting on you, context rot (agent minutes from a handoff to the next edit), proof
loops (frame probes, captures, vision checks), polling and CI waits, side quests, render passes with no new feedback
(jobs read from the film's render logs; a pass is one chat's back-to-back chunks), renders that died, duplicate chats,
and jobs re-dispatched by automation. Recurring failures, scene churn and patterns follow.

Data: `data/mission.json` (a local snapshot built from your own sessions, never committed) or `mission.example.json`, a
synthetic public sample from `python3 scripts/mission-example.py mission.example.json`. `?sample=1` forces the sample;
`?t=15:10` opens at a time, `?play=1` replays, `#<id>` opens a card.

## Agents

`scripts/atlas.mjs` turns the atlas into briefs an agent can build a site or UI component from
(`export`, `list`, `get`, `search`, `suggest`, `brief <ids> [--component] [--md]`). The same brief
builder (`src/brief.js`) backs the card's "Copy site brief" / "Component brief" buttons and
`window.__atlas.brief()`. The agent workflow is `skills/taste-atlas/SKILL.md`.

## Checks

`node scripts/shot.mjs <dir>` screenshots key states, runs the feature journeys and asserts the
canvas and SVG layers stay registered mid-zoom (`MOBILE=1` adds phone shots).
`HISTORY=1 node scripts/shot.mjs <dir>` checks `/history` on desktop and phone (a card per source, calendars
drawn, every cover loads). `NETWORK=1 node scripts/shot.mjs <dir>` checks `/network` the same way (every node
drawn, a company card shows its way in, search finds it). `WORK=1 node scripts/shot.mjs <dir>` checks the Work layer (every product
on screen, a real click into glide and Taste pages, thumbnails drawn, the proof lightbox, a post linked and tethered after a
reload, search, deep link, toggle, stale rendering, light theme and a 390 px phone). `node scripts/lod.mjs` checks deep zoom: clips autoplay without costing frames, and
at the 24× maximum tiles show the original file (X's full-resolution upload or a native-size video frame) and
native-size clips; a photo's detail view opens at its original width.
`MISSION=1 node scripts/shot.mjs <dir>` checks `/mission` on the local snapshot and the public sample (no two nodes
overlap in either mode, replay reaches the ticker, LIVE pins to now, an Insights failure highlights its chats), then
walks it on 390×844 and 360×800 touch phones. At every state it fails on sideways scroll, controls off screen, taps
under 36 px (44 for lone buttons), chrome text under 11 px, overlapping fixed surfaces, a sheet hiding the replay bar,
fewer than 3 legible chat titles in view, or a drawer covering the card that opened it. It also checks pinch, pan and
scrub. On phones the chrome takes two rows and Retro and the chat drawer become bottom sheets. Picking a sink folds
the sheet so its chats stay visible.

`e2e/army` is the tester army: vision-model `e2e explore` lanes (`goals.tsv`) at the same phone sizes and desktop. Each
lane runs in its own Boat sandbox: `cd e2e/army && with-keys.sh python3 boat/up.py`. The `canary-390` lane runs the
pre-fix build (`e53431c`) and must report its off-screen controls, so a clean report on the real build means
something. Findings land in `runs/boat/<ts>/findings.json`.
`node scripts/perf.mjs` measures idle load and zoom frame times on desktop and a 4x-throttled phone;
it exits 1 if the phone p95 frame exceeds `BUDGET_MS` (default 34).

## Films

`film.html?cut=launch` (1080×1080, 18 s) and `film.html?cut=reel` (1080×1920, 21 s) drive the same
renderer from `window.seek(t)`, so a capture tool can render them frame by frame. Opened in a normal
browser they play in real time.

## Edit the taxonomy

Add a row to `T` in `src/taxonomy.js`: `[operation, domain, id, name, specimen family, mechanism, executions]`,
and its web recipe to `UI`.
A new specimen family is one function in `src/specimens.js` that returns SVG for `(seed, palette, rng, t)`.
