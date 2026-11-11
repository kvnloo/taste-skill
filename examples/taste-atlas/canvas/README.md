# Board canvas

`/s/<id>/canvas` shows a board as a freeform canvas. Pick the engine at the top:

- **Excalidraw** (MIT) edits the canvas in the browser. Every change saves to the board home.
- **Ink** ([Inkboard](https://github.com/VictorLetirand/inkboard), a desktop whiteboard) works on the same canvas through files.
  Download the `.excalidraw` file (pictures included) or the `.canvas` file ([JSON Canvas 1.0](https://jsoncanvas.org)),
  edit it in Inkboard, then import it back. `board.mjs canvas <id> --ink` writes both files and opens Inkboard
  (`inkboard` on PATH, or set `$TASTE_INK`).

Neither engine needs a license key. The choice is remembered per browser (`localStorage["taste-canvas-engine"]`);
`?engine=excalidraw|ink` overrides it.

The canvas has five frames: Inspo, Kept, Directions, Ideas and Noped. New refs, notes and palette swatches from the
agent land in the next free cell of their frame and never move what you placed. Dragging a ref into Kept likes it,
into Noped nopes it, and back to Inspo clears it, so `board.mjs status` and the board page stay in sync.

Build once (output in `dist/`, not committed):

```sh
npm --prefix canvas ci && npm --prefix canvas run build
```

Check it end to end in a real browser (own temp board server, never the live one; `SHOTS=<dir>` keeps screenshots):

```sh
npm --prefix canvas run e2e
```

Storage per board: `canvas.excalidraw` (the scene) and `canvas-files/` (pictures) inside the board home.
The format code is `../src/canvasfmt.js`; tests are `../scripts/canvasfmt.test.mjs`.
