"""Mid level of the atlas's deep zoom: data/sprite160.jpg, the same tile order as data/sprite.json at 160px.

The canvas draws each tile from the cheapest picture that is still sharp at its on-screen size:
64px sprite -> 160px sprite -> 480px thumb -> <=1600px still -> original. Without the 160 tier a tile between
64 and 480 device pixels was either blurry (sprite) or one of hundreds of 480px decodes (thumbs).
Usage: python3 scripts/sprite.py [data_dir]
reuse-checked: sprite.json/sprite.jpg came from an ad-hoc build with no script in the repo; this reads that order.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageOps

D = Path(sys.argv[1] if len(sys.argv) > 1 else "data")
m = json.loads((D / "sprite.json").read_text())
thumb = {b["id"]: b.get("thumb") for b in json.loads((D / "bookmarks.atlas.json").read_text())["items"]}
S, cols, ids = 160, m["cols"], m["ids"]
sheet = Image.new("RGB", (cols * S, -(-len(ids) // cols) * S), (40, 40, 40))
miss = 0
for i, pid in enumerate(ids):
    p = thumb.get(pid) and D / thumb[pid]
    if not p or not p.exists():
        miss += 1; continue
    sheet.paste(ImageOps.fit(Image.open(p).convert("RGB"), (S, S)), ((i % cols) * S, (i // cols) * S))
sheet.save(D / "sprite160.jpg", quality=82, optimize=True)
(D / "sprite160.json").write_text(json.dumps({"size": S, "cols": cols, "of": "sprite.json"}))
print(f"sprite160 {sheet.size} {len(ids)} tiles, {miss} missing")
