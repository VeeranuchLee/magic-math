#!/usr/bin/env python3
"""Generate the runtime image tree for math-app: assets/*.png -> assets-runtime/*.webp

Why this exists: the games shipped their lossless masters as runtime art. Space
Math referenced 15.76 MB of images and pulled 14.13 MB of it -- all eight journey
backgrounds -- on mount. The art is painterly, so PNG was the wrong container for
it: bg-saturn.png is 1672x941 at 2,024 KB, and the identical pixels as WebP q82
are 130 KB.

Design decisions worth knowing before you change anything here:

  * Masters are READ-ONLY. `math-app/assets/` is a protected directory_prefix.
    Everything this script writes goes to the parallel `assets-runtime/` tree, so
    a bad run can never damage a source file -- delete the output tree and re-run.

  * NO RESIZING, unlike solar-storybook's version of this script. Those pages
    painted 1254px masters into boxes a few dozen pixels wide, so downscaling was
    most of the win. Here the backgrounds are `background-size: cover` and are
    already being scaled UP on a portrait phone: a 1672x941 landscape master
    covering a 375x812 viewport renders at 1443x812 CSS px, about 1.7x at dpr 2.
    Cutting their resolution would be a visible regression. The format alone is
    worth 94%, so this takes that and stops.

  * Two qualities, split by what the image IS, not where it lives. Backgrounds are
    photographic and sit behind a dark tint, so q82 is invisible. Icons and
    character cutouts are flat-shaded with hard alpha edges, where WebP's chroma
    handling shows first, so they get q90 -- still ~88% off, and the whole icon
    set is small enough that the extra bytes are noise.

  * App icons under assets/icons/ are SKIPPED. They are referenced by
    manifest.webmanifest and apple-touch-icon, where PNG is the compatible
    choice, and all three together are 352 KB.

  * Deterministic: same inputs produce byte-identical outputs, so a re-run leaves
    a clean `git status` and the tree can be trusted as generated rather than
    curated. Re-run it after changing any art, then re-run build-cache-list.py.
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed.  python3 -m pip install --user pillow")

HERE = Path(__file__).resolve().parent
APP = HERE.parent
SRC_ROOT = APP / "assets"
OUT_ROOT = APP / "assets-runtime"

# Referenced by the manifest and apple-touch-icon, where PNG is the safe choice.
SKIP_DIRS = {"icons"}          # only at assets/<this>, i.e. assets/icons/
PHOTOGRAPHIC_QUALITY = 82      # backgrounds: painterly, behind a tint
CUTOUT_QUALITY = 90            # icons and characters: flat colour, hard alpha edges


def is_photographic(rel: Path) -> bool:
    """Backgrounds are the full-bleed art; everything else is a cutout."""
    return rel.name.startswith("bg-")


def main() -> int:
    if not SRC_ROOT.is_dir():
        sys.exit(f"no master tree at {SRC_ROOT}")

    sources = []
    for png in sorted(SRC_ROOT.rglob("*.png")):
        rel = png.relative_to(SRC_ROOT)
        # assets/icons/* are the installed-app icons: leave them as PNG.
        if rel.parts[0] in SKIP_DIRS:
            continue
        sources.append((png, rel))

    src_bytes = out_bytes = 0
    written = 0
    for png, rel in sources:
        out = (OUT_ROOT / rel).with_suffix(".webp")
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(png) as im:
            # Preserve alpha where it exists; a cutout without it is a black box.
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            quality = PHOTOGRAPHIC_QUALITY if is_photographic(rel) else CUTOUT_QUALITY
            im.save(out, "WEBP", quality=quality, method=6)
        src_bytes += png.stat().st_size
        out_bytes += out.stat().st_size
        written += 1

    # A master that was deleted must not leave a stale runtime file behind, or the
    # cache list will happily keep shipping art the app no longer references.
    expected = {(OUT_ROOT / rel).with_suffix(".webp") for _, rel in sources}
    for stale in sorted(OUT_ROOT.rglob("*.webp")):
        if stale not in expected:
            stale.unlink()
            print(f"  removed stale {stale.relative_to(APP)}")

    pct = 100 - (out_bytes / src_bytes * 100) if src_bytes else 0
    print(f"  {written} images  {src_bytes/1048576:.2f} MB -> {out_bytes/1048576:.2f} MB "
          f"({pct:.0f}% smaller)  -> {OUT_ROOT.relative_to(APP)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
