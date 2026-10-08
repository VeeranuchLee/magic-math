// Order the Numbers — pure engine (ORDER-NUMBERS-SPEC.md).
// No DOM, no speech, no Math.random. Every draw goes through the injected rng.

const ON_DENOMS = [2, 3, 4, 5, 6, 8, 10];
const ON_BOUNDS = [
  { min: 0, max: 1, step: 0.25 },
  { min: 0, max: 2, step: 0.5 },
  { min: 0, max: 3, step: 0.5 },
  { min: 0, max: 5, step: 1 },
  { min: 0, max: 10, step: 1 },
];
const MIN_SPACING = 0.06; // 6 % of the axis width
const MIN_SPACING_VALUE = { n: 3, d: 50 };
const MAX_TRIES = 1200;

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a || 1;
}

function reduce(n, d) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error('rational parts must be integers');
  if (d === 0) throw new Error('zero denominator');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function rat(n, d = 1) {
  return reduce(n, d);
}

/* Convert the decimal values used by the generator to rationals without routing an
 * ordering decision through a binary float. The generator only creates one- or
 * two-place decimals; the small normalisation also keeps a value such as
 * 0.30000000000000004 from becoming a 17-digit rational when a caller supplies it. */
export function ratFromFloat(x) {
  if (!Number.isFinite(x)) throw new Error('non-finite value');
  const rounded = Number(x.toFixed(6));
  const s = String(rounded).toLowerCase();
  const [mantissa, exponentText] = s.split('e');
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ''] = mantissa.split('.');
  let n = Number((whole || '0') + fraction);
  let d = 10 ** fraction.length;
  if (exponent > 0) n *= 10 ** exponent;
  else if (exponent < 0) d *= 10 ** (-exponent);
  return reduce(n, d);
}

export function compare(a, b) {
  const lhs = a.n * b.d;
  const rhs = b.n * a.d;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

export function equals(a, b) {
  return compare(a, b) === 0;
}

/* Conversion is for drawing and measuring, never for deciding an order. */
export function toNumber(a) {
  return a.n / a.d;
}

function decimalText(a) {
  const scaled = a.n * 100;
  if (scaled % a.d !== 0) return null;
  const hundredths = scaled / a.d;
  const sign = hundredths < 0 ? '-' : '';
  const abs = Math.abs(hundredths);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0').replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

/* Display descriptor. `preferred` is important: a generated 3/2 card is an
 * IMPROPER FRACTION card, while a generated 1.5 card is a DECIMAL card. Both
 * carry the same exact rational value, but the child-facing representation is
 * deliberately not collapsed to one another. */
export function displayOf(a, preferred) {
  if (preferred === 'fraction' && a.d !== 1) {
    return { kind: 'fraction', text: `${a.n}/${a.d}`, n: a.n, d: a.d };
  }
  if (a.d === 1) return { kind: 'whole', text: String(a.n), n: a.n, d: 1 };
  if (preferred === 'decimal') {
    const text = decimalText(a);
    if (text != null) return { kind: 'decimal', text, n: a.n, d: a.d };
  }
  const text = decimalText(a);
  if (text != null) return { kind: 'decimal', text, n: a.n, d: a.d };
  return { kind: 'fraction', text: `${a.n}/${a.d}`, n: a.n, d: a.d };
}

function clampRandom(rng) {
  const n = Number(rng());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0.999999999999, n));
}

function pick(rng, list) {
  return list[Math.floor(clampRandom(rng) * list.length)];
}

function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(clampRandom(rng) * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function randInt(rng, lo, hi) {
  return lo + Math.floor(clampRandom(rng) * (hi - lo + 1));
}

function rationalBounds(bounds) {
  return {
    min: ratFromFloat(bounds.min),
    max: ratFromFloat(bounds.max),
    step: ratFromFloat(bounds.step === undefined ? 1 : bounds.step),
  };
}

function contains(bounds, value) {
  const b = rationalBounds(bounds);
  return compare(value, b.min) >= 0 && compare(value, b.max) <= 0;
}

/* The generation bounds stay friendly and unchanged. When a generated answer lands
 * exactly on the upper bound, the drawing gets one more friendly tick of breathing
 * room so that answer is a dot inside the axis, never a dot under the arrowhead.
 * The 0–10 line uses 0–12 with two-place ticks; the shorter ranges extend by their
 * own natural step. */
export function lineBoundsFor(bounds, values) {
  const b = rationalBounds(bounds);
  if (!Array.isArray(values) || values.length === 0) return bounds;
  let largest = values[0];
  for (const value of values.slice(1)) if (compare(value, largest) > 0) largest = value;
  if (compare(largest, b.max) !== 0) return bounds;
  const step = b.max.n === 10 && b.max.d === 1 ? rat(2, 1) : b.step;
  const next = rat(b.max.n * step.d + step.n * b.max.d, b.max.d * step.d);
  return { min: bounds.min, max: toNumber(next), step: toNumber(step) };
}

function makeWhole(rng, bounds) {
  const lo = Math.ceil(bounds.min);
  const hi = Math.floor(bounds.max);
  if (lo > hi) return null;
  return rat(randInt(rng, lo, hi), 1);
}

function makeDecimal(rng, bounds) {
  const step = ratFromFloat(bounds.step);
  const minSteps = Math.ceil(bounds.min * step.d / step.n);
  const maxSteps = Math.floor(bounds.max * step.d / step.n);
  if (minSteps > maxSteps) return null;
  const steps = randInt(rng, minSteps, maxSteps);
  return rat(steps * step.n, step.d);
}

function fractionCandidates(bounds) {
  const out = [];
  const max = Math.floor(bounds.max);
  for (const d of ON_DENOMS) {
    for (let n = 1; n <= max * d; n++) {
      const r = rat(n, d);
      if (r.d === 1 || !contains(bounds, r)) continue;
      out.push(r);
    }
  }
  return out;
}

function decimalCandidates(bounds) {
  const out = [];
  const add = (n, d) => {
    const r = rat(n, d);
    if (contains(bounds, r)) out.push(r);
  };
  /* A few friendly places rather than a random cloud of hundredths. The pool
   * still includes one- and two-place decimals, while the spacing check below
   * decides which can coexist on a line. */
  for (let i = 0; i <= Math.round(bounds.max * 4); i++) add(i, 4);
  for (let i = 0; i <= Math.round(bounds.max * 2); i++) add(i, 2);
  for (let i = 0; i <= Math.round(bounds.max * 10); i++) add(i, 10);
  for (let i = 0; i <= Math.round(bounds.max * 5); i++) add(i, 5);
  for (let i = 0; i <= Math.round(bounds.max); i++) add(i, 1);
  return out.filter(r => r.d !== 1);
}

function makeCard(value, kind) {
  const v = value.d === 1 ? rat(value.n, 1) : value;
  const k = v.d === 1 ? 'whole' : kind;
  return { value: v, kind: k, display: displayOf(v, k) };
}

function candidateCards(bounds) {
  const fractions = fractionCandidates(bounds).map(v => makeCard(v, 'fraction'));
  const decimals = decimalCandidates(bounds).map(v => makeCard(v, 'decimal'));
  const wholes = [];
  for (let n = Math.ceil(bounds.min); n <= Math.floor(bounds.max); n++) {
    wholes.push(makeCard(rat(n, 1), 'whole'));
  }
  return { fractions, decimals, wholes, all: fractions.concat(decimals, wholes) };
}

function hasDuplicate(set) {
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      if (equals(set[i].value, set[j].value)) return true;
    }
  }
  return false;
}

function positionValue(value, bounds) {
  const b = rationalBounds(bounds);
  const span = { n: b.max.n * b.min.d - b.min.n * b.max.d, d: b.max.d * b.min.d };
  if (span.n <= 0) return rat(0, 1);
  const diff = { n: value.n * b.min.d - b.min.n * value.d, d: value.d * b.min.d };
  return reduce(diff.n * span.d, diff.d * span.n);
}

function tooClose(set, bounds) {
  const limit = MIN_SPACING_VALUE;
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = positionValue(set[i].value, bounds);
      const b = positionValue(set[j].value, bounds);
      const distance = { n: Math.abs(a.n * b.d - b.n * a.d), d: a.d * b.d };
      if (compare(distance, limit) < 0) return true;
    }
  }
  return false;
}

function trySelect(cards, count, bounds, rng) {
  const selected = [];
  const add = (pool) => {
    if (!pool || !pool.length) return false;
    const candidate = pick(rng, pool);
    if (selected.some(x => equals(x.value, candidate.value))) return false;
    if (tooClose(selected.concat(candidate), bounds)) return false;
    selected.push(candidate);
    return true;
  };
  /* The first choices make the activity genuinely mixed, rather than leaving
   * the type mix to a lucky shuffle. Two values can be only one fraction and
   * one non-fraction; from three upward there is room for all three families. */
  const hasKind = kind => selected.some(card => card.kind === kind);
  const required = count >= 3 ? ['fraction', 'decimal', 'whole'] : ['fraction', 'nonfraction'];
  for (const kind of required) {
    const pool = kind === 'fraction' ? cards.fractions
      : kind === 'decimal' ? cards.decimals
        : kind === 'whole' ? cards.wholes : cards.decimals.concat(cards.wholes);
    for (let attempt = 0; attempt < 160 && (kind === 'nonfraction' ? !hasKind('decimal') && !hasKind('whole') : !hasKind(kind)); attempt++) {
      if (add(pool)) break;
    }
    if (kind === 'nonfraction' ? !hasKind('decimal') && !hasKind('whole') : !hasKind(kind)) return null;
  }
  while (selected.length < count) {
    const before = selected.length;
    add(cards.all);
    if (selected.length === before) add(cards.fractions);
    if (selected.length === before) add(cards.decimals);
    if (selected.length === before) add(cards.wholes);
    if (selected.length === before) break;
  }
  return selected.length === count && !hasDuplicate(selected) && !tooClose(selected, bounds)
    ? selected : null;
}

function fallbackSelect(cards, count, bounds) {
  /* A deterministic, bounded backtracking search for a pathological or
   * exhausted RNG. It still chooses only the same friendly rational cards; the
   * search is what guarantees that a constant RNG cannot leave the required
   * whole/decimal/fraction mix uncovered. */
  const unique = list => {
    const seen = new Set();
    return list.filter(card => {
      const key = `${card.value.n}/${card.value.d}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => compare(a.value, b.value));
  };
  const pools = {
    fraction: unique(cards.fractions),
    decimal: unique(cards.decimals),
    whole: unique(cards.wholes),
    all: unique(cards.all),
  };
  let nodes = 0;
  const search = selected => {
    if (nodes++ > 20000) return null;
    if (selected.length === count) return hasRequiredMix(selected, count) ? selected : null;
    const kinds = new Set(selected.map(card => card.kind));
    const choices = [];
    if (!kinds.has('fraction')) choices.push(pools.fraction);
    if (count >= 3 && !kinds.has('decimal')) choices.push(pools.decimal);
    if (count >= 3 && !kinds.has('whole')) choices.push(pools.whole);
    if (count === 2 && !kinds.has('decimal') && !kinds.has('whole')) choices.push(pools.decimal, pools.whole);
    if (!choices.length) choices.push(pools.all);
    for (const pool of choices) {
      for (const card of pool) {
        if (selected.some(seen => equals(seen.value, card.value))) continue;
        if (tooClose(selected.concat(card), bounds)) continue;
        const found = search(selected.concat(card));
        if (found) return found;
      }
    }
    return null;
  };
  return search([]);
}

function hasRequiredMix(cards, count) {
  const kinds = new Set(cards.map(card => card.kind));
  if (!kinds.has('fraction')) return false;
  return count >= 3
    ? kinds.has('decimal') && kinds.has('whole')
    : kinds.has('decimal') || kinds.has('whole');
}

function boundsForCount(count, rng) {
  const pool = count <= 4
    ? [ON_BOUNDS[0], ON_BOUNDS[0], ON_BOUNDS[1], ON_BOUNDS[1], ON_BOUNDS[2]]
    : [ON_BOUNDS[1], ON_BOUNDS[2], ON_BOUNDS[2], ON_BOUNDS[3], ON_BOUNDS[4]];
  return pick(rng, pool);
}

export function makeProblem(count, rng) {
  if (!rng) rng = Math.random;
  if (!Number.isInteger(count) || count < 2 || count > 7) throw new Error('count must be 2–7');
  for (let t = 0; t < MAX_TRIES; t++) {
    const bounds = boundsForCount(count, rng);
    const cards = candidateCards(bounds);
    let selected = trySelect(cards, count, bounds, rng);
    if (!selected) selected = fallbackSelect(cards, count, bounds);
    if (!selected || !hasRequiredMix(selected, count)) continue;
    const sorted = selected.slice().sort((a, b) => compare(a.value, b.value));
    const tray = shuffle(rng, sorted);
    const lineBounds = lineBoundsFor(bounds, sorted.map(card => card.value));
    return {
      count,
      values: tray.map(card => card.value),
      sorted: sorted.map(card => card.value),
      cards: tray,
      sortedCards: sorted,
      forms: tray.map(card => card.display),
      sortedForms: sorted.map(card => card.display),
      bounds,
      lineBounds,
      ticks: makeTicks(lineBounds),
    };
  }
  throw new Error('failed to generate an order-numbers problem');
}

export function makeTicks(bounds) {
  const b = rationalBounds(bounds);
  const steps = Math.round((b.max.n * b.min.d - b.min.n * b.max.d) * b.step.d / (b.step.n * b.max.d * b.min.d));
  const ticks = [];
  for (let i = 0; i <= steps; i++) {
    const n = b.min.n * b.step.d + i * b.step.n * b.min.d;
    const d = b.min.d * b.step.d;
    ticks.push(reduce(n, d));
  }
  return ticks;
}

export function markerRational(value, bounds) {
  const b = rationalBounds(bounds);
  const span = { n: b.max.n * b.min.d - b.min.n * b.max.d, d: b.max.d * b.min.d };
  if (span.n <= 0) return rat(0, 1);
  const diff = { n: value.n * b.min.d - b.min.n * value.d, d: value.d * b.min.d };
  return reduce(diff.n * span.d, diff.d * span.n);
}

export function markerPosition(value, bounds) {
  return toNumber(markerRational(value, bounds));
}

export function isCorrectForBox(card, sorted, index) {
  return equals(card, sorted[index]);
}

export const OrderNumbersEngine = {
  rat,
  ratFromFloat,
  compare,
  equals,
  toNumber,
  displayOf,
  makeProblem,
  makeTicks,
  lineBoundsFor,
  markerRational,
  markerPosition,
  isCorrectForBox,
  MIN_SPACING,
  ON_BOUNDS,
  ON_DENOMS,
};
