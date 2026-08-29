#!/usr/bin/env python3
"""Build the spelling narration manifest.

    python3 math-app/tools/build-spelling-manifest.py            # write narration/spelling.json
    python3 math-app/tools/build-spelling-manifest.py --report   # counts only, no write
    python3 math-app/tools/build-spelling-manifest.py --verify   # rendered clips vs manifest

Every spoken line in Magic Spelling, in one bounded set: the 729 curriculum words
(spoken as the bare word, or as "word. context line." for the ones English cannot
disambiguate by ear), the six praise strings, the three pack-complete star lines and
the practice-pass line. The words and homophone lines come from
spelling/spelling-master.csv and spelling/homophones.json; the praise, star and
practice lines are EXTRACTED FROM THE PAGE, the same no-drift rule as
build-narration-manifest.py -- if someone rewords a praise string in
magic-spelling.html and forgets this file, the next run fails loudly instead of
quietly shipping a clip the page no longer asks for.

Ids are derived from the text (sp-w-<slugified word>), so the mapping is checkable
by reading it, and stable across re-renders of the same word.
"""
import argparse
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV = ROOT / "spelling" / "spelling-master.csv"
HOMOPHONES = ROOT / "spelling" / "homophones.json"
PAGE = ROOT / "magic-spelling.html"
MANIFEST = ROOT / "narration" / "spelling.json"
RUNTIME = ROOT / "assets-runtime" / "narration" / "spelling"


def slug(word):
    s = re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-")
    return s or "blank"


def extract_fixed_lines(page):
    """The fixed strings the page speaks, read out of the page itself.

    A missing or malformed anchor is fatal on purpose: the manifest must not
    silently stop covering the game."""
    def need(pattern, what):
        m = re.search(pattern, page)
        if not m:
            sys.exit(f"spoken_fixed: could not find {what} -- the anchor has drifted, and "
                     "rendering without it would ship clips the page never asks for")
        return m

    praise = need(r"const PRAISE=\[(.*?)\];", "the PRAISE array")
    strings = re.findall(r"'([^']*)'", praise.group(1))
    if not strings:
        sys.exit("spoken_fixed: PRAISE holds no single-quoted strings")

    stars = {}
    sm = need(r"const STAR_LINES=\{(.*?)\};", "the STAR_LINES map")
    for k, v in re.findall(r"(\d):'([^']*)'", sm.group(1)):
        stars[int(k)] = v
    if sorted(stars) != [1, 2, 3]:
        sys.exit(f"spoken_fixed: STAR_LINES must hold exactly 1,2,3 -- found {sorted(stars)}")

    pm = need(r'const PRACTICE_LINE="([^"]*)";', "the PRACTICE_LINE string")
    practice = pm.group(1)
    return strings, stars, practice


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="counts only, no write")
    ap.add_argument("--verify", action="store_true",
                    help="check every line has a rendered clip in the runtime tree")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    homo = {k: v for k, v in json.load(open(HOMOPHONES, encoding="utf-8")).items()
            if k != "_comment"}
    praise, stars, practice = extract_fixed_lines(PAGE.read_text(encoding="utf-8"))

    lines = []
    for r in rows:
        w = r["word"]
        text = f"{w}. {homo[w]}" if w in homo else w
        lines.append({
            "id": f"sp-w-{slug(w)}",
            "text": text,
            "role": "narrator",
            "note": f"{r['pack_label']}, grade {r['grade']}"
                    + (" -- spoken with a context line (sounds like another word)" if w in homo else ""),
        })
    for i, s in enumerate(praise, 1):
        lines.append({"id": f"sp-praise-{i}", "text": s, "role": "narrator",
                      "note": "praise, positional like the times-tables set"})
    for k in (1, 2, 3):
        lines.append({"id": f"sp-star-{k}", "text": stars[k], "role": "narrator",
                      "note": "pack complete"})
    lines.append({"id": "sp-practice", "text": practice, "role": "narrator",
                  "note": "a pass over the words that needed the help ladder"})

    ids = [l["id"] for l in lines]
    if len(ids) != len(set(ids)):
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        sys.exit(f"slug collision between words: {dupes} -- widen the id scheme before rendering")

    if a.verify:
        idx = RUNTIME / "clips.json"
        if not idx.exists():
            sys.exit(f"no runtime index: {idx} -- run build-runtime-audio.py --set spelling first")
        j = json.loads(idx.read_text(encoding="utf-8"))
        have = set(j.get("clips", []))
        textmap = j.get("texts") or {}
        missing = [l["id"] for l in lines if l["id"] not in have]
        drift = [l["id"] for l in lines if textmap.get(l["text"]) != l["id"]]
        if missing:
            sys.exit(f"{len(missing)} line(s) have no rendered clip, e.g. {missing[:6]}")
        if drift:
            sys.exit(f"{len(drift)} line(s) disagree with the shipped text map, e.g. {drift[:6]}")
        print(f"OK: {len(lines)} lines rendered and reachable in {RUNTIME}")
        return

    chars = sum(len(l["text"]) for l in lines)
    print(f"lines     {len(lines)}  ({len(rows)} words + {len(praise)} praise + "
          f"3 star + 1 practice)")
    print(f"characters {chars}  (~{chars} credits at 1/char)")
    if a.report:
        return

    manifest = {
        "app": "math-app",
        "mode": "Magic Spelling",
        "generatedBy": "tools/build-spelling-manifest.py",
        "doNotHandEdit": "Change the word list in spelling/ or the line in the page, "
                         "then re-run the generator.",
        "skins": None,
        "why": "The whole game in one bounded set: every word the child can be asked to "
               "spell, spoken by the ABC robot with a real voice instead of the device's "
               "adult speechSynthesis (owner decision, 2026-08-29, closing the open item "
               "of 2026-08-27). Words that sound identical to another word in the "
               "universe carry a spoken context line so the child knows WHICH spelling "
               "is asked; the line is never shown as text. Homophones aside, every word "
               "is spoken bare, exactly as a teacher dictates.",
        "format": {
            "container": "m4a", "codec": "aac", "channels": 1, "sampleRateHz": 24000,
            "targetPeakDbfs": -3.0,
            "why": "matches the times-tables set exactly -- one voice across the app, "
                   "and isolated words need the final-consonant detail even more than "
                   "numbers do",
        },
        "provenance": {
            "REQUIRED_BEFORE_SHIPPING": "AUDIO-DIRECTION.md: tool, model, date and the "
                                        "prompt or voice. Filled at render time. A file "
                                        "that arrives without them cannot be published.",
            "tool": "ElevenLabs Voice Design",
            "model": "eleven_multilingual_v2",
            "voiceId": "syTCOMrIG987VoS0EmlL",
            "voiceName": "Magic Math Narrator",
            "voiceNote": "The same voice as the maths apps, deliberately: it is one app "
                         "family, and a second voice would be audible the moment a child "
                         "moved between games.",
            "renderedOn": "",
            "termsCheckedForPublicRedistribution": True,
        },
        "counts": {"clips": len(lines), "characters": chars},
        "lines": lines,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
