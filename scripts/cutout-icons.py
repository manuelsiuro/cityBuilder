#!/usr/bin/env python3
"""Flood-fill the magenta background of generated tool icons to transparent.

The FLUX icon batch is rendered on a flat magenta field (and casts a soft
magenta-tinted shadow). We flood-fill inward from the four corners, clearing
pixels whose hue is magenta — red and blue both above green. The thick black
glyph outline stops the fill, so interior colours are preserved even when a
glossy highlight picks up a pink tint.

Usage: python3 scripts/cutout-icons.py public/assets/icons/*.png
"""
import sys
from collections import deque
from PIL import Image

MARGIN = 12   # how far above green red & blue must sit to count as background


def is_magenta(c):
    r, g, b, _ = c
    return r > g + MARGIN and b > g + MARGIN


def cutout(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()

    cleared = [[False] * w for _ in range(h)]
    q = deque((cx, cy) for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or cleared[y][x]:
            continue
        if not is_magenta(px[x, y]):
            continue
        cleared[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for y in range(h):
        for x in range(w):
            if cleared[y][x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    img.save(path)
    print(f"cut {path}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        cutout(p)
