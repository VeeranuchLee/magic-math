#!/usr/bin/env python3
"""Derive the narration manifests for the unrendered modes FROM THE PAGES.

WHY THIS IS GENERATED AND NOT HAND-WRITTEN

    `narration/times-tables.json` was hand-written, and it cost a bug: `tt-card` was
    rendered, paid for, shipped, and silent, because the manifest and the resolver were
    two hand-maintained lists of the same strings and they disagreed. A line the app
    never says is money spent on nothing; a line the app says that nobody rendered is a
    voice that switches mid-game.

    So these manifests are extracted from `space-math.html` and `unicorn-math.html`. If
    a line changes in a page, re-run this and the manifest changes with it. What the app
    says is the single source of truth.

WHAT IT COVERS, AND WHY EXACTLY THESE LINES

    The owner's rule (2026-08-20): a mode is either fully voiced or fully robot. So the
    unit of work is a MODE, and a mode is done only when every line reachable inside it
    is rendered -- its prompts, its answer chain, its praise, its mascot, and any
    progress lines that can fire while it is on screen.

    m1 Times Tables is in `Clips`'s VOICED set already, but only its arithmetic is
    rendered: its picker prompt, the mascot and the journey arrivals are still robot.
    That is the same defect in miniature, so those lines are here.

    s1 Count By joins VOICED once this renders. Its answer chain already resolves --
    all 552 clips exist, because Count By's lines have the same shape as the times
    table's -- so what is missing is only its prompts and its completion lines.

    The eight remaining modes are deliberately absent. Their spoken lines carry
    unbounded pairs of numbers (up to 1000+), so whole-sentence coverage is impossible
    rather than merely expensive, and the owner chose on 2026-08-20 to leave them all
    robot rather than half-voiced.

SETS

    count-by   the s1 lines. Shared between skins: the maths text is identical in both.
    shared     mascot, pickers, home cards and journey lines. Some are per-skin.

USAGE

    python3 math-app/tools/build-narration-manifest.py            # write the manifests
    python3 math-app/tools/build-narration-manifest.py --report   # costs only, no write
"""
import argparse, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SKINS = {"space": "space-math.html", "unicorn": "unicorn-math.html"}
RUNGS = 20   # every ladder is fixed at 20 rungs; upTo stopped being a control 2026-08-15
STEPS = range(1, 21)


def read(skin):
    return (ROOT / SKINS[skin]).read_text(encoding="utf-8")


def js_array(src, name):
    """The string literals of a top-level `const NAME=[ ... ];`."""
    m = re.search(r"const %s\s*=\s*\[(.*?)\n?\];" % re.escape(name), src, re.S)
    if not m:
        return []
    return [a or b for a, b in
            re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", m.group(1))]


def unescape(s):
    return s.replace("\\'", "'").replace('\\"', '"')


def journey_stops(src):
    """(name, [facts]) for each stop. Space only -- unicorn grows a garden and speaks no
    arrival lines, which is why it contributes none.

    THE ROWS ARE SPLIT ON `{id:`, not by matching braces. Each stop now carries an `amb`
    object and a multi-line `facts` array, so the old `\{(.*?)\}` -- which stopped at the
    first closing brace it found -- would end each row inside `amb` and see no facts at
    all. It would have reported seven stops with nothing to say and written a manifest
    that quietly dropped every fact."""
    m = re.search(r"const JOURNEY_STOPS\s*=\s*\[(.*?)\n\];", src, re.S)
    if not m:
        return []
    body = m.group(1)
    out = []
    rows = re.split(r"\n\s*\{(?=id:)", body)[1:]
    for row in rows:
        name = re.search(r"name:\s*'((?:[^'\\]|\\.)*)'", row)
        facts_block = re.search(r"facts:\s*\[(.*?)\]", row, re.S)
        if not (name and facts_block):
            continue
        facts = [unescape(a or b) for a, b in re.findall(
            r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", facts_block.group(1))]
        if facts:
            out.append((unescape(name.group(1)), facts))
    return out


BACKTICK = re.compile(r"`(?:[^`\\]|\\.)*`", re.S)


def literals(text):
    """Quoted string literals in a slice of JS, TEMPLATE LITERALS REMOVED FIRST.

    Removed rather than skipped, because a template contains quoted literals of its own:
    `${p.op==='+'?'plus':'minus'}` would otherwise contribute "plus" and "minus" as lines
    the app says, and a manifest line the app never utters is money spent on silence.

    COMMENTS GO FIRST, for the same reason and it is not hypothetical: solveColumns's
    comment quotes the question it is describing, and that quotation was being harvested as
    something the app says."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"//[^\n]*", " ", text)
    text = BACKTICK.sub("``", text)
    return [unescape(a or b) for a, b in re.findall(
        r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", text)]


def call_args(src, name):
    """The argument text of every `name(...)` call, bracket-balanced and quote-aware."""
    out, needle = [], name + "("
    i = src.find(needle)
    while i >= 0:
        j, depth = i + len(needle), 1
        while j < len(src) and depth:
            ch = src[j]
            if ch in "'\"`":                    # skip the whole string, brackets and all
                q, j = ch, j + 1
                while j < len(src) and src[j] != q:
                    j += 2 if src[j] == "\\" else 1
            elif ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            j += 1
        out.append(src[i + len(needle):j - 1])
        i = src.find(needle, j)
    return out


def spoken_fixed(src):
    """Every FIXED string the app speaks, harvested from the calls that speak it.

    WHY FROM THE CALL SITES AND NOT FROM A DATA BLOCK. The companion's lines are written
    where the moment happens -- "Too many! Take one away." belongs next to the code that
    notices there are too many -- and moving thirty of them into a table to make them
    findable would trade readable code for a second list to keep in step, which is the
    exact failure that shipped `tt-card` paid-for and silent.

    So the page stays the source of truth and this walks it: the arguments of every
    Voice.say / Voice.lines call, plus solveColumns, whose hint arrays are built for
    Voice.lines a few screens later.

    THE FILTER, and what it is protecting against. A call argument contains literals that
    are not lines -- `preset.show==='blocks'`, `s.kind==='mark'`, `typed!=='0'`. A spoken
    line begins with a capital and either contains a space or ends in sentence
    punctuation; a comparison operand does neither. Anything rejected is printed by
    --report, because a line silently dropped here is a line nobody renders."""
    chunks = call_args(src, "Voice.say") + call_args(src, "Voice.lines")

    # THE ANCHORED CHUNKS, AND WHY THEY ARE ANCHORED HARD.
    #
    # Not every companion line reaches Voice.lines as a literal argument. c2-c4 build
    # their chains into arrays first -- solveColumns fills askMark/sayMark/hintMark and
    # the cursor effect builds `open` -- and Voice.lines(list) then takes an identifier,
    # so the harvest above sees nothing. The first version of this shipped without the
    # second anchor and "Start with the glowing box." was silently absent: no error, no
    # clip, and one line of Borrow Take Away answering in the wrong voice.
    #
    # So a missing anchor now EXITS. A silent gap here is indistinguishable from a game
    # that has no companion lines, and that is the one failure mode this whole generator
    # exists to make impossible.
    for what, pattern in (
            ("solveColumns's hint arrays", r"function solveColumns\(.*?\n\}"),
            ("the c2-c4 opening chain",    r"const open=cursor===0.*?\n.*?\n.*?\];"),
    ):
        m = re.search(pattern, src, re.S)
        if not m:
            sys.exit(f"spoken_fixed: could not find {what} -- the anchor has drifted, and "
                     f"guessing would ship unrendered companion lines")
        chunks.append(m.group(0))

    # THE COLUMN OPENER'S FIRST LINE IS DATA, NOT A LITERAL AT THE CALL SITE. The opening
    # chain anchored above reads `cfg.intro`, an identifier, so the announcement the
    # companion now makes -- "Carry adding!" -- is invisible to the harvest even though
    # the call site is anchored. The exclamation lives in COLUMN_MODES rather than in the
    # template BECAUSE of this: a line assembled from `${cfg.intro}!` could never be
    # harvested, and an unharvested companion line is one that answers in the engine
    # voice.
    #
    # ANCHORED ON THE FIELD, NOT ON THE BLOCK. COLUMN_MODES also carries `title` and
    # `sub` -- "Carry Add", "Carry the one!" -- which are printed on the mode card and
    # never spoken. Harvesting the block would pass the filter (capitalised, punctuated)
    # and buy six clips nobody can ever play.
    intros = re.findall(r"\bintro:\s*('(?:[^'\\]|\\.)*')",
                        re.sub(r"/\*.*?\*/", " ", src, flags=re.S))
    if not intros:
        sys.exit("spoken_fixed: no column-mode `intro:` lines -- the anchor has drifted, "
                 "and the companion's opening announcement would ship unrendered")
    chunks.append(" ".join(intros))

    keep, drop = [], []
    for chunk in chunks:
        for t in literals(chunk):
            t = t.strip()
            if not t or "${" in t:
                continue
            spoken = bool(re.match(r"[A-Z]", t)) and (" " in t or t[-1] in "!?.")
            (keep if spoken else drop).append(t)
    # dict.fromkeys: first-seen order, deduplicated
    return list(dict.fromkeys(keep)), sorted(set(drop))


def report_rejects():
    """What the filter threw away, so a real line dropped by it is visible rather than
    merely absent. Almost all of these are comparison operands."""
    for skin in ("space", "unicorn"):
        _, drop = spoken_fixed(read(skin))
        print(f"{skin:10} filter rejected {len(drop)}: {drop}")


def slug(text):
    """A stable id from the text. Positional ids would re-number every clip after any
    line that is added or removed, orphaning files that are already rendered and paid
    for; a slug only changes when the line itself changes, which is exactly when a new
    recording is genuinely needed."""
    t = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return t[:44].rstrip("-")


def card_voice(src):
    """BOTH QUOTE STYLES, and the reason is a bug this cost.

    An earlier version of this matched single-quoted values only. `b3`'s line is
    "What's Missing? Make both sides the same!" -- double-quoted in the source precisely
    BECAUSE it contains an apostrophe -- so it was silently absent from the manifest, was
    never rendered, and would have been the one card of eleven that answered in the robot
    voice. Found by probing the real page, not by any check here, which is why `--verify`
    now also checks the app's fixed strings against the manifest."""
    m = re.search(r"const CARD_VOICE\s*=\s*\{(.*?)\n\};", src, re.S)
    if not m:
        return {}
    out = {}
    for k, sq, dq in re.findall(
            r"(\w+)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")",
            m.group(1)):
        out[k] = unescape(sq if sq else dq)
    return out


def build_count_by():
    """s1, complete. Every line the mode can utter that is not already rendered."""
    lines = [{"id": "cb-pick", "text": "Which number shall we count by? Tap it!",
              "role": "narrator", "note": "the picker, before a step is chosen"}]
    for n in STEPS:
        lines.append({"id": f"cb-chose-{n}", "text": f"Count by {n}!",
                      "role": "narrator", "note": "spoken as the child taps a step"})
        lines.append({"id": f"cb-first-{n}", "text": f"Let's count by {n}. What number comes first?",
                      "role": "narrator", "note": "asked at an empty ladder"})
    # The chant: the last up-to-three multiples already on the ladder. back=min(3,filled)
    # and the ladder is 20 rungs, so this is a closed set of 400, not combinatorial.
    seen = set()
    for n in STEPS:
        for filled in range(1, RUNGS + 1):
            back = min(3, filled)
            tail = [(filled - back + 1 + i) * n for i in range(back)]
            text = f"{', '.join(map(str, tail))}. What comes next?"
            if text in seen:
                continue
            seen.add(text)
            lines.append({"id": f"cb-next-{n}-{filled}", "text": text, "role": "narrator",
                          "note": f"chant at rung {filled} counting by {n}"})
    for n in STEPS:
        lines.append({"id": f"cb-done-{n}", "text": f"You counted by {n} all the way to {n * RUNGS}.",
                      "role": "narrator", "note": "the completed ladder"})
        lines.append({"id": f"cb-table-{n}", "text": f"That is the {n} times table!",
                      "role": "narrator", "note": "the completed ladder, second line"})
    return lines


def build_shared():
    """Lines that are not a mode's own but are reachable inside one, so they decide
    whether that mode counts as fully voiced."""
    lines, seen = [], {}

    def add(id_, text, note):
        if text in seen:                      # identical text in both skins renders once
            lines[seen[text]]["note"] += f"; also {note}"
            return
        seen[text] = len(lines)
        lines.append({"id": id_, "text": text, "role": "narrator", "note": note})

    for skin in ("space", "unicorn"):
        src = read(skin)
        pre = "s" if skin == "space" else "u"
        for i, t in enumerate(js_array(src, "MASCOT_LINES"), 1):
            add(f"sh-mascot-{pre}{i}", unescape(t), f"{skin} mascot, tapped")
        add(f"sh-pick-times-{pre}", "How big shall we go? Tap a number!",
            f"{skin} Times Tables picker")

    src = read("space")
    for key, text in card_voice(src).items():
        add(f"sh-card-{key}", text, f"home screen card {key}")
    stops = journey_stops(src)
    for i, (name, facts) in enumerate(stops):
        add(f"sh-arrive-{i}", f"You reached {name}!", f"journey arrival at {name}")
        # THE FIRST FACT KEEPS THE BARE ID. sh-fact-0 .. sh-fact-6 are already rendered
        # and the resolver matches on text, so renumbering them would orphan seven paid
        # clips and buy seven identical replacements.
        for j, fact in enumerate(facts):
            add(f"sh-fact-{i}" if j == 0 else f"sh-fact-{i}-{j+1}", fact,
                f"journey fact {j+1} at {name}")
    if stops:
        last = stops[-1][0]
        add("sh-arrive-final", f"Journey complete! You reached {last}!",
            "the last stop, which prefixes the arrival line")
    add("sh-journey-new", "A brand new journey begins. Blast off!", "journey reset")
    add("sh-journey-go", "Off we go!", "closing the arrival overlay")

    # The companion's own lines, from the call sites that speak them. Both skins, because
    # a line shared between them renders once -- add() folds identical text together.
    for skin in ("space", "unicorn"):
        keep, _ = spoken_fixed(read(skin))
        for t in keep:
            add(f"sh-l-{slug(t)}", t, f"{skin} companion line")

    ids = [l["id"] for l in lines]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        sys.exit(f"slug collision -- two different lines want the same id: {dupes}")
    return lines


def manifest(mode, sets, lines, why):
    chars = sum(len(l["text"]) for l in lines)
    return {
        "app": "math-app",
        "mode": mode,
        "generatedBy": "tools/build-narration-manifest.py",
        "doNotHandEdit": "Change the line in the page, then re-run the generator.",
        "skins": sets,
        "why": why,
        "format": {"container": "m4a", "codec": "aac", "channels": 1, "sampleRateHz": 24000,
                   "targetPeakDbfs": -3.0,
                   "why": "matches the times-tables set exactly, so a chain that crosses "
                          "sets does not change timbre or level mid-sentence"},
        "provenance": {
            "REQUIRED_BEFORE_SHIPPING": "AUDIO-DIRECTION.md: tool, model, date and the "
                "prompt or voice. Filled at render time. A file that arrives without "
                "them cannot be published.",
            "tool": "ElevenLabs Voice Design",
            "model": None,
            "voiceId": "syTCOMrIG987VoS0EmlL",
            "voiceName": "Magic Math Narrator",
            "voiceNote": "The same voice as the times-tables set, deliberately. A second "
                         "voice design would be audible the moment a chain crossed sets.",
            "renderedOn": None,
            "termsCheckedForPublicRedistribution": True,
        },
        "counts": {"clips": len(lines), "characters": chars},
        "lines": lines,
    }


def app_coverage():
    """THE OTHER DIRECTION, and the one that actually caught something.

    verify() below checks manifest -> clips: everything I paid for exists and resolves.
    It cannot catch a line the app says that the manifest never knew about -- and that is
    exactly what happened. CARD_VOICE has eleven entries; `b3`'s is double-quoted in the
    source because its text contains an apostrophe, the extractor matched single quotes
    only, and so one card of eleven was missing from the manifest, unrendered, and would
    have spoken in the robot voice on an otherwise fully-voiced home screen.

    So this walks the app's ENUMERABLE fixed-string sources -- the card names, both
    skins' mascot lines and praise, the journey names and facts -- and asserts every one
    is covered by a manifest or already rendered. Interpolated lines are not checkable
    this way and are covered by the pattern rules instead."""
    covered = set()
    for name in ("times-tables", "count-by", "shared"):
        f = ROOT / "narration" / f"{name}.json"
        if f.exists():
            covered |= {l["text"] for l in
                        json.loads(f.read_text(encoding="utf-8"))["lines"]}

    expected = {}          # text -> where it comes from
    for skin in ("space", "unicorn"):
        src = read(skin)
        for t in js_array(src, "MASCOT_LINES"):
            expected[unescape(t)] = f"{skin} MASCOT_LINES"
        for t in js_array(src, "PRAISE"):
            expected[unescape(t)] = f"{skin} PRAISE"
    for skin in ("space", "unicorn"):
        keep, _ = spoken_fixed(read(skin))
        for t in keep:
            expected.setdefault(t, f"{skin} companion line")
    src = read("space")
    for k, v in card_voice(src).items():
        expected[v] = f"CARD_VOICE.{k}"
    for name, facts in journey_stops(src):
        expected[f"You reached {name}!"] = f"journey arrival ({name})"
        for j, fact in enumerate(facts):
            expected[fact] = f"journey fact {j+1} ({name})"

    gaps = sorted((w, t) for t, w in expected.items() if t not in covered)
    print(f"app lines   {len(expected) - len(gaps):4}/{len(expected)} enumerable fixed "
          f"strings covered by a manifest")
    for where, text in gaps:
        print(f"           MISSING  {where}: {text!r}")
    return 1 if gaps else 0


def verify():
    """Every line the app can say either has a file or is named here as not having one.

    WHAT THE TWO FAILURES COST CHANGED ON 2026-08-21, when the voice split by role rather
    than by mode, and the difference matters when you are deciding whether to spend:

      NOT RENDERED  -- the clip does not exist, so that ONE LINE speaks in the companion's
                       engine voice instead of her recorded one. Under the old rule this
                       disqualified the whole mode, because the fallback landed inside a
                       sentence next to a rendered number. It no longer does: numbers have
                       their own voice now, so a missing companion clip is one line that
                       sounds thinner, not a seam mid-sentence. Still work to do; no
                       longer a reason to make a mode all-robot.

      NOT REACHABLE -- unchanged, and still the expensive one: the clip exists and was
                       paid for, but nothing resolves to it, so it is shipped and silent.
                       `tt-card` was exactly this and no test caught it; it was found by
                       instrumenting Audio in a browser.
    """
    bad = app_coverage()
    for name in ("count-by", "shared"):
        man = ROOT / "narration" / f"{name}.json"
        idx = ROOT / "assets-runtime" / "narration" / name / "clips.json"
        if not man.exists():
            print(f"{name:10} no manifest -- run without --verify first"); bad = 1; continue
        lines = json.loads(man.read_text(encoding="utf-8"))["lines"]
        if not idx.exists():
            print(f"{name:10} NOT RENDERED at all ({len(lines)} lines); "
                  f"every one of them falls back to the engine"); bad = 1; continue
        j = json.loads(idx.read_text(encoding="utf-8"))
        have, texts = set(j.get("clips", [])), j.get("texts", {})

        missing = [l["id"] for l in lines if l["id"] not in have]
        unreachable = [l["id"] for l in lines
                       if l["id"] in have and texts.get(l["text"]) != l["id"]]
        print(f"{name:10} {len(lines) - len(missing):4}/{len(lines)} rendered, "
              f"{len(lines) - len(unreachable) - len(missing):4} reachable")
        if missing:
            print(f"           NOT RENDERED  ({len(missing)}): {missing[:6]}")
            bad = 1
        if unreachable:
            print(f"           NOT REACHABLE ({len(unreachable)}): {unreachable[:6]}"
                  f"  <- paid for and silent")
            bad = 1

    print("\nVERIFY " + ("INCOMPLETE - the lines above fall back to the engine until "
                          "they are rendered" if bad else
                          "OK - every line rendered and reachable"))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="print costs, write nothing")
    ap.add_argument("--verify", action="store_true",
                    help="check every manifest line is rendered AND reachable; exit 1 if not")
    a = ap.parse_args()

    if a.verify:
        return verify()

    if a.report:
        report_rejects()

    cb = build_count_by()
    sh = build_shared()

    # Nothing here may duplicate an already-rendered clip, or it is paid for twice.
    existing = json.loads((ROOT / "assets-runtime" / "narration" / "times-tables"
                           / "clips.json").read_text(encoding="utf-8"))
    have_ids = set(existing["clips"])
    done = json.loads((ROOT / "narration" / "times-tables.json").read_text(encoding="utf-8"))
    have_text = {l["text"] for l in done["lines"]}
    # AND the sets built in THIS run must be checked against each other, not only against
    # times-tables. That gap cost 39 credits on 2026-08-21: the harvest enumerated "Which
    # number shall we count by? Tap it!" into `shared` when count-by/cb-pick had said it
    # since the day before, both were written, and both were rendered. The loser is not
    # merely wasted -- `Clips.url` answers a fixed string from whichever set's text map
    # matches first, so one of the two can never be reached, and verify() cannot see it
    # because each set's own map is self-consistent. `have_text` now grows as the loop
    # goes, which makes the FIRST set to claim a line the one that keeps it.

    total = 0
    for name, lines, mode, sets, why in (
        ("count-by", cb, "Count By (s1)", ["space-math.html", "unicorn-math.html"],
         "Its answer chain already resolves against the times-tables set; these are the "
         "prompts and completion lines that were missing, and the reason s1 was held out "
         "of Clips's VOICED set rather than left half-voiced."),
        ("shared", sh, "shared surfaces", ["space-math.html", "unicorn-math.html"],
         "Mascot, pickers, home cards and journey lines. Not a mode's own lines, but "
         "reachable inside one -- which is why m1 was not in fact fully voiced."),
    ):
        dup_id = sorted(l["id"] for l in lines if l["id"] in have_ids)
        if dup_id:
            sys.exit(f"{name}: id collides with a rendered clip: {dup_id[:5]}")

        # Text already rendered is REUSED, never re-paid-for. The resolver matches on
        # text, so an existing clip already answers these lines -- and this check caught
        # a real one on its first run: the home card "Times Tables!" is `tt-card`, which
        # was rendered with the times-tables set. Dropping it here is the difference
        # between reusing a clip and buying a second copy of it.
        reused = sorted(l["text"] for l in lines if l["text"] in have_text)
        if reused:
            lines = [l for l in lines if l["text"] not in have_text]
            print(f"{name:10} reusing {len(reused)} already-rendered line(s): {reused}")

        ids = [l["id"] for l in lines]
        if len(set(ids)) != len(ids):
            sys.exit(f"{name}: duplicate ids")

        have_text |= {l["text"] for l in lines}

        m = manifest(mode, sets, lines, why)
        chars = m["counts"]["characters"]
        total += chars
        print(f"{name:10} {len(lines):5} clips  {chars:7,} characters  ~{chars:,} credits")
        if not a.report:
            out = ROOT / "narration" / f"{name}.json"
            out.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"           -> {out.relative_to(ROOT.parent)}")

    print(f"{'TOTAL':10} {len(cb) + len(sh):5} clips  {total:7,} characters  ~{total:,} credits")
    print(f"\nalready rendered and reused for free: {len(have_ids)} clips "
          f"(Count By's whole answer chain is 552 of them)")


if __name__ == "__main__":
    sys.exit(main() or 0)
