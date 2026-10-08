// What's Missing? — the hide-one-part engine (WHATS-MISSING-SPEC §1, owner's
// words, 2026-09-15, amended by §1b, 2026-09-16).
//
// The order of operations is the contract: build a complete, valid mathematical
// fact FIRST, then hide one part of it. No problem is ever a question in search
// of an answer — the answer exists before the '?' does, because the fact did.
// Where the '?' falls is a separate uniform draw over the fact's legal
// positions, made after the fact is built, so no slot can lean and no child can
// win by always answering the same position (§1: "Vary where ? appears. Avoid
// positional shortcuts or bias.").
//
// The values-first discipline is compare-problem.js's, mirrored: no binary
// float ever holds a value. A decimal here is an integer count of tenths —
// `0.7 + ? = 1.0` is `7 + ? = 10` in tenths, so `0.30000000000000004` cannot
// occur — and a fraction is integers n over d, with d born ≥ 2 and never 0.
// The pages will one day render `slots`; this module renders nothing, speaks
// nothing and reads no DOM (the ribbon, keypad and narration are the pages'
// business, not the engine's).
//
// Mirrored from compare-problem.js rather than re-invented: randInt/pick and
// the trailing-injectable-rng rule (:81, :706), the MAX_ATTEMPTS re-draw loop
// (:718), the avoid threading against immediate repeats (:731), the add/sub/
// mul/div fact draws (:143, :155, :169, :191), coprimeN (:90) and the
// digits-and-places decimal (:50). Deliberately NOT mirrored: the equal coin
// and the direction-first rule (this game's coin is the '?' position, drawn
// uniformly below), the magnitude TIERS (this spec has none) and the
// born-reduced display rule — `1/2 = ?/4` is unreduced on purpose, because the
// unreduced writing IS the question (see the Fraction section).

// --- The seven ribbon modes (§1 "Main ribbon", as amended by §1b) -------------
//
// Ribbon order: Count Block | + | − | × | ÷ | Fraction | Decimal. Which is
// default is the page's call; the engine has no default. The six old Count Block
// rungs are deliberately ABSENT from this list — they are not modes any more
// (§1: "Count Block has no child-facing submodes anymore") — and so is Number,
// removed by §1b (owner, 2026-09-16: "Remove the overlapping Number sequence
// mode from What's Missing" — number runs are Sequence's game, not this one's).
// makeMissingProblem() throws on the rungs' ids and tags, and on 'number'.
export const MODES = ['count', 'add', 'sub', 'mul', 'div', 'frac', 'dec'];

// --- Tokens: the fact as the child will see it --------------------------------
//
// A slot is one of:
//   { k:'int',  n }                a whole number as written
//   { k:'frac', n, d }             a fraction as written (may be unreduced —
//                                  see the Fraction section for why)
//   { k:'frac', n, d, hidePart }   a fraction with ONE part as the '?': that
//                                  part's field is null, hidePart names it
//   { k:'dec',  digits, places }   digits and a place count — the rational
//                                  digits / 10^places; places is always 1 here
//   { k:'op',   op }               '+', '−', '×', '÷' or '='
//   { k:'q' }                      the missing part — a whole value slot
//
// The answer is the exact written token that filled the missing slot (or, for
// a hidden fraction part, the integer that filled it), so a page can judge an
// entry without ever doing arithmetic of its own. The minus sign is '−'
// (U+2212), the character the app already prints — never a hyphen
// (REPRESENTATION-SPEC §3).

const int = (n) => ({ k: 'int', n });
const frac = (n, d) => ({ k: 'frac', n, d });
const dec = (tenths) => ({ k: 'dec', digits: tenths, places: 1 });
const op = (o) => ({ k: 'op', op: o });

// --- Exact arithmetic and random draws ----------------------------------------

// The same Euclid loop as compare-problem.js:17, kept local so each engine
// stands alone — its own test file keeps its own copy for the same reason.
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0 ? 1 : a;
}

// randInt and pick are compare-problem.js's two draws (:81, :85), mirrored line
// for line. Every draw in this module goes through the injected rng; there is
// no Math.random() anywhere, and the module refuses to run without one.
function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const MAX_ATTEMPTS = 500; // compare-problem.js:328's budget, mirrored

// --- Hiding: the position coin ------------------------------------------------
//
// The fact is built complete; hiding is a separate, uniform draw over its value
// slots. This is the missing-term twin of compare-problem.js's direction-first
// rule (space-math.html :7546-7562): the position is decided by an explicit
// coin over the legal positions, never by a generator's convenience, so the
// learnable shortcut this spec outlaws — "always answer the middle", "the ?
// is always the answer" — cannot arise.
function hideOneValue(rng, mode, family, slots) {
  const where = [];
  slots.forEach((s, i) => { if (s.k !== 'op') where.push(i); });
  const i = pick(rng, where);
  const answer = slots[i];
  const hidden = slots.slice();
  hidden[i] = { k: 'q' };
  return { mode, family, slots: hidden, answerSlot: i, answer };
}

// [a op b = c]; the '?' then hides one of the three value slots (0, 2 or 4).
function equation(rng, mode, family, a, o, b, c) {
  return hideOneValue(rng, mode, family, [a, op(o), b, op('='), c]);
}

// `0.3 0.4 ? 0.6` — no operators; the step is part of the fact. Only the
// decimal run survives here: whole-number runs (`18 19 ? 21`) are Sequence's,
// not this game's (§1b).
function sequence(rng, mode, family, tokens) {
  return hideOneValue(rng, mode, family, tokens);
}

// --- The operator modes: + − × ÷ ----------------------------------------------
//
// Each generator draws a COMPLETE fact first — §1's rule — from the same domain
// its twin representation uses in Which is Bigger?, so the two games agree
// about what a fact is.

// add — total first, then the split: genAdd's draw (compare-problem.js:143),
// mirrored. Terms ≥ 1, total ≤ 20; §1's "Missing result/addend" names both
// kinds, so all three positions hide.
function genAdd(rng) {
  const total = randInt(rng, 3, 20);
  const a = randInt(rng, 1, total - 1);
  return equation(rng, 'add', 'equation', int(a), '+', int(total - a), int(total));
}

// sub — result first, then a start above it: genSub's draw
// (compare-problem.js:155), mirrored. Result ≥ 1 and take ≥ 1, so no answer is
// negative and none is a bare 0 (§1: "No negative whole-number answers").
// §1's "Missing result/subtrahend/start" — all three positions hide.
function genSub(rng) {
  const result = randInt(rng, 1, 19);
  const start = randInt(rng, result + 1, 20);
  return equation(rng, 'sub', 'equation', int(start), '−', int(start - result), int(result));
}

// mul — factors 2–10, products ≤ 100: the same kid-appropriate table
// compare-problem.js enumerates as MUL_FACTS (:169), drawn here as two uniform
// factors, which is the identical distribution over the same 81 facts — the
// table exists there to filter by constraint, and this game has none.
// §1's "Missing product/factor" names both kinds.
function genMul(rng) {
  const a = randInt(rng, 2, 10);
  const b = randInt(rng, 2, 10);
  return equation(rng, 'mul', 'equation', int(a), '×', int(b), int(a * b));
}

// div — quotient and divisor drawn, dividend their product: genDiv's draw
// (compare-problem.js:191), mirrored. Exactness is by construction and the
// divisor is ≥ 2, so division by zero cannot occur (§1: "Division uses exact
// whole-number facts; no divide-by-zero"). §1's "Missing quotient/divisor/
// dividend" — all three. Dividends stay table-sized (≤ 100).
function genDiv(rng) {
  const q = randInt(rng, 2, 50);
  const divisors = [];
  for (let dv = 2; dv <= 10; dv++) {
    if (q * dv <= 100) divisors.push(dv);
  }
  const dv = pick(rng, divisors); // q ≤ 50 always admits dv = 2
  return equation(rng, 'div', 'equation', int(q * dv), '÷', int(dv), int(q));
}

// --- Decimal: tenths, never floats ----------------------------------------------
//
// §1: "Missing decimal/sequence: `0.7 + ? = 1.0`, `0.3 0.4 ? 0.6`". Every
// decimal in this module is an integer count of TENTHS with one place — the
// width of every example the spec itself gives — so every fact is built in
// integers and no float ever holds a value (`0.7 + 0.3 === 1.0` is false in
// JavaScript; 7 + 3 = 10 is not false). Decimal × and ÷ are out of scope (§1);
// the relationships are +, − and the sequence.
function genDecEquation(rng) {
  const t = randInt(rng, 2, 20); // the total, in tenths: 0.2 – 2.0
  if (rng() < 0.5) {
    const x = randInt(rng, 1, t - 1);
    return equation(rng, 'dec', 'equation', dec(x), '+', dec(t - x), dec(t));
  }
  const s = randInt(rng, 1, t - 1);
  return equation(rng, 'dec', 'equation', dec(t), '−', dec(s), dec(t - s));
}

function genDecSequence(rng) {
  const start = randInt(rng, 1, 96); // last term 9.9
  return sequence(rng, 'dec', 'sequence',
    [dec(start), dec(start + 1), dec(start + 2), dec(start + 3)]);
}

function genDec(rng) {
  return rng() < 0.5 ? genDecEquation(rng) : genDecSequence(rng);
}

// --- Fraction: equivalence and like-denominator sums -----------------------------
//
// §1: "Missing fraction parts/equivalence: `1/2 = ?/4`, `3/4 + ? = 1`". Two
// families, one coin. Fraction mode is a VALUE mode, not an operator mode
// (REPRESENTATION-SPEC §6.3): the relationships are + and − over a shared
// denominator, and fraction ×/÷ is out of scope (§1).
//
// THE BORN-REDUCED RULE IS DELIBERATELY NOT MIRRORED HERE. compare-problem.js
// draws every fraction coprime so `2/4` is never shown, because there an
// unreduced writing could settle a comparison. This game's own spec asks for
// `1/2 = ?/4` — the unreduced writing IS the question — and the sums count
// parts of one shared denominator, so `1/4 + ? = 3/4` is answered `2/4` as
// written, the counting answer (READ-FRACTION-SPEC's core invariant: "Never
// simplify the main fraction before representing or reading it"). The base of
// an equivalence pair is still born reduced (coprimeN below): the scaled side
// is the pair's unreduced member by design, never an accident.

const EASY_DENOMS = [2, 3, 4, 5, 6];

// Draw n coprime with d — compare-problem.js:90's draw, mirrored.
function coprimeN(rng, d) {
  for (;;) {
    const n = randInt(rng, 1, d - 1);
    if (gcd(n, d) === 1) return n;
  }
}

// 1/2 = ?/4 — and the same fact with any ONE of the four written parts hidden.
// §1's example hides the scaled numerator; each of the other three also has a
// single positive-integer answer (fix either part of a fraction and the other
// is determined), so all four hide. Which side carries the reduced fraction is
// a coin: scaling up (1/2 = 2/4) and simplifying down (2/4 = 1/2) are both
// real lessons. d is born ≥ 2 and k ≥ 2 multiplies it, so a denominator is
// never 0, never 1, and the two sides never share a denominator (§1: "Fraction
// denominator never zero").
function genFracEquivalence(rng) {
  const d1 = pick(rng, EASY_DENOMS);
  const n1 = coprimeN(rng, d1);
  const ks = [2, 3].filter((k) => d1 * k <= 12);
  const k = pick(rng, ks); // every d1 ≤ 6 admits k = 2, so ks is never empty
  const reduced = frac(n1, d1);
  const scaled = frac(n1 * k, d1 * k);
  const slots = rng() < 0.5
    ? [reduced, op('='), scaled]
    : [scaled, op('='), reduced];
  const [part, i] = pick(rng, [['n', 0], ['d', 0], ['n', 2], ['d', 2]]);
  const whole = slots[i];
  const answer = int(part === 'n' ? whole.n : whole.d);
  const hidden = slots.slice();
  hidden[i] = part === 'n'
    ? { ...whole, n: null, hidePart: 'n' }
    : { ...whole, d: null, hidePart: 'd' };
  return { mode: 'frac', family: 'equivalence', slots: hidden, answerSlot: i, answer };
}

// The whole 1 is written when the parts fill it (3/4 + 1/4 = 1); otherwise the
// total stays a fraction over the same denominator.
function totalTok(t, d) {
  return t === d ? int(1) : frac(t, d);
}

// 3/4 + ? = 1 and 1 − ? = 3/4: parts over one denominator d, every part worth
// ≥ 1/d, totals ≤ 1. The total hides as readily as a part — §1's interaction
// note expects "numerator/denominator input when an entire fraction is
// missing", so entire fractions must go missing.
function genFracSum(rng) {
  const d = pick(rng, EASY_DENOMS);
  if (rng() < 0.5) {
    const a = randInt(rng, 1, d - 1);
    const t = randInt(rng, a + 1, d);
    return equation(rng, 'frac', 'sum', frac(a, d), '+', frac(t - a, d), totalTok(t, d));
  }
  const t = randInt(rng, 2, d);
  const s = randInt(rng, 1, t - 1);
  return equation(rng, 'frac', 'sum', totalTok(t, d), '−', frac(s, d), frac(t - s, d));
}

function genFrac(rng) {
  return rng() < 0.5 ? genFracEquivalence(rng) : genFracSum(rng);
}

// --- Count Block: the six old rungs, internal ------------------------------------
//
// §1: the six child-facing submodes ("Up to a ten / Up to any / A big jump /
// ? first / Took away / Started with") are removed from the ribbon and "may
// remain internally as generators" — they remain here, ids, forms and
// difficulty numbers verbatim from MISSING_PRESETS (space-math.html :3242),
// and ONLY here. They are not modes: MODES does not contain them and
// makeMissingProblem() throws on their ids and tags. Count Block mixes them
// automatically; the child never chooses one.
const COUNT_STRATEGIES = [
  // Rung 1 is biased to targets ending 0 or 5 — owner, 2026-08-19: "they're
  // satisfying and easy to see" — kept as the easy tier's target rule.
  { id: 'w10', tag: 'Up to a ten', form: 'addEnd', bMax: 60, ansMin: 1, ansMax: 9, round: true },
  { id: 'wany', tag: 'Up to any', form: 'addEnd', bMin: 12, bMax: 60, ansMin: 1, ansMax: 10 },
  // The missing amount now has a ten inside it, so counting up starts needing
  // a strategy.
  { id: 'wbig', tag: 'A big jump', form: 'addEnd', bMin: 30, bMax: 99, ansMin: 11, ansMax: 25 },
  // Same maths, hidden pile written first.
  { id: 'wfirst', tag: '? first', form: 'addStart', bMax: 60, ansMin: 8, ansMax: 48 },
  { id: 'wtook', tag: 'Took away', form: 'subTake', bMax: 60, ansMin: 1, ansMax: 12 },
  { id: 'wstart', tag: 'Started with', form: 'subStart', bMax: 60 },
];

// The form is drawn BEFORE the rung, uniformly over the four: the three addEnd
// rungs are difficulty tiers of ONE form, and picking a rung uniformly would
// put the '?' in the second slot four times in six. Form-first keeps the
// equation slot a fair half (addEnd and subTake hide the second term, addStart
// and subStart the first) — Count Block's share of §1's "no positional bias"
// is enforced right here, in the mixer. The hidden pile's visual SIDE follows
// the old drawing grammar instead (countLayout below).
const COUNT_FORMS = ['addEnd', 'addStart', 'subTake', 'subStart'];

// One complete fact from one rung — the arithmetic is the old
// makeMissingProblem's (space-math.html :5408), transplanted with the rng
// injected in place of Math.random(). `a` is the given amount, `b` the amount
// on the other side, `answer` what the child builds. A rung declines (null)
// when its bounds cannot be met, and the caller re-draws — it never clamps
// (compare-problem.js's rule, and the old code's `continue`).
function drawCountFact(rng, st) {
  const bMin = st.bMin || 1;
  if (st.form === 'subStart') {
    const a = randInt(rng, 2, 12);            // what went away
    if (st.bMax - a < 10) return null;
    const b = randInt(rng, 10, st.bMax - a);  // what stayed
    return { a, b, answer: a + b };           // what we started with
  }
  if (st.form === 'subTake') {
    const answer = randInt(rng, st.ansMin, st.ansMax); // what went away
    const a = randInt(rng, Math.max(answer + 5, 15), st.bMax);
    return { a, b: a - answer, answer };      // b: what stayed
  }
  if (st.form === 'addStart') {
    const answer = randInt(rng, st.ansMin, st.ansMax);
    const a = randInt(rng, 2, 12);
    if (a + answer > st.bMax) return null;
    return { a, b: a + answer, answer };
  }
  // addEnd
  const answer = randInt(rng, st.ansMin, st.ansMax);
  let b;
  if (st.round) {
    // Targets ending 0 or 5, ten-heavy. The two cases are drawn SEPARATELY
    // rather than by picking a step of 10 or 5 and multiplying, because half
    // of every multiple of 5 is also a multiple of 10: that shortcut measured
    // 86.8/13.2, not the 72/28 drawn here (space-math.html :5437).
    if (rng() < 0.72) {
      const lo = Math.ceil(Math.max(answer + 1, 10) / 10);
      const hi = Math.floor(st.bMax / 10);
      if (hi < lo) return null;
      b = randInt(rng, lo, hi) * 10;
    } else {
      const lo = Math.ceil((Math.max(answer + 1, 5) - 5) / 10);
      const hi = Math.floor((st.bMax - 5) / 10);
      if (hi < lo) return null;
      b = randInt(rng, lo, hi) * 10 + 5;
    }
  } else {
    // Floored per rung so each one stays the question its rung promises
    // (space-math.html :5447).
    const lo = Math.max(answer + 1, bMin);
    if (st.bMax < lo) return null;
    b = randInt(rng, lo, st.bMax);
  }
  if (b - answer < 1) return null;
  return { a: b - answer, b, answer };
}

// The two block sides — missingLayout (space-math.html :5398) mirrored exactly:
// given piles are always drawn before the hidden one, and the hidden pile
// changes sides with what the child is building (left when building a total or
// the start, right when building the part that was taken away — 3:1 by grammar,
// not by accident). Pure data; the renderer draws blocks and never computes.
function countLayout(form, a, b) {
  if (form === 'subTake') {
    return { left: [{ kind: 'have', n: a }], right: [{ kind: 'have', n: b }, { kind: 'gap' }] };
  }
  if (form === 'subStart') {
    return { left: [{ kind: 'gap' }], right: [{ kind: 'gone', n: a }, { kind: 'have', n: b }] };
  }
  return { left: [{ kind: 'have', n: a }, { kind: 'gap' }], right: [{ kind: 'have', n: b }] };
}

// Count Block's '?' position is fixed by the form — the mixer's uniform form
// draw IS the position draw. The equation is written in reading order even on
// the rungs whose picture draws the given pile first; the strip and the picture
// telling the same fact two ways is those rungs' own lesson
// (space-math.html :5385-5393).
function countProblem(form, st, f) {
  const { a, b, answer } = f;
  const q = { k: 'q' };
  const slots = form === 'addEnd' ? [int(a), op('+'), q, op('='), int(b)]
    : form === 'addStart' ? [q, op('+'), int(a), op('='), int(b)]
    : form === 'subTake' ? [int(a), op('−'), q, op('='), int(b)]
    : [q, op('−'), int(a), op('='), int(b)];
  return {
    mode: 'count',
    family: form,
    strategy: st.id,
    slots,
    answerSlot: (form === 'addEnd' || form === 'subTake') ? 2 : 0,
    answer: int(answer),
    layout: countLayout(form, a, b),
  };
}

function drawCount(rng) {
  const form = pick(rng, COUNT_FORMS);
  const rungs = COUNT_STRATEGIES.filter((s) => s.form === form);
  const st = pick(rng, rungs);
  const fact = drawCountFact(rng, st);
  return fact ? countProblem(form, st, fact) : null;
}

// --- The entry point --------------------------------------------------------------

// §1: "Avoid immediately repeating the same problem." The same question as
// written — mode and slots — is refused; the same fact with a different part
// hidden is a different problem and is allowed. compare-problem.js's `avoid`
// (:731), restated for written questions: the page threads the previous
// problem back in, and a mode switch re-deals with the old problem as avoid.
function sameTokens(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => sameTokens(a[key], b[key]));
}

function sameProblem(a, b) {
  return a.mode === b.mode && sameTokens(a.slots, b.slots);
}

function drawProblem(mode, rng) {
  switch (mode) {
    case 'count': return drawCount(rng);
    case 'add': return genAdd(rng);
    case 'sub': return genSub(rng);
    case 'mul': return genMul(rng);
    case 'div': return genDiv(rng);
    case 'frac': return genFrac(rng);
    case 'dec': return genDec(rng);
    default: throw new Error('unknown mode: ' + mode);
  }
}

// The rng is the trailing injectable parameter, as in compare-problem.js:706.
// There is no default: every draw goes through it, and a single Math.random()
// anywhere would make the module untestable, so the module refuses to run
// without one.
export function makeMissingProblem(mode, avoid = null, rng) {
  if (typeof rng !== 'function') throw new Error('makeMissingProblem requires an rng');
  if (!MODES.includes(mode)) {
    throw new Error('unknown mode: ' + mode + ' — the ribbon offers ' + MODES.join(' | '));
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const p = drawProblem(mode, rng);
    if (!p) continue; // a rung declined; re-draw, never clamp
    if (avoid && sameProblem(p, avoid)) continue;
    return p;
  }
  throw new Error('makeMissingProblem: could not draw a ' + mode + ' problem');
}
