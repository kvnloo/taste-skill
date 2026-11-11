import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Served by board.mjs at /atlas/canvas/dist/ (the page itself at /s/<id>/canvas).
export default defineConfig({ base: "/atlas/canvas/dist/", plugins: [react()], build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 } });
