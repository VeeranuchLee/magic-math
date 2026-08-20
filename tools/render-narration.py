#!/usr/bin/env python3
"""Render a narration manifest to audio files via the ElevenLabs API.

Usage:
    export ELEVENLABS_API_KEY=...          # or put it in math-app/.env (git-ignored)
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

  * VERIFIES WHAT IT WROTE. The API can return 200 with a truncated or empty body. A
    file under MIN_BYTES is deleted rather than left on disk, because a zero-length mp3
    that looks "already rendered" would be silently skipped by the next resume and ship
    as silence -- a child tapping 7x8 and hearing nothing.

  * COSTS ARE PRINTED BEFORE ANY SPEND, and --dry-run stops there.

  * FIXED SEED, so a re-render of one clip matches the 958 around it.

The key wants only the text_to_speech endpoint. Model and voice are hardcoded for that
reason: looking either up would need scopes this key deliberately does not have.
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
    """Environment first, then math-app/.env. The key is never written to the repo:
    .env is git-ignored, and nothing here echoes the value."""
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if k:
        return k
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No ELEVENLABS_API_KEY in the environment or math-app/.env")


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

    # --ids always re-renders: it is the "this one clip came out wrong" tool, and
    # skipping the file you explicitly named would be the opposite of what you asked.
    todo = lines if a.ids else [l for l in lines if not (
        (a.outdir / f"{l['id']}.mp3").exists()
        and (a.outdir / f"{l['id']}.mp3").stat().st_size >= MIN_BYTES)]
    chars = sum(len(l["text"]) for l in todo)

    print(f"voice     {m['provenance']['voiceName']}  ({voice_id})")
    print(f"model     {MODEL}")
    print(f"selected  {len(lines)} clips; {len(lines)-len(todo)} already rendered")
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
