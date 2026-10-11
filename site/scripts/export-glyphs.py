"""Writes public/preview/glyphs.json: the card fonts' glyphs as 1-bit masks, rendered the way the card server draws
them (Pillow's basic layout, fontmode "1"), so the builder preview draws the same pixels. Rerun after a font
change: python scripts/export-glyphs.py (needs Pillow)."""
import json
from pathlib import Path

from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "public" / "preview" / "glyphs.json"
FONTS = {
    "text": ("fonts/Tiny5-Regular.ttf", 8),
    "title": ("fonts/NodestoCapsCondensed-Bold.otf", 30),
    "titleSmall": ("fonts/NodestoCapsCondensed-Bold.otf", 20),
}
CHARS = [chr(c) for c in range(32, 256) if c < 127 or c > 160]


def glyphs(path, size):
    font = ImageFont.truetype(str(ROOT / path), size, layout_engine=ImageFont.Layout.BASIC)
    out = {}
    for ch in CHARS:
        mask, (ox, oy) = font.getmask2(ch, mode="1", anchor="la")
        w, h = mask.size
        bits = "".join("1" if mask.getpixel((x, y)) else "0" for y in range(h) for x in range(w))
        out[ch] = [round(font.getlength(ch, mode="1")), ox, oy, w, h, format(int(bits or "0", 2), "x") if bits else ""]
    return out


OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({k: glyphs(*v) for k, v in FONTS.items()}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"export-glyphs: {OUT.stat().st_size} bytes")
