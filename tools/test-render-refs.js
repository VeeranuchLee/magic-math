/* Every name a page uses must be defined IN THAT PAGE.

   WHY THIS EXISTS. On 2026-08-26 the Read Big Numbers keypad reused `<BackspaceIcon/>`,
   which space-math defines and unicorn-math does not — that skin uses words where space
   uses icons. React threw `ReferenceError: BackspaceIcon is not defined` the moment the
   screen rendered, and because the throw happened inside the root render, unicorn-math
   rendered NOTHING AT ALL. A blank page.

   Four gates passed it: check-math-parity (compares blocks, does not evaluate them),
   test-clips-gate (lifts the resolver out and exercises that), test-voice-chain (fakes
   Clips entirely) and build-narration-manifest --verify (audio coverage). None of them
   evaluates a page, so none of them could see it. It was caught by loading the skin in a
   browser and finding zero buttons on it, which is not a thing anyone remembers to do.

   WHAT THIS CATCHES, PRECISELY: a component or helper referenced somewhere in a page and
   defined nowhere in it. That is the whole bug above, and it is the standing hazard of two
   skins that share code by being edited in parallel rather than by importing anything.

   WHAT IT DOES NOT CATCH, and this is worth being honest about rather than letting the
   name oversell it: it does not render. A component that is defined but throws for some
   other reason — a bad prop, a null deref, a hook called conditionally — still reaches a
   child. Catching those needs a real browser, which a pre-commit gate cannot have. This
   check is the cheap half, and the cheap half is the half that failed.

   HOW, without a parser: the pages are one inline `text/babel` script each, and every
   definition in them is a top-level `function X(` or `const X=`. A regex pass over that is
   enough to be exact about names, and being wrong in the safe direction is easy — an
   over-broad definition sweep can only produce FALSE PASSES, never false alarms, so the
   sweep deliberately collects declarations at any depth. */
const fs = require('fs'), path = require('path');

const SKINS = ['space-math.html', 'unicorn-math.html'];
let failed = 0, passed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
};

/* The one inline JSX script. `text/babel` in the source tree; the publish build compiles
   it away, so this is a SOURCE gate like its three siblings and says so if pointed at
   compiled bytes rather than reporting a confusing pile of misses. */
function script(skin) {
  const html = fs.readFileSync(path.join(__dirname, '..', skin), 'utf8');
  const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
  if (!m) {
    console.error(`\n${skin}: no text/babel script. This is a SOURCE gate — run it on the`);
    console.error('repository tree, not on a compiled publish candidate.');
    process.exit(2);
  }
  return m[1];
}

/* Strings and comments hold `<Foo` and `name(` that are not code — the docstrings in these
   pages are long and quote JSX freely. Blanking them first is what keeps this exact. */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')            // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')        // line comments, sparing `http://`
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")        // single-quoted
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')        // double-quoted
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');         // templates (their ${} go too; see below)
}

/* Template literals are blanked above, which would hide a reference inside `${...}`. The
   pages use those constantly — `${a} times ${b}` — so the interpolations are harvested
   back out of the ORIGINAL source before the blanking loses them. */
function interpolations(src) {
  return (src.match(/\$\{[^{}]*\}/g) || []).join(' ');
}

function defined(code) {
  const names = new Set();
  const add = re => { let m; while ((m = re.exec(code))) names.add(m[1]); };
  add(/\bfunction\s+([A-Za-z_$][\w$]*)/g);
  add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  add(/\bclass\s+([A-Za-z_$][\w$]*)/g);
  /* `const {useState,useEffect}=React` and friends. */
  let m, destr = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g;
  while ((m = destr.exec(code)))
    m[1].split(',').forEach(part => {
      const n = part.split(':').pop().trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  /* Function parameters, so a component using its own props is not reported. */
  let fn = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g;
  while ((m = fn.exec(code)))
    m[1].split(',').forEach(part => {
      const n = part.split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  return names;
}

/* JSX component references only. Lowercase tags are HTML; dotted tags are checked on
   their base object, so `<React.Fragment>` asks whether `React` exists. */
function componentsUsed(code) {
  const used = new Map();                       // name -> a line number, for the message
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    let m, re = /<([A-Z][\w$]*)/g;
    while ((m = re.exec(line))) if (!used.has(m[1])) used.set(m[1], i + 1);
  });
  return used;
}

const GLOBALS = new Set([
  'React', 'ReactDOM', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'JSON',
  'Date', 'Set', 'Map', 'Promise', 'Error', 'RegExp', 'Audio', 'Image', 'AudioContext',
  'OfflineAudioContext', 'Intl', 'URL', 'Infinity', 'NaN',
]);

const perSkin = {};
for (const skin of SKINS) {
  const raw = script(skin);
  const code = stripNonCode(raw) + '\n' + interpolations(raw);
  const defs = defined(code);
  const used = componentsUsed(code);
  perSkin[skin] = { defs, used };

  const missing = [...used].filter(([n]) => !defs.has(n) && !GLOBALS.has(n));
  ok(`${skin}: every component it renders is defined in it`,
     missing.length === 0,
     missing.map(([n, ln]) => `<${n}/> used at line ~${ln} of the script, defined nowhere`).join('\n      '));
}

/* THE CROSS-SKIN REPORT, which is the context that explains the failure above rather than
   a failure itself. The skins are ALLOWED to differ — space draws icons where unicorn
   writes words — so a one-sided component is not a bug. It is the list of names a shared
   component may not touch, and printing it is how the next person finds that out before
   the browser does. */
const [A, B] = SKINS;
const onlyA = [...perSkin[A].defs].filter(n => /^[A-Z]/.test(n) && !perSkin[B].defs.has(n));
const onlyB = [...perSkin[B].defs].filter(n => /^[A-Z]/.test(n) && !perSkin[A].defs.has(n));
console.log('\n=== components defined in one skin only — safe to use THERE, never in shared code ===');
console.log(`  ${A.replace('-math.html', '')} only:   ${onlyA.join(', ') || '(none)'}`);
console.log(`  ${B.replace('-math.html', '')} only: ${onlyB.join(', ') || '(none)'}`);

console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? 'RENDER REFS FAILED' : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
