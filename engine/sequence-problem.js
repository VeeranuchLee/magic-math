// Sequence — the pattern-run engine (SEQUENCE-SPEC §17, §18; CG-095).
//
// The contract is one mathematical source of truth (§17). A question is
// { family, operator, start, stepOrFactor, terms, blankIndex, answer,
// ruleLabel } and nothing else: `terms` is the rule applied forward from
// `start` exactly once, `answer` is assigned from `terms[blankIndex]` —
// never recomputed — and `ruleLabel` is built once by ruleLabelFor. The
// rendered sequence, the expected answer, the hint transitions and the rule
// reveal all read this object and derive nothing; the failure this exists to
// prevent is UI code computing the answer separately from the terms and the
// two disagreeing on exactly the questions a child gets wrong.
//
// Field notes: `stepOrFactor` is §17's `step` for add/sub and its `factor` /
// divisor for ×/÷, unified; §17's `length` is terms.length, which §2 pins at
// 5 — except ×10's four, by the owner's 2026-09-17 "shorter row" ruling (see
// the FACTORS note). `operator` is the logic key ('add' | 'sub' | 'multiply'
// | 'divide');
// `ruleLabel` is the display string with §16's proper symbols — kept separate
// so a display symbol can never be parsed as logic, nor a logic key shown.
//
// Like compare-problem.js this is a pure ES module: no DOM, no
// speechSynthesis, and every draw goes through the injected `rng` — one
// Math.random() anywhere would make a seeded run unreproducible. `answer` is
// a number, never a narration string: a bare "25" text entry resolves ungated
// in every mode and leaked across games (2026-08-20), so speech routing
// belongs to the caller (§23, CG-095 §8).

// --- Constants (§2, §9, §10, §11) ---------------------------------------------

export const TERM_COUNT = 5;            // §2: five terms, one blank, Phase 1
export const MAX_VISIBLE_VALUE = 9999;  // §9: discard above, never clamp

// ×10's row, by the owner's "shorter row" ruling (2026-09-17): FOUR terms,
// the one exception to §2's five. A five-term whole-number ×10 run bottoms
// out at 1 × 10⁴ = 10,000 — one digit past MAX_VISIBLE_VALUE — so ×10 and ÷10
// were unsatisfiable as first written, not merely unused (CG-095), and FACTORS
// left 10 out. Four terms keep the top term at start × 10³ ≤ 9,000, under the
// unchanged cap; every other factor keeps TERM_COUNT.
export const X10_TERM_COUNT = 4;

// §11: first 10%, second 20%, middle 30%, fourth 25%, last 15%. A uniform
// index would put 20% on each and the middle would not be the commonest —
// the weighting is the requirement, not "it varies".
export const BLANK_WEIGHTS = [0.10, 0.20, 0.30, 0.25, 0.15];

// §11's weights are written for a five-position row; ×10's four-term row keeps
// the shape. First and last keep §11's own 10% and 15%, and the 75% §11 gives
// its interior trio is split across the two interior positions, tilted to the
// later one — so an interior blank stays the commonest and the first term
// stays rarest on the short row exactly as on the long one.
export const BLANK_WEIGHTS_X10 = [0.10, 0.35, 0.40, 0.15];

// §17 names the families 'addSub' and 'multiplyDivide'; 'count' and
// 'skipCount' follow the §5 ribbon labels. 'mixed' is a preset, not a
// family: a mixed question carries the family that generated it (§10). A
// Phase-2 family (§30) is a new attempt function plus an entry here, and
// nothing downstream changes, because everything reads the question object.
export const FAMILIES = ['count', 'skipCount', 'addSub', 'multiplyDivide'];
export const PRESETS = FAMILIES.concat(['mixed']);

// §10's mixing weights: Count 20%, Skip Count 25%, +/− 30%, ×/÷ 25%.
const MIXED_WEIGHTS = [0.20, 0.25, 0.30, 0.25];

const BLANK_TABLE = BLANK_WEIGHTS.map((w, i) => [i, w]);
const BLANK_TABLE_X10 = BLANK_WEIGHTS_X10.map((w, i) => [i, w]);

// §16: child-facing symbols, never * or /. ruleLabel is display-only.
const OP_SYMBOL = { add: '+', sub: '−', multiply: '×', divide: '÷' };

function ruleLabelFor(operator, k) {
  return OP_SYMBOL[operator] + k;
}

// --- Random draws -------------------------------------------------------------
//
// Every draw in this module goes through the injected `rng`; there is no
// Math.random() anywhere, and the seeded test harness depends on that.

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// table is [[value, weight], ...]. The draw is over the weights' sum, so a
// filtered table stays proportional without renormalising by hand.
function weightedPick(rng, table) {
  let total = 0;
  for (const entry of table) total += entry[1];
  const r = rng() * total;
  let acc = 0;
  for (const entry of table) {
    acc += entry[1];
    if (r < acc) return entry[0];
  }
  return table[table.length - 1][0]; // float-slop guard, unreachable in practice
}

// --- Terms: the one rule, applied forward --------------------------------------
//
// The only place terms come from. Division is refused here on purpose: its
// terms exist only as a reversed multiplication (§9), and this throw is the
// module's way of saying so if a future family tries to forget it.

// The row length for a question: §2's five, except ×10's four (2026-09-17).
// One function answers it for the generator, the invariant gate and the ported
// page copy alike, so the exception is stated once and cannot drift. The
// family is part of the key because an additive step of 10 — skip counting by
// 10, +10 — is an ordinary five-term row; only the factor 10 runs short.
export function termCountFor(family, factor) {
  return family === 'multiplyDivide' && factor === 10 ? X10_TERM_COUNT : TERM_COUNT;
}

function buildTerms(operator, start, k, count = TERM_COUNT) {
  if (operator === 'divide') {
    throw new Error('division terms come only from reversing a multiplication (§9)');
  }
  const terms = [start];
  for (let i = 1; i < count; i++) {
    const prev = terms[i - 1];
    terms.push(operator === 'add' ? prev + k : operator === 'sub' ? prev - k : prev * k);
  }
  return terms;
}

// Why ambiguous sequences cannot be generated (§19): there is no search over
// sequences to reject. Every question is constructed by iterating one
// constant rule from one start, so an alternating rule, two interwoven
// sequences, a Fibonacci-like rule, squares, primes or growing differences
// would each need a code path this module does not contain. §19's refusal
// list is a property of the construction; a filter that "checked" it after
// the fact could only re-verify the rule it just applied — which is exactly
// what the constant-rule check in validateSequenceProblem does, on every
// attempt, before anything leaves the module.

// --- The additive families: count, skipCount, addSub (§6, §7, §8) --------------
//
// One construction for all three: draw the constant step, draw the direction,
// draw a magnitude band the whole five-term run fits inside, then draw the
// start. Ascending puts the band's ceiling at terms[4], descending at
// terms[0]; either way every term stays inside [lo, hi], so a negative term
// cannot occur and the 9,999 cap is unreachable here (bands top out at
// 1,000). Lower bands are weighted up because §6 wants lower numbers more
// common, with the occasional 100–1,000 Count run for the larger-number
// exposure the app already gives.

const COUNT_STEP = 1; // §6: +1 / −1

// §7: steps 2, 5, 10 high; 3, 4 medium.
const SKIP_STEPS = [[2, 0.28], [5, 0.28], [10, 0.28], [3, 0.08], [4, 0.08]];

// §8/§27: N in 2–20, smaller steps somewhat more common.
const ADDSUB_SMALL_SHARE = 0.60;

// Magnitude bands, whole-sequence [lo, hi] (§6, §27).
const COUNT_BANDS = [
  { lo: 0, hi: 20, w: 0.55 },     // mostly 0–20
  { lo: 0, hi: 100, w: 0.30 },    // then 0–100
  { lo: 100, hi: 1000, w: 0.15 }, // occasionally 100–1,000
];
const SKIP_BANDS = [
  { lo: 0, hi: 30, w: 0.45 },
  { lo: 0, hi: 100, w: 0.40 },
  { lo: 0, hi: 1000, w: 0.15 },
];
const ADDSUB_BANDS = [
  { lo: 0, hi: 60, w: 0.40 },
  { lo: 0, hi: 200, w: 0.35 },
  { lo: 0, hi: 1000, w: 0.25 },
];

// A band fits a step only if a five-term run stays inside it: hi − 4·step ≥
// lo. When the drawn step outruns the drawn band (skip-10 in the 0–30 band,
// an addSub step of 16–20 in the 0–60 band), escalate to the next band up
// rather than clamping the start — clamping is what §9 forbids, and a
// squeezed start would quietly park every large step at one band's floor.
// Every top band fits every Phase-1 step, so the fallback below is kept
// defensive, not hopeful.
function drawBand(rng, bands, step) {
  const drawn = weightedPick(rng, bands.map((b) => [b, b.w]));
  for (let i = bands.indexOf(drawn); i < bands.length; i++) {
    if (bands[i].hi - 4 * step >= bands[i].lo) return bands[i];
  }
  return bands[bands.length - 1];
}

function additiveAttempt(rng, family) {
  let step, bands;
  if (family === 'count') {
    step = COUNT_STEP;
    bands = COUNT_BANDS;
  } else if (family === 'skipCount') {
    step = weightedPick(rng, SKIP_STEPS);
    bands = SKIP_BANDS;
  } else {
    step = rng() < ADDSUB_SMALL_SHARE ? randInt(rng, 2, 10) : randInt(rng, 11, 20);
    bands = ADDSUB_BANDS;
  }
  const operator = rng() < 0.5 ? 'add' : 'sub';
  const band = drawBand(rng, bands, step);
  const start = operator === 'add'
    ? randInt(rng, band.lo, band.hi - 4 * step)
    : randInt(rng, band.lo + 4 * step, band.hi);
  return { family, operator, start, stepOrFactor: step, terms: buildTerms(operator, start, step) };
}

// --- The multiplicative family (§9) --------------------------------------------
//
// FACTORS carries 10 again, on the shorter row the owner ruled for it
// (2026-09-17, "shorter row"). It had been omitted deliberately: a five-term
// ×10 run of whole numbers has a smallest possible top term of 1 × 10⁴ =
// 10,000 — above §9's own 9,999 cap — so ×10 and ÷10 were unsatisfiable in
// Phase 1 as first written, and the conflict was reported to the owner
// (CG-095) rather than resolved silently. Of the three routes put to the
// owner — give ×10 a shorter row, raise the cap to five digits, drop ×10 —
// the ruling chose the shorter row: a ×10 (or ÷10, its reverse) question is
// FOUR terms, every term fits under the unchanged cap, and no check was
// relaxed. Weight: §9 keeps 10 in its high tier with 2, 3 and 5 — ×10 is the
// place-value pattern, the "add a zero" move — so the four highs split evenly
// at 0.22 and 4 stays the lone medium at 0.12.
const FACTORS = [[2, 0.22], [3, 0.22], [5, 0.22], [10, 0.22], [4, 0.12]];

// §28's examples all start small (1–5), so most draws do too — but the
// "any" branch reaches starts whose ×5 and ×10 runs bust the cap, which keeps
// §9's discard-and-regenerate path genuinely live rather than decorative.
const MULDIV_SMALL_SHARE = 0.60;

function multiplyDivideAttempt(rng) {
  const operator = rng() < 0.5 ? 'multiply' : 'divide';
  const factor = weightedPick(rng, FACTORS);
  const multStart = rng() < MULDIV_SMALL_SHARE ? randInt(rng, 1, 9) : randInt(rng, 1, 30);
  // ×10 stops one term earlier (the 2026-09-17 ruling), so a start ≤ 9 tops
  // out at ≤ 9,000; the 1–30 branch still draws the 10–30 starts that bust,
  // which keeps §9's discard path live for 10 exactly as it already is for 5.
  const ascending = buildTerms('multiply', multStart, factor,
    termCountFor('multiplyDivide', factor));
  // ÷ runs are valid × runs REVERSED (§9). The construction multiplies only;
  // it never divides, so integer terms are guaranteed by how the terms are
  // built — divide-then-round cannot occur because no division happens.
  const terms = operator === 'multiply' ? ascending : ascending.slice().reverse();
  return { family: 'multiplyDivide', operator, start: terms[0], stepOrFactor: factor, terms };
}

// --- The question signature (§18) ----------------------------------------------
//
// §18 asks to avoid immediately repeating the same start, rule, term array
// and blank position. Those, plus the family, determine a question outright
// (the terms follow from the rule), so the signature IS the question and
// only an exact consecutive repeat is refused. Refusing any component on its
// own — a repeated blank position, say — would fight §11's weighted blank
// distribution, which has to hold unconditionally, so it is not done.

export function questionSignature(p) {
  return p.family + '|' + p.operator + '|' + p.start + '|' +
    p.stepOrFactor + '|' + p.blankIndex;
}

// --- The invariant gate (§18, §31) ---------------------------------------------
//
// Every attempt passes through here before it leaves the module; a failure
// is discarded and a fresh attempt drawn — §9's "discard it and generate
// another", never a clamp. Most of these failures cannot be constructed by
// the generators above; the gate exists because §31 wants the maths checked,
// not trusted, and it is what turns the 9,999 cap into a live rejection (the
// ×5 big-start draws really do bust it). Verification may divide exactly —
// construction never does.
export function validateSequenceProblem(p) {
  if (!p || typeof p !== 'object') return false;
  const { family, operator, start, stepOrFactor, terms, blankIndex, answer, ruleLabel } = p;
  if (!FAMILIES.includes(family)) return false;
  if (!(operator in OP_SYMBOL)) return false;
  if (!Number.isInteger(start) || !Number.isInteger(stepOrFactor)) return false;
  // The row length is the rule's own: five, or ×10's four (2026-09-17). A
  // four-term ×2 row and a five-term ×10 row are both refused here, so the
  // exception cannot leak into any other factor's shape.
  const count = termCountFor(family, stepOrFactor);
  if (!Number.isInteger(blankIndex) || blankIndex < 0 || blankIndex >= count) return false;
  if (!Array.isArray(terms) || terms.length !== count) return false;
  // NaN, Infinity, −0, negatives and above-cap values all fail here (§31).
  for (const t of terms) {
    if (!Number.isInteger(t) || t < 0 || t > MAX_VISIBLE_VALUE || Object.is(t, -0)) return false;
  }
  if (!Number.isInteger(answer) || answer !== terms[blankIndex]) return false;
  if (terms[0] !== start) return false;
  if (ruleLabel !== ruleLabelFor(operator, stepOrFactor)) return false;
  // No +0/−0/×0/×1/÷0/÷1 (§18): additive steps are ≥ 1, factors ≥ 2.
  if ((operator === 'add' || operator === 'sub') && stepOrFactor < 1) return false;
  if ((operator === 'multiply' || operator === 'divide') && stepOrFactor < 2) return false;
  // The one constant rule, at every step, on the stored terms (§31).
  for (let i = 1; i < terms.length; i++) {
    const a = terms[i - 1], b = terms[i], k = stepOrFactor;
    if (operator === 'add' && b !== a + k) return false;
    if (operator === 'sub' && b !== a - k) return false;
    if (operator === 'multiply' && b !== a * k) return false;
    if (operator === 'divide' && !(a % k === 0 && b === a / k)) return false;
  }
  return true;
}

// --- The entry point (§10, §17) -------------------------------------------------

const MAX_ATTEMPTS = 500;

// Mixed draws from the four Phase-1 families with §10's weights, and never
// the same family twice in a row when the previous problem is given — the
// strongest "avoid more than 2 consecutive questions from the same family
// where practical" (§10) available to a stateless call holding one problem
// of memory. The renormalised redraw settles ~2pp from the stated weights
// (addSub 30% → ~28%), which §10 explicitly tolerates ("exact weighting is
// not critical").
function drawMixedFamily(rng, avoidFamily) {
  const table = FAMILIES.map((f, i) => [f, MIXED_WEIGHTS[i]]);
  const drawn = weightedPick(rng, table);
  if (!avoidFamily || drawn !== avoidFamily) return drawn;
  return weightedPick(rng, table.filter((entry) => entry[0] !== avoidFamily));
}

// The rng is the trailing injectable parameter, as in compare-problem.js.
// There is no default: a single Math.random() anywhere would make the module
// untestable, so it refuses to run without one. `avoid` is the previous
// question (or null); it feeds only §18's repeat rule and §10's mixed-family
// rotation, and never constrains the mathematics.
export function makeSequenceProblem(preset, avoid = null, rng) {
  if (typeof rng !== 'function') throw new Error('makeSequenceProblem requires an rng');
  if (!PRESETS.includes(preset)) throw new Error('unknown preset: ' + preset);
  const avoidSignature = avoid ? questionSignature(avoid) : null;
  const avoidFamily = avoid ? avoid.family : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const family = preset === 'mixed' ? drawMixedFamily(rng, avoidFamily) : preset;
    const a = family === 'multiplyDivide'
      ? multiplyDivideAttempt(rng)
      : additiveAttempt(rng, family);
    const shortRow = termCountFor(a.family, a.stepOrFactor) === X10_TERM_COUNT;
    const blankIndex = weightedPick(rng, shortRow ? BLANK_TABLE_X10 : BLANK_TABLE);
    const p = {
      family: a.family,
      operator: a.operator,
      start: a.start,
      stepOrFactor: a.stepOrFactor,
      terms: a.terms,
      blankIndex,
      answer: a.terms[blankIndex], // assigned from the terms, never recomputed
      ruleLabel: ruleLabelFor(a.operator, a.stepOrFactor),
    };
    if (!validateSequenceProblem(p)) continue; // discard, do not clamp (§9)
    if (avoidSignature !== null && questionSignature(p) === avoidSignature) continue; // §18
    return p;
  }
  throw new Error('makeSequenceProblem: could not draw a valid ' + preset + ' question');
}
