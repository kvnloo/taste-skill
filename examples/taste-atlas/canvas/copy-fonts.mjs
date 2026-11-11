// Excalidraw fetches its hand-drawn fonts from EXCALIDRAW_ASSET_PATH; ship them so the canvas works offline / on the tailnet.
import { cpSync, existsSync } from "node:fs";
const src = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
if (!existsSync(src)) { console.error(`copy-fonts: ${src} missing`); process.exit(1); }
cpSync(src, "dist/fonts", { recursive: true });
console.log("copy-fonts: dist/fonts");
