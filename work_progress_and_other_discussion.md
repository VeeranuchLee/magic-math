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

## 2026-08-19 — Built: the counting stage, counted by rows

Task record: `coordination/tasks/2026-08-19-claudecode-missing-counting-stage.md`

**Decided** — owner: *"count by rows"*. Built the same session.

**How it works** — What's Missing? now opens in a **counting stage**: both piles, no
sockets, no numerals. Tapping a full row counts ten, so tapping rows in order says
"ten, twenty, thirty…"; the part-row at the bottom counts in ones. A side's numeral
appears when the child's own count reaches its total, and the sockets only open once both
sides are counted. Counting 77 is fourteen taps, not seventy-seven — which is what made the
stage affordable at all.

**Two bugs found by playing it, both worth remembering**

- **The numerals vanished when the sockets opened.** The child counted 24 and 25, then had
  both taken away exactly when they needed them. A counted side now keeps its numeral for
  the rest of the problem, including on rung 1 which otherwise writes nothing until the win.
- **Five of the six rungs printed the totals during the counting stage**, because they are
  `show:'both'` — so a child could read 37 rather than count to it, which is the whole thing
  the stage exists to stop. The numeral is now gated on the child's count on **every** rung,
  not on the rung's own setting.

**Corrected** — an earlier note here said a child could finish "every blocks rung" by
matching shapes. Only rung 1 is `show:'blocks'`; rungs 2 - 6 print their numerals. The
broader point held and is what the build acted on: a printed number gets read, not counted.

**Still open** — the mix-of-all opening rung; and this wants watching with a real
four-year-old before it is called done, particularly whether the counting stage is welcome
on every problem or wears out.

---

## 2026-08-19 — What's Missing? never asks the child what each side counts to

Task record: `coordination/tasks/2026-08-19-claudecode-missing-counting-stage.md` (proposed)

**Discussed** — straight after the v12 publish, owner: *"I think the current what's missing
lack the stage where children get to know which side count to what. so maybe we can start
from what's bigger and make it two stages?"*

**Found** — the observation lands on one line. `showNum = preset.show!=='blocks' || won`
(`space-math.html:2050`) hides both side totals until the problem is **won**, so a child can
finish every blocks rung by matching two shapes and never form either number; the
`47 + 3 = 50` strip arrives only as a reward. Meanwhile `tapGiven` already lets a child tap
the given blocks to count them aloud — it is optional and unprompted, so nothing invites it.
The material for a counting stage exists; it is not being staged or required.

**Decided — (B), same day.** Owner: *"B, keep the cards separate."* A counting stage opens
*inside* What's Missing?: both panels appear with no sockets, the child taps to count each
side until its numeral appears, and only then does the gap open. Which is Bigger? is the
model for how counting is prompted and is otherwise untouched; the home screen does not
change.

**Rejected** — (A), joining the two games into one two-card journey.

**Still open, and it is the real design problem:** tapping 47 blocks is not a stage a
four-year-old survives. The easy rung is fine, the higher rungs are not. Leading option is
**counting by rows** — the grid is ten wide on purpose, so a row is a ten-frame and tapping
one says "ten, twenty, thirty…", which is the same place-value reading the blocks rungs of
Which is Bigger? teach. Not to be solved by shortening the stage into a formality: the
counting is the lesson.

**Rejected in advance** — simply turning `showNum` on during play. That prints `47` and `50`
and turns a counting lesson into a subtraction one. The child should *arrive at* each total.

---

## 2026-08-19 — Published: What's Missing?, and the blocks that had gone nowhere

Task record: `coordination/tasks/2026-08-19-claudecode-publish-missing-number.md`

**Discussed** — owner: *"I want my game to be able to go live on public."* Carried in from
another session: that the GitHub billing problem does not block publishing.

**Decided**

- **That report was right, and the reason is now written down.** Public Pages is configured
  *Deploy from a branch* (`build_type: "legacy"`), so GitHub's own static pipeline builds it
  and no Actions minutes are involved. The billing block only greys out the **private**
  repo's PR checks. Publishing is a push, and a push is not CI.
- **The publish carried two changes, not one.** The hundreds-of-blocks rungs of Which is
  Bigger? (`6bad3b1`) had merged without a `CACHE_NAME` bump and so had reached nobody. A
  merge is not a publish, and an unbumped publish is not a delivery — the gap is invisible
  unless someone diffs live against `main` before shipping. Worth doing every time.
- **The cache bump rode in the game's own PR** rather than a second one, so the merge
  happened once.

**Rejected and why**

- **Declaring this a light-tier turn.** The four previous math-app publishes did, and each
  wrote `math-app/service-worker.js`, which is in `protected_paths.md`. The risk is nil
  because the file is tracked, but the tier records what was touched, not how risky it felt.

**Still open**

- The mix-of-all opening rung for What's Missing?.
- Account-wide CI has been dead for a while. The publish gates were run by hand; that is not
  a substitute for CI, and it is a separate job.

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
