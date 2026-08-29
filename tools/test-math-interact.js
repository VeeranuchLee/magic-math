/* Stateful interaction tests: the real tap → miss → recover → win → next flow,
 * for every expansion game, every rung, both skins — outside a browser.
 *
 * WHY THIS EXISTS. The 2026-08-29 session's in-app browser lost its entire input
 * pipeline (clicks at any coordinate stopped dispatching), which left the
 * expansion's interaction QA as its one open item. Rather than leave it open,
 * this harness runs the REAL component code — the actual tap handlers, state
 * transitions, miss counting, choice regeneration, next-round logic — against a
 * tiny but honest React: working useState (setters update and re-render), a
 * path-keyed hook store so child state survives re-renders, and a virtual clock
 * so timed behaviour (the 450 ms wrong-shake, the 2200 ms unfair-share reset,
 * the division demonstration's staggered dealing) is executed, not skipped.
 *
 * WHAT IT IS HONEST ABOUT. It is logic-level: it proves the games' state
 * machines behave when driven like a child drives them (wrong answers, retries,
 * spam, mid-question difficulty changes, many rounds). It is NOT pixel/geometry
 * QA — that stays with the real-browser loop — and it cannot find
 * browser-only quirks; those need a device.
 *
 * Each game gets a READER that works out the correct answer from the rendered
 * tree the way a child reads the screen (count the lit counters, read the
 * equation), so the tests cannot pass by trusting the generator's own answer
 * key. Run: node tools/test-math-interact.js  (exit non-zero on any failure). */
const fs = require('fs'), vm = require('vm'), path = require('path');

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
}

const Babel = require(path.join(__dirname, '..', 'vendor', 'babel-7.26.4.min.js'));

/* ── the mini renderer ── */
function makeRenderer(sandbox) {
  const slotsByPath = new Map();
  let effects = [];
  const ctxStack = [];
  function render(el, p) {
    if (Array.isArray(el)) return el.map((c, i) => render(c, p + '/' + i)).flat();
    if (el == null || typeof el !== 'object') return el;
    if (typeof el.type === 'function') {
      let slots = slotsByPath.get(p);
      if (!slots) { slots = { arr: [] }; slotsByPath.set(p, slots); }
      const ctx = { slots: slots.arr, i: 0 };
      slots.lastCtx = ctx;
      ctxStack.push(ctx);
      let out;
      try { out = render(el.type(el.props), p); }
      finally { ctxStack.pop(); }
      return out;
    }
    return { ...el, children: (el.children || []).map((c, i) => render(c, p + '/' + i)) };
  }
  const R = {
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(2) }; },
    Fragment: 'Fragment',
    useState(init) {
      const ctx = ctxStack[ctxStack.length - 1];
      const i = ctx.i++;
      if (ctx.slots.length <= i) ctx.slots[i] = typeof init === 'function' ? init() : init;
      const value = ctx.slots[i];
      const setter = v => { ctx.slots[i] = typeof v === 'function' ? v(ctx.slots[i]) : v; };
      return [value, setter];
    },
    useEffect(fn) { effects.push(fn); return () => {}; },
    useRef(start) { const ctx = ctxStack[ctxStack.length - 1]; const i = ctx.i++; if (ctx.slots.length <= i) ctx.slots[i] = { current: start }; return ctx.slots[i]; },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
  };
  return { R, render, runEffects: () => { const fx = effects; effects = []; fx.forEach(f => { try { f(); } catch (e) { check('effect body', false, e.message); } }); }, reset: () => { slotsByPath.clear(); effects = []; } };
}

/* ── the page environment ── */
function loadSkin(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
  const { code } = Babel.transform(m[1], { presets: [['react', {}]] });

  const renderer = makeRenderer();
  const spoken = [];
  const scoreCalls = [];
  /* virtual clock + timers: staggered dealing, shake clears, resets — all run */
  let clock = 0, tid = 0;
  const timers = new Map();
  const sandbox = {
    React: renderer.R,
    useState: renderer.R.useState, useEffect: renderer.R.useEffect, useRef: renderer.R.useRef,
    useCallback: renderer.R.useCallback, useMemo: renderer.R.useMemo,
    console,
    setTimeout(fn, ms) { const id = ++tid; timers.set(id, { fn, at: clock + (ms || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {}, document: { getElementById: () => null, querySelectorAll: () => [] },
    navigator: {},
    Image: function () { this.src = ''; },
    Audio: function () { this.play = () => Promise.resolve(); this.pause = () => {}; return this; },
    performance: { now: () => clock },
    requestAnimationFrame: () => 0,
  };
  /* the page's Sound/Voice/Music are page-defined; spy at the edges we assert on */
  sandbox.__spoken = spoken;
  sandbox.__scoreCalls = scoreCalls;
  sandbox.__flush = ms => {
    const end = clock + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.at)) next = { id, ...t };
      if (!next) break;
      timers.delete(next.id);
      clock = next.at;
      try { next.fn(); } catch (e) { check('timer body', false, e.message); }
    }
    clock = end;
  };
  vm.createContext(sandbox);
  const body = code.replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\([^;]*\);?/, 'void 0;');
  vm.runInContext(body + ';this.__exports={ODD_EVEN_PRESETS,TEN_BOND_PRESETS,HUNDRED_PRESETS,DIVISION_PRESETS,FRACTION_PRESETS,AREA_PRESETS};', sandbox);
  /* wrap Voice.say/lines AFTER the page defined them so spoken lines are recorded */
  vm.runInContext(`(function(){
    const wrap = fn => function(a){ try{ fn&&fn(a); }catch(e){}
      const parts = Array.isArray(a) ? a : [a];
      parts.filter(Boolean).forEach(p => __spoken.push(typeof p === 'object' ? p.t : String(p)));
      return fn ? fn(a) : undefined; };
    Voice.say = wrap(Voice.say.bind(Voice));
    const lines = Voice.lines.bind(Voice);
    Voice.lines = function(parts){ parts.filter(Boolean).forEach(p => __spoken.push(typeof p === 'object' ? p.t : String(p))); return lines(parts); };
  })();`, sandbox);
  sandbox.ODD_EVEN_PRESETS = sandbox.__exports.ODD_EVEN_PRESETS;
  sandbox.TEN_BOND_PRESETS = sandbox.__exports.TEN_BOND_PRESETS;
  sandbox.HUNDRED_PRESETS = sandbox.__exports.HUNDRED_PRESETS;
  sandbox.DIVISION_PRESETS = sandbox.__exports.DIVISION_PRESETS;
  sandbox.FRACTION_PRESETS = sandbox.__exports.FRACTION_PRESETS;
  sandbox.AREA_PRESETS = sandbox.__exports.AREA_PRESETS;
  return { sandbox, renderer };
}

/* ── tree helpers ── */
function findAll(node, pred, out = []) {
  if (Array.isArray(node)) { node.forEach(n => findAll(n, pred, out)); return out; }
  if (node == null || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  if (node.children) node.children.forEach(c => findAll(c, pred, out));
  return out;
}
const byClass = (tree, cls) => findAll(tree, n => typeof n.type === 'string' && String(n.props.className || '').split(/\s+/).includes(cls));
const buttons = tree => findAll(tree, n => typeof n.type === 'string' && (n.type === 'button') && typeof n.props.onClick === 'function');
const textOf = node => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') return textOf(node.children);
  return String(node);
};

/* ── a mounted game session ── */
function mount(skin, Comp, props) {
  const { sandbox, renderer } = skin;
  renderer.reset();
  sandbox.__spoken.length = 0;
  sandbox.__scoreCalls.length = 0;
  const setScore = m => fn => sandbox.__scoreCalls.push({ mode: m, fn });
  let tree;
  const rerender = () => { tree = renderer.render({ type: sandbox[Comp], props: { ...props, score: 0, setScore: setScore(props.__modeId || 'x') } }, 'root'); };
  rerender();
  renderer.runEffects();
  const flush = ms => { sandbox.__flush(ms); rerender(); renderer.runEffects(); };
  return {
    tree: () => tree,
    rerender: () => { rerender(); },
    flush,
    click: el => { el.props.onClick(); rerender(); renderer.runEffects(); },
    spoken: () => sandbox.__spoken,
    scoreCalls: () => sandbox.__scoreCalls,
    sandbox,
  };
}

/* ── per-game readers: the answer as a child would read it off the screen ── */
const READERS = {
  oe1(tree) {
    const board = byClass(tree, 'oe-pairs')[0];
    if (board) {
      const dots = byClass(board, 'oe-dot').length;
      return dots % 2 === 1 ? 'odd' : 'even';
    }
    const num = textOf(byClass(tree, 'oe-num')[0]);
    return parseInt(num, 10) % 2 === 1 ? 'odd' : 'even';
  },
  /* the equation's digits are k and 10 in some order; k is the one that is not 10 */
  n1(tree) {
    const eq = byClass(tree, 'nb-eq')[0];
    if (eq) { const nums = textOf(eq).match(/\d+/g) || []; const k = nums.map(Number).find(x => x !== 10); return String(10 - k); }
    return String(10 - byClass(tree, 'tf-on').length);
  },
  n2(tree) {
    const eq = byClass(tree, 'nb-eq')[0];
    if (eq) { const nums = textOf(eq).match(/\d+/g) || []; const k = nums.map(Number).find(x => x !== 10); return String(10 - k); }
    return String(byClass(tree, 'tf-on').length);
  },
  h1(tree) {
    const q = textOf(byClass(tree, 'hb-question')[0]).replace(/\s+/g, '');
    const m = q.match(/(\d+)[+−-](\d+)/);
    if (m) {
      const start = parseInt(m[1], 10), d = parseInt(m[2], 10);
      return String(start + (q.includes('−') ? -d : d));
    }
    const b = q.match(/(\d+)→(\d+)/);
    if (b) { const delta = parseInt(b[2], 10) - parseInt(b[1], 10); return (delta > 0 ? '+' : '−') + Math.abs(delta); }
    return null;
  },
  d1(tree) {
    const plates = byClass(tree, 'dv-plate');
    if (plates.length) {
      const counts = plates.map(p => byClass(p, 'oe-dot').length);
      return String(counts[0]);
    }
    const rings = byClass(tree, 'dv-ring');
    if (rings.length) return String(rings.length);
    const sub = textOf(byClass(tree, 'count-title-sub')[0]);
    const gm = sub.match(/Groups of (\d+)/);
    if (gm) {
      const pool = byClass(tree, 'dv-pool')[0];
      return String(Math.round(byClass(pool, 'oe-dot').length / parseInt(gm[1], 10)));
    }
    return null;
  },
  q1(tree) {
    const bar = byClass(tree, 'fr-bar')[0], grid = byClass(tree, 'fr-grid')[0], pie = byClass(tree, 'fr-pie')[0], group = byClass(tree, 'fr-group')[0];
    const host = bar || grid || pie || group;
    if (!host) return null;
    const parts = (bar ? byClass(host, 'fr-part') : grid ? byClass(host, 'fr-cell') : pie ? pie.children : byClass(host, 'oe-dot'));
    const lit = (bar || grid) ? byClass(host, 'fr-on').length : pie ? findAll(host, n => n.props && n.props.className === 'fr-on').length : byClass(host, 'fr-dot-on').length;
    return `${lit}/${parts.length}`;
  },
  u1(tree) {
    const ask = textOf(byClass(tree, 'um-ask')[0]);
    const items = vm.runInContext('MEASURE_ITEMS', SKIN.sandbox);
    const words = vm.runInContext('MEASURE_WORDS', SKIN.sandbox);
    /* match by the item's full noun phrase, longest first so "swimming pool"
       beats "pool", then answer with the WORD the chips speak */
    const sorted = items.slice().sort((a, b) => b.thing.length - a.thing.length);
    const item = sorted.find(m => ask.includes(m.thing));
    return item ? words[item.unit] : null;
  },
  a1(tree) { return String(byClass(tree, 'ag-on').length); },
};

/* answer-control locator per game: returns [{key, click}] where key matches the reader's answer */
function answerControls(game, tree) {
  if (game === 'oe1') return buttons(tree).filter(b => b.props.className.includes('oe-key')).map(b => ({ key: b.props['aria-label'].startsWith('Even') ? 'even' : 'odd', click: b }));
  if (game === 'u1') return byClass(tree, 'um-tile').map(b => ({ key: b.props['aria-label'], click: b }));
  if (game === 'h1') {
    const chips = byClass(tree, 'hb-chip');
    if (chips.length) return chips.map(b => ({ key: textOf(b).replace(/\s+/g, ''), click: b }));
    return byClass(tree, 'hb-cell').filter(b => b.props.onClick).map(b => ({ key: b.props['aria-label'], click: b }));
  }
  const tiles = byClass(tree, 'nb-tile').concat(byClass(tree, 'fr-tile'));
  return tiles.map(b => ({ key: (b.props['aria-label'] || textOf(b)).replace(/\s+/g, ''), click: b }));
}

/* ── the standard child flow, run for a game+rung ── */
function playRound(session, game, label) {
  const tree = session.tree();
  const answer = READERS[game](tree);
  if (answer == null) return { ok: false, why: 'reader could not read a problem' };
  const controls = answerControls(game, tree);
  const correct = controls.find(c => c.key === answer);
  const wrong = controls.find(c => c.key !== answer);
  if (!correct || !wrong) return { ok: false, why: `controls missing (answer=${answer}, got ${controls.map(c => c.key).join(',')})` };
  return { ok: true, answer, correct, wrong, controls };
}

function exerciseGame(skin, game, Comp, props, rungLabel, rounds) {
  const issues = [];
  const session = mount(skin, Comp, props);

  /* wrong → recover → correct → next, `rounds` times, plus spam and hints */
  let prevAnswer = null;
  for (let r = 0; r < rounds; r++) {
    let info = playRound(session, game, rungLabel);
    if (!info.ok) { issues.push(`round ${r}: ${info.why}`); break; }
    if (prevAnswer !== null && info.answer === prevAnswer && rounds > 3) { /* fine occasionally, not every time */ }
    prevAnswer = info.answer;

    /* wrong answer: no progress, question unchanged */
    const before = session.scoreCalls().length;
    session.click(info.wrong.click);
    session.flush(500);
    let snap = session.tree();
    if (session.scoreCalls().length !== before) issues.push(`round ${r}: wrong answer scored`);
    if (byClass(snap, 'next-btn').length) issues.push(`round ${r}: next button after wrong answer`);
    if (textOf(byClass(snap, 'celebrate-text')[0] || '')) issues.push(`round ${r}: celebrate text after wrong answer`);

    /* recover: correct answer now */
    const rerun = playRound(session, game, rungLabel);
    if (!rerun.ok) { issues.push(`round ${r}: lost problem after wrong answer — ${rerun.why}`); break; }
    session.click(rerun.correct.click);
    snap = session.tree();
    if (!byClass(snap, 'next-btn').length) issues.push(`round ${r}: no next button after correct answer`);
    if (session.scoreCalls().length !== before + 1) issues.push(`round ${r}: score not +1 after correct (Δ=${session.scoreCalls().length - before})`);

    /* Spam, honestly: real React dispatches to the CURRENT handlers, and the
       win replaces the tiles with the celebrate row — so spam must re-locate
       controls in the fresh tree, exactly as a re-rendered DOM would force.
       A gone control is the real behaviour; a still-present control that scores
       again would be a real bug. */
    for (let spam = 0; spam < 2; spam++) {
      const still = answerControls(game, session.tree()).find(c => c.key === info.answer);
      if (!still) break; /* replaced by the celebrate row — spam impossible, correct */
      session.click(still.click);
    }
    if (session.scoreCalls().length !== before + 1) issues.push(`round ${r}: spam scored again`);
    const nextBtn = byClass(session.tree(), 'next-btn')[0];
    if (!nextBtn) { issues.push(`round ${r}: next vanished after spam`); break; }
    session.click(nextBtn);
    const nextAgain = byClass(session.tree(), 'next-btn')[0];
    if (nextAgain) session.click(nextAgain); /* double-tap next: may or may not persist */
    session.flush(50);
    const after = playRound(session, game, rungLabel);
    if (!after.ok) { issues.push(`round ${r}: no fresh problem after next — ${after.why}`); break; }
    const unique = new Set(answerControls(game, session.tree()).map(c => c.key));
    if (unique.size !== answerControls(game, session.tree()).length) issues.push(`round ${r}: duplicate answer choices`);
  }

  /* the two-miss hint path on a fresh problem */
  const session2 = mount(skin, Comp, props);
  let info = playRound(session2, game, rungLabel);
  if (info.ok) {
    session2.click(info.wrong.click); session2.flush(500);
    session2.click(info.wrong.click); session2.flush(500);
    if (game === 'h1') {
      /* the board's hint is the revealed path — the stops light up to the answer */
      if (!byClass(session2.tree(), 'hb-path').length) issues.push('no path reveal after two misses');
    } else {
      const hinted = answerControls(game, session2.tree()).filter(c => String(c.click.props.className).includes('hint-glow'));
      if (!hinted.length) issues.push('no hint highlight after two misses');
    }
    const again = playRound(session2, game, rungLabel);
    if (again.ok) { session2.click(again.correct.click); if (!byClass(session2.tree(), 'next-btn').length) issues.push('cannot win after two misses'); }
  } else issues.push('hint-path mount failed: ' + info.why);

  return issues;
}

/* ── run everything ── */
const SPACE_SHARED = { onBack: () => {}, journey: 3, addProgress: () => false, trophies: 0, journeyBg: 'bg.webp', muted: true, onToggleMute: () => {} };
const UNICORN_SHARED = { onBack: () => {}, flowers: 4, gardenFull: false, setFlowers: () => {}, setFlowersDirect: null, setGardenFull: () => {}, bouquets: 0, addBouquet: () => {}, muted: true, onToggleMute: () => {} };

let SKIN; /* READERS.u1 needs a sandbox for MEASURE_ITEMS */
for (const [skinName, file, shared] of [
  ['space', 'space-math.html', SPACE_SHARED],
  ['unicorn', 'unicorn-math.html', UNICORN_SHARED],
]) {
  const skin = loadSkin(file);
  SKIN = skin;
  const P = skin.sandbox;

  const plans = [
    ['oe1', 'OddEvenGame', P.ODD_EVEN_PRESETS.map(p => ({ props: { ...shared }, preset: p }))],
    ['n1', 'TenBondGame', P.TEN_BOND_PRESETS.n1.map(p => ({ props: { ...shared, modeId: 'n1' }, preset: p }))],
    ['n2', 'TenBondGame', P.TEN_BOND_PRESETS.n2.map(p => ({ props: { ...shared, modeId: 'n2' }, preset: p }))],
    ['h1', 'HundredGame', P.HUNDRED_PRESETS.map(p => ({ props: { ...shared }, preset: p }))],
    ['d1', 'DivisionGame', P.DIVISION_PRESETS.map(p => ({ props: { ...shared }, preset: p }))],
    ['q1', 'FractionGame', P.FRACTION_PRESETS.map(p => ({ props: { ...shared }, preset: p }))],
    ['u1', 'MeasureGame', [{ props: { ...shared }, preset: null }]],
    ['a1', 'AreaGame', P.AREA_PRESETS.map(p => ({ props: { ...shared }, preset: p }))],
  ];

  for (const [game, Comp, rungs] of plans) {
    for (const rung of rungs) {
      if (rung.preset && rung.preset.id === 'd1share') continue; /* dedicated block below */
      /* The component picks its own rung from presets[0]; to exercise a given
         rung we swap it into slot 0 of the live preset array (as the mount
         harness does), then restore. */
      const label = `${skinName} ${game}${rung.preset ? ' [' + rung.preset.id + ']' : ''}`;
      let swapBack = null;
      if (rung.preset) {
        const list = Array.isArray(rung.preset) ? rung.preset : null;
        /* find the owning array in the sandbox */
        for (const name of ['ODD_EVEN_PRESETS', 'TEN_BOND_PRESETS', 'HUNDRED_PRESETS', 'DIVISION_PRESETS', 'FRACTION_PRESETS', 'AREA_PRESETS']) {
          const arr = P[name];
          const candidate = Array.isArray(arr) ? arr : arr[game === 'n1' || game === 'n2' ? game : null];
          if (Array.isArray(candidate) && candidate.includes(rung.preset)) {
            swapBack = candidate[0];
            candidate[0] = rung.preset;
            break;
          }
        }
      }
      try {
        const issues = exerciseGame(skin, game, Comp, rung.props, label, 8);
        check(`${label}: wrong→recover→correct→next ×8 + hint path + spam`, issues.length === 0, issues.join('; '));
      } catch (e) {
        check(`${label}: session ran`, false, e.message);
      } finally {
        if (swapBack !== null) {
          for (const name of ['ODD_EVEN_PRESETS', 'TEN_BOND_PRESETS', 'HUNDRED_PRESETS', 'DIVISION_PRESETS', 'FRACTION_PRESETS', 'AREA_PRESETS']) {
            const arr = P[name];
            const candidate = Array.isArray(arr) ? arr : arr[game === 'n1' || game === 'n2' ? game : null];
            if (Array.isArray(candidate) && candidate.includes(rung.preset)) { candidate[0] = swapBack; break; }
          }
        }
      }
    }
  }

  /* ── division share rung: the dealing flow itself ── */
  {
    const session = mount(skin, 'DivisionGame', { ...shared });
    /* deal everything into basket 0 — unfair */
    let guard = 0;
    while (!byClass(session.tree(), 'dv-unequal').length && byClass(session.tree(), 'nb-tile').length === 0 && guard++ < 40) {
      const plates = byClass(session.tree(), 'dv-plate').filter(b => b.props.onClick);
      if (!plates.length) break;
      session.click(plates[0]);
    }
    check(`${skinName} d1 share: unfair deal is named`, byClass(session.tree(), 'dv-unequal').length === 1);
    session.flush(2400);
    check(`${skinName} d1 share: unfair deal resets the baskets`,
      byClass(session.tree(), 'dv-plate').every(p => byClass(p, 'oe-dot').length === 0));

    /* unfair again → the demonstration deals round-robin and asks */
    guard = 0;
    while (!byClass(session.tree(), 'dv-unequal').length && byClass(session.tree(), 'nb-tile').length === 0 && guard++ < 40) {
      const plates = byClass(session.tree(), 'dv-plate').filter(b => b.props.onClick);
      if (!plates.length) break;
      session.click(plates[0]);
    }
    session.flush(1200 + 40 * 300);
    const plates = byClass(session.tree(), 'dv-plate');
    const counts = plates.map(p => byClass(p, 'oe-dot').length);
    check(`${skinName} d1 share: demonstration deals equally`, counts.length > 0 && counts.every(c => c === counts[0]));
    check(`${skinName} d1 share: demonstration ends on the question`, byClass(session.tree(), 'nb-tile').length >= 2);

    /* fair dealing path: round-robin by hand, then answer */
    const s2 = mount(skin, 'DivisionGame', { ...shared });
    let turn = 0;
    while (byClass(s2.tree(), 'nb-tile').length === 0) {
      const plates = byClass(s2.tree(), 'dv-plate').filter(b => b.props.onClick);
      if (!plates.length) break;
      s2.click(plates[turn % plates.length]); turn++;
      if (turn > 40) break;
    }
    check(`${skinName} d1 share: fair dealing reaches the question`, byClass(s2.tree(), 'nb-tile').length >= 2);
    const info = playRound(s2, 'd1', 'share');
    if (info.ok) {
      s2.click(info.correct.click);
      check(`${skinName} d1 share: fair deal wins`, byClass(s2.tree(), 'next-btn').length === 1);
    } else check(`${skinName} d1 share: readable after fair deal`, false, info.why);
  }

  /* ── difficulty switching mid-question (settings modal path) ── */
  {
    const session = mount(skin, 'OddEvenGame', { ...shared });
    const gear = buttons(session.tree()).find(b => (b.props['aria-label'] || '') === 'Change the numbers');
    if (!gear) check(`${skinName} settings gear reachable`, false, 'no gear button');
    else {
      session.click(gear);
      const presetBtns = byClass(session.tree(), 'preset-btn').filter(b => b.props.onClick);
      check(`${skinName} settings modal offers rungs`, presetBtns.length >= 2);
      session.click(presetBtns[presetBtns.length - 1]);
      const info = playRound(session, 'oe1', 'switched');
      check(`${skinName} difficulty switch regenerates a fresh problem`, info.ok, info.ok ? '' : info.why);
    }
  }
}

console.log(`\n${failed === 0 ? 'ALL INTERACTION FLOWS HOLD' : failed + ' INTERACTION FAILURE(S)'}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
