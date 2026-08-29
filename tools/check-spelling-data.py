#!/usr/bin/env python3
"""Hold the spelling word universe to the curriculum master.

    python3 math-app/tools/check-spelling-data.py

The game's words live as JSON inside magic-spelling.html (one file the service worker
precaches, so the words are offline when the game is -- see the comment above the
<script id="spelling-universe"> block). The master lives in
math-app/spelling/spelling-master.csv. Two copies of the same 729 words is exactly the
shape that drifted before (the music-book clip bank shipped a paid clip silent because
two lists of the same strings disagreed), so this gate reads BOTH and refuses any
difference, plus the invariants the game quietly depends on:

  * every word is unique, letters plus only ' and a final . where the written form
    demands them (contractions, Mr./Mrs./Ms.);
  * pack labels are the runtime's packId() shape and the order matches the CSV exactly;
  * every homophone key exists in the universe (a line for a word that is not asked
    is dead audio, paid for and never played);
  * every word that sounds like another word in the universe HAS a line -- "two" and
    "too" cannot be told apart by ear, and the line is the only thing that names
    which spelling is meant.

Run from anywhere; exits non-zero with a named reason on any failure.
"""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV = ROOT / "spelling" / "spelling-master.csv"
PAGE = ROOT / "magic-spelling.html"
HOMOPHONES = ROOT / "spelling" / "homophones.json"

# The pairs English cannot distinguish by ear. A pair only demands a line when BOTH
# spellings are words the child could legitimately be asked for; extend this only when
# a new bundle genuinely adds such a pair.
AMBIGUOUS_SETS = [
    {"to", "too", "two"},
    {"for", "four"},
    {"no", "know"},
    {"new", "knew"},
    {"right", "write"},
    {"their", "there"},
    {"by", "buy"},
    {"one", "won"},
    {"your", "you're"},
]


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    if len(rows) != 729:
        fail(f"spelling-master.csv holds {len(rows)} words, expected 729")

    # -- the master's own shape --
    seen = {}
    csv_words = []
    for r in rows:
        w = r["word"]
        if not re.fullmatch(r"[A-Za-z']+\.?", w):
            fail(f"word {w!r} has characters outside letters, apostrophe and a final period")
        if w.lower() in seen:
            fail(f"duplicate word {w!r} (also in pack {seen[w.lower()]})")
        seen[w.lower()] = r["pack_label"]
        csv_words.append(w)

    # -- the page's embedded copy --
    page = PAGE.read_text(encoding="utf-8")
    m = re.search(
        r'<script type="application/json" id="spelling-universe">(.*?)</script>', page, re.S)
    if not m:
        fail("magic-spelling.html has no spelling-universe JSON block (or the marker moved)")
    try:
        uni = json.loads(m.group(1))
    except ValueError as e:
        fail(f"spelling-universe JSON does not parse: {e}")

    page_words = []
    for g in ("1", "2", "3"):
        packs = uni.get("grades", {}).get(g)
        if not isinstance(packs, list) or not packs:
            fail(f"universe grade {g} has no packs")
        for pack in packs:
            if not isinstance(pack, list) or not pack:
                fail(f"universe grade {g} has an empty pack")
            page_words.extend(pack)

    if page_words != csv_words:
        csv_set, page_set = set(csv_words), set(page_words)
        missing, extra = csv_set - page_set, page_set - csv_set
        if missing or extra:
            fail(f"universe and CSV differ (missing={sorted(missing)[:8]} extra={sorted(extra)[:8]})")
        fail("universe and CSV hold the same words in a different order -- packs are the "
             "curriculum's sequence and must be preserved exactly")

    # -- pack labels agree with the runtime's packId() --
    for r in rows:
        g, n = r["grade"], int(r["pack_within_grade"])
        if r["pack_label"] != f"G{g}-{n:02d}":
            fail(f"{r['word']!r}: pack_label {r['pack_label']} does not match its grade/position")

    # -- homophones: every line keyed to a real word, every ambiguous word lined --
    homo = {k: v for k, v in json.load(open(HOMOPHONES, encoding="utf-8")).items()
            if k != "_comment"}
    universe = set(page_words)
    for k, v in homo.items():
        if k not in universe:
            fail(f"homophones.json keys {k!r}, which is not in the word universe -- dead audio")
        if not isinstance(v, str) or not v.strip():
            fail(f"homophones.json line for {k!r} is empty")
    for group in AMBIGUOUS_SETS:
        present = group & universe
        unlined = present - set(homo)
        if len(present) > 1 and unlined:
            fail(f"ambiguous set {sorted(present)} has no spoken context line for "
                 f"{sorted(unlined)} -- the child cannot know which spelling is asked")

    packs_by_grade = {g: len(uni["grades"][g]) for g in ("1", "2", "3")}
    print(f"OK: 729 words, packs {packs_by_grade['1']}/{packs_by_grade['2']}/{packs_by_grade['3']}, "
          f"{len(homo)} homophone lines, CSV and page identical")


if __name__ == "__main__":
    main()
