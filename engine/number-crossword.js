// Number Crossword — the board engine (NUMBER-CROSSWORD-SPEC.md; CG-269).
//
// A board is a small crossword of equations `a ∘ b = c`, written across and
// down on a 5 × 5 grid of cells and sharing their number cells where they
// cross. The engine does four things and the page does none of them:
//
//   1. FILL   — a complete, valid solution first (whole numbers only, ÷ only
//               when exact, nothing below 1, nothing above the rung's cap);
//   2. BLANK  — choose which number and sign cells become empty slots, and
//               build the tray: exactly the missing tiles plus the rung's
//               distractors;
//   3. PROVE  — an exact backtracking solver over the tray's multiset proves
//               the board has ONE solution (it counts, and stops at two),
//               and a propagation measure proves how much deduction it
//               takes: how many blanks one equation alone can settle at the
//               start, and whether reasoning over one equation (easy rungs)
//               or two crossing equations at a time (hard rungs) finishes it;
//   4. CHECK  — judge a child's placement by the EQUATIONS, never by a stored
//               answer. With uniqueness proven the two agree, but a check that
//               compared against the answer key would be wrong the day a rung
//               is loosened, and this one cannot be.
//
// Pure ES module: no DOM, no speech, no Math.random. Every draw goes through
// the injected `rng`, so a seeded run is reproducible and the vetted seed pool
// (the fallback when a live deal runs out of budget) is just a list of seeds.
// The file is ported byte-for-byte into both game pages by
// tools/port-crossword-engine.js — never edit the generated copy there.

// --- Signs ----------------------------------------------------------------------

// Display glyphs are the logic keys: the pages print these exact characters and
// Number Toys already uses them (− is U+2212, × U+00D7, ÷ U+00F7), so a tile's
// value can be shown without a lookup and compared without a translation.
export const NC_OPS = ['+', '−', '×', '÷'];
export const NC_OP_WORDS = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' };

// a ∘ b, or null when the result is not a whole number (÷ that is not exact).
export function ncApply(a, op, b) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  if (op === '÷') return b !== 0 && a % b === 0 ? a / b : null;
  return null;
}

export function ncHolds(a, op, b, c) {
  const v = ncApply(a, op, b);
  return v !== null && v === c;
}

// The one missing number of `a ∘ b = c`, given the sign and the other two.
// pos is 0 (a), 2 (b) or 3 (c). null when no whole number fits.
function solveFor(pos, a, op, b, c) {
  let v = null;
  if (pos === 3) v = ncApply(a, op, b);
  else if (pos === 0) {
    if (op === '+') v = c - b;
    else if (op === '−') v = c + b;
    else if (op === '×') v = b !== 0 && c % b === 0 ? c / b : null;
    else if (op === '÷') v = c * b;
  } else {
    if (op === '+') v = c - a;
    else if (op === '−') v = a - c;
    else if (op === '×') v = a !== 0 && a % 1 === 0 && c % a === 0 ? c / a : null;
    else if (op === '÷') v = c !== 0 && a % c === 0 ? a / c : null;
  }
  if (v === null || !Number.isInteger(v)) return null;
  // The whole equation must still hold with v in place (guards 0 ÷ 0 shapes).
  const t = [a, op, b, c];
  t[pos] = v;
  return ncHolds(t[0], t[1], t[2], t[3]) ? v : null;
}

// --- Layouts --------------------------------------------------------------------

// The board is always drawn on a 5 × 5 cell grid. Number cells sit on even rows
// and even columns; an equation across row 2i reads (2i,0) ∘ (2i,2) = (2i,4) with
// its sign at (2i,1) and its "=" at (2i,3); an equation down column 2j reads the
// same way top to bottom. A layout is the set of rows and columns that carry an
// equation, so every layout is a sub-crossword of the full 3 × 3 "number square".
export const NC_LAYOUTS = {
  // 2 equations crossing in the middle number: a plus sign. 5 numbers.
  plus: { rows: [1], cols: [1] },
  // 4 equations round the edge: a square frame with a hole. 8 numbers, a loop.
  ring: { rows: [0, 2], cols: [0, 2] },
  // All 6: three across, three down, 9 numbers; the corner result closes two.
  full: { rows: [0, 1, 2], cols: [0, 1, 2] },
};

export function ncBuildLayout(name) {
  const def = NC_LAYOUTS[name];
  if (!def) throw new Error('unknown layout ' + name);
  const cells = {};
  const order = [];
  const put = (r, c, kind) => {
    const id = r + ',' + c;
    if (!cells[id]) { cells[id] = { id, r, c, kind }; order.push(id); }
    return id;
  };
  const equations = [];
  def.rows.forEach((i) => {
    const r = 2 * i;
    equations.push({ dir: 'across', line: i, cells: [put(r, 0, 'num'), put(r, 1, 'op'), put(r, 2, 'num'), put(r, 4, 'num')], eq: put(r, 3, 'eq') });
  });
  def.cols.forEach((j) => {
    const c = 2 * j;
    equations.push({ dir: 'down', line: j, cells: [put(0, c, 'num'), put(1, c, 'op'), put(2, c, 'num'), put(4, c, 'num')], eq: put(3, c, 'eq') });
  });
  order.sort((x, y) => cells[x].r - cells[y].r || cells[x].c - cells[y].c);
  return { name, cells, order, equations };
}

// --- Rungs ----------------------------------------------------------------------

// The child picks the rung (the app's rule). Every number on every board, operand
// or result, is a whole number from 1 to `max`; × and ÷ keep their small operands
// (the times-table factors, and the divisor and quotient of a ÷) between 2 and
// `timesMax`, so a ×1 or ÷1 never makes a sign ambiguous by construction.
//
// `deduce` is the rung's proof obligation, checked on every board before it is
// dealt (see ncAnalyse):
//   'single-each'  every blank is settled by its own equation at the start;
//   'single'       reasoning one equation at a time solves the whole board;
//   'single-chain' as 'single', and at least two blanks can only be settled
//                  after a crossing blank is filled (a real chain);
//   'pair'         one-equation reasoning settles at most `maxForced` blanks at
//                  the start; reasoning over two crossing equations at a time
//                  solves the board, and does need two at least once.
// Every rung also requires the solution to be UNIQUE over the tray.
export const NC_LEVELS = [
  { id: 'easy',   tag: 'Easy',   layout: 'plus', ops: ['+', '−'], max: 10,  timesMax: 5,
    numBlanks: 2, opBlanks: 0, numDistractors: 0, opDistractors: 0, minDistinctOps: 1,
    deduce: 'single-each', seeds: [11, 12, 13, 14, 15, 16, 17, 18] },
  { id: 'medium', tag: 'Medium', layout: 'ring', ops: ['+', '−'], max: 20,  timesMax: 5,
    numBlanks: 3, opBlanks: 1, numDistractors: 0, opDistractors: 0, minDistinctOps: 2,
    deduce: 'single', seeds: [21, 22, 23, 24, 25, 26, 27, 28] },
  { id: 'tricky', tag: 'Tricky', layout: 'full', ops: ['+', '−', '×'], max: 30, timesMax: 6,
    numBlanks: 5, opBlanks: 2, numDistractors: 1, opDistractors: 0, minDistinctOps: 3,
    deduce: 'single-chain', seeds: [31, 32, 33, 34, 35, 36, 37, 38] },
  { id: 'hard',   tag: 'Hard',   layout: 'full', ops: NC_OPS, max: 50, timesMax: 9,
    numBlanks: 6, opBlanks: 3, numDistractors: 1, opDistractors: 1, minDistinctOps: 3,
    deduce: 'pair', maxForced: 1, seeds: [41, 42, 43, 44, 45, 46, 47, 48] },
  { id: 'expert', tag: 'Expert', layout: 'full', ops: NC_OPS, max: 100, timesMax: 12,
    numBlanks: 7, opBlanks: 4, numDistractors: 2, opDistractors: 1, minDistinctOps: 4,
    deduce: 'pair', maxForced: 0, seeds: [51, 52, 53, 54, 55, 56, 57, 58] },
];

export function ncLevel(id) {
  return NC_LEVELS.find((l) => l.id === id) || NC_LEVELS[0];
}

// --- Randomness -----------------------------------------------------------------

export function ncSeeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// --- 1. Fill --------------------------------------------------------------------

// Is a complete equation acceptable on this rung? Holds, stays inside 1..max,
// and keeps × and ÷ on small factors.
function equationOk(a, op, b, c, spec) {
  if (!ncHolds(a, op, b, c)) return false;
  for (const v of [a, b, c]) if (!(v >= 1 && v <= spec.max)) return false;
  if (op === '×' && !(a >= 2 && b >= 2 && a <= spec.timesMax && b <= spec.timesMax)) return false;
  if (op === '÷' && !(b >= 2 && c >= 2 && b <= spec.timesMax && c <= spec.timesMax)) return false;
  return true;
}

// The range a free number cell is drawn from: a × factor, a ÷ divisor or a ÷
// quotient is drawn small, anything else from the whole range.
function drawRange(id, layout, val, spec) {
  let small = false;
  for (const e of layout.equations) {
    const pos = e.cells.indexOf(id);
    if (pos < 0) continue;
    const op = val[e.cells[1]];
    if (op === '×' && (pos === 0 || pos === 2)) small = true;
    if (op === '÷' && (pos === 2 || pos === 3)) small = true;
  }
  return small ? [2, spec.timesMax] : [1, spec.max];
}

// One complete solution, or null after `tries` random restarts. Signs are drawn
// first, then numbers: any number an equation already determines is computed, and
// only when none is determined is a free cell drawn. When a crossing makes an
// equation's three numbers known before its own sign was ever used to compute
// one of them — the corner of the full square is the usual case, closed by a row
// and a column at once — the sign is re-chosen from whichever of the rung's signs
// makes it true, rather than throwing the whole fill away. A restart is then only
// caused by a value leaving the range or no sign fitting.
export function ncFill(layout, spec, rng, tries) {
  const numIds = layout.order.filter((id) => layout.cells[id].kind === 'num');
  const want = Math.min(spec.minDistinctOps, spec.ops.length, layout.equations.length);
  for (let t = 0; t < (tries || 400); t++) {
    const val = {};
    const used = new Set();   // equations whose sign has computed a number
    layout.equations.forEach((e) => { val[e.cells[1]] = pick(rng, spec.ops); });
    let ok = true;
    for (;;) {
      let progressed = false;
      for (const e of layout.equations) {
        const [a, o, b, c] = e.cells;
        const unknown = [a, b, c].filter((id) => val[id] === undefined);
        if (unknown.length === 0) {
          if (equationOk(val[a], val[o], val[b], val[c], spec)) continue;
          const fits = used.has(e) ? [] : spec.ops.filter((op) => equationOk(val[a], op, val[b], val[c], spec));
          if (!fits.length) { ok = false; break; }
          val[o] = pick(rng, fits);
          used.add(e);
        } else if (unknown.length === 1) {
          const pos = e.cells.indexOf(unknown[0]);
          const v = solveFor(pos, val[a], val[o], val[b], val[c]);
          if (v === null || v < 1 || v > spec.max) { ok = false; break; }
          val[unknown[0]] = v;
          used.add(e);
          if (!equationOk(val[a], val[o], val[b], val[c], spec)) { ok = false; break; }
          progressed = true;
        }
      }
      if (!ok) break;
      if (progressed) continue;
      const open = numIds.filter((id) => val[id] === undefined);
      if (!open.length) break;
      // Prefer a cell in an equation that already has a known number, so the
      // next pass can compute something; otherwise any open cell.
      const touching = open.filter((id) => layout.equations.some((e) => e.cells.indexOf(id) >= 0
        && [e.cells[0], e.cells[2], e.cells[3]].some((x) => x !== id && val[x] !== undefined)));
      const id = pick(rng, touching.length ? touching : open);
      const [lo, hi] = drawRange(id, layout, val, spec);
      // Forward check at the draw: only values that leave every equation through
      // this cell still completable — a computed neighbour in range, or a sign that
      // fits once all three numbers are known — so the next pass cannot fail on it.
      const viable = [];
      for (let v = lo; v <= hi; v++) {
        val[id] = v;
        let good = true;
        for (const e of layout.equations) {
          if (e.cells.indexOf(id) < 0) continue;
          const [a, o, b, c] = e.cells;
          const unknown = [a, b, c].filter((x) => val[x] === undefined);
          if (unknown.length === 0) {
            good = equationOk(val[a], val[o], val[b], val[c], spec)
              || (!used.has(e) && spec.ops.some((op) => equationOk(val[a], op, val[b], val[c], spec)));
          } else if (unknown.length === 1) {
            const pos = e.cells.indexOf(unknown[0]);
            const w = solveFor(pos, val[a], val[o], val[b], val[c]);
            if (w === null || w < 1 || w > spec.max) good = false;
            else {
              val[unknown[0]] = w;
              good = equationOk(val[a], val[o], val[b], val[c], spec);
              delete val[unknown[0]];
            }
          }
          if (!good) break;
        }
        if (good) viable.push(v);
      }
      if (!viable.length) { ok = false; break; }
      val[id] = pick(rng, viable);
    }
    if (!ok) continue;
    if (!layout.equations.every((e) => equationOk(val[e.cells[0]], val[e.cells[1]], val[e.cells[2]], val[e.cells[3]], spec))) continue;
    if (new Set(layout.equations.map((e) => val[e.cells[1]])).size < want) continue;
    return val;
  }
  return null;
}

// --- 2. Blank -------------------------------------------------------------------

function distractorNumber(rng, spec, taken) {
  for (let i = 0; i < 40; i++) {
    const base = pick(rng, taken.length ? taken : [randInt(rng, 1, spec.max)]);
    const delta = pick(rng, [-2, -1, 1, 2, 10, -10]);
    const v = i < 30 ? base + delta : randInt(rng, 1, spec.max);
    if (v >= 1 && v <= spec.max && taken.indexOf(v) < 0) return v;
  }
  return null;
}

// A puzzle object — what the page renders and what the prover and the checker read.
export function ncMakePuzzle(layout, sol, spec, rng) {
  const numIds = layout.order.filter((id) => layout.cells[id].kind === 'num');
  const opIds = layout.order.filter((id) => layout.cells[id].kind === 'op');
  const blanks = shuffle(rng, numIds).slice(0, spec.numBlanks).concat(shuffle(rng, opIds).slice(0, spec.opBlanks));
  const blankSet = new Set(blanks);
  const nums = blanks.filter((id) => layout.cells[id].kind === 'num').map((id) => sol[id]);
  const ops = blanks.filter((id) => layout.cells[id].kind === 'op').map((id) => sol[id]);
  const extraNums = [];
  for (let i = 0; i < spec.numDistractors; i++) {
    const v = distractorNumber(rng, spec, nums.concat(extraNums));
    if (v !== null) extraNums.push(v);
  }
  const extraOps = [];
  for (let i = 0; i < spec.opDistractors; i++) {
    const unused = spec.ops.filter((o) => ops.indexOf(o) < 0 && extraOps.indexOf(o) < 0);
    extraOps.push(pick(rng, unused.length ? unused : spec.ops));
  }
  // The tray is sorted, numbers small to big and then the signs in their usual
  // order, so a child scans it like a number line; its order says nothing about
  // where a tile goes.
  const trayVals = nums.concat(extraNums).sort((x, y) => x - y).map((v) => ({ kind: 'num', value: v }))
    .concat(ops.concat(extraOps).sort((x, y) => NC_OPS.indexOf(x) - NC_OPS.indexOf(y)).map((v) => ({ kind: 'op', value: v })));
  const tray = trayVals.map((t, i) => ({ id: 't' + i, kind: t.kind, value: t.value }));
  const cells = layout.order.map((id) => {
    const cell = layout.cells[id];
    return { id, r: cell.r, c: cell.c, kind: cell.kind, value: cell.kind === 'eq' ? '=' : sol[id], blank: blankSet.has(id) };
  });
  const solution = {};
  blanks.forEach((id) => { solution[id] = sol[id]; });
  return {
    level: spec.id, layout: layout.name, size: 5,
    cells,
    equations: layout.equations.map((e) => ({ dir: e.dir, line: e.line, cells: e.cells.slice(), eq: e.eq })),
    blanks: layout.order.filter((id) => blankSet.has(id)),
    tray,
    solution,
  };
}

// --- 3. Prove -------------------------------------------------------------------

// Tray multiset, by kind: { num: Map(value -> count), op: Map(value -> count) }.
function trayCounts(tray) {
  const counts = { num: new Map(), op: new Map() };
  tray.forEach((t) => counts[t.kind].set(t.value, (counts[t.kind].get(t.value) || 0) + 1));
  return counts;
}

// The exact search every proof uses. Variables are the unknown cells of `eqs`;
// values come from `counts` (mutated and restored), each tile used at most once.
// `known` holds givens and already-settled cells (mutated and restored). Calls
// visit(known) once per solution — a solution is an assignment of VALUES, so two
// identical tiles swapped are one solution, not two — and stops after `cap`.
// Returns { count, capped }.
function search(eqs, known, counts, kinds, cap, visit) {
  const vars = [];
  const eqsOf = {};
  eqs.forEach((e) => e.forEach((id) => {
    if (known[id] !== undefined) return;
    if (!eqsOf[id]) { eqsOf[id] = []; vars.push(id); }
    if (eqsOf[id].indexOf(e) < 0) eqsOf[id].push(e);
  }));
  let count = 0, stop = false;
  const unknowns = (e) => { let n = 0; for (const id of e) if (known[id] === undefined) n++; return n; };
  // Values the ONE unknown of e can take from what is left in the tray.
  const derive = (e, id) => {
    const pos = e.indexOf(id);
    const [a, o, b, c] = e.map((x) => known[x]);
    if (pos === 1) return NC_OPS.filter((op) => (counts.op.get(op) || 0) > 0 && ncHolds(a, op, b, c));
    const v = solveFor(pos, a, o, b, c);
    return v !== null && (counts.num.get(v) || 0) > 0 ? [v] : [];
  };
  const consistent = (id) => {
    for (const e of eqsOf[id]) {
      const n = unknowns(e);
      if (n === 0) { if (!ncHolds(known[e[0]], known[e[1]], known[e[2]], known[e[3]])) return false; }
      else if (n === 1) {
        const u = e.find((x) => known[x] === undefined);
        if (!derive(e, u).length) return false;
      }
    }
    return true;
  };
  const rec = () => {
    if (stop) return;
    let best = null, bestScore = Infinity;
    for (const id of vars) {
      if (known[id] !== undefined) continue;
      let s = 9;
      for (const e of eqsOf[id]) s = Math.min(s, unknowns(e));
      s = s * 2 + (kinds[id] === 'op' ? 0 : 1);
      if (s < bestScore) { bestScore = s; best = id; }
    }
    if (best === null) {
      count++;
      if (visit) visit(known);
      if (count >= cap) stop = true;
      return;
    }
    const kind = kinds[best];
    let cands = null;
    for (const e of eqsOf[best]) if (unknowns(e) === 1) { cands = derive(e, best); break; }
    if (!cands) cands = [...counts[kind].keys()].filter((v) => counts[kind].get(v) > 0);
    for (const v of cands) {
      const left = counts[kind].get(v) || 0;
      if (left <= 0) continue;
      known[best] = v;
      counts[kind].set(v, left - 1);
      if (consistent(best)) rec();
      counts[kind].set(v, left);
      delete known[best];
      if (stop) return;
    }
  };
  rec();
  return { count, capped: stop && count >= cap };
}

function startState(p) {
  const known = {};
  const kinds = {};
  p.cells.forEach((c) => {
    kinds[c.id] = c.kind;
    if (c.kind !== 'eq' && !c.blank) known[c.id] = c.value;
  });
  return { known, kinds, counts: trayCounts(p.tray) };
}

// How many ways the tray completes the board: 0, 1 or 2 (meaning "two or more").
export function ncCountSolutions(p, limit) {
  const { known, kinds, counts } = startState(p);
  return search(p.equations.map((e) => e.cells), known, counts, kinds, limit || 2, null).count;
}

// What each unknown cell of `eqs` can still be, reasoning over those equations
// only. null when the enumeration hit its cap (too loose to settle anything).
function domains(eqs, known, counts, kinds, cap) {
  const seen = {};
  const r = search(eqs, known, counts, kinds, cap, (k) => {
    eqs.forEach((e) => e.forEach((id) => {
      if (kinds[id] === 'eq') return;
      if (!seen[id]) seen[id] = new Set();
      seen[id].add(k[id]);
    }));
  });
  if (r.capped) return null;
  return seen;
}

// Settle every blank that `eqs` alone forces. Returns [[id, value], ...].
function forcedBy(eqs, known, counts, kinds) {
  const d = domains(eqs, known, counts, kinds, 4000);
  if (!d) return [];
  const out = [];
  Object.keys(d).forEach((id) => {
    if (known[id] !== undefined) return;
    if (d[id].size === 1) out.push([id, [...d[id]][0]]);
  });
  return out;
}

// Blanks that ONE equation alone settles on the untouched board.
export function ncForcedAtStart(p) {
  const { known, kinds, counts } = startState(p);
  const forced = new Set();
  p.equations.forEach((e) => forcedBy([e.cells], known, counts, kinds).forEach(([id]) => forced.add(id)));
  return forced.size;
}

// Solve the board the way a child reasoning line by line would: settle whatever
// one equation forces; when nothing is forced and maxK is 2, look at two crossing
// equations together; repeat. Every step is sound (a forced value is the value in
// every solution), so reaching the end also proves uniqueness. Returns
// { solved, steps, usedPair }.
export function ncPropagate(p, maxK) {
  const { known, kinds, counts } = startState(p);
  const eqs = p.equations.map((e) => e.cells);
  const open = () => p.blanks.filter((id) => known[id] === undefined);
  const pairs = [];
  for (let i = 0; i < eqs.length; i++) for (let j = i + 1; j < eqs.length; j++) {
    if (eqs[i].some((id) => eqs[j].indexOf(id) >= 0)) pairs.push([eqs[i], eqs[j]]);
  }
  let steps = 0, usedPair = false;
  const settle = (list) => {
    let n = 0;
    for (const [id, v] of list) {
      if (known[id] !== undefined) continue;
      const kind = kinds[id];
      const left = counts[kind].get(v) || 0;
      if (left <= 0) continue;
      known[id] = v;
      counts[kind].set(v, left - 1);
      n++;
    }
    return n;
  };
  while (open().length) {
    let got = 0;
    for (const e of eqs) {
      if (!e.some((id) => known[id] === undefined)) continue;
      got += settle(forcedBy([e], known, counts, kinds));
      if (got) break;
    }
    if (!got && maxK >= 2) {
      for (const pr of pairs) {
        if (!pr[0].concat(pr[1]).some((id) => known[id] === undefined)) continue;
        got += settle(forcedBy(pr, known, counts, kinds));
        if (got) { usedPair = true; break; }
      }
    }
    if (!got) break;
    steps++;
  }
  const solved = !open().length && eqs.every((e) => ncHolds(known[e[0]], known[e[1]], known[e[2]], known[e[3]]));
  return { solved, steps, usedPair };
}

// The rung's proof obligation, measured. Cheapest test first; `ok` is the verdict.
export function ncAnalyse(p, spec) {
  const out = { ok: false, forcedAtStart: ncForcedAtStart(p), blanks: p.blanks.length };
  const n = p.blanks.length;
  if (spec.deduce === 'single-each' && out.forcedAtStart !== n) return out;
  if (spec.deduce === 'single-chain' && out.forcedAtStart > n - 2) return out;
  if (spec.deduce === 'pair' && out.forcedAtStart > spec.maxForced) return out;
  const prop = ncPropagate(p, spec.deduce === 'pair' ? 2 : 1);
  out.solved = prop.solved;
  out.steps = prop.steps;
  out.usedPair = prop.usedPair;
  if (!prop.solved) return out;
  if (spec.deduce === 'pair' && !prop.usedPair) return out;
  out.solutions = ncCountSolutions(p, 2);
  out.ok = out.solutions === 1;
  return out;
}

// --- Deal -----------------------------------------------------------------------

// One proven board for the rung from `rng`, or null when the budget runs out.
export function ncGenerate(levelId, rng, budget) {
  const spec = ncLevel(levelId);
  const layout = ncBuildLayout(spec.layout);
  const fills = (budget && budget.fills) || 60;
  const perFill = (budget && budget.perFill) || 12;
  for (let f = 0; f < fills; f++) {
    const sol = ncFill(layout, spec, rng, 400);
    if (!sol) continue;
    for (let b = 0; b < perFill; b++) {
      const p = ncMakePuzzle(layout, sol, spec, rng);
      const a = ncAnalyse(p, spec);
      if (a.ok) { p.stats = a; return p; }
    }
  }
  return null;
}

// What the page calls. A live deal first; if it runs out of budget (it has not
// in testing — see tools/test-number-crossword.js), a board from the rung's
// vetted seed pool, every one of which the test proves generates.
export function ncDeal(levelId, rng) {
  const p = ncGenerate(levelId, rng);
  if (p) return p;
  const spec = ncLevel(levelId);
  const seed = spec.seeds[Math.floor(rng() * spec.seeds.length)];
  return ncGenerate(levelId, ncSeeded(seed), { fills: 400, perFill: 12 });
}

// --- 4. Check -------------------------------------------------------------------

// Judge a placement. `placed` maps a blank cell id to the value of the tile in it.
// Returns { full, solved, lines } where lines[i] is true / false for a complete
// equation and null for one with an empty slot. Judged by the equations only.
export function ncCheck(p, placed) {
  const val = {};
  p.cells.forEach((c) => { if (c.kind !== 'eq') val[c.id] = c.blank ? placed[c.id] : c.value; });
  const lines = p.equations.map((e) => {
    const [a, o, b, c] = e.cells.map((id) => val[id]);
    if ([a, o, b, c].some((v) => v === undefined || v === null)) return null;
    return ncHolds(a, o, b, c);
  });
  const full = p.blanks.every((id) => placed[id] !== undefined && placed[id] !== null);
  return { full, lines, solved: full && lines.every((x) => x === true) };
}

// The blank to reveal as a hint: one whose tile is missing or not the proven
// value, preferring the blank in the line that is nearest to finished — the
// place a child is most likely to be stuck. Returns a cell id or null.
export function ncHintCell(p, placed) {
  const wrong = p.blanks.filter((id) => placed[id] !== p.solution[id]);
  if (!wrong.length) return null;
  let best = null, bestScore = Infinity;
  wrong.forEach((id) => {
    let s = Infinity;
    p.equations.forEach((e) => {
      if (e.cells.indexOf(id) < 0) return;
      s = Math.min(s, e.cells.filter((x) => p.blanks.indexOf(x) >= 0 && placed[x] !== p.solution[x]).length);
    });
    if (s < bestScore) { bestScore = s; best = id; }
  });
  return best;
}

// The equation read aloud by the ship's computer on a win: "3 plus 4 equals 7".
export function ncLineWords(p, index) {
  const e = p.equations[index];
  const byId = {};
  p.cells.forEach((c) => { byId[c.id] = c; });
  const v = (id) => byId[id].blank ? p.solution[id] : byId[id].value;
  return v(e.cells[0]) + ' ' + NC_OP_WORDS[v(e.cells[1])] + ' ' + v(e.cells[2]) + ' equals ' + v(e.cells[3]);
}
