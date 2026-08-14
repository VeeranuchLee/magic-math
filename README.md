# Children Games

Learning games for children aged 4–6 (pre-readers). Everything is picture- and
voice-based: spoken instructions, pictograms instead of words, no reading needed.

## Games

| File | Game | What it is |
|---|---|---|
| [index.html](index.html) | Game menu | Landing page linking to all games |
| [space-math.html](space-math.html) | **Space Math** | Counting, place value, add/subtract, column add, times tables, count by. Every correct answer flies the rocket further: Earth → Moon → Mars → Asteroid Belt → Jupiter → Saturn → Milky Way. Each arrival teaches one spoken fact about that place. |
| [unicorn-math.html](unicorn-math.html) | **Unicorn Math** | The same math games in a unicorn/princess theme. Correct answers grow a flower garden; full gardens become bouquets. |
| [magic-spelling.html](magic-spelling.html) | **Magic Spelling** | Early spelling practice. |
| [classical-music.html](classical-music.html) | **Classical Music** | Listen-and-guess music game. |

## Install it on a phone or tablet

Open the site, then use the browser's **Add to Home Screen**. It installs like an
app: its own icon, no browser bars, and **it works with no connection**. Everything
it needs is served from this folder — React and the fonts are included, so nothing
is fetched from the internet at any point.

What works offline, and when:

- **Straight after the first visit** — all five games, the menu, and every menu and
  character picture. The service worker fetches those in the background as soon as
  it installs.
- **After a game is played once** — that game's backgrounds. They are ~21 MB in
  total, so they are cached as they are used; installing the app does not pull down
  34 MB up front.

## Folders

- `assets/space/` – backgrounds and sticker icons for Space Math
- `assets/unicorn/` – backgrounds and sticker icons for Unicorn Math
- `assets/icons/` – installed-app icons, built by `tools/build-icons.py`
- `vendor/` – React, ReactDOM and Babel, self-hosted so the games start offline.
  Byte-identical to the published releases named in the filenames; re-verify against
  the CDN's SRI if you ever replace one.
- `fonts/`, `fonts.css` – Nunito and Fredoka One, self-hosted for the same reason
- `tools/` – deterministic generators: `build-icons.py` (app icons) and
  `build-cache-list.py` (the offline warm list). Re-run and commit the result after
  changing icon art.
- `archive/` – older versions of the math game (v1–v7), kept for reference
- `art-source/` – original AI-generated art sheets the icons were cut from
  (kept locally only, not uploaded — see `.gitignore`)

## Publishing an update

Bump `CACHE_NAME` in `service-worker.js` when you publish. A device that already has
the app installed keeps serving its old cache until that name changes — the bump is
what actually delivers the update.

## Run locally

A service worker needs `http://localhost` (or HTTPS), so serve the folder rather
than opening `index.html` from disk — from a `file://` URL the games still run, but
offline support does not install:

```bash
python3 -m http.server 4321
# then open http://localhost:4321
```

## Publish with GitHub Pages

On GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
The games will be playable at `https://<username>.github.io/<repo>/`.

## Count By — how it teaches

Both math apps have a **Count By** game. Counting by 3 and the 3 times table are the
same list of numbers, so the game shows both at once instead of teaching them as two
separate skills:

- a **chant strip** across the top grows as the child counts — `3 › 6 › 9 › ?`
- a **ladder** underneath writes those very same numbers as multiplication —
  `1 × 3 = 3`, `2 × 3 = 6`, `3 × 3 = 9`, `4 × 3 = ?`
- the child types the missing number **into the ladder**, so "count on one more jump"
  and "one more group of 3" are literally the same action
- each correct answer is read back as the bridge sentence: *"12! Four times three is
  twelve."* Finishing the ladder says *"You counted by 3 all the way to 36 — that is
  the 3 times table!"*

The child picks the number: Count By opens on a grid of 1–20 and one tap on a tile both
sets it and starts the ladder. How many jumps (2–20) sits underneath as a quieter second
choice. The pill in the top bar — "Count by 7" — reopens the same picker at any time.

## Choosing the difficulty

The child chooses, not the grown-up. Nothing is hidden behind a gesture: a single tap on
the gear — or on the difficulty pill next to it, which is the bigger target — opens the
choice, and picking an option applies it immediately. There is no "Done" to find.

- **Count By** and **Times Tables** open on their picker, so the first thing a child does
  is name their number. Count By asks "Count by…" over tiles 1–20; Times Tables asks
  "How big?" and one tap sets both sides of the table (up to 20 × 20).
- **What Number?**, **Fill the Right Block**, **Add & Subtract** and **Column Add** choose
  from pictures instead of numbers. Tapping a picture picks it and returns to the game.
- Tapping **Play!** without choosing keeps whatever the game was already on.

## Notes for grown-ups

- Sound/voice uses the browser's built-in speech (no internet voices needed).
- The two picker games open pre-selected on 12, which was their old starting point, so the
  previous default is still one tap away. The four picture games still **start on their
  hardest setting** — What Number? and Fill the Right Block at Full 1–1000, Add & Subtract
  at Full 1–30, Column Add at `>100 + <100`.
- Add & Subtract keeps a typed custom range and a custom problem type further down its
  panel; those still need the **Apply** button, and a preset tap will not close the panel
  out from under them while they are open.
- Progress (space journey, trophies) is saved in the browser on the device.
