"""Generate the home-screen / browser icons from the app's own palette.

    python3 scripts/make-app-icon.py

Writes src/app/icon.png (192), src/app/apple-icon.png (180) and
public/icon-512.png. Re-run after changing the palette below.

Drawn rather than hand-exported so the icons stay in step with globals.css.
Everything is rendered at 4x and downsampled, which is what gives the flag
edges and the ball their antialiasing — PIL does not antialias primitives.

No rounded corners on purpose: iOS applies its own squircle mask, and a
pre-rounded source would show a dark halo inside the mask.
"""
from PIL import Image, ImageDraw

BG_TOP = (17, 48, 31)     # --bg lifted, matching the body radial-gradient
BG_BOTTOM = (10, 31, 20)  # --bg  #0a1f14
GOLD = (217, 178, 90)     # --gold #d9b25a
GOLD_DIM = (154, 131, 72) # --gold-dim
INK = (234, 242, 236)     # --ink #eaf2ec
LINE = (29, 70, 49)       # --line #1d4631

S = 4096  # 4x supersample of the 1024 master


def build():
    img = Image.new("RGB", (S, S), BG_BOTTOM)
    d = ImageDraw.Draw(img)

    # Vertical gradient standing in for the app's radial background.
    for y in range(S):
        t = (y / S) ** 0.7
        d.line(
            [(0, y), (S, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)),
        )

    # The green: a wide shallow arc, so the flag has something to stand on.
    d.ellipse([-S * 0.30, S * 0.70, S * 1.30, S * 1.55], fill=LINE)

    cx, ground = S * 0.46, S * 0.775

    # Hole — an ellipse on the arc, darker than the green it sits in.
    d.ellipse(
        [cx - S * 0.075, ground - S * 0.022, cx + S * 0.075, ground + S * 0.022],
        fill=(7, 22, 14),
    )

    # Flagstick, tapering very slightly so it reads as a pole not a bar.
    top = S * 0.175
    d.polygon(
        [
            (cx - S * 0.0115, ground),
            (cx + S * 0.0115, ground),
            (cx + S * 0.0085, top),
            (cx - S * 0.0085, top),
        ],
        fill=INK,
    )

    # Pennant, with a shaded lower half to give it a fold.
    fly, drop = S * 0.30, S * 0.135
    d.polygon([(cx, top), (cx + fly, top + drop * 0.52), (cx, top + drop)], fill=GOLD)
    d.polygon(
        [(cx, top + drop * 0.52), (cx + fly, top + drop * 0.52), (cx, top + drop)],
        fill=GOLD_DIM,
    )

    # Ball, sitting just off the hole.
    bx, by, r = cx - S * 0.175, ground - S * 0.045, S * 0.062
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=INK)
    d.ellipse(
        [bx - r * 0.30, by - r * 0.52, bx + r * 0.44, by + r * 0.10],
        fill=(255, 255, 255),
    )

    return img


def main():
    master = build().resize((1024, 1024), Image.LANCZOS)
    for path, size in [
        ("src/app/icon.png", 192),
        ("src/app/apple-icon.png", 180),
        ("public/icon-512.png", 512),
    ]:
        master.resize((size, size), Image.LANCZOS).save(path)
        print(f"wrote {path} ({size}x{size})")
    # Kept for eyeballing the artwork at full size; not shipped in any tag.
    master.save("public/icon-1024.png")


if __name__ == "__main__":
    main()
