#!/usr/bin/env python3
"""gen-assets.py — generate static brand assets for the packet reference site.

Outputs (into website/assets/):
  og-image.png      1200x630 Open Graph / Twitter card banner
  icon-192.png      192x192 blocky cube app icon
  icon-512.png      512x512 blocky cube app icon
  site.webmanifest  PWA-lite manifest (icons, theme color)

Deterministic: same input, same bytes. Run after changing branding text.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets")
os.makedirs(OUT, exist_ok=True)

BG = (10, 10, 10)
ACCENT = (249, 115, 22)      # --orange
TEXT = (237, 237, 237)       # --text-primary
MUTED = (102, 102, 102)      # --text-muted
GREEN = (34, 197, 94)

FONT_DIR = "/usr/share/fonts/TTF"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def draw_cube(d, cx, cy, size, shift=0):
    """Isometric blocky cube (top/left/right faces)."""
    s = size
    top = [(cx, cy - s * 0.62), (cx + s * 0.54, cy - s * 0.31),
           (cx, cy), (cx - s * 0.54, cy - s * 0.31)]
    left = [(cx - s * 0.54, cy - s * 0.31), (cx, cy),
            (cx, cy + s * 0.54), (cx - s * 0.54, cy + s * 0.23)]
    right = [(cx, cy), (cx + s * 0.54, cy - s * 0.31),
             (cx + s * 0.54, cy + s * 0.23), (cx, cy + s * 0.54)]
    d.polygon(top, fill=(189, 92, 24))      # light orange top
    d.polygon(left, fill=ACCENT)            # mid orange left
    d.polygon(right, fill=(180, 82, 16))    # dark orange right
    return shift


def og_image():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # subtle pixel grid on the right half
    for gx in range(38):
        for gy in range(20):
            x0, y0 = 640 + gx * 14, 40 + gy * 14
            if (gx + gy) % 3 == 0:
                d.rectangle([x0, y0, x0 + 2, y0 + 2], fill=(26, 26, 26))

    # accent bar
    d.rectangle([0, 0, 12, H], fill=ACCENT)

    # cubes
    draw_cube(d, 250, 180, 130)
    draw_cube(d, 900, 480, 170)

    f_title = font("DejaVuSans-Bold.ttf", 92)
    f_sub = font("DejaVuSans-Bold.ttf", 40)
    f_small = font("DejaVuSans.ttf", 30)
    f_mono = font("DejaVuSansMono-Bold.ttf", 26)

    d.text((64, 120), "MC 1.8.9", font=f_title, fill=TEXT)
    d.text((64, 250), "PACKET REFERENCE", font=f_title, fill=ACCENT)

    # auto-fit the subtitle so it never clips at the right edge
    subtitle = "105 packets  \u00b7  fields  \u00b7  wire encoding  \u00b7  MCP references"
    size = 40
    while size > 18 and d.textlength(subtitle, font=font("DejaVuSans-Bold.ttf", size)) > 1200 - 128:
        size -= 2
    d.text((64, 400), subtitle, font=font("DejaVuSans-Bold.ttf", size), fill=TEXT)
    d.text((64, 470), "implementation cases from 8 real client codebases",
           font=f_small, fill=(160, 160, 160))
    d.text((64, 560), "realcrystalnight.github.io/mc-packet-reference", font=f_mono, fill=GREEN)

    img.save(os.path.join(OUT, "og-image.png"))
    print("og-image.png 1200x630")


def icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # rounded dark tile
    r = size // 8
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    # centered cube
    s = size * 0.30
    cx, cy = size / 2, size / 2 + size * 0.04
    top = [(cx, cy - s * 0.62), (cx + s * 0.54, cy - s * 0.31),
           (cx, cy), (cx - s * 0.54, cy - s * 0.31)]
    left = [(cx - s * 0.54, cy - s * 0.31), (cx, cy),
            (cx, cy + s * 0.54), (cx - s * 0.54, cy + s * 0.23)]
    right = [(cx, cy), (cx + s * 0.54, cy - s * 0.31),
             (cx + s * 0.54, cy + s * 0.23), (cx, cy + s * 0.54)]
    d.polygon(top, fill=(189, 92, 24))
    d.polygon(left, fill=ACCENT)
    d.polygon(right, fill=(180, 82, 16))
    img.save(os.path.join(OUT, "icon-%d.png" % size))
    print("icon-%d.png" % size)


def manifest():
    data = {
        "name": "Minecraft 1.8.9 Packet Reference",
        "short_name": "MC 1.8.9 Packets",
        "description": "Complete reference for all 105 Minecraft 1.8.9 network packets with fields, wire encoding, MCP references, and real client implementation cases.",
        "start_url": "/mc-packet-reference/",
        "scope": "/mc-packet-reference/",
        "display": "standalone",
        "background_color": "#0a0a0a",
        "theme_color": "#0a0a0a",
        "icons": [
            {"src": "/mc-packet-reference/assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/mc-packet-reference/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"}
        ]
    }
    with open(os.path.join(OUT, "site.webmanifest"), "w") as f:
        json.dump(data, f, indent=2)
    print("site.webmanifest")


if __name__ == "__main__":
    og_image()
    icon(192)
    icon(512)
    manifest()
    print("done ->", OUT)
