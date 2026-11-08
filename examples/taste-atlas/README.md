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

## Films

`film.html?cut=launch` (1080×1080, 18 s) and `film.html?cut=reel` (1080×1920, 21 s) drive the same
renderer from `window.seek(t)`, so a capture tool can render them frame by frame. Opened in a normal
browser they play in real time.

## Edit the taxonomy

Add a row to `T` in `src/taxonomy.js`: `[operation, domain, id, name, specimen family, mechanism, executions]`.
A new specimen family is one function in `src/specimens.js` that returns SVG for `(seed, palette, rng, t)`.
