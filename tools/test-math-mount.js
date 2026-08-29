/* Cold-mount smoke test: every game component in both skins must RENDER without
 * throwing, outside a browser.
 *
 * tools/test-render-refs.js catches "referenced but defined nowhere". It says so
 * itself: it "does not render — a component that is defined but throws for some
 * other reason still reaches a child. Catching those needs a real browser." On
 * 2026-08-29 the expansion's TenBondGame proved that gap is real: every name was
 * defined, every gate passed, and the page rendered blank (found by loading the
 * game in a browser through the #play-<mode> QA bootstrap).
 *
 * This harness executes the real component bodies with a minimal fake React:
 * hooks are stubbed, createElement returns plain objects, and every mode id the
 * home screen offers is mounted with the props App passes it. It is not a layout
 * or interaction test — it is the cheapest possible answer to "does this screen
 * come up at all", for every game, on every run, with no browser.
 *
 * The ask-effect bodies (useEffect callbacks) run too, wrapped in try/catch:
 * they exercise the Voice lines each game speaks on mount, which is where a
 * template-literal bug likes to hide.
 *
 * Run: node tools/test-math-mount.js   (exit non-zero on any failure) */
const fs = require('fs'), vm = require('vm'), path = require('path');

let failed = 0, passed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
};

const Babel = require(path.join(__dirname, '..', 'vendor', 'babel-7.26.4.min.js'));

/* Fake hooks good enough to run any game component's body. State is stored per
   component instance; the harness mounts one component at a time, so a single
   slot per hook suffices. */
function makeFakeReact() {
  let stateSlot = { i: 0, states: [] };
  let effectBodies = [];
  const reset = () => { stateSlot = { i: 0, states: [] }; effectBodies = []; };
  const R = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat ? children.flat(2) : children };
    },
    Fragment: 'Fragment',
    useState(init) {
      const s = stateSlot;
      const idx = s.i++;
      if (s.states[idx] === undefined) s.states[idx] = typeof init === 'function' ? init() : init;
      const setter = () => {};   // fire-and-forget: one render pass only
      return [s.states[idx], setter];
    },
    useEffect(fn) { effectBodies.push(fn); return () => {}; },
    useRef(start) { return { current: start }; },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
  };
  return { R, reset, effectBodies: () => effectBodies };
}

/* The page's script, compiled and evaluated with the fake React and stubs for every
   browser API the module top level touches. */
function loadSkin(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${file}: no babel script`);
  const { code } = Babel.transform(m[1], { presets: [['react', {}]] });
  const { R, reset, effectBodies } = makeFakeReact();

  const sandbox = {
    React: R,
    useState: R.useState, useEffect: R.useEffect, useRef: R.useRef,
    useCallback: R.useCallback, useMemo: R.useMemo,
    console,
    setTimeout: () => 0, clearTimeout: () => {},
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    localStorage: { getItem: () => null, setItem: () => {} },
    window: { speechSynthesis: undefined, addEventListener: () => {} },
    document: { getElementById: () => null, querySelectorAll: () => [], hidden: false },
    navigator: { serviceWorker: undefined },
    Image: function () { this.src = ''; },
    Audio: function () { this.play = () => Promise.resolve(); this.pause = () => {}; return this; },
    speechSynthesis: undefined,
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
  };
  sandbox.window.Audio = sandbox.Audio;
  sandbox.window.Image = sandbox.Image;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.setTimeout = sandbox.setTimeout;
  sandbox.window.clearTimeout = sandbox.clearTimeout;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.fetch = sandbox.fetch;
  vm.createContext(sandbox);
  /* The trailing ReactDOM.createRoot(...).render(...) line is removed — this harness
     mounts components itself, with controlled props. */
  const body = code.replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\([^;]*\);?/, 'void 0;');
  if (body === code) throw new Error(`${file}: could not neutralise the root render call`);
  /* const/let declarations never attach to a context's global object, while function
     declarations do — so the preset arrays the rung tests need are exported
     explicitly on `this` (the sandbox global). */
  vm.runInContext(body + ';this.__exports={ODD_EVEN_PRESETS,TEN_BOND_PRESETS,TEN_CFG,HUNDRED_PRESETS,DIVISION_PRESETS,FRACTION_PRESETS,AREA_PRESETS};', sandbox);
  sandbox.ODD_EVEN_PRESETS = sandbox.__exports && sandbox.__exports.ODD_EVEN_PRESETS;
  sandbox.TEN_BOND_PRESETS = sandbox.__exports && sandbox.__exports.TEN_BOND_PRESETS;
  sandbox.TEN_CFG = sandbox.__exports && sandbox.__exports.TEN_CFG;
  sandbox.HUNDRED_PRESETS = sandbox.__exports && sandbox.__exports.HUNDRED_PRESETS;
  sandbox.DIVISION_PRESETS = sandbox.__exports && sandbox.__exports.DIVISION_PRESETS;
  sandbox.FRACTION_PRESETS = sandbox.__exports && sandbox.__exports.FRACTION_PRESETS;
  sandbox.AREA_PRESETS = sandbox.__exports && sandbox.__exports.AREA_PRESETS;
  return { sandbox, reset, effectBodies };
}

/* Mount every routed mode with the props its App passes. Props come from the routing
   lines themselves (shared + score/setScore + modeId), mirrored here. */
const SPACE_SHARED = {
  onBack: () => {}, journey: 3, addProgress: () => false, trophies: 0,
  journeyBg: 'bg.webp', muted: true, onToggleMute: () => {},
};
const UNICORN_SHARED = {
  onBack: () => {}, flowers: 4, gardenFull: false, setFlowers: () => {},
  setGardenFull: () => {}, bouquets: 0, addBouquet: () => {}, muted: true, onToggleMute: () => {},
};

for (const [skin, shared, extra] of [
  ['space-math.html', SPACE_SHARED, {}],
  ['unicorn-math.html', UNICORN_SHARED, { useFlowerReward: () => () => {} }],
]) {
  let env;
  try {
    env = loadSkin(skin);
  } catch (e) {
    ok(`${skin} loads`, false, e.message);
    continue;
  }
  ok(`${skin} loads`, true);
  Object.assign(env.sandbox, extra);

  const src = fs.readFileSync(path.join(__dirname, '..', skin), 'utf8');
  const routed = [...src.matchAll(/mode==='([a-z]+\d)'\)?\s*(?:screen=|return)(?:<(\w+))/g)].map(m => [m[1], m[2]]);
  ok(`${skin}: routing table parsed`, routed.length >= 14, `found ${routed.length}: ${routed.map(r => r[0]).join(',')}`);

  for (const [mode, Comp] of routed) {
    env.reset();
    try {
      const props = { ...shared, score: 0, setScore: () => {} };
      if (Comp === 'TenBondGame' || Comp === 'ColumnMath') props.modeId = mode;
      const el = env.sandbox[Comp](props);
      ok(`${skin} ${mode} (${Comp}) mounts`, !!el && (typeof el.type === 'string' || typeof el.type === 'function'),
        el ? `unexpected element ${JSON.stringify(el).slice(0, 80)}` : 'returned nothing');
      /* Ask-effects run once, wrapped: a broken template in a Voice line throws here,
         not silently in a browser. */
      for (const fx of env.effectBodies()) {
        try { fx(); } catch (e) {
          ok(`${skin} ${mode} ask-effect`, false, e.message);
        }
      }
    } catch (e) {
      ok(`${skin} ${mode} (${Comp}) mounts`, false, e.message);
    }
  }

  /* ── EVERY RUNG OF THE EXPANSION GAMES, NOT JUST THE OPENING ONE ──
     The games pick their preset through internal state (presets[0]), which a prop
     cannot reach — but the preset ARRAYS live in the same sandbox, so swapping
     index 0 for each real preset mounts every rung. This is where the numbers-only
     render paths (the equation row, the pair-them-up button) get executed; the
     cold-mount QA of 2026-08-29 could not click a difficulty pill, and a rung that
     only crashes when chosen would otherwise ship green. */
  const rungGames = [
    ['OddEvenGame', 'ODD_EVEN_PRESETS'],
    ['TenBondGame', 'TEN_BOND_PRESETS', 'n1'],
    ['TenBondGame', 'TEN_BOND_PRESETS', 'n2'],
    ['HundredGame', 'HUNDRED_PRESETS'],
    ['DivisionGame', 'DIVISION_PRESETS'],
    ['FractionGame', 'FRACTION_PRESETS'],
    ['AreaGame', 'AREA_PRESETS'],
  ];
  for (const [Comp, presetName, modeId] of rungGames) {
    const list = env.sandbox[presetName];
    if (!list) { ok(`${skin} exposes ${presetName}`, false); continue; }
    const presets = Array.isArray(list) ? list : list[modeId];
    for (let i = 0; i < presets.length; i++) {
      env.reset();
      const keep = presets[0];
      try {
        /* shallow-swap in the sandbox, mount, swap back */
        presets[0] = presets[i];
        const props = { ...shared, score: 0, setScore: () => {}, modeId };
        env.sandbox[Comp](props);
        for (const fx of env.effectBodies()) {
          try { fx(); } catch (e) { ok(`${skin} ${Comp}[${modeId || ''}] rung ${i + 1} ask-effect`, false, e.message); }
        }
        ok(`${skin} ${Comp}[${modeId || ''}] rung ${i + 1} (${presets[i].id}) mounts`, true);
      } catch (e) {
        ok(`${skin} ${Comp}[${modeId || ''}] rung ${i + 1} (${presets[i].id}) mounts`, false, e.message);
      } finally {
        presets[0] = keep;
      }
    }
  }

  /* And the home screen itself mounts with its own props. */
  env.reset();
  try {
    const el = env.sandbox.Home(skin.startsWith('space')
      ? { onSelect: () => {}, trophies: 0, journey: 0 }
      : { onSelect: () => {}, bouquets: 0 });
    ok(`${skin} Home mounts`, !!el);
  } catch (e) {
    ok(`${skin} Home mounts`, false, e.message);
  }
}

console.log(`\n${failed === 0 ? 'ALL MODES COLD-MOUNT' : failed + ' MOUNT FAILURE(S)'}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
