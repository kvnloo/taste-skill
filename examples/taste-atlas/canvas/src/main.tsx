import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tldraw, createTLStore, defaultUserStore } from "@tldraw/tldraw";
import { useAtomValue } from "jotai";

interface Board {
  id: string;
  title: string;
  goal: string;
  refs: Array<{
    id: string;
    url: string;
    title: string;
    text: string;
    image: string | null;
    source: string;
  }>;
  notes: Array<{
    id: string;
    who: string;
    text: string;
    t: number;
  }>;
}

function TldrawCanvas({ board, onChange }: { board: Board; onChange: (refs: any[], notes: any[]) => void }) {
  const [store] = useState(() => createTLStore(defaultUserStore()));

  useEffect(() => {
    // Seed the tldraw board from board.json refs and notes
    const shapes: any[] = [];

    // Convert refs to image shapes
    for (const r of board.refs) {
      shapes.push({
        type: "image",
        id: r.id,
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
        width: 200,
        height: 200,
        url: r.image ?? "",
        title: r.title,
        text: r.text ?? "",
      });
    }

    // Convert notes to sticky notes
    for (const n of (board.notes ?? [])) {
      shapes.push({
        type: "note",
        id: n.id ?? randomId(),
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
        text: n.text ?? "",
      });
    }

    store.setShapes(shapes);
  }, [board, store]);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = store.listen(() => {
      const refs: any[] = [];
      const notes: any[] = [];

      for (const shape of store.shapes) {
        if (shape.type === "image") {
          refs.push({
            id: shape.id,
            url: shape.url,
            title: shape.title,
            text: shape.text,
          });
        } else if (shape.type === "note") {
          notes.push({
            id: shape.id,
            text: shape.text,
          });
        }
      }

      onChange(refs, notes);
    });

    return () => unsub();
  }, [store, onChange]);

  return <Tldraw store={store} />;
}

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

function CanvasApp() {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    // Extract board ID from URL: /s/<id>/canvas
    const match = window.location.pathname.match(/^\/s\/([a-z0-9-]{4,40})\/canvas/);
    if (!match) return;
    const boardId = match[1];

    // Fetch initial board data
    async function fetchBoard() {
      const r = await fetch(`./board.json`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      setBoard(data);
    }
    fetchBoard();

    // Connect to SSE for live updates
    const es = new EventSource("./events");
    es.onmessage = () => fetchBoard();
    es.onerror = () => {
      es.close();
      setTimeout(() => {
        const newEs = new EventSource("./events");
        newEs.onmessage = () => fetchBoard();
      }, 2000);
    };

    return () => es.close();
  }, []);

  if (!board) return <div>Loading...</div>;

  return (
    <TldrawCanvas
      board={board}
      onChange={async (refs, notes) => {
        try {
          await fetch(`./canvas`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ refs, notes }),
          });
        } catch (e) {
          console.error("Failed to persist canvas changes:", e);
        }
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<CanvasApp />);