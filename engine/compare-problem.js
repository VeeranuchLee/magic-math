// Which is Bigger? — the values-first compare engine (REPRESENTATION-SPEC §4, §5).
//
// The order of operations is the contract (§4.1): generate the left value, generate
// the right value, then render. `sign` is derived from the two rationals by
// cross-multiplication and from nothing else. No binary float ever holds a value:
// decimals are digits and a place count — the rational k/10 or k/100 — so
// `0.30000000000000004` cannot occur. parseFloat, Number(string), toFixed and
// string comparison are absent by construction.

// --- The value type ---------------------------------------------------------
//
// A value is { n, d }: integers, n ≥ 0, d ≥ 1, always reduced. Integers have d:1.
// There is no second number type anywhere in this module. One deliberate,
// confined exception to "always reduced" exists — the whole-valued equal-pair
// fraction 4/2 = 2 (owner, 2026-09-14) — documented at genWholeValueFrac.

export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0 ? 1 : a;
}

export function makeValue(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new Error('value parts must be integers: ' + n + '/' + d);
  }
  if (n < 0 || d < 1) {
    throw new Error('value out of domain: ' + n + '/' + d);
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function intValue(k) {
  return makeValue(k, 1);
}

export function isReduced(v) {
  return Number.isInteger(v.n) && Number.isInteger(v.d) && v.n >= 0 && v.d >= 1 &&
    gcd(v.n, v.d) === 1;
}

// Decimal values as digits and a place count (§4.3): the rational k / 10^places.
// `places` is 1 or 2. This is the only way a decimal value comes into being.
export function decValue(digits, places) {
  if (!Number.isInteger(digits) || digits < 1) {
    throw new Error('decimal digits must be a positive integer: ' + digits);
  }
  if (places !== 1 && places !== 2) {
    throw new Error('decimal places must be 1 or 2: ' + places);
  }
  const d = places === 1 ? 10 : 100;
  return makeValue(digits, d);
}

// Compare two values by cross-multiplication (§4.2). Exact — the products are
// far inside safe integer range at these magnitudes — and the only comparison
// rule in the module.
export function compareValues(a, b) {
  const l = a.n * b.d; // left.n × right.d
  const r = b.n * a.d; // right.n × left.d
  if (l < r) return '<';
  if (l > r) return '>';
  return '=';
}

export function valuesEqual(a, b) {
  return compareValues(a, b) === '=';
}

// --- Random draws -----------------------------------------------------------
//
// Every draw in this module goes through the injected `rng`. There is no
// Math.random() anywhere; the seeded test harness depends on that.

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Draw n coprime with d (§4.3): 2/4 is never shown; fractions are born reduced.
function coprimeN(rng, d) {
  for (;;) {
    const n = randInt(rng, 1, d - 1);
    if (gcd(n, d) === 1) return n;
  }
}

// --- Tier ranges (§4.5) -----------------------------------------------------
//
// Magnitude lives here, not in the ribbon (§4.6). Tier W defaults to 1–20; the
// larger integer tiers keep the 2026-08-18 "big numbers" promise. mul/div stay
// table-sized in every tier.

export const TIERS = {
  1: { max: 20 },
  2: { max: 100 },
  3: { max: 1000 },
};

function tierMax(tier) {
  return (TIERS[tier] || TIERS[1]).max;
}

// --- Per-representation generators ------------------------------------------
//
// Each generator returns a side object { repr, value, expr? } where `expr`
// evaluates exactly to `value` (§4.2). Whole-number generators take (rng, tier,
// target) where target, when given, is the exact integer value the side must
// carry — used when the direction coin or the equality coin has already decided
// the relation. A generator returns null if it cannot express `target`; the
// caller re-draws (it never clamps, §4.5).

// A constraint is { target } (exact value — the equality coin) or { lo, hi }
// (the decided side of a direction). This normalises it to a range.
function normRange(constraint, defLo, defHi) {
  if (!constraint) return { lo: defLo, hi: defHi };
  if (constraint.target !== undefined) return { lo: constraint.target, hi: constraint.target };
  return { lo: constraint.lo, hi: constraint.hi };
}

// num — the numeral. Tier range; 1 is a poor "which is bigger?" numeral on its
// own, so the default draw starts at 2.
function genNum(rng, cap, constraint) {
  const { lo: rLo, hi: rHi } = normRange(constraint, 2, cap);
  const lo = Math.max(rLo, 1), hi = Math.min(rHi, cap);
  if (lo > hi) return null;
  return { repr: 'num', value: intValue(randInt(rng, lo, hi)) };
}

export { genNum };

// add — two terms, a + b IS the value. Terms ≥ 1, total inside the tier, so
// the smallest expressible total is 2.
function genAdd(rng, cap, constraint) {
  const { lo: rLo, hi: rHi } = normRange(constraint, 3, cap);
  const lo = Math.max(rLo, 2), hi = Math.min(rHi, cap);
  if (lo > hi) return null;
  const total = randInt(rng, lo, hi);
  const a = randInt(rng, 1, total - 1);
  return { repr: 'add', value: intValue(total), expr: { op: '+', a, b: total - a } };
}

// sub — a − b, result non-negative (owner's preference). a = b — a zero result —
// happens only when the caller asks for target 0, i.e. only when the equality
// coin asked for it. Draws keep b ≥ 1 whenever the tier has room for it.
function genSub(rng, cap, constraint) {
  const { lo: rLo, hi: rHi } = normRange(constraint, 1, Math.max(1, cap - 1));
  const lo = Math.max(rLo, 0), hi = Math.min(rHi, cap);
  if (lo > hi) return null;
  const result = randInt(rng, lo, hi);
  const a = randInt(rng, Math.min(result + 1, cap), cap);
  return { repr: 'sub', value: intValue(result), expr: { op: '−', a, b: a - result } };
}

export { genAdd, genSub };

// mul — kid-appropriate times-table facts: factors 2–10, product ≤ 100 (§5).
// The fact table is enumerated, so a target or a range is honoured exactly or
// the generator declines (null) — it never clamps.
const MUL_FACTS = [];
for (let a = 2; a <= 10; a++) {
  for (let b = 2; b <= 10; b++) {
    MUL_FACTS.push([a, b, a * b]);
  }
}

function genMul(rng, constraint) {
  let lo = 4, hi = 100;
  if (constraint) {
    if (constraint.target !== undefined) { lo = hi = constraint.target; }
    else { lo = constraint.lo; hi = constraint.hi; }
  }
  const ok = MUL_FACTS.filter((f) => f[2] >= lo && f[2] <= hi);
  if (ok.length === 0) return null;
  const [a, b, p] = ok[Math.floor(rng() * ok.length)];
  return { repr: 'mul', value: intValue(p), expr: { op: '×', a, b } };
}

// div — exact, no remainders (§5): divisor and quotient drawn, dividend is
// their product, divisor ≥ 2. Dividends stay table-sized (≤ 100), so the
// quotient tops out at 50.
function genDiv(rng, constraint) {
  let lo = 2, hi = 50;
  if (constraint) {
    if (constraint.target !== undefined) { lo = hi = constraint.target; }
    else { lo = constraint.lo; hi = constraint.hi; }
  }
  lo = Math.max(lo, 1);
  hi = Math.min(hi, 50);
  if (lo > hi) return null;
  const q = randInt(rng, lo, hi);
  const divisors = [];
  for (let dv = 2; dv <= 10; dv++) {
    if (q * dv <= 100) divisors.push(dv);
  }
  if (divisors.length === 0) return null;
  const dv = pick(rng, divisors);
  return { repr: 'div', value: intValue(q), expr: { op: '÷', a: q * dv, b: dv } };
}

export { genMul, genDiv };

// frac — proper, reduced, easy denominators first (§5). The denominator set is
// chosen by the pair: {2,3,4,5,6} at tier 1, {8,10} join at harder tiers, and
// {2,4,5,10} only, when paired with dec (§4.3) so every value the equality or
// closeness draw might need is exactly writable in ≤ 2 places. n is drawn
// coprime with d — 2/4 is never shown. The widened tier F draws (improper and
// whole-valued fractions, 2026-09-14) go through genImproperBetween and
// genWholeValueFrac below; this one stays the proper-draw workhorse.
function genFrac(rng, denominators) {
  const d = pick(rng, denominators);
  const n = coprimeN(rng, d);
  return { repr: 'frac', value: makeValue(n, d) };
}

// An improper fraction with value strictly between lo and hi (owner,
// 2026-09-14: §10 open question 4, closed — "5/4 > 1" is a shape the game must
// ask). n is drawn coprime with d exactly as in genFrac, so improper fractions
// are born reduced too, and a whole value cannot come out of here (n = k·d
// would share the factor d), which is why the closed hi end never lands. The
// denominator set is the caller's — see IMPROPER_DENOMS / MUL_FRAC_DENOMS.
function genImproperBetween(rng, lo, hi, denominators) {
  for (;;) {
    const d = pick(rng, denominators);
    const ns = [];
    for (let n = lo * d + 1; n <= hi * d; n++) {
      if (gcd(n, d) === 1) ns.push(n);
    }
    if (ns.length > 0) return { repr: 'frac', value: makeValue(pick(rng, ns), d) };
    // This d has no coprime numerator in the window; none of the callers'
    // windows is empty for every d, so re-draw the denominator.
  }
}

// THE UNREDUCED EXCEPTION — the only one in the module. Everywhere else
// fractions are born reduced (genFrac and genImproperBetween draw n coprime
// with d precisely so 2/4 is never shown), but a fraction worth a whole number
// is unreduced by definition: n = k·d shares the factor d. The owner asked for
// "4/2 = 2" by name (2026-09-14), so unreduced numerators are permitted ONLY
// when BOTH hold: the fraction's value is a whole number, AND the pair is an
// equal pair. Everywhere else the reduced rule stands unchanged — 2/4, 4/6 and
// 9/3 are never shown. The value is built raw rather than through makeValue,
// which would reduce 4/2 to the integer 2/1 and lose the fraction the child is
// meant to compare; compareValues is unaffected either way, since it
// cross-multiplies rather than reading the fraction's form.
function genWholeValueFrac(rng, k, denominators) {
  const d = pick(rng, denominators);
  return { repr: 'frac', value: { n: k * d, d } };
}

// dec — generated as digits and a place count (§4.3), never a float. The value
// IS k/10 or k/100 where k is `digits`. Ranges are given in hundredths
// (numerator over 100) so windows stay exact integer intervals.
function genDec(rng, loK, hiK) {
  if (loK > hiK) return null;
  const k = randInt(rng, loK, hiK);
  const canOnePlace = k % 10 === 0;
  const places = canOnePlace && rng() < 0.5 ? 1 : 2;
  const digits = places === 1 ? k / 10 : k;
  return { repr: 'dec', value: decValue(digits, places), expr: { digits, places } };
}

// blocks — whole numbers 1–999, never 1000 (§5): ten flats is a different
// lesson, and this generator cannot teach it by accident. The per-place
// drawing rules (ones only ≤ 10, rods and ones ≤ 99, per-place groups 100–999)
// are the renderer's business; the engine guarantees the bound.
function genBlocks(rng, cap, constraint) {
  const top = Math.min(cap, 999);
  let lo = 1, hi = top;
  if (constraint) {
    if (constraint.target !== undefined) { lo = hi = constraint.target; }
    else { lo = constraint.lo; hi = constraint.hi; }
  }
  if (lo < 1 || hi > 999 || lo > hi) return null;
  return { repr: 'blocks', value: intValue(randInt(rng, lo, hi)) };
}

export { genFrac, genDec, genBlocks };

// The whole-number dispatch (tiers W and D, and tier F's integer partners).
// `constraint` is { target } for an exact value (the equality coin, or a
// partner matched to a drawn fact) or { lo, hi } for a side of a decided
// direction. Every generator declines with null when it cannot express what
// was asked — the caller re-draws, it never clamps (§4.5).
function genWholeSide(repr, rng, cap, constraint) {
  switch (repr) {
    case 'num': return genNum(rng, cap, constraint);
    case 'blocks': return genBlocks(rng, cap, constraint);
    case 'add': return genAdd(rng, cap, constraint);
    case 'sub': return genSub(rng, cap, constraint);
    case 'mul': return genMul(rng, constraint);
    case 'div': return genDiv(rng, constraint);
    default: throw new Error('unknown whole-number representation: ' + repr);
  }
}

// --- The pair domains (§4.5) ------------------------------------------------

const WHOLE_REPRS = ['blocks', 'num', 'add', 'sub', 'mul', 'div'];
const EASY_DENOMS = [2, 3, 4, 5, 6];
const HARDER_DENOMS = [2, 3, 4, 5, 6, 8, 10];
const DEC_PAIRED_DENOMS = [2, 4, 5, 10]; // §4.3: exactly writable in ≤ 2 places
// The widened tier F draws (2026-09-14) keep to the familiar denominators:
// {2,3,4,5,6} beside a 1-or-2 partner — the owner's shapes are 3/2, 5/4, 7/4,
// 4/2, 6/3, 8/4 — and {2,3,4} only beside a mul fact, where reaching past the
// fact already needs numerators like 9 or 31 and a larger denominator would
// inflate them further (31/4 is the widest fraction the module ever draws).
const IMPROPER_DENOMS = [2, 3, 4, 5, 6];
const MUL_FRAC_DENOMS = [2, 3, 4];
// The mul facts a fraction can fight: the small end of the table (2 × 2, 2 × 3
// and 3 × 2) — the same reach-capping move tier W's mulDivRange makes for a
// lone fact. mul has no fact below 4 (its factors are 2–10, §5), and a
// fraction that could beat, say, 7 × 8 would not be a child's fraction at all.
const TIER_F_MUL_PRODUCTS = [4, 6];
// The equality coin (§4.4): written p = .15/.85 — not .15 — because the
// no-two-in-a-row gate makes the generator a two-state machine whose long-run
// share is p/(1+p) = .15. The rate is decided; this implements it.
const EQUAL_COIN = 0.15 / 0.85;
const MAX_ATTEMPTS = 500;

function isMulDiv(repr) {
  return repr === 'mul' || repr === 'div';
}

function fracDenominators(tier, otherRepr) {
  if (otherRepr === 'dec') return DEC_PAIRED_DENOMS;
  return tier >= 2 ? HARDER_DENOMS : EASY_DENOMS;
}

// Exact digit count of a whole number, by integer division — never a string
// comparison. Close pairs must share it, or digit count would settle them.
function digits10(k) {
  let c = 1;
  while (k >= 10) {
    k = Math.floor(k / 10);
    c++;
  }
  return c;
}

// Exact hundredths numerator of a k/100-representable value, else null.
function hundredths(v) {
  const k = 100 * v.n;
  return k % v.d === 0 ? k / v.d : null;
}

// --- Tier F: either side frac -----------------------------------------------

// The whole-number partner beside a fraction, and the fraction beside it — the
// widened tier F domain (owner, 2026-09-14; §4.5, §10 open question 4 closed).
// All three relations occur and the direction comes from the coin, never from
// the domain: which side carries the fraction is fixed by the pairing, and the
// coin then decides which value is bigger.
//
// The partner's value is its representation's own: num/blocks/sub/div carry
// 1 or 2; add's terms are ≥ 1 (§5) so its one fact here is 1 + 1 = 2; mul has
// no fact below 2 × 2 = 4 (§5), so it draws from TIER_F_MUL_PRODUCTS. The
// fraction reaches past every one of those values — 5/4 > 1, 5/2 > 1 + 1,
// 9/2 > 2 × 2, and the equal pairs 4/2 = 2, 8/2 = 2 × 2 — which is the whole
// of the widening: before it, fractions were proper-only and strictly below
// every partner, so the whole side won every time. That was exactly the
// learnable shortcut ("whole numbers always beat fractions") the owner ruled
// out, and it is what used to be reported by isDirectionFixed below.
//
// Every branch draws from a non-empty set, so no attempt declines here: both
// coins reach the problem untouched, the equal share stays exactly EQUAL_COIN's
// and the direction stays a fair half — on these pairings as on every other.
function fracWholeSides(rng, tier, partnerRepr, fracIsLeft, wantEqual, leftBigger, close) {
  const fracBigger = fracIsLeft ? leftBigger : !leftBigger;
  const proper = fracDenominators(tier, partnerRepr);
  let frac, partner;
  if (partnerRepr === 'mul') {
    // The fact draws first, inside the fraction's reach — tier D's precedent:
    // the sparse set draws first and the other side matches it.
    const fact = pick(rng, TIER_F_MUL_PRODUCTS);
    partner = genWholeSide('mul', rng, 0, { target: fact });
    if (wantEqual) {
      frac = genWholeValueFrac(rng, fact, MUL_FRAC_DENOMS);        // 8/2 = 2 × 2
    } else if (fracBigger) {
      frac = genImproperBetween(rng, fact, close ? fact + 1 : fact + 2, MUL_FRAC_DENOMS);
    } else if (close) {
      frac = genImproperBetween(rng, fact - 1, fact, MUL_FRAC_DENOMS); // 7/2 < 4, barely
    } else {
      frac = rng() < 0.5 ? genFrac(rng, proper)
        : genImproperBetween(rng, 1, fact, MUL_FRAC_DENOMS);       // 3/4 or 5/2 < 4
    }
  } else if (wantEqual) {
    const t = partnerRepr === 'add' ? 2 : (close ? 1 : 2);
    partner = genWholeSide(partnerRepr, rng, 10, { target: t });
    frac = genWholeValueFrac(rng, t, IMPROPER_DENOMS);             // 4/2 = 2, 2/2 = 1
  } else if (fracBigger) {
    // Beat a 1 from inside (1, 2) — 5/4, 3/2, 7/4; add's 2 from (2, 3) — 5/2.
    const t = partnerRepr === 'add' ? 2 : 1;
    partner = genWholeSide(partnerRepr, rng, 10, { target: t });
    frac = genImproperBetween(rng, t, t + 1, IMPROPER_DENOMS);
  } else {
    const t = partnerRepr === 'add' ? 2 : (close ? 1 : 2);
    partner = genWholeSide(partnerRepr, rng, 10, { target: t });
    frac = t === 1 ? genFrac(rng, proper)
      : close ? genImproperBetween(rng, 1, 2, IMPROPER_DENOMS)     // 7/4 < 2, barely
      : (rng() < 0.5 ? genFrac(rng, proper)
        : genImproperBetween(rng, 1, 2, IMPROPER_DENOMS));         // 3/4 or 5/4 < 2
  }
  if (!partner) return null; // defensive: every target above is expressible
  return fracIsLeft ? { left: frac, right: partner } : { left: partner, right: frac };
}

// 3/4 ? 0.75 → '=': the decimal is built from the fraction's own digits, so
// the pair is exact by construction, never rounded (§4.3).
function fracDecEqualSides(rng, fracIsLeft) {
  const d = pick(rng, DEC_PAIRED_DENOMS);
  const n = coprimeN(rng, d);
  const places = (n * 10) % d === 0 ? 1 : 2;
  const digits = (n * (places === 1 ? 10 : 100)) / d;
  const fracSide = { repr: 'frac', value: makeValue(n, d) };
  const decSide = { repr: 'dec', value: decValue(digits, places), expr: { digits, places } };
  return fracIsLeft ? { left: fracSide, right: decSide } : { left: decSide, right: fracSide };
}

// frac ? dec, decided direction. All window arithmetic is in exact hundredths.
// Close means near values (3/4 ? 0.8), so the pair cannot be settled by
// silhouette or digit count.
function fracDecUnequalSides(rng, fracIsLeft, leftBigger, close) {
  const frac = genFrac(rng, DEC_PAIRED_DENOMS);
  const { n, d } = frac.value;
  const num = 100 * n;
  const fl = Math.floor(num / d);
  const exact = num % d === 0;
  const fracIsBigger = fracIsLeft ? leftBigger : !leftBigger;
  let loK = 1, hiK = 200; // tier F decimals live in (0, 2]
  if (fracIsBigger) {
    hiK = exact ? fl - 1 : fl; // the decimal stays below the fraction
  } else {
    loK = fl + 1;             // the decimal stays above the fraction
  }
  if (close) {
    const ceilNd = exact ? fl : fl + 1;
    loK = Math.max(loK, ceilNd - 25);
    hiK = Math.min(hiK, fl + 25);
  }
  const dec = genDec(rng, loK, hiK);
  if (!dec) return null;
  return fracIsLeft ? { left: frac, right: dec } : { left: dec, right: frac };
}

// frac ? frac. Close means the same denominator: the pair is settled only by
// comparing numerators across the bar, never by how the shapes look.
function fracFracUnequalSides(rng, tier, leftBigger, close) {
  const denoms = fracDenominators(tier, 'frac');
  if (close) {
    const d = pick(rng, denoms);
    const ns = [];
    for (let k = 1; k < d; k++) {
      if (gcd(k, d) === 1) ns.push(k);
    }
    if (ns.length < 2) return null; // e.g. d = 2 has only one numerator
    const i = Math.floor(rng() * ns.length);
    let j = Math.floor(rng() * ns.length);
    if (j === i) j = (j + 1) % ns.length;
    const lo = { repr: 'frac', value: makeValue(Math.min(ns[i], ns[j]), d) };
    const hi = { repr: 'frac', value: makeValue(Math.max(ns[i], ns[j]), d) };
    return leftBigger ? { left: hi, right: lo } : { left: lo, right: hi };
  }
  const a = genFrac(rng, denoms);
  const b = genFrac(rng, denoms);
  const cmp = compareValues(a.value, b.value);
  if (cmp === '=') return null;
  if ((cmp === '>') !== leftBigger) return null;
  return { left: a, right: b };
}

// Tier F dispatch. Every branch can now express the equal coin and either side
// of the direction coin, so no pairing's answer is fixed by the domain — that
// is the 2026-09-14 widening (see fracWholeSides and isDirectionFixed below).
function tierFSides(leftRepr, rightRepr, tier, rng, wantEqual, leftBigger, close) {
  const fracIsLeft = leftRepr === 'frac';
  const otherRepr = fracIsLeft ? rightRepr : leftRepr;
  if (otherRepr === 'frac') {
    if (wantEqual) {
      const f = genFrac(rng, fracDenominators(tier, 'frac'));
      return { left: f, right: { repr: 'frac', value: f.value } };
    }
    return fracFracUnequalSides(rng, tier, leftBigger, close);
  }
  if (otherRepr === 'dec') {
    if (wantEqual) return fracDecEqualSides(rng, fracIsLeft);
    return fracDecUnequalSides(rng, fracIsLeft, leftBigger, close);
  }
  return fracWholeSides(rng, tier, otherRepr, fracIsLeft, wantEqual, leftBigger, close);
}

// --- Direction-fixed pairings: none left -------------------------------------
//
// This used to report the twelve frac-vs-whole pairings whose answer the old
// domain decided on its own: fractions were proper-only — strictly below 1 —
// while tier F's integer partner carried 1 or 2, and mul, having no fact in
// (0, 2], drew an ordinary table fact; the whole side was bigger every time,
// in either order. The owner widened the fraction domain on 2026-09-14 (§10
// open question 4, closed; see fracWholeSides above) precisely so that "whole
// numbers always beat fractions" could not be learned, and with it every
// pairing can honour either side of the direction coin — so this is now false
// everywhere.
//
// It stays exported because callers use it to ask whether a pairing needs a
// fairness exemption. What would bring a `true` back is a future domain change
// that re-fixed some pairing's answer — a representation whose expressible
// values all sat on one side of its partner's, the way proper-only fractions
// sat below 1.
export function isDirectionFixed(leftRepr, rightRepr) {
  // Retired 2026-09-14 by the widened fraction domain: no pairing's answer is
  // fixed by the domain any more. (Parameters kept for the callers' signature.)
  return false;
}

// --- Tier D: either side dec, neither frac ----------------------------------
//
// Decimals run 0.1–20 (§4.5) with 1–2 places; the other side is an integer or
// an integer-valued expression. All windows are exact hundredths numerators.

function decSideFromInteger(rng, v) {
  const places = rng() < 0.5 ? 1 : 2;
  const digits = v * (places === 1 ? 10 : 100);
  return { repr: 'dec', value: decValue(digits, places), expr: { digits, places } };
}

function tierDDecPartnerSides(rng, decIsLeft, partnerRepr, leftBigger, wantEqual, close) {
  let partner;
  if (isMulDiv(partnerRepr)) {
    // The fact draws first, inside tier D's reach; the decimal then matches it.
    const con = partnerRepr === 'mul' ? { lo: 4, hi: 20 } : { lo: 1, hi: 20 };
    partner = genWholeSide(partnerRepr, rng, 20, con);
  } else {
    const v = randInt(rng, 1, 20);
    partner = genWholeSide(partnerRepr, rng, 20, { target: v });
  }
  if (!partner) return null;
  const v = partner.value.n;
  if (wantEqual) {
    const dec = decSideFromInteger(rng, v);
    return decIsLeft ? { left: dec, right: partner } : { left: partner, right: dec };
  }
  const decIsBigger = decIsLeft ? leftBigger : !leftBigger;
  const kV = 100 * v;
  let loK = 10, hiK = 2000;
  if (decIsBigger) loK = kV + 1;
  else hiK = kV - 1;
  if (close) {
    // Same whole part (5.25 ? 5, 4.9 ? 5): the hundredths stay in v's whole.
    if (decIsBigger) hiK = Math.min(hiK, kV + 99);
    else loK = Math.max(loK, kV - 99);
  }
  const dec = genDec(rng, loK, hiK);
  if (!dec) return null;
  return decIsLeft ? { left: dec, right: partner } : { left: partner, right: dec };
}

function tierDDecDecSides(rng, wantEqual, leftBigger, close) {
  const first = genDec(rng, 10, 2000);
  if (!first) return null;
  if (wantEqual) {
    return { left: first, right: { repr: 'dec', value: first.value, expr: { ...first.expr } } };
  }
  const k = hundredths(first.value);
  let loK = 10, hiK = 2000;
  if (leftBigger) hiK = k - 1;
  else loK = k + 1;
  if (close) {
    const whole = Math.floor(k / 100);
    loK = Math.max(loK, whole * 100);
    hiK = Math.min(hiK, whole * 100 + 99);
  }
  const second = genDec(rng, loK, hiK);
  if (!second) return null;
  return { left: first, right: second };
}

function tierDSides(leftRepr, rightRepr, rng, wantEqual, leftBigger, close) {
  if (leftRepr === 'dec' && rightRepr === 'dec') {
    return tierDDecDecSides(rng, wantEqual, leftBigger, close);
  }
  const decIsLeft = leftRepr === 'dec';
  const partnerRepr = decIsLeft ? rightRepr : leftRepr;
  return tierDDecPartnerSides(rng, decIsLeft, partnerRepr, leftBigger, wantEqual, close);
}

// --- Tier W: both sides whole-number representations -------------------------

// A lone table fact's reach: its own table (§5 — products 4–100, quotients
// 2–50) cut to the tier, and to one below the tier when the fact must be the
// smaller side, so the whole-number partner (1–drawCap) has room on the
// decided side of the coin. Tier D already draws its facts this way ("the
// fact draws first, inside tier D's reach", above); tier W must too, or the
// re-draw spends the coin: at tier 1 (cap 20), 58 of the 81 products are 20
// or more and can never be overshot by a partner capped at 20, so the
// "partner is bigger" half of the coin declined far more often than its
// opposite and the fact side came out bigger on ~72% of unequal pairs
// (controller, 8 seeds × 400 draws). Inside the tier both halves succeed
// nearly always and the coin passes through to the problem untouched.
function mulDivRange(repr, cap, factIsSmaller) {
  const lo = repr === 'mul' ? 4 : 2;
  const table = repr === 'mul' ? 100 : 50;
  return { lo, hi: Math.min(table, factIsSmaller ? cap - 1 : cap) };
}

function tierWSides(leftRepr, rightRepr, tier, rng, wantEqual, leftBigger, close) {
  const cap = tierMax(tier);
  const blocksInvolved = leftRepr === 'blocks' || rightRepr === 'blocks';
  const drawCap = blocksInvolved ? Math.min(cap, 999) : cap; // never 1000 (§5)
  // Exactly one side is a table fact: whichever draws first below draws
  // inside mulDivRange's reach, not its full table.
  const loneFact = isMulDiv(leftRepr) !== isMulDiv(rightRepr);

  if (wantEqual) {
    // A table fact decides the shared value when either side must show one —
    // the fact is the sparse set, so it draws first.
    let firstRepr = null;
    if (isMulDiv(leftRepr)) firstRepr = leftRepr;
    else if (isMulDiv(rightRepr)) firstRepr = rightRepr;
    let firstSide = null, t;
    if (firstRepr) {
      firstSide = genWholeSide(firstRepr, rng, drawCap,
        loneFact ? mulDivRange(firstRepr, drawCap, false) : null);
      if (!firstSide) return null;
      t = firstSide.value.n;
    } else {
      const lo = (leftRepr === 'add' || rightRepr === 'add') ? 2 : 1;
      t = randInt(rng, lo, drawCap);
    }
    const otherRepr = firstRepr === leftRepr ? rightRepr : leftRepr;
    if (firstSide) {
      const other = genWholeSide(otherRepr, rng, drawCap, { target: t });
      if (!other) return null;
      return firstRepr === leftRepr
        ? { left: firstSide, right: other }
        : { left: other, right: firstSide };
    }
    const l = genWholeSide(leftRepr, rng, drawCap, { target: t });
    if (!l) return null;
    const r = genWholeSide(rightRepr, rng, drawCap, { target: t });
    if (!r) return null;
    return { left: l, right: r };
  }

  // Direction-first fairness (§4.4): the bigger side was already chosen, among
  // the sides that have room. The most constrained representation draws first —
  // a table fact if there is one (a lone one inside mulDivRange's reach, so
  // the partner can honour either side of the coin), otherwise the bigger
  // side, drawn with room below it — and the partner is constrained to the
  // decided side of that value. If the partner cannot express it, the attempt
  // declines and the whole pair re-draws; nothing is ever clamped (§4.5).
  // Which slot draws first is decided by the coin, never by comparing
  // representation names: on a symmetric pairing (num ? num) the names are
  // identical, so name-matching pinned the bigger side to the left.
  let firstIsLeft, firstIsBigger;
  if (isMulDiv(leftRepr) && isMulDiv(rightRepr)) {
    firstIsLeft = leftBigger;
    firstIsBigger = true;
  } else if (isMulDiv(leftRepr) || isMulDiv(rightRepr)) {
    firstIsLeft = isMulDiv(leftRepr);
    firstIsBigger = firstIsLeft ? leftBigger : !leftBigger;
  } else {
    firstIsLeft = leftBigger;
    firstIsBigger = true;
  }
  const firstRepr = firstIsLeft ? leftRepr : rightRepr;
  const otherRepr = firstIsLeft ? rightRepr : leftRepr;
  // A lone fact draws inside its tier reach, on the decided side of the room
  // (mulDivRange above); every other representation draws its own domain.
  const first = genWholeSide(firstRepr, rng, drawCap,
    loneFact ? mulDivRange(firstRepr, drawCap, !firstIsBigger) : null);
  if (!first) return null;
  const v = first.value.n;
  let lo = 1, hi = drawCap;
  if (firstIsBigger) hi = v - 1;
  else lo = v + 1;
  if (close) {
    const w = drawCap >= 100 ? 4 : 2;
    lo = Math.max(lo, v - w);
    hi = Math.min(hi, v + w);
  }
  const other = genWholeSide(otherRepr, rng, drawCap, { lo, hi });
  if (!other) return null;
  // A close pair must share its digit count, or a digit count would settle it.
  if (close && digits10(first.value.n) !== digits10(other.value.n)) return null;
  return firstIsLeft
    ? { left: first, right: other }
    : { left: other, right: first };
}

// --- The entry point (§4.1) -------------------------------------------------

const ALL_REPRS = WHOLE_REPRS.concat(['frac', 'dec']);

// The rng is the trailing injectable parameter (§4.4). There is no default:
// every draw goes through it, and a single Math.random() anywhere would make
// the module untestable, so the module refuses to run without one.
export function makeCompareProblem(leftRepr, rightRepr, tier = 1, avoid = null, rng) {
  if (typeof rng !== 'function') throw new Error('makeCompareProblem requires an rng');
  if (!ALL_REPRS.includes(leftRepr) || !ALL_REPRS.includes(rightRepr)) {
    throw new Error('unknown representation: ' + leftRepr + ' or ' + rightRepr);
  }
  if (!TIERS[tier]) throw new Error('unknown tier: ' + tier);

  // The pair domain is chosen from the two representations before any value is
  // drawn (§4.5).
  const kind = (leftRepr === 'frac' || rightRepr === 'frac') ? 'F'
    : (leftRepr === 'dec' || rightRepr === 'dec') ? 'D' : 'W';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // The equality gate, then the coin written .15/.85 (§4.4).
    const equalAllowed = !(avoid && avoid.sign === '=');
    const wantEqual = equalAllowed && rng() < EQUAL_COIN;
    const leftBigger = rng() < 0.5;
    const close = rng() < 0.5;
    const sides = kind === 'F'
      ? tierFSides(leftRepr, rightRepr, tier, rng, wantEqual, leftBigger, close)
      : kind === 'D'
        ? tierDSides(leftRepr, rightRepr, rng, wantEqual, leftBigger, close)
        : tierWSides(leftRepr, rightRepr, tier, rng, wantEqual, leftBigger, close);
    if (!sides) continue;
    // Not the same pair of values twice in a row (§4.4), restated for values.
    if (avoid && avoid.left && avoid.right &&
        valuesEqual(sides.left.value, avoid.left.value) &&
        valuesEqual(sides.right.value, avoid.right.value)) continue;
    // sign comes only from the values, by cross-multiplication.
    return {
      left: sides.left,
      right: sides.right,
      sign: compareValues(sides.left.value, sides.right.value),
    };
  }
  throw new Error('makeCompareProblem: could not draw ' + leftRepr + ' vs ' +
    rightRepr + ' at tier ' + tier);
}
