"""Green-screen video frames -> a seamless transparent animated WebP + a resting still.

There is no ffmpeg on this machine; frames arrive from a small Swift AVFoundation dumper
and everything from here is PIL/numpy.

Three decisions worth knowing:
  * ONE union bounding box for every frame. The head tilts and drifts, so per-frame
    cropping would make it jitter inside its 104px slot.
  * The loop range is CHOSEN, not assumed: every start/end pair is scored on how alike
    the two end frames look, and the best pair wins. A talking clip has no natural loop.
  * The remaining seam is then CROSS-FADED away over the last few frames rather than
    ping-ponged. Ping-pong is seamless for free but doubles the frames, and this is a
    104px decoration that ships inside an offline cache.
"""
import numpy as np, glob, sys, os
from PIL import Image

src, out_stem, target_px = sys.argv[1], sys.argv[2], int(sys.argv[3])
FPS_IN, FPS_OUT = 24, 12
STEP = FPS_IN // FPS_OUT
FADE = 3                      # output frames spent closing the seam

files = sorted(glob.glob(os.path.join(src, 'f*.png')))
assert files, src

def key(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    greenness = G - np.maximum(R, B)
    bg = greenness > 90
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    spill = (~bg) & (greenness > 18)
    out = a.copy()
    out[..., 1] = np.where(spill, np.maximum(R, B) + 8, G)
    return np.dstack([out.astype(np.uint8), alpha])

frames = [key(p) for p in files]

union = None
for f in frames:
    ys, xs = np.where(f[..., 3] > 8)
    b = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    union = b if union is None else (min(union[0], b[0]), min(union[1], b[1]),
                                     max(union[2], b[2]), max(union[3], b[3]))
x0, y0, x1, y1 = union
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
half = max(x1 - x0, y1 - y0) // 2 + 4
H, W = frames[0].shape[:2]
x0, x1 = max(0, cx - half), min(W, cx + half)
y0, y1 = max(0, cy - half), min(H, cy + half)

def prep(f):
    return Image.fromarray(f[y0:y1, x0:x1]).resize((target_px, target_px), Image.LANCZOS)

prepped = [prep(f) for f in frames]
arrs = [np.asarray(p).astype(np.float64) for p in prepped]

def diff(i, j):
    a, b = arrs[i], arrs[j]
    m = (a[..., 3] > 8) | (b[..., 3] > 8)
    if not m.any():
        return 1e9
    return float(np.abs(a[..., :3] - b[..., :3]).mean(axis=2)[m].mean())

best = None
MIN_LEN = FPS_IN                      # at least a second of movement

# SCORE THE PAIR THAT ACTUALLY WRAPS, WHICH IS NOT (s, e). The output keeps every STEP-th
# frame of range(s, e), so frame `e` is never rendered at all -- the frame the loop wraps
# FROM is the last multiple of STEP below it. Scoring (s, e) optimises a join the child
# never sees, and at 24 fps in, one frame of a talking mouth is most of the way between
# closed and open, so the two are nowhere near interchangeable. Measured on the ABC head:
# the winning pair scored 15.4 while the frames that actually abutted differed by 44.4,
# and the cross-fade below was left hiding three times the seam it reported.
def wrap_frame(s, e):
    return e - 1 - ((e - 1 - s) % STEP)

for s in range(0, len(frames) - MIN_LEN):
    for e in range(s + MIN_LEN, min(len(frames), s + 4 * FPS_IN)):
        d = diff(s, wrap_frame(s, e))
        if best is None or d < best[0]:
            best = (d, s, e)
raw_seam, s, e = best

idx = list(range(s, e, STEP))
seq = [arrs[i].copy() for i in idx]

# Close the loop: the last FADE frames walk toward the first, so the wrap is a dissolve
# instead of a cut. Alpha is blended with them or the outline would pop.
first = seq[0]
n = min(FADE, len(seq) - 1)
for k in range(n):
    i = len(seq) - n + k
    w = (k + 1) / (n + 1)
    seq[i] = seq[i] * (1 - w) + first * w

out = [Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)) for a in seq]

def seam_of(x, y):
    m = (x[..., 3] > 8) | (y[..., 3] > 8)
    return float(np.abs(x[..., :3] - y[..., :3]).mean(axis=2)[m].mean())

# A resting face for the idle state: the frame of the loop closest to the loop's average,
# i.e. the least mid-word one. It comes from the SAME clip as the animation so the still
# and the talking robot are the same robot in the same light.
mean = np.mean([arrs[i] for i in range(s, e)], axis=0)
def to_mean(i):
    a = arrs[i]; m = a[..., 3] > 8
    return float(np.abs(a[..., :3] - mean[..., :3]).mean(axis=2)[m].mean())
idle = min(range(s, e), key=to_mean)

prepped[idle].save(out_stem + '-still.png')
out[0].save(out_stem + '.webp', save_all=True, append_images=out[1:],
            duration=int(1000 / FPS_OUT), loop=0, quality=80, method=6)

print(f"{os.path.basename(out_stem):14} range f{s:03d}-f{e:03d} ({(e-s)/FPS_IN:.2f}s) "
      f"{len(out)} frames @{FPS_OUT}fps  seam {raw_seam:.1f} -> {seam_of(seq[-1],seq[0]):.1f}  "
      f"idle=f{idle:03d}  webp={os.path.getsize(out_stem+'.webp')//1024}KB "
      f"still={os.path.getsize(out_stem+'-still.png')//1024}KB")
