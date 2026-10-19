# /// script
# dependencies = ["pillow"]
# ///
"""Draws every card the site shows once, from a running questlog server, and saves it as a WebP file in
site/public/cards/, so the site ships its own copies and never asks the card server for a drawing.

The cards are the ones the built pages point at (static/*.html) plus the builder's thumbnails
(static/snapshots.json). After an art or rendering change:

    cd site && npm run build                                  # pages that point at the copies
    uv run scripts/snap_cards.py http://127.0.0.1:8080        # a local server of the same build
    npm run build                                             # embed the new copies

Animated cards stay animated (lossless WebP). Copies nothing points at any more are deleted, and
components/snapped.json gets a new version so browsers and Cloudflare fetch the new files.
"""
import hashlib
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageSequence

SITE = Path(__file__).resolve().parents[1]
STATIC = SITE.parent / "static"
OUT = SITE / "public" / "cards"
REF = re.compile(r"/static/cards/([^\"'?\s]+)\.webp")


def url_of(name: str) -> str:
    """cards/stats.user=x,scene=y.webp is /stats?user=x&scene=y: the reverse of snap() in components/data.ts, where
    a character a file name can't hold is ~ and its hex bytes."""
    path, _, query = name.partition(".")
    unsafe = lambda part: re.sub(r"(?:~[0-9A-F]{2})+", lambda m: bytes.fromhex(m.group(0).replace("~", "")).decode(), part)
    return "/" + path.replace("_", "/", 1) + ("?" + "&".join(unsafe(p) for p in query.split(",")) if query else "")


def name_of(url: str) -> str:
    path, _, query = url[1:].partition("?")
    safe = lambda part: re.sub(r"[^A-Za-z0-9=._-]", lambda m: "".join(f"~{b:02X}" for b in m.group(0).encode()), part)
    return path.replace("/", "_", 1) + ("." + ",".join(safe(p) for p in query.split("&")) if query else "")


def wanted() -> set[str]:
    names = set()
    for page in STATIC.glob("*.html"):
        names.update(REF.findall(page.read_text(encoding="utf-8").replace("&amp;", "&")))
    names.update(name_of(u) for u in json.loads((STATIC / "snapshots.json").read_text(encoding="utf-8")))
    return names


def fetch(base: str, url: str) -> bytes:
    kind = ""
    for _ in range(8):
        with urllib.request.urlopen(base + url, timeout=60) as r:
            kind, body = r.headers.get("x-questlog", "card"), r.read()
        # the wiki's message cards are examples of the busy and other messages, so their kind is the point
        if kind == "card" or url.startswith("/demo/message"):
            return body
        time.sleep(15 if kind == "busy" else 5)  # busy: the per-minute budget; placeholder: stats still coming
    raise RuntimeError(f"{url}: the server kept answering {kind}")


def webp(png: bytes) -> bytes:
    im = Image.open(io.BytesIO(png))
    frames = [f.convert("RGB") for f in ImageSequence.Iterator(im)]
    out = io.BytesIO()
    if len(frames) > 1:
        ms = im.info.get("duration", 180)
        frames[0].save(out, "WEBP", save_all=True, append_images=frames[1:], duration=ms, loop=0, lossless=True, method=6)
    else:
        frames[0].save(out, "WEBP", lossless=True, method=6)
    return out.getvalue()


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
    names = sorted(wanted())
    OUT.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1()
    for i, name in enumerate(names, 1):
        data = webp(fetch(base, url_of(name)))
        (OUT / f"{name}.webp").write_bytes(data)
        digest.update(name.encode() + data)
        print(f"{i}/{len(names)} {name}.webp {len(data) // 1024} KB", flush=True)
        time.sleep(0.3)  # stays under the server's per-IP budget of 240 drawings a minute
    for old in OUT.glob("*.webp"):
        if old.stem not in names:
            old.unlink()
    (SITE / "components" / "snapped.json").write_text(json.dumps({"version": digest.hexdigest()[:10]}) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"{len(names)} cards, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
