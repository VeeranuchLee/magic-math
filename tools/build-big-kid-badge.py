#!/usr/bin/env python3
"""Compose the "big kids" difficulty badge worn by Carry Add and Borrow Take Away.

    python3 math-app/tools/build-big-kid-badge.py

Writes two PNG masters:

    math-app/assets/space/icons/big-kids.png
    math-app/assets/unicorn/icons/big-kids.png

then run `build-runtime-assets.py` and `build-cache-list.py` as usual.

Sources are individual figures under `shared-art/kid-characters/cut/`, produced
by `cut-sheet.py` from the owner's character sheets.

Why these four children, of the twenty-four available
-----------------------------------------------------
The badge is composited on the `mc-pink` and `mc-magic` cards, which are blue
and deep purple in Space and hot pink and deep purple in Unicorn. A child
dressed in the card's own colour disappears into it, so the figures are chosen
for **contrast against all four** — orange, yellow and white — rather than for
matching the theme. That rules out the obvious picks: the pink girl reads
beautifully on Space and vanishes on Unicorn's pink card.

Each badge is one boy and one girl, per the owner. The lead child is drawn
larger and in front: the boy leads in Space, the girl leads in Unicorn, because
boys can like unicorns but fewer of them do, so the unicorn theme leans girls
without excluding anyone.

Both lead figures stand upright and full height. Age is read off head-to-body
ratio, and that is exactly the cue a jumping or sitting pose destroys — which
matters, because "these are big kids" is the entire message.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CUT = ROOT / "shared-art" / "kid-characters" / "cut"

# The badge renders at 72 CSS px, so 224 covers a 3x screen — the densest phone
# there is — with a little to spare. The cut library keeps the full-resolution
# figures, and the runtime builder never downscales, so a master left at its
# native 433px would ship 52 KB per theme into the offline shell to draw 72
# points. Raise this if the badge is ever wanted larger, then re-run the two
# asset builders.
HEIGHT = 224
SECOND_SCALE = 0.88
OVERLAP = 0.10

BADGES = {
    "space": {
        "lead": ("big-kids-boys", 11),      # orange hoodie, arms folded
        "second": ("big-kids-girls", 12),   # white/pink star top, both arms up
    },
    "unicorn": {
        "lead": ("big-kids-girls", 5),      # yellow star tee, holding a pencil
        "second": ("big-kids-boys", 9),     # white star tee, both arms up
    },
}


def load(sheet, n):
    path = CUT / sheet / f"{sheet}-{n:02d}.png"
    if not path.exists():
        # cut/ is generated and git-ignored, so a fresh clone lands here first.
        raise SystemExit(
            f"missing {path.relative_to(ROOT)}\n"
            "Cut the figures out of the tracked sheets first:\n"
            "    python3 shared-art/kid-characters/cut-sheet.py"
        )
    return Image.open(path).convert("RGBA")


def scaled(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def compose(lead, second):
    """Feet on a shared baseline, lead in front and left, second behind and right."""
    a = scaled(lead, HEIGHT)
    b = scaled(second, round(HEIGHT * SECOND_SCALE))
    overlap = round(min(a.width, b.width) * OVERLAP)
    out = Image.new("RGBA", (a.width + b.width - overlap, HEIGHT), (0, 0, 0, 0))
    out.alpha_composite(b, (a.width - overlap, HEIGHT - b.height))
    out.alpha_composite(a, (0, 0))
    return out.crop(out.getbbox())


if __name__ == "__main__":
    for theme, pick in BADGES.items():
        badge = compose(load(*pick["lead"]), load(*pick["second"]))
        dest = ROOT / "math-app" / "assets" / theme / "icons" / "big-kids.png"
        badge.save(dest)
        print(f"{dest.relative_to(ROOT)}  {badge.size[0]}x{badge.size[1]}")
