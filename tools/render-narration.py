#!/usr/bin/env python3
"""Render a narration manifest to audio files via the ElevenLabs API.

Usage:
    # The key lives OUTSIDE every checkout -- see AGENTS.md, "Secrets and credentials":
    #   ~/.config/children-games/secrets.env   (macOS/Linux)
    #   %APPDATA%\\children-games\\secrets.env  (Windows)
    # or export ELEVENLABS_API_KEY=... for a one-off. Never store it in the repo: an
    # agent session's worktree gets deleted and takes the key with it.
    python3 math-app/tools/render-narration.py --dry-run     # cost, no spend
    python3 math-app/tools/render-narration.py --limit 10    # the pilot
    python3 math-app/tools/render-narration.py               # the whole manifest

Why this exists rather than the web UI: the Times Tables manifest is 959 clips. That
is not a thing a person clicks. Everything below exists to make an unattended run safe
to start and safe to interrupt.

  * RESUMABLE, and that is the important one. Every clip is skipped if its output file
    already exists and is non-trivial, so a run that dies at clip 700 -- rate limit,
    credit ceiling, closed laptop -- is resumed by re-running the exact same command.
    Nothing is re-billed. This is also why the key's credit ceiling is a safety net and
    not a hazard: hitting it stops the run, it does not corrupt it.

  * IT ALSO SKIPS WHAT IS ALREADY SHIPPED, and that clause exists because the obvious
    version of "resumable" quietly stopped being true. Resume keys off the .mp3 masters
    under narration/rendered/, and those are untracked -- they lived in a worktree the
    harness later deleted. What survived is the transcoded .m4a tree under
    assets-runtime/narration/, which is what actually ships. So on 2026-08-21 the shared
    manifest grew by 49 lines and re-running this command would have re-billed the 38
    already-paid clips beside them, with nothing on disk to say otherwise.
    The check is exact, not optimistic: assets-runtime/narration/<set>/clips.json carries
    the text->id map emitted from the manifest that produced each file, so a line is
    skipped only when the SHIPPED clip was made from THIS line's text. Reword a line and
    its id no longer matches the map, and it renders. Pass --ignore-shipped to override.

  * VERIFIES WHAT IT WROTE. The API can return 200 with a truncated or empty body. A
    file under MIN_BYTES is deleted rather than left on disk, because a zero-length mp3
    that looks "already rendered" would be silently skipped by the next resume and ship
    as silence -- a child tapping 7x8 and hearing nothing.

  * COSTS ARE PRINTED BEFORE ANY SPEND, and --dry-run stops there.

  * FIXED SEED, so a re-render of one clip matches the 958 around it.

Model and voice are hardcoded, and stay hardcoded. That was originally because the first
key had only the text_to_speech scope and could not look either up. The replacement key
(2026-08-21, after the first was lost with a worktree) does grant voices read, so half of
that sentence stopped being true -- but models read is still 401, and a hardcoded voice id
is the better habit regardless: it is provenance, recorded in the manifest, and a renderer
that resolves "the voice called X" at run time will happily render 958 clips in the wrong
voice the day someone renames one in the dashboard.
"""
import argparse, json, os, pathlib, sys, time, urllib.error, urllib.request

ROOT      = pathlib.Path(__file__).resolve().parents[1]
MANIFEST  = ROOT / "narration" / "times-tables.json"
OUTDIR    = ROOT / "narration" / "rendered" / "times-tables"
MODEL     = "eleven_multilingual_v2"   # 1 credit/char; Flash is half but flatter on numbers
FMT       = "mp3_44100_128"            # high-bitrate source; transcode to m4a after
SEED      = 20260820
MIN_BYTES = 1200                       # anything smaller is not a spoken line
API       = "https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=" + FMT


def load_key():
    """Delegates to scripts/repo_secrets.py, which is repo-wide policy.

    This used to read `math-app/.env` itself, and that is how the key was lost on
    2026-08-20: the file was in the documented place, but the place was relative to the
    working checkout, and the checkout was a harness worktree that the harness later
    deleted. Secrets now live outside every checkout. See AGENTS.md, "Secrets and
    credentials". Nothing here echoes the value."""
    sys.path.insert(0, str(ROOT.parent / "scripts"))
    from repo_secrets import load
    return load("ELEVENLABS_API_KEY")


def render(key, voice_id, text, attempt_budget=4):
    body = json.dumps({
        "text": text,
        "model_id": MODEL,
        "seed": SEED,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": 0.95},
    }).encode()
    req = urllib.request.Request(
        API.format(vid=voice_id), data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"})
    delay = 2.0
    for attempt in range(attempt_budget):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            # Read the body for EVERY error, not just the fatal ones. A bare
            # "HTTP Error 400: Bad Request" says nothing; the body names the field.
            detail = e.read()[:400].decode("utf-8", "replace")
            # 400/401/403/422 mean the key or the request is wrong; retrying cannot fix
            # any of them. Fail loudly, with the reason, instead of burning attempts.
            if e.code in (400, 401, 403, 422):
                sys.exit(f"HTTP {e.code} - not retryable: {detail}")
            if e.code == 429 or 500 <= e.code < 600:
                if attempt == attempt_budget - 1:
                    raise
                time.sleep(delay); delay *= 2; continue
            raise
        except urllib.error.URLError:
            if attempt == attempt_budget - 1:
                raise
            time.sleep(delay); delay *= 2
    raise RuntimeError("unreachable")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=pathlib.Path, default=MANIFEST)
    ap.add_argument("--outdir",   type=pathlib.Path, default=OUTDIR)
    ap.add_argument("--limit",    type=int, default=0, help="render only the first N (the pilot)")
    ap.add_argument("--ids",      default="", help="comma-separated clip ids; re-renders even if present")
    ap.add_argument("--dry-run",  action="store_true")
    ap.add_argument("--ignore-shipped", action="store_true",
                    help="re-render even lines whose shipped .m4a already matches this text")
    a = ap.parse_args()

    m = json.loads(a.manifest.read_text(encoding="utf-8"))
    voice_id = m["provenance"]["voiceId"]
    if a.ids:
        want = [x.strip() for x in a.ids.split(",") if x.strip()]
        by_id = {l["id"]: l for l in m["lines"]}
        missing = [w for w in want if w not in by_id]
        if missing:
            sys.exit(f"no such clip id(s) in the manifest: {', '.join(missing)}")
        lines = [by_id[w] for w in want]
    else:
        lines = m["lines"][:a.limit] if a.limit else m["lines"]
    a.outdir.mkdir(parents=True, exist_ok=True)

    def shipped_texts(set_name):
        """text -> id for the clips already encoded into the runtime tree."""
        f = ROOT / "assets-runtime" / "narration" / set_name / "clips.json"
        if not f.exists():
            return {}
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return {}
        have = set(j.get("clips", []))
        # `renderedTexts` is the BILLING ledger and `texts` is the RUNTIME resolver map.
        # They are the same content wherever both exist, but times-tables has only the
        # former -- deliberately, because a `texts` entry resolves ungated in every mode
        # and that set is 308 bare products. Reading only `texts` is what made this guard
        # blind to the 965 clips it was most important to protect (2026-08-26). Prefer the
        # ledger; fall back to the resolver map for sets encoded before it existed.
        m = j.get("renderedTexts") or j.get("texts") or {}
        return {t: i for t, i in m.items() if i in have}

    already = {} if (a.ids or a.ignore_shipped) else shipped_texts(a.outdir.name)

    def have_master(l):
        f = a.outdir / f"{l['id']}.mp3"
        return f.exists() and f.stat().st_size >= MIN_BYTES

    # --ids always re-renders: it is the "this one clip came out wrong" tool, and
    # skipping the file you explicitly named would be the opposite of what you asked.
    todo, reused = [], 0
    for l in lines:
        if a.ids:
            todo.append(l); continue
        if have_master(l):
            continue
        if already.get(l["text"]) == l["id"]:
            reused += 1
            continue
        todo.append(l)
    chars = sum(len(l["text"]) for l in todo)

    print(f"voice     {m['provenance']['voiceName']}  ({voice_id})")
    print(f"model     {MODEL}")
    print(f"selected  {len(lines)} clips; {len(lines)-len(todo)} already rendered"
          + (f" ({reused} of them recognised from the shipped .m4a tree, not re-billed)"
             if reused else ""))
    print(f"to render {len(todo)} clips, {chars} characters ~= {chars} credits")
    if a.dry_run:
        print("dry run - nothing sent, nothing spent"); return
    if not todo:
        print("nothing to do"); return

    key = load_key()
    ok = fail = 0
    for i, l in enumerate(todo, 1):
        dst = a.outdir / f"{l['id']}.mp3"
        try:
            audio = render(key, voice_id, l["text"])
        except Exception as e:
            print(f"  [{i}/{len(todo)}] FAIL {l['id']}: {e}"); fail += 1; continue
        if len(audio) < MIN_BYTES:
            # Never leave a stub behind - the next resume would treat it as done.
            print(f"  [{i}/{len(todo)}] SHORT {l['id']} ({len(audio)}B) - discarded")
            fail += 1; continue
        dst.write_bytes(audio); ok += 1
        if i % 25 == 0 or i == len(todo):
            print(f"  [{i}/{len(todo)}] ok={ok} fail={fail}")

    # Provenance the manifest requires, written next to what it describes.
    (a.outdir / "_provenance.json").write_text(json.dumps({
        "tool": "ElevenLabs API /v1/text-to-speech",
        "model": MODEL, "outputFormat": FMT, "seed": SEED,
        "voiceId": voice_id, "voiceName": m["provenance"]["voiceName"],
        "renderedOn": time.strftime("%Y-%m-%d"),
        "clipsRendered": ok, "clipsFailed": fail,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"done: {ok} rendered, {fail} failed -> {a.outdir}")
    if fail:
        print("re-run the same command to retry only the failures")


if __name__ == "__main__":
    main()
