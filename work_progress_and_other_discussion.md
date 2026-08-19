# Math Apps — work in progress and discussion

**What goes in this file:** anything the owner and an agent worked out in conversation
that would otherwise only exist in a chat transcript. Decisions, and just as
importantly **the options that were rejected and why**, things looked at and judged
fine as they are, half-finished trains of thought, and open questions.

**Why it exists:** on 2026-08-19 the owner had to give the same sound direction twice,
because an earlier session agreed it and wrote it nowhere. The next session read the
code, found no direction, and confidently re-proposed things already ruled out. A
decision that lives only in a transcript does not exist.

**How it differs from the files next to it:**

- `coordination/tasks/` records *executions* — one file per task, what changed and why.
  Nothing lands there if no files changed.
- `SESSION_STATE.md` is the *current* snapshot. It is deliberately overwritten, so it is
  not a history.
- There is no settled-decisions file for this app yet. If a body of firm decisions builds up here, split it out the way `animal-book/DECISIONS.md` did.
- **This file is the discussion trail.** Append-only, newest entry first.

**When to write here:** at the end of any turn where the owner made a call, rejected an
idea, or accepted something as good enough — even, especially, when no code changed. Do
not wait to be asked. Keep entries short and link to the task record for detail.

**Entry format:** date, one-line topic, then `Discussed / Decided / Rejected and why /
Still open` — omit any line that has nothing in it.

---

## 2026-08-19 — What's Missing?: the missing addend, played as a balance

Task record: `coordination/tasks/2026-08-19-claudecode-missing-number-blocks.md`

**Discussed** — a new game for `23 + ? = 30`, for a four-year-old. Owner: *"I want blocks
to count, not in number format, but two sides of blocks to count."* First rung heavily
biased to targets ending in 0 or 5, *"they're satisfying and easy to see"*. Harder rungs
selectable: `? + 8 = 31`, `31 − ? = 23`, `? − 8 = 23`.

**Decided**

- **Two panels with `=` between them, and the child fills the hidden pile until they
  match.** The equals sign is the lesson, not the framing: `=` as "the same on both sides"
  is the reading later algebra needs, and `23 + ? = 30` is the first sentence a child meets
  that is not read left to right.
- **The subtraction rungs are balances too, not crossings-out.** `31 − ? = 23` is 31 blocks
  against 23 plus the hidden pile, so the child counts *up* on all six rungs. This came
  straight from the owner's point that a child solves `23 + ? = 35` by counting on from 23,
  not by taking away.
- **Six rungs, one mechanic** — what changes is where the hidden pile sits and how big the
  jump is. That is why it is one card and not four.
- **Opens on the easy rung.** Owner: *"for now, let's just go with the easy one."* A
  mix-of-all opening is wanted eventually; it is a one-line change and was left undone
  rather than guessed at.
- **The app speaks the running total of the side being built**, not the count of blocks
  added — counting on is the strategy being taught.

**Rejected and why**

- **Rods and flats.** Two rods and three ones is wider than three rods, so equal amounts
  would have unequal footprints and the balance would stop being readable. Every cell is
  one unit; each side is a single grid ten wide, which also makes every row a ten-frame so
  the answer blocks are seen finishing a part-built row.
- **Drawing the pile ending at the answer.** Trailing sockets are a fixed ten, so the empty
  boxes are never a second way to read the answer off the screen.
- **Sizing the blocks off the pile being built.** It resized blocks under a counting
  child's finger in 13 % of problems. Sizing is measured off the side without the hidden
  pile, which is known before the first tap.

**Still open**

- The mix-of-all default the owner asked for "in the end".
- Nothing has been published — this is a build. `service-worker.js` is untouched and the
  `CACHE_NAME` bump belongs to whatever publish carries it.

---

## No entries yet

This file starts empty on 2026-08-19. That is not the same as "nothing was ever decided
about Math Apps" — earlier discussion for this app was not captured anywhere, and it is not
reconstructed here, because guessing at it would be worse than an honest gap. Write the
next one.
