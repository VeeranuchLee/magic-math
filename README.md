# Children Games

Learning games for children aged 4–6 (pre-readers). Everything is picture- and
voice-based: spoken instructions, pictograms instead of words, no reading needed.

## Games

| File | Game | What it is |
|---|---|---|
| [index.html](index.html) | Game menu | Landing page linking to all games |
| [space-math.html](space-math.html) | **Space Math** | Counting, place value, add/subtract, column add, times tables. Every correct answer flies the rocket further: Earth → Moon → Mars → Asteroid Belt → Jupiter → Saturn → Milky Way. Each arrival teaches one spoken fact about that place. |
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

## Notes for grown-ups

- Sound/voice uses the browser's built-in speech (no internet voices needed).
- Each game hides its settings behind **press-and-hold on the gear button**,
  so little fingers can't change the difficulty by accident.
- Progress (space journey, trophies) is saved in the browser on the device.
