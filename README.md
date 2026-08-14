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

## Folders

- `assets/space/` – backgrounds and sticker icons for Space Math
- `assets/unicorn/` – backgrounds and sticker icons for Unicorn Math
- `archive/` – older versions of the math game (v1–v7), kept for reference
- `art-source/` – original AI-generated art sheets the icons were cut from
  (kept locally only, not uploaded — see `.gitignore`)

## Run locally

Just open `index.html` in a browser, or serve the folder:

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

Behind the gear: which number to count by (1–12) and how many jumps (2–12).

## Notes for grown-ups

- Sound/voice uses the browser's built-in speech (no internet voices needed).
- Each game hides its settings behind **press-and-hold on the gear button**,
  so little fingers can't change the difficulty by accident.
- **Every game starts on its hardest setting** — Times Tables at 12 × 12, What Number?
  and Fill the Right Block at Full 1–1000, Add & Subtract at Full 1–30, Column Add at
  `>100 + <100`, Count By at 12s. Turn any of them down behind the gear.
- Progress (space journey, trophies) is saved in the browser on the device.
