/* Generation-invariant tests for the expansion games' puzzle logic.
 *
 * The 2026-08-28 expansion roadmap asked for deterministic tests of the MATHS —
 * "answer parity always correct", "complements always remain valid in configured
 * ranges", and so on — and the primitives block exists to make that possible: its
 * generators take an rng rather than calling Math.random, so this harness seeds one
 * (mulberry32) and replays thousands of problems whose every failure reproduces by
 * seed.
 *
 * It loads the SAME code the page ships — the MATH PRIMITIVES block is lifted out of
 * space-math.html and evaluated — so it tests the shipped generator, not a copy.
 * check-math-parity.js already holds unicorn's copy byte-identical, so testing one
 * skin tests both.
 *
 * Run: node tools/test-math-games.js   (exit non-zero on any failure)
 * Later expansion phases (hundred board, division, fractions, measurement, area)
 * append their invariants here rather than growing a second harness. */
const fs = require('fs'), vm = require('vm'), path = require('path');

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
}

/* Pull the primitives block out of the shipped page. The anchors are the same ones the
   parity gate uses, so a rename fails loudly here too rather than testing nothing. */
function loadPrimitives() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'space-math.html'), 'utf8');
  const a = html.indexOf('/* ══ MATH PRIMITIVES (shared, pure) ══');
  if (a < 0) throw new Error('primitives block not found in space-math.html');
  const b = html.indexOf('\n/* ══ SHARED COMPONENTS ══', a);
  if (b < 0) throw new Error('primitives block does not terminate');
  const src = html.slice(a, b);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__x={mulberry32,randR,shuffleR,makeOddEvenProblem,makeTenProblem,tenForm,tenChoices,hundredRC,hundredAt,hundredPath,hundredMoveWords,makeHundredProblem,hundredBuildChoices,hundredHonestStart,hundredEdgeStart,makeDivisionProblem,makeFractionProblem,fractionCells,fractionBarParts,fractionCircleParts,fractionChoices,MEASURE_ITEMS,MEASURE_UNITS,MEASURE_SENSE,fractionGridCols,HUNDRED_MIX_OPS,makeAreaProblem,areaChoices};', sandbox);
  return sandbox.__x;
}
const P = loadPrimitives();

/* ── seeded rng sanity ── */
{
  const r1 = P.mulberry32(42), r2 = P.mulberry32(42);
  const a = Array.from({ length: 5 }, () => r1());
  const b = Array.from({ length: 5 }, () => r2());
  check('mulberry32 is deterministic for a seed', JSON.stringify(a) === JSON.stringify(b));
  check('mulberry32 returns values in [0,1)', a.every(v => v >= 0 && v < 1));
  const r3 = P.mulberry32(7);
  const spread = Array.from({ length: 1000 }, () => r3());
  check('mulberry32 spreads across the range', Math.min(...spread) < 0.05 && Math.max(...spread) > 0.95);
}

/* ── odd/even ──
   Invariants: the parity flag always agrees with n; n always in the preset range;
   the avoid parameter actually avoids (no immediate repeat); both parities occur. */
{
  const presets = [
    { min: 1, max: 10 },
    { min: 1, max: 30 },
    { min: 1, max: 100 },
  ];
  for (const preset of presets) {
    const rng = P.mulberry32(20260829);
    let parityOk = true, rangeOk = true, avoidOk = true, sawOdd = false, sawEven = false, firstDiff = '';
    let prev = null;
    for (let i = 0; i < 500; i++) {
      const p = P.makeOddEvenProblem(rng, preset, prev);
      if (p.odd !== (p.n % 2 === 1)) { parityOk = false; firstDiff = `n=${p.n} odd=${p.odd}`; break; }
      if (p.n < preset.min || p.n > preset.max) { rangeOk = false; firstDiff = `n=${p.n} out of [${preset.min},${preset.max}]`; break; }
      if (prev && p.n === prev.n) { avoidOk = false; firstDiff = `repeated n=${p.n}`; break; }
      if (p.odd) sawOdd = true; else sawEven = true;
      prev = p;
    }
    check(`odd/even parity always correct (${preset.min}–${preset.max})`, parityOk, firstDiff);
    check(`odd/even stays in range (${preset.min}–${preset.max})`, rangeOk, firstDiff);
    check(`odd/even avoids an immediate repeat (${preset.min}–${preset.max})`, avoidOk, firstDiff);
    check(`odd/even produces both parities (${preset.min}–${preset.max})`, sawOdd && sawEven);
  }
}

/* ── number bonds to ten ──
   Invariants: k in 1..9; answer = 10 − k for BOTH readings; avoid works; every k
   value occurs (so the game teaches all nine bonds, not a lucky subset). */
for (const kind of ['add', 'sub']) {
  const rng = P.mulberry32(20260830);
  let mathOk = true, rangeOk = true, avoidOk = true, firstDiff = '';
  const seenK = new Set();
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const p = P.makeTenProblem(rng, kind, prev);
    if (p.answer !== 10 - p.k) { mathOk = false; firstDiff = `k=${p.k} answer=${p.answer}`; break; }
    if (p.k < 1 || p.k > 9) { rangeOk = false; firstDiff = `k=${p.k}`; break; }
    if (prev && p.k === prev.k) { avoidOk = false; firstDiff = `repeated k=${p.k}`; break; }
    seenK.add(p.k);
    prev = p;
  }
  check(`${kind}: answer is always 10 − k`, mathOk, firstDiff);
  check(`${kind}: k always in 1..9`, rangeOk, firstDiff);
  check(`${kind}: avoids an immediate repeat`, avoidOk, firstDiff);
  check(`${kind}: every bond 1..9 occurs`, seenK.size === 9, `saw ${[...seenK].sort().join(',')}`);
}

/* tenChoices: exactly one correct answer; four unique tiles all within 0..10; the
   on-screen number k is always present (the mirror-error distractor); deterministic
   under a seed. */
{
  const rng = P.mulberry32(20260831);
  let shapeOk = true, kOk = true, uniqOk = true, inRangeOk = true, firstDiff = '';
  for (let i = 0; i < 500; i++) {
    const k = P.randR(rng, 1, 9), answer = 10 - k;
    const c = P.tenChoices(rng, answer, k);
    if (c.length !== 4) { shapeOk = false; firstDiff = `k=${k} got ${c.length} tiles`; break; }
    if (c.filter(v => v === answer).length !== 1) { shapeOk = false; firstDiff = `k=${k} tiles=${c}`; break; }
    if (!c.includes(k)) { kOk = false; firstDiff = `k=${k} tiles=${c}`; break; }
    if (new Set(c).size !== 4) { uniqOk = false; firstDiff = `k=${k} tiles=${c}`; break; }
    if (c.some(v => v < 0 || v > 10)) { inRangeOk = false; firstDiff = `k=${k} tiles=${c}`; break; }
  }
  check('choices are four tiles with exactly one correct', shapeOk, firstDiff);
  check('choices always include the on-screen number k', kOk, firstDiff);
  check('choices are unique', uniqOk, firstDiff);
  check('choices stay within 0..10', inRangeOk, firstDiff);
  const a = P.tenChoices(P.mulberry32(99), 3, 7);
  const b = P.tenChoices(P.mulberry32(99), 3, 7);
  check('choices are deterministic under a seed', JSON.stringify(a) === JSON.stringify(b));
}

/* tenForm: only two shapes, deterministic under a seed. */
{
  const forms = new Set(Array.from({ length: 100 }, () => P.tenForm(P.mulberry32(5))));
  check('tenForm only produces end/start', [...forms].every(f => f === 'end' || f === 'start'));
  check('tenForm is deterministic under a seed', P.tenForm(P.mulberry32(5)) === P.tenForm(P.mulberry32(5)));
}


/* ── the hundred board ──
   The board's transforms are the teaching: coordinate↔number is exact, a path
   decomposes tens-first and ends where the arithmetic says, ±10 keeps its column,
   and ±1 changes row ONLY across a real row edge (the boundary rule the roadmap
   insists is mathematical, never a visual wrap). */
{
  let roundTrip = true, firstBad = '';
  for (let n = 1; n <= 100; n++) {
    const { r, c } = P.hundredRC(n);
    if (P.hundredAt(r, c) !== n) { roundTrip = false; firstBad = `n=${n} r=${r} c=${c}`; break; }
  }
  check('hundred RC/At round-trip for 1..100', roundTrip, firstBad);
  check('hundredAt rejects off-board seats', P.hundredAt(-1, 0) === null && P.hundredAt(0, -1) === null && P.hundredAt(10, 0) === null && P.hundredAt(0, 10) === null);
}
{
  const deltas = [1, -1, 10, -10, 20, -20, 11, 9, -9, -11, 2, -3];
  let endsOk = true, inRangeOk = true, colsOk = true, rowsOk = true, stepsOk = true, firstBad = '';
  for (const delta of deltas) {
    for (let start = 1; start <= 100; start++) {
      const target = start + delta;
      if (target < 1 || target > 100) continue;
      const path = P.hundredPath(start, delta);
      if (path[path.length - 1] !== target) { endsOk = false; firstBad = `${start}+${delta} ended at ${path[path.length-1]}`; break; }
      if (path.some(n => n < 1 || n > 100)) { inRangeOk = false; firstBad = `${start}+${delta} left the board`; break; }
      const tens = Math.trunc(delta / 10), ones = delta - tens * 10;
      if (path.length !== Math.abs(tens) + Math.abs(ones) + 1) { stepsOk = false; firstBad = `${start}+${delta} took ${path.length} stops`; break; }
      for (let i = 1; i < path.length; i++) {
        const a = P.hundredRC(path[i - 1]), b = P.hundredRC(path[i]);
        const step = path[i] - path[i - 1];
        if (Math.abs(step) === 10 && a.c !== b.c) { colsOk = false; firstBad = `${path[i-1]}→${path[i]} changed column on a ten step`; break; }
        if (Math.abs(step) === 1 && a.r !== b.r && !(a.c === 9 && b.c === 0) && !(a.c === 0 && b.c === 9)) { rowsOk = false; firstBad = `${path[i-1]}→${path[i]} changed row on a one step that was not an edge`; break; }
      }
      if (!endsOk || !inRangeOk || !colsOk || !rowsOk || !stepsOk) break;
    }
    if (!endsOk || !inRangeOk || !colsOk || !rowsOk || !stepsOk) break;
  }
  check('hundredPath ends at start+delta', endsOk, firstBad);
  check('hundredPath never leaves 1..100', inRangeOk, firstBad);
  check('ten steps keep their column', colsOk, firstBad);
  check('one steps change row only at a real edge', rowsOk, firstBad);
  check('hundredPath length is |tens|+|ones|+1', stepsOk, firstBad);
}
{
  const rng = P.mulberry32(20260901);
  const stepPreset = { kind: 'step' }, jumpPreset = { kind: 'jump' };
  const buildPreset = { kind: 'build', ops: [20, 10, 2, 1, -10, -20] };
  let targetOk = true, inRangeOk = true, avoidOk = true, edgeOk = true, firstBad = '';
  let prev = null;
  for (let i = 0; i < 800; i++) {
    const preset = i % 3 === 0 ? stepPreset : i % 3 === 1 ? jumpPreset : buildPreset;
    const p = P.makeHundredProblem(rng, preset, prev);
    if (p.target !== p.start + p.delta) { targetOk = false; firstBad = `start=${p.start} delta=${p.delta} target=${p.target}`; break; }
    if (p.target < 1 || p.target > 100 || p.start < 1 || p.start > 100) { inRangeOk = false; firstBad = `start=${p.start} delta=${p.delta}`; break; }
    if (preset.kind === 'step' && Math.abs(p.delta) === 1) {
      const a = P.hundredRC(p.start);
      if ((p.delta === 1 && a.c === 9) || (p.delta === -1 && a.c === 0)) { edgeOk = false; firstBad = `step rung: ${p.start}${p.delta} crosses an edge`; break; }
    }
    if (prev && prev.start === p.start && prev.delta === p.delta) { avoidOk = false; firstBad = `repeated start=${p.start} delta=${p.delta}`; break; }
    prev = p;
  }
  check('hundred problems: target = start + delta', targetOk, firstBad);
  check('hundred problems stay on the board', inRangeOk, firstBad);
  check('step rung never crosses a row edge by one', edgeOk, firstBad);
  check('hundred problems avoid an immediate repeat', avoidOk, firstBad);
}
{
  /* build choices: exactly one correct chip, and the classic magnitude confusion
     (+20 vs +2) is offered when the two differ. */
  const rng = P.mulberry32(20260902);
  let shapeOk = true, magOk = true, firstBad = '';
  for (let i = 0; i < 400; i++) {
    const delta = [20, 10, 2, 1, -10, -20][i % 6];
    const c = P.hundredBuildChoices(rng, delta);
    const want = delta > 0 ? `+${delta}` : `−${-delta}`;
    if (c.filter(x => x === want).length !== 1 || new Set(c).size !== c.length) { shapeOk = false; firstBad = `delta=${delta} chips=${c}`; break; }
    if (Math.abs(delta) >= 10) {
      const onesConf = `${delta > 0 ? '+' : '−'}${Math.abs(delta) / 10}`;
      if (!c.includes(onesConf)) { magOk = false; firstBad = `delta=${delta} chips=${c} lacked ${onesConf}`; break; }
    }
  }
  check('build chips: one correct, all unique', shapeOk, firstBad);
  check('build chips: tens moves offer their ones confusion', magOk, firstBad);
}


/* ── division ──
   Exact sharing only (no remainders at this tier): total = groups × each, always;
   the answer is whichever half the rung asks for; totals stay countable (≤ 30). */
{
  const rng = P.mulberry32(20260903);
  const kinds = ['share', 'each', 'groups'];
  let exactOk = true, capOk = true, answerOk = true, avoidOk = true, sawAllKinds = true, firstBad = '';
  const seenKinds = new Set();
  let prev = null;
  for (let i = 0; i < 600; i++) {
    const preset = { kind: kinds[i % 3] };
    const p = P.makeDivisionProblem(rng, preset, prev);
    seenKinds.add(p.kind);
    if (p.total !== p.g * p.e) { exactOk = false; firstBad = `g=${p.g} e=${p.e} total=${p.total}`; break; }
    if (p.total > 30 || p.g < 2 || p.e < 2) { capOk = false; firstBad = `g=${p.g} e=${p.e}`; break; }
    const want = p.kind === 'groups' ? p.g : p.e;
    if (p.answer !== want) { answerOk = false; firstBad = `kind=${p.kind} answer=${p.answer} want=${want}`; break; }
    if (prev && prev.total === p.total && prev.g === p.g && prev.e === p.e) { avoidOk = false; firstBad = `repeat g=${p.g} e=${p.e}`; break; }
    prev = p;
  }
  if (seenKinds.size !== 3) sawAllKinds = false;
  check('division problems divide exactly (no remainders)', exactOk, firstBad);
  check('division totals stay countable (≤ 30, ≥ 2 per group)', capOk, firstBad);
  check('division answer matches its rung (each vs groups)', answerOk, firstBad);
  check('division avoids an immediate repeat', avoidOk, firstBad);
  check('division generates all three readings', sawAllKinds);
}


/* ── fractions ──
   The mathematical rules the roadmap calls critical: proper fractions only at
   these rungs (n < d), exactly n lit parts out of d, partitions EQUAL BY
   CONSTRUCTION (bar cells each 1/d, sectors each 360/d, summing to the whole),
   and the answer chips unique with the classic inversion offered. */
{
  const rng = P.mulberry32(20260904);
  const presets = [
    { denoms: [2, 3, 4], shapes: ['bar', 'circle'] },
    { denoms: [2, 3, 4, 5, 6], shapes: ['bar', 'circle', 'grid', 'group'] },
    { denoms: [5, 6, 8, 10], shapes: ['bar', 'grid', 'group'] },
  ];
  let properOk = true, litOk = true, shapeOk = true, avoidOk = true, firstBad = '';
  let prev = null;
  for (let i = 0; i < 900; i++) {
    const preset = presets[i % 3];
    const p = P.makeFractionProblem(rng, preset, prev);
    if (p.n >= p.d || p.n < 1) { properOk = false; firstBad = `n=${p.n} d=${p.d}`; break; }
    if (p.cells.length !== p.n || new Set(p.cells).size !== p.n || p.cells.some(c => c < 0 || c >= p.d)) {
      litOk = false; firstBad = `n=${p.n} d=${p.d} cells=${p.cells}`; break;
    }
    if (!preset.shapes.includes(p.shape) || !preset.denoms.includes(p.d)) { shapeOk = false; firstBad = `shape=${p.shape} d=${p.d}`; break; }
    if (prev && prev.n === p.n && prev.d === p.d && prev.shape === p.shape) { avoidOk = false; firstBad = `repeat n=${p.n} d=${p.d}`; break; }
    prev = p;
  }
  check('fraction problems are proper (1 <= n < d)', properOk, firstBad);
  check('lit parts are exactly n distinct cells', litOk, firstBad);
  check('shapes and denominators come from the rung', shapeOk, firstBad);
  check('fraction problems avoid an immediate repeat', avoidOk, firstBad);
  /* equal-partition specs: every bar cell 1/d summing to 1; every sector 360/d
     summing to 360 — the "no unequal quarters" rule, tested not promised. */
  let partsOk = true; firstBad = '';
  for (let d = 2; d <= 12; d++) {
    const bar = P.fractionBarParts(d), circ = P.fractionCircleParts(d);
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    if (bar.length !== d || bar.some(w => !near(w, 1 / d)) || !near(bar.reduce((a, b) => a + b, 0), 1)) { partsOk = false; firstBad = `bar d=${d}`; break; }
    if (circ.length !== d || circ.some(w => !near(w, 360 / d)) || !near(circ.reduce((a, b) => a + b, 0), 360)) { partsOk = false; firstBad = `circle d=${d}`; break; }
  }
  check('bar and circle partitions are exactly equal and sum to the whole', partsOk, firstBad);
  /* chips: one correct, all unique, inversion present when distinct. */
  let chipOk = true, invOk = true; firstBad = '';
  for (let i = 0; i < 300; i++) {
    const rng2 = P.mulberry32(9000 + i);
    const d = [2, 3, 4, 5, 6, 8, 10][i % 7];
    const n = 1 + (i % (d - 1));
    const c = P.fractionChoices(rng2, n, d);
    const want = `${n}/${d}`;
    if (c.filter(x => x === want).length !== 1 || new Set(c).size !== c.length) { chipOk = false; firstBad = `n=${n} d=${d} chips=${c}`; break; }
    if (n !== d - n && !c.includes(`${d}/${n}`)) { invOk = false; firstBad = `n=${n} d=${d} chips=${c} lacked ${d}/${n}`; break; }
  }
  check('fraction chips: one correct, all unique', chipOk, firstBad);
  check('fraction chips offer the inversion d/n', invOk, firstBad);
}


/* ── measurement ──
   The curated table IS the contract: every item's unit belongs to its category's
   unit list and every category is represented. There is no generator to test any
   more — u1 became a chart on 2026-08-29 and now DRAWS the whole table at once,
   which means every row of it is on screen and every row of it has to be right. */
{
  const cats = new Set(P.MEASURE_ITEMS.map(i => i.cat));
  check('measure table covers length, mass and capacity',
    cats.has('length') && cats.has('mass') && cats.has('capacity'));
  let tableOk = true, firstBad = '';
  for (const item of P.MEASURE_ITEMS) {
    const units = P.MEASURE_UNITS[item.cat].map(([a]) => a);
    if (!units.includes(item.unit)) { tableOk = false; firstBad = `${item.thing}: ${item.unit} not in ${item.cat}`; break; }
  }
  check('every curated unit belongs to its category', tableOk, firstBad);
  /* The chart lays a row out per category and a column per unit, so no unit may
     stand empty: a "kilometres" column with nothing under it teaches nothing and
     looks broken. */
  const empty = [];
  for (const [cat, list] of Object.entries(P.MEASURE_UNITS))
    for (const [abbr] of list)
      if (!P.MEASURE_ITEMS.some(it => it.cat === cat && it.unit === abbr)) empty.push(`${cat}/${abbr}`);
  check('every unit column has something in it', empty.length === 0, empty.join(','));
}

/* ── area ──
   The answer is the occupied cell count by construction: cells are valid indices,
   unique, inside the w×h bounds, and equal in number to the answer. */
{
  const rng = P.mulberry32(20260906);
  const presets = [{ kind: 'rect', maxSide: 5, min: 4, max: 20 }, { kind: 'l', maxSide: 5, min: 5, max: 20 }];
  let idxOk = true, countOk = true, rangeOk = true, firstBad = '';
  let prev = null;
  for (let i = 0; i < 600; i++) {
    const preset = presets[i % 2];
    const p = P.makeAreaProblem(rng, preset, prev);
    if (p.w < 2 || p.h < 2 || p.w > 5 || p.h > 5) { rangeOk = false; firstBad = `w=${p.w} h=${p.h}`; break; }
    const inBounds = p.cells.every(c => c >= 0 && c < p.w * p.h);
    const unique = new Set(p.cells).size === p.cells.length;
    if (!inBounds || !unique) { idxOk = false; firstBad = `w=${p.w} h=${p.h} cells=${p.cells}`; break; }
    if (p.answer !== p.cells.length || p.answer < preset.min || p.answer > preset.max) { countOk = false; firstBad = `answer=${p.answer} cells=${p.cells.length}`; break; }
    prev = p;
  }
  check('area shapes stay 2×2..5×5', rangeOk, firstBad);
  check('area cells are unique in-bounds indices', idxOk, firstBad);
  check('area answer equals the occupied cell count, in range', countOk, firstBad);
  /* choices: four unique tiles, one correct, near misses only. */
  let chipOk = true; firstBad = '';
  for (let i = 0; i < 200; i++) {
    const r2 = P.mulberry32(9500 + i);
    const a = 4 + (i % 17);
    const c = P.areaChoices(r2, a);
    if (c.length !== 4 || new Set(c).size !== 4 || c.filter(x => x === a).length !== 1 || c.some(x => x < 1 || x > 24)) {
      chipOk = false; firstBad = `a=${a} chips=${c}`; break;
    }
  }
  check('area chips: four unique, one correct, within 1..24', chipOk, firstBad);
}


/* ── hundred board, final shape (2026-08-29 owner review) ──
   jump rungs never land a one-step across a row edge (honestStart holds for every
   generated start); the edge rung ALWAYS sits on the edge its delta crosses —
   boundary behaviour is taught deliberately, never leaked. */
{
  const rng = P.mulberry32(20260907);
  const jump = { kind: 'jump' }, edge = { kind: 'edge' };
  let jumpOk = true, edgeOk = true, firstBad = '';
  for (let i = 0; i < 1000; i++) {
    const preset = i % 2 ? jump : edge;
    const p = P.makeHundredProblem(rng, preset, null);
    const rc = P.hundredRC(p.start);
    if (preset.kind === 'jump' && !P.hundredHonestStart(p.delta, rc.c)) { jumpOk = false; firstBad = `${p.start}${p.delta}`; break; }
    if (preset.kind === 'edge') {
      const onEdge = (p.delta === 1 || p.delta === 11 || p.delta === -9) ? rc.c === 9 : rc.c === 0;
      /* a boundary problem is one whose PATH crosses an edge on a one-step —
         ±9 from the far edge ends on the SAME row, crossing inside the path */
      const path = P.hundredPath(p.start, p.delta);
      const crosses = path.some((n, k) => k > 0 && Math.abs(n - path[k - 1]) === 1 && P.hundredRC(n).r !== P.hundredRC(path[k - 1]).r);
      const lands = P.hundredRC(p.target).r !== rc.r;
      if (!onEdge || !crosses || !lands) { edgeOk = false; firstBad = `${p.start}${p.delta} (start col ${rc.c})`; break; }
    }
  }
  check('jump rung never lands a one-step across a row edge', jumpOk, firstBad);
  check('edge rung always starts on the edge it crosses', edgeOk, firstBad);
}
/* ── measure table, final shape: ten items, every category spanning its scale ──
   Since 2026-08-29 the table is a CHART's data rather than a quiz's, so every row
   also carries the size it is quoted at. A number that drifted away from its unit
   ("about 15 metres long" under cm) would be a wrong fact printed on a teaching
   screen, which is the worst kind this app can ship — so each `about` must name
   its own unit's word, and every unit in the table must have a sense line for the
   chart to speak when the unit itself is tapped. */
{
  const cats = {};
  for (const it of P.MEASURE_ITEMS) (cats[it.cat] = cats[it.cat] || []).push(it.unit);
  check('measure table has at least three items per category',
    Object.values(cats).every(list => list.length >= 3), JSON.stringify(cats));
  check('length spans cm, m and km', new Set(cats.length).size === 3);
  check('mass spans g and kg', new Set(cats.mass).size === 2);
  check('capacity spans ml and l', new Set(cats.capacity).size === 2);

  const words = { cm: 'centimetres', m: 'metres', km: 'kilometres', g: 'grams', kg: 'kilograms', ml: 'millilitres', l: 'litres' };
  const bad = P.MEASURE_ITEMS.filter(it => !it.about || !it.about.includes(words[it.unit]));
  check('every item says how big it is, in its own unit', bad.length === 0,
    bad.map(it => `${it.thing}: ${it.about}`).join(' | '));
  const noLabel = P.MEASURE_ITEMS.filter(it => !it.label || it.label.length > 14);
  check('every item has a short label for under its picture', noLabel.length === 0,
    noLabel.map(it => it.thing).join(' | '));
  const units = [...new Set(P.MEASURE_ITEMS.map(it => it.unit))];
  check('every unit in the table has a sense line', units.every(u => P.MEASURE_SENSE[u]),
    units.filter(u => !P.MEASURE_SENSE[u]).join(','));
  /* the chart draws each category's units smallest first — the order in
     MEASURE_UNITS IS the teaching, so it is asserted rather than assumed */
  check('units are listed smallest first', JSON.stringify(Object.fromEntries(
      Object.entries(P.MEASURE_UNITS).map(([c, list]) => [c, list.map(u => u[0])])))
    === JSON.stringify({ length: ['cm', 'm', 'km'], mass: ['g', 'kg'], capacity: ['ml', 'l'] }));
}

/* ── the mix rung (2026-08-29 owner direction: the board's default) ──
   Every move from −30 to +30 and nothing else; problems stay on the board; the
   pool genuinely mixes rather than dressing up the curated four. */
{
  check('mix ops are −30..+30 with no zero',
    P.HUNDRED_MIX_OPS.length === 60 &&
    new Set(P.HUNDRED_MIX_OPS).size === 60 &&
    P.HUNDRED_MIX_OPS.every(d => d !== 0 && Math.abs(d) <= 30),
    P.HUNDRED_MIX_OPS.join(','));
  const rng = P.mulberry32(20260908);
  const mix = { kind: 'mix' };
  let rangeOk = true, targetOk = true, pathOk = true, avoidOk = true, firstBad = '';
  const seen = new Set();
  let prev = null;
  for (let i = 0; i < 3000; i++) {
    const p = P.makeHundredProblem(rng, mix, prev);
    if (p.start < 1 || p.start > 100 || p.target < 1 || p.target > 100) { rangeOk = false; firstBad = `${p.start}${p.delta}`; break; }
    if (p.target !== p.start + p.delta) { targetOk = false; firstBad = `${p.start}${p.delta}=${p.target}`; break; }
    const path = P.hundredPath(p.start, p.delta);
    if (path.some(n => n < 1 || n > 100) || path[path.length - 1] !== p.target) { pathOk = false; firstBad = `${p.start}${p.delta}`; break; }
    if (prev && prev.start === p.start && prev.delta === p.delta) { avoidOk = false; firstBad = `repeat ${p.start}${p.delta}`; break; }
    seen.add(p.delta);
    prev = p;
  }
  check('mix problems stay on the board', rangeOk, firstBad);
  check('mix problems: target = start + delta', targetOk, firstBad);
  check('mix paths stay on the board and land on the target', pathOk, firstBad);
  check('mix problems avoid an immediate repeat', avoidOk, firstBad);
  /* the point of the rung: tens AND ones, both directions, not just the tidy
     moves the curated rungs already offer */
  const mixed = [...seen].filter(d => Math.abs(d) % 10 !== 0 && Math.abs(d) > 10);
  check('mix asks moves that carry tens AND ones', mixed.length >= 10, [...seen].join(','));
  check('mix asks both directions', [...seen].some(d => d > 0) && [...seen].some(d => d < 0));
  check('mix reaches most of its pool', seen.size >= 50, `${seen.size} distinct deltas`);
}

/* ── the fraction grid closes its rectangle ──
   The grid shape is "one whole cut into d equal parts", so the parts have to fill
   a rectangle: a short final row makes the whole a ragged L and the child is then
   counting parts of a shape nobody drew. Every denominator any rung offers must
   tile exactly. */
{
  const denoms = [2, 3, 4, 5, 6, 8, 10, 12];
  let ok = true, firstBad = '';
  for (const d of denoms) {
    const cols = P.fractionGridCols(d);
    if (cols < 1 || d % cols !== 0) { ok = false; firstBad = `d=${d} cols=${cols}`; break; }
  }
  check('fraction grids tile a full rectangle', ok, firstBad);
  check('fraction grid columns stay near the square root',
    denoms.every(d => { const c = P.fractionGridCols(d); return c <= d && c >= Math.sqrt(d) - 0.001; }),
    denoms.map(d => `${d}->${P.fractionGridCols(d)}`).join(' '));
}

console.log(`\n${failed === 0 ? 'ALL GAME-LOGIC INVARIANTS HOLD' : failed + ' INVARIANT FAILURE(S)'}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
