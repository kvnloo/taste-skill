# Visual Reference Atlas · Taste Lab (experimental)

A local-first, original prototype for organizing visual references by **purpose → material → decision → reference** instead of only subject folders. Built on the MIT-licensed [React Flow](https://github.com/xyflow/xyflow) graph library.

**Provenance:** Inspired by the *idea of visually mapped creative techniques* in [Iris](https://visuals.modernartdirection.com/) from **Jason Murray / Modern Art Direction** (original [reel](https://www.instagram.com/reel/Dee4c-QgT1g/), October 14, 2026). Iris is a separate invite-only product; this is **not** its source code, an official port, a reproduction of its proprietary taxonomy, or a collection of its images. All demo visuals are generated with original CSS shapes.

## Run

```sh
cd examples/visual-reference-atlas
npm install
npm run dev
# open http://127.0.0.1:5173
```

`npm run build` checks the production bundle; `npm test` runs dependency-free data safety tests. Requires Node 22+.

## What works

- Interactive graph: pan, zoom, drag nodes, create edges by dragging connector handles, filter/search categories.
- Edit reference title, reasoning, creator credit, source URL, and optional preview image URL in the inspector.
- Add references, save changes locally in your own browser, export/restore JSON, import a JSON list of links/bookmarks. No account, crawler, authentication, or server database.
- JSON import accepts either an exported graph, an array of `{ "url", "title", "description", "creator" }` objects, or `{ "bookmarks": [...] }`. Invalid URL schemes are excluded and graph edges must refer to valid nodes.
- Responsive side panels and reduced-motion support.

## Next, not claimed complete

- Authenticated read-only import adapters for AgentWeb/Taste social-bookmark collections (X, YouTube, Pinterest) with explicit consent; don't store platform cookies in the app.
- Vision-assisted suggestion of design properties with source provenance, opt-in review, and retrieval evals.
- Tests for thousands of nodes, image licensing/provenance, keyboard connect/selection, and screenshot QA.

**Licensing:** This prototype code remains in the user's Taste fork. Original media and reference authors retain their respective rights. Adding a source URL does not confer permission to republish an image.