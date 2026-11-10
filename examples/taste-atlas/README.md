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
python3 -m http.server 8787   # then open http://127.0.0.1:8787/
```

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

## Agents

`scripts/atlas.mjs` turns the atlas into briefs an agent can build a site or UI component from
(`export`, `list`, `get`, `search`, `suggest`, `brief <ids> [--component] [--md]`). The same brief
builder (`src/brief.js`) backs the card's "Copy site brief" / "Component brief" buttons and
`window.__atlas.brief()`. The agent workflow is `skills/taste-atlas/SKILL.md`.

## Checks

`node scripts/shot.mjs <dir>` screenshots key states, runs the feature journeys and asserts the
canvas and SVG layers stay registered mid-zoom (`MOBILE=1` adds phone shots).
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
