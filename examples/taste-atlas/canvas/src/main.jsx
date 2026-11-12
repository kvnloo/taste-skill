import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, restoreElements, MainMenu } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./canvas.css";
import { fit } from "../../src/canvasfmt.js";

const id = location.pathname.match(/^\/s\/([a-z0-9-]{4,40})/)?.[1];
const api = (p) => `/s/${id}${p}`;
const KEY = "taste-canvas-engine";
const ENGINES = [["excalidraw", "Excalidraw", "Edit here in the browser"], ["ink", "Ink", "Edit in Inkboard on your computer"]];
const initialEngine = () => { const q = new URLSearchParams(location.search).get("engine"); return ENGINES.some(([k]) => k === q) ? q : localStorage.getItem(KEY) ?? "excalidraw"; };
const theme = () => { const t = new URLSearchParams(location.search).get("theme") ?? localStorage.getItem("taste-theme"); return t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"; };
const json = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
const toDataURL = (blob) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });

// Ref pictures arrive as image elements with no file yet: fetch each through the board server, add it, and keep a copy.
async function fillPictures(x, elements, have) {
  const want = elements.filter((e) => e.type === "image" && !e.isDeleted && e.fileId && !have.has(e.fileId) && e.customData?.ref);
  for (const e of want) {
    have.add(e.fileId);
    try {
      const r = await fetch(api(`/canvas/img?ref=${encodeURIComponent(e.customData.ref)}`)); if (!r.ok) continue;
      const blob = await r.blob(), dataURL = await toDataURL(blob), file = { id: e.fileId, mimeType: blob.type || "image/jpeg", dataURL, created: Date.now() };
      x.addFiles([file]);
      fetch(api("/canvas/file"), { method: "POST", body: JSON.stringify(file) });
    } catch (err) { console.warn("canvas picture", e.customData.ref, err); }
  }
}

function App() {
  const [engine, setEngine] = useState(initialEngine), [x, setX] = useState(null), [init, setInit] = useState(null);
  const [status, setStatus] = useState("loading"), [title, setTitle] = useState("");
  const saved = useRef(""), files = useRef(new Set()), timer = useRef(0), dark = useMemo(() => theme() === "dark", []), eng = useRef(engine), xr = useRef(null);
  eng.current = engine; xr.current = x;
  const pick = (k) => { clearTimeout(timer.current); setEngine(k); localStorage.setItem(KEY, k); const u = new URL(location.href); u.searchParams.set("engine", k); history.replaceState(null, "", u); };

  useEffect(() => {
    fetch(api("/canvas.json")).then(json).then((s) => {
      for (const k of Object.keys(s.files ?? {})) files.current.add(k);
      saved.current = JSON.stringify(s.elements.map((e) => [e.id, e.version]));
      setInit({ elements: restoreElements(s.elements, null), files: s.files ?? {}, appState: { viewBackgroundColor: s.appState?.viewBackgroundColor ?? "#ffffff", theme: dark ? "dark" : "light" } });
      setStatus("saved");
    }).catch((e) => setStatus(`error: ${e.message}`));
    fetch(api("/board.json")).then((r) => (r.ok ? r.json() : null)).then((b) => b?.title && setTitle(b.title)).catch(() => {});
  }, []);
  useEffect(() => { if (x && init) { fillPictures(x, init.elements, files.current); // Open where the scene says home is (frames with customData.home, e.g. an agent-built journey map),
      // else on Inspo and Kept (the frames the owner sorts between), at a readable zoom; the rest is a scroll away.
      requestAnimationFrame(() => { const els = x.getSceneElements(), home = els.filter((e) => e.type === "frame" && e.customData?.home);
        const f = home.length ? home : els.filter((e) => e.id === "frame-inspo" || e.id === "frame-kept"); x.scrollToContent(f.length ? f : undefined, { fitToViewport: true, viewportZoomFactor: 0.95 }); }); } if (x) window.tasteCanvas = x; }, [x, init]);  // window.tasteCanvas: the Excalidraw API, for agents and tests

  // Debounced, and it saves the scene as it is when the timer fires: a save queued before an import or an
  // engine switch must not write the older scene back over it.
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const x = xr.current; if (!x || eng.current !== "excalidraw") return;
      const elements = x.getSceneElementsIncludingDeleted(), appState = x.getAppState();
      const sig = JSON.stringify(elements.map((e) => [e.id, e.version])); if (sig === saved.current) return;
      setStatus("saving");
      try {
        const r = await json(await fetch(api("/canvas.json"), { method: "POST", body: JSON.stringify({ elements: elements.filter((e) => !e.isDeleted), appState: { viewBackgroundColor: appState.viewBackgroundColor } }) }));
        saved.current = sig; setStatus(r.picks?.length ? `saved · ${r.picks.map((p) => `${p.verdict} ${p.ref}`).join(", ")}` : "saved");
      } catch (e) { setStatus(`not saved: ${e.message}`); }
    }, 700);
  }, []);
  const onChange = useCallback((elements, appState, fs) => {
    if (engine !== "excalidraw") return;
    for (const f of Object.values(fs)) if (!files.current.has(f.id) && f.dataURL?.startsWith("data:image/")) { files.current.add(f.id); fetch(api("/canvas/file"), { method: "POST", body: JSON.stringify(f) }); }
    save();
  }, [engine, save]);

  // The agent keeps adding refs and notes: merge whatever is new into the open canvas every few seconds.
  useEffect(() => {
    if (!x) return;
    const t = setInterval(async () => {
      try {
        const s = await json(await fetch(api("/canvas.json?files=0")));
        const have = new Set(x.getSceneElementsIncludingDeleted().map((e) => e.id)), fresh = s.elements.filter((e) => !have.has(e.id));
        if (engine === "ink") { x.updateScene({ elements: restoreElements(s.elements, null) }); fillPictures(x, s.elements, files.current); return; }
        if (!fresh.length) return;
        const add = restoreElements(fresh, null); x.updateScene({ elements: fit([...x.getSceneElementsIncludingDeleted(), ...add]) }); fillPictures(x, add, files.current);
      } catch { /* server restarting; next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [x, engine]);

  const [msg, setMsg] = useState("");
  const importFile = async (f) => {
    if (!f) return; clearTimeout(timer.current); setMsg(`importing ${f.name}…`);
    try {
      const r = await json(await fetch(api("/canvas/import"), { method: "POST", body: await f.text() }));
      const s = await json(await fetch(api("/canvas.json")));
      x?.addFiles(Object.values(s.files ?? {})); x?.updateScene({ elements: restoreElements(s.elements, null) }); x?.scrollToContent();
      saved.current = JSON.stringify(s.elements.map((e) => [e.id, e.version]));
      setMsg(`imported ${r.elements} shapes${r.picks.length ? ` · ${r.picks.length} pick${r.picks.length > 1 ? "s" : ""} from moved refs` : ""}`);
    } catch (e) { setMsg(`import failed: ${e.message}`); }
  };

  return (
    <div className={`shell ${dark ? "dark" : ""}`}>
      <header className="bar">
        <a className="brand" href={api("/")}>← Board</a>
        <span className="ttl">{title || id}</span>
        <div className="engines" role="radiogroup" aria-label="Canvas engine">
          {ENGINES.map(([k, label, hint]) => <button key={k} role="radio" aria-checked={engine === k} className={engine === k ? "on" : ""} title={hint} onClick={() => pick(k)}>{label}</button>)}
        </div>
        <span className="status" data-testid="status">{engine === "ink" ? "view only here · edit in Inkboard" : status}</span>
      </header>
      {engine === "ink" && (
        <aside className="ink" data-testid="ink-panel">
          <b>Ink</b> edits this canvas in <a href="https://github.com/VictorLetirand/inkboard" target="_blank" rel="noreferrer">Inkboard</a>, a desktop whiteboard.
          <ol>
            <li>Download <a href={api("/board.excalidraw")} download>{id}.excalidraw</a> (pictures included) or <a href={api("/board.canvas")} download>{id}.canvas</a> (JSON Canvas).</li>
            <li>Open it in Inkboard. Or run <code>board.mjs canvas {id} --ink</code> to write both files and open Inkboard.</li>
            <li>Save it there, then <label className="file">import it back<input type="file" accept=".excalidraw,.canvas,.json,application/json" onChange={(e) => importFile(e.target.files[0])} /></label>. Refs you moved into Kept or Noped become picks.</li>
          </ol>
          {msg && <p className="msg" data-testid="ink-msg">{msg}</p>}
        </aside>
      )}
      <main className="stage">
        {init && <Excalidraw excalidrawAPI={setX} initialData={init} onChange={onChange} viewModeEnabled={engine === "ink"} theme={dark ? "dark" : "light"} UIOptions={{ canvasActions: { loadScene: false } }}>
          <MainMenu><MainMenu.DefaultItems.Export /><MainMenu.DefaultItems.SaveAsImage /><MainMenu.DefaultItems.ToggleTheme /><MainMenu.DefaultItems.ChangeCanvasBackground /></MainMenu>
        </Excalidraw>}
        {!init && <p className="loading">{status}</p>}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
