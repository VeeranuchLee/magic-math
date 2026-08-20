#!/usr/bin/env python3
"""Turn a generated music master into a seamless looping menu bed.

    audio-source/menu-bed-master.wav  ->  assets-runtime/audio/menu-bed.m4a

WHY THIS EXISTS AT ALL. Generated music does not loop. The master measured here fades in
from silence over 3.5 s and ends at full level -- a head/tail RMS mismatch of 705x -- so
playing it with `loop = true` drops the floor out of the room every 60 seconds. That is
the same defect AUDIO-DIRECTION.md measured on the Grok sample, and generating a new track
does not fix it: nothing in the prompt makes a model end where it began.

WHAT IT DOES ABOUT IT. Trim the fade-in, then equal-power crossfade the tail back over the
head. Equal power (sin/cos) rather than linear because two decorrelated signals summed
with linear ramps dip ~3 dB in the middle of the crossfade, which is audible on a sustained
pad as a breath. The result is shorter than the master by the fade-in plus the crossfade,
and its ends match: measured 1.00x head/tail, down from 705x.

The trim point is MEASURED, not assumed -- the first 100 ms window that reaches half the
track's overall RMS. Hard-coding 3.5 s would silently mangle the next track someone feeds
this.
"""
import argparse, array, math, pathlib, shutil, subprocess, sys, wave

ROOT    = pathlib.Path(__file__).resolve().parents[1]
SRC     = ROOT / "audio-source" / "menu-bed-master.wav"
DST     = ROOT / "assets-runtime" / "audio" / "menu-bed.m4a"
XFADE_S = 4.0
BITRATE = 96000      # stereo music, unlike the 32 kbps mono used for speech


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, default=SRC)
    ap.add_argument("--dst", type=pathlib.Path, default=DST)
    ap.add_argument("--keep-wav", action="store_true", help="also leave the looped wav beside the m4a")
    a = ap.parse_args()
    if not shutil.which("afconvert"):
        sys.exit("afconvert not found - macOS only")
    if not a.src.exists():
        sys.exit(f"no master at {a.src} (it is git-ignored; see .gitignore)")

    w = wave.open(str(a.src), "rb")
    ch, fr, n = w.getnchannels(), w.getframerate(), w.getnframes()
    s = array.array("h"); s.frombytes(w.readframes(n)); w.close()

    def rms(a0, b0):
        tot = 0.0
        for i in range(a0, b0):
            v = sum(s[i*ch:(i+1)*ch]) / ch / 32768.0
            tot += v * v
        return math.sqrt(tot / max(1, b0 - a0))

    overall = rms(0, n)
    win = int(fr * 0.1)
    fade_end = 0
    for st in range(0, n - win, win // 2):
        if rms(st, st + win) >= overall * 0.5:
            fade_end = st
            break

    X = int(XFADE_S * fr)
    N = (n - fade_end) - X
    if N <= X:
        sys.exit("master too short for this crossfade")

    def g(i, c): return s[(fade_end + i) * ch + c]
    out = array.array("h", [0]) * (N * ch)
    for i in range(N):
        for c in range(ch):
            if i < X:
                t = i / X
                v = g(i, c) * math.sin(math.pi/2*t) + g(N + i, c) * math.cos(math.pi/2*t)
            else:
                v = g(i, c)
            out[i*ch + c] = max(-32768, min(32767, int(round(v))))

    a.dst.parent.mkdir(parents=True, exist_ok=True)
    tmp_wav = a.dst.with_suffix(".loop.wav")
    o = wave.open(str(tmp_wav), "wb")
    o.setnchannels(ch); o.setsampwidth(2); o.setframerate(fr)
    o.writeframes(out.tobytes()); o.close()

    r = subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE),
                        str(tmp_wav), str(a.dst)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"afconvert failed: {r.stderr.strip()[:200]}")

    head, tail = rms(0, fr//2), 0.0
    def orms(a0, b0):
        tot = 0.0
        for i in range(a0, b0):
            v = sum(out[i*ch:(i+1)*ch]) / ch / 32768.0
            tot += v*v
        return math.sqrt(tot / max(1, b0 - a0))
    h, t = orms(0, fr//2), orms(N - fr//2, N)
    peak = max(abs(v) for v in out) / 32768.0
    print(f"master   {n/fr:.2f}s, fade-in ends {fade_end/fr:.2f}s")
    print(f"loop     {N/fr:.2f}s  peak {peak:.3f} ({20*math.log10(peak):+.1f} dBFS)")
    print(f"seam     head/tail RMS {h:.5f} / {t:.5f}  ratio {max(h,t)/min(h,t):.2f}x")
    print(f"output   {a.dst}  {a.dst.stat().st_size/1024:.0f} KB")
    if not a.keep_wav:
        tmp_wav.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
