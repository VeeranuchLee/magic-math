#!/usr/bin/env python3
"""Build the installed-app icons for the math app.

No new artwork is invented here: the icons composite an existing, owner-approved
sprite (`assets/space/icons/rocket.png`) onto the deep-space navy the game menu
already uses, so the home-screen icon matches the app it opens.

Written against the standard library only — this machine has no imaging library,
and depending on one would make the icons unreproducible for the next agent.
PNG decode/encode is done directly: zlib plus the five scanline filters.

Output is deterministic, so re-running produces byte-identical files and a clean
`git status`.

    python tools/build-icons.py

Regenerate whenever the source sprite or the palette changes; commit the result.
"""

from __future__ import annotations

import pathlib
import struct
import zlib

HERE = pathlib.Path(__file__).resolve().parent.parent
SOURCE = HERE / "assets" / "space" / "icons" / "rocket.png"
OUT_DIR = HERE / "assets" / "icons"

# The menu's own palette (see index.html): deep navy with a blue lift.
GRADIENT = ((27, 42, 107), (10, 14, 45), (19, 26, 74))
GLOW = (120, 170, 255)


def read_png_rgba(path: pathlib.Path) -> tuple[int, int, bytearray]:
    """Decode an 8-bit RGBA PNG into a flat RGBA buffer."""
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    width, height, depth, color = struct.unpack(">IIBB", raw[16:26])
    if (depth, color) != (8, 6):
        raise ValueError(f"{path}: expected 8-bit RGBA, got depth={depth} color={color}")

    idat = bytearray()
    i = 8
    while i < len(raw):
        length = struct.unpack(">I", raw[i : i + 4])[0]
        kind = raw[i + 4 : i + 8]
        if kind == b"IDAT":
            idat += raw[i + 8 : i + 8 + length]
        i += 12 + length

    data = zlib.decompress(bytes(idat))
    stride = width * 4
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        filt = data[pos]
        pos += 1
        line = bytearray(data[pos : pos + stride])
        pos += stride
        if filt == 1:  # Sub
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 0xFF
        elif filt == 2:  # Up
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif filt == 3:  # Average
            for x in range(stride):
                left = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif filt == 4:  # Paeth
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                b = prev[x]
                c = prev[x - 4] if x >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 0xFF
        elif filt != 0:
            raise ValueError(f"unknown PNG filter {filt}")
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return width, height, out


def write_png_rgba(path: pathlib.Path, width: int, height: int, buf: bytearray) -> int:
    """Encode a flat RGBA buffer as a PNG (filter 0, max compression)."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += buf[y * stride : (y + 1) * stride]

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    return len(png)


def sample_bilinear(src: bytearray, sw: int, sh: int, u: float, v: float) -> tuple[int, ...]:
    """Bilinear sample of an RGBA buffer at normalised (u, v)."""
    x = min(max(u * (sw - 1), 0.0), sw - 1.0)
    y = min(max(v * (sh - 1), 0.0), sh - 1.0)
    x0, y0 = int(x), int(y)
    x1, y1 = min(x0 + 1, sw - 1), min(y0 + 1, sh - 1)
    fx, fy = x - x0, y - y0
    out = []
    for c in range(4):
        p00 = src[(y0 * sw + x0) * 4 + c]
        p10 = src[(y0 * sw + x1) * 4 + c]
        p01 = src[(y1 * sw + x0) * 4 + c]
        p11 = src[(y1 * sw + x1) * 4 + c]
        top = p00 + (p10 - p00) * fx
        bot = p01 + (p11 - p01) * fx
        out.append(int(top + (bot - top) * fy + 0.5))
    return tuple(out)


def build(size: int, maskable: bool) -> bytearray:
    canvas = bytearray(size * size * 4)

    # Diagonal gradient background.
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            if t < 0.55:
                k = t / 0.55
                a, b = GRADIENT[0], GRADIENT[1]
            else:
                k = (t - 0.55) / 0.45
                a, b = GRADIENT[1], GRADIENT[2]
            i = (y * size + x) * 4
            canvas[i + 0] = int(a[0] + (b[0] - a[0]) * k)
            canvas[i + 1] = int(a[1] + (b[1] - a[1]) * k)
            canvas[i + 2] = int(a[2] + (b[2] - a[2]) * k)
            canvas[i + 3] = 255

    # Deterministic stars — a fixed LCG, so the output never changes between runs.
    seed = 7
    def rnd() -> float:
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        return seed / 0x7FFFFFFF

    for _ in range(size // 6):
        cx, cy = rnd() * size, rnd() * size
        radius = size * (0.004 + rnd() * 0.006)
        alpha = 0.35 + rnd() * 0.5
        r0 = int(radius) + 1
        for y in range(max(0, int(cy) - r0), min(size, int(cy) + r0 + 1)):
            for x in range(max(0, int(cx) - r0), min(size, int(cx) + r0 + 1)):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d <= radius:
                    a = alpha * (1 - d / radius)
                    i = (y * size + x) * 4
                    for c in range(3):
                        canvas[i + c] = int(canvas[i + c] * (1 - a) + 255 * a)

    # The sprite. A maskable icon must survive being cropped to a circle, so it
    # sits inside the 80% safe zone and is drawn smaller than the plain icon.
    sw, sh, sprite = read_png_rgba(SOURCE)
    frac = 0.52 if maskable else 0.70
    dw = size * frac
    dh = dw * (sh / sw)
    ox, oy = (size - dw) / 2, (size - dh) / 2
    for y in range(int(oy), int(oy + dh) + 1):
        if not 0 <= y < size:
            continue
        for x in range(int(ox), int(ox + dw) + 1):
            if not 0 <= x < size:
                continue
            u, v = (x - ox) / dw, (y - oy) / dh
            if not (0 <= u <= 1 and 0 <= v <= 1):
                continue
            r, g, b, a = sample_bilinear(sprite, sw, sh, u, v)
            if a == 0:
                continue
            af = a / 255
            i = (y * size + x) * 4
            canvas[i + 0] = int(canvas[i + 0] * (1 - af) + r * af)
            canvas[i + 1] = int(canvas[i + 1] * (1 - af) + g * af)
            canvas[i + 2] = int(canvas[i + 2] * (1 - af) + b * af)
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in (
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True),
    ):
        written = write_png_rgba(OUT_DIR / name, size, size, build(size, maskable))
        print(f"  {written / 1024:7.1f} KB  assets/icons/{name}")


if __name__ == "__main__":
    main()
