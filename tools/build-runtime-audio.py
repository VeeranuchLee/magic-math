#!/usr/bin/env python3
"""Encode rendered narration into the runtime audio tree.

    narration/rendered/<set>/*.mp3  ->  assets-runtime/narration/<set>/*.m4a

The audio sibling of build-runtime-assets.py, and it follows the same rule: the
rendered mp3s are the masters, everything here writes only into assets-runtime, and a
bad run is fixed by deleting the output tree and re-running.

WHY .m4a AND NOT THE MP3 WE ALREADY HAVE. AUDIO-DIRECTION.md decision 5: AAC in an
.m4a plays in Safari on iOS, which is the 9.7" iPad the children actually use. The mp3
would also play, but it is the API's delivery format at 128 kbps stereo-capable -- three
times the size for speech we are going to hear through an iPad speaker.

WHY 24 kHz MONO AT 32 kbps, AND NOT LOWER. 24 kbps was measured and is 25% smaller, and
it was still rejected. The entire value of this voice is that "thirteen" cannot be heard
as "thirty" -- and what separates that pair is the final consonant, which is exactly the
high-frequency detail a codec throws away first. Compressing hard to save 1.5 MB on the
one thing the render exists to get right is a bad trade. 24 kHz sampling leaves 12 kHz of
bandwidth, which is comfortably enough for /t/, /n/ and /th/.

WHY NOTHING IS ADDED TO cache-list.js. The service worker's fetch handler is cache-first
for every same-origin GET and stores whatever it successfully fetches, so these files
join tier 3 -- "cached as it is used" -- with no change at all. Precaching 959 clips
would add megabytes to the install for a child who may only ever play the 3 times table.
Do still bump CACHE_NAME on publish: cache-first means a device already holding an old
clip keeps it until the cache name changes.
"""
import argparse, json, pathlib, shutil, subprocess, sys

ROOT     = pathlib.Path(__file__).resolve().parents[1]
SRCROOT  = ROOT / "narration" / "rendered"
DSTROOT  = ROOT / "assets-runtime" / "narration"
RATE     = 24000     # Hz
BITRATE  = 32000     # bps, mono
MIN_OUT  = 500       # bytes; below this the encode produced nothing usable


def encode(src: pathlib.Path, dst: pathlib.Path) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".m4a.tmp")
    r = subprocess.run(
        ["afconvert", "-f", "m4af", "-d", f"aac@{RATE}", "-c", "1", "-b", str(BITRATE),
         str(src), str(tmp)],
        capture_output=True, text=True)
    if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < MIN_OUT:
        tmp.unlink(missing_ok=True)
        print(f"  FAIL {src.name}: {(r.stderr or 'output too small').strip()[:120]}")
        return False
    # Rename only once the encode is known good, so an interrupted run never leaves a
    # truncated .m4a that the next run would treat as up to date.
    tmp.replace(dst)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="times-tables", help="subdirectory of narration/rendered")
    ap.add_argument("--force", action="store_true", help="re-encode even if up to date")
    ap.add_argument("--manifest", type=pathlib.Path, default=None,
                    help="the render manifest for this set. When given, clips.json also "
                         "carries a text->id map, and the resolver needs no rule per line.")
    a = ap.parse_args()

    if not shutil.which("afconvert"):
        sys.exit("afconvert not found - this script is macOS only")
    src_dir = SRCROOT / a.set
    if not src_dir.is_dir():
        sys.exit(f"no such rendered set: {src_dir}")
    dst_dir = DSTROOT / a.set

    srcs = sorted(src_dir.glob("*.mp3"))
    done = skipped = failed = 0
    for src in srcs:
        dst = dst_dir / (src.stem + ".m4a")
        if not a.force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        if encode(src, dst):
            done += 1
        else:
            failed += 1

    outs = sorted(dst_dir.glob("*.m4a"))

    # An index of what actually exists, so the app never has to discover a missing clip
    # by requesting it. Without this the fallback to speechSynthesis would be driven by
    # 404s: the child hears silence, then a robot voice a moment later, on every line the
    # render happened to miss. With it, the decision is made before anything is spoken.
    index = {"set": a.set, "format": "m4a", "clips": [f.stem for f in outs]}

    # THE TEXT MAP, AND WHY IT IS WORTH ITS BYTES.
    #
    # times-tables is resolved by regex, because its lines are patterns -- "7 times 8?"
    # -- and a handful of rules cover 965 clips. That worked, and it also produced the
    # one bug nobody caught: `tt-card` was rendered, paid for, shipped and silent,
    # because it is a fixed string and no rule was written for it. Nothing failed. It
    # was found by instrumenting Audio in a browser.
    #
    # These sets are mostly fixed strings -- mascot lines, home cards, journey facts --
    # so a regex cannot cover them and a hand-written lookup would be the same two
    # hand-maintained lists that disagreed last time. Instead the map is emitted from
    # the very manifest that was rendered, and only for ids that actually encoded. So
    # every clip present is reachable BY CONSTRUCTION, and one that failed to encode is
    # absent from both lists together and falls back to the engine.
    # ══ THE BILLING LEDGER IS A SEPARATE KEY, AND IT MUST STAY SEPARATE ══
    #
    # Added 2026-08-26, after a dry run at the new 30x30 ceiling offered to re-buy all
    # 965 already-paid times-tables clips. The cause: render-narration.py decides what is
    # already shipped by reading `texts`, and times-tables has no `texts` -- correctly, it
    # is resolved by regex. So the renderer's guard was blind for exactly the largest and
    # most expensive set. Nothing was wrong with the audio; the ledger simply did not exist.
    #
    # THE OBVIOUS FIX IS WRONG. Emitting `texts` for times-tables would fix the billing and
    # break the game: Clips resolves a `texts` entry as an EXACT match, and exact matches
    # are deliberately NOT behind the VOICED mode gate -- that is what lets the companion
    # keep her voice in Carry Add. Feeding it 308 bare products ("56!") and 1,800 arithmetic
    # sentences would make an ordinary Take Away answer resolve to a times-table clip again,
    # which is precisely the 2026-08-20 bug the gate was built to end.
    #
    # So the ledger is emitted under a key the app does not read. Clips.load() takes
    # `j.clips` and `j.texts` and nothing else, so this is inert at runtime and exact at
    # render time -- which is the split that was missing.
    if a.manifest:
        m = json.loads(a.manifest.read_text(encoding="utf-8"))
        have = {f.stem for f in outs}
        ledger = {l["text"]: l["id"] for l in m["lines"] if l["id"] in have}
        index["renderedTexts"] = ledger
        # `texts` is the RUNTIME resolver map and stays opt-in per set: only the sets the
        # app resolves by string get one. times-tables resolves by regex and must not.
        if a.set != "times-tables":
            index["texts"] = ledger
        missing = [l["id"] for l in m["lines"] if l["id"] not in have]
        if missing:
            print(f"NOT ENCODED, so absent from the map too ({len(missing)}): "
                  f"{missing[:6]}{'...' if len(missing) > 6 else ''}")

    (dst_dir / "clips.json").write_text(
        json.dumps(index, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8")

    total = sum(f.stat().st_size for f in outs)
    src_total = sum(f.stat().st_size for f in srcs)
    print(f"source  {len(srcs):4d} mp3  {src_total/1048576:6.2f} MB")
    print(f"encoded {done}, skipped {skipped}, failed {failed}")
    print(f"runtime {len(outs):4d} m4a  {total/1048576:6.2f} MB   -> {dst_dir}")
    if outs:
        print(f"average {total/len(outs):.0f} B per clip")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
