#!/usr/bin/env node
/* Parity check for the two math themes.  node tools/check-math-parity.js
 *
 * space-math.html and unicorn-math.html are the same games in two themes, and the
 * standing failure mode of every change to them is that it lands in one file and not
 * the other, or lands differently. This makes that mechanical instead of aspirational:
 *
 *   1. the blocks that must be byte-identical are diffed;
 *   2. ColumnMath, which legitimately differs, is checked by deriving unicorn's version
 *      from space's through exactly the seven permitted differences and comparing. Any
 *      eighth difference is a failure.
 *
 * Run it after touching either file. Exit code is non-zero on any divergence.
 */
const fs = require('fs'), path = require('path');

const dir = path.join(__dirname, '..');
const S = fs.readFileSync(path.join(dir, 'space-math.html'), 'utf8');
const U = fs.readFileSync(path.join(dir, 'unicorn-math.html'), 'utf8');

let fails = 0;
const ok = (cond, name, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '\n      ' + detail : ''}`);
  if (!cond) fails++;
};

/* Pull the text between two markers. Both markers must be unique in the file, so a
   rename that breaks an anchor fails loudly rather than silently checking nothing. */
function region(src, name, from, to) {
  const parts = src.split(from);
  if (parts.length !== 2) throw new Error(`anchor "${from}" occurs ${parts.length - 1}x in ${name}`);
  const rest = parts[1];
  const end = rest.indexOf(to);
  if (end < 0) throw new Error(`closing anchor "${to}" not found in ${name}`);
  return from + rest.slice(0, end);
}

console.log('=== blocks that must be byte-identical in both themes ===');
const SHARED = [
  ['Voice object', '/* ══ VOICE (Web Speech) ══ */', '\nconst PRAISE=['],
  /* The helpers are inserted after toColumnDigits, so the next thing in the file is c1's
     own settings modal — NOT ColumnMathSettings, which sits much further down after
     ColumnAdd. Anchoring on the wrong one silently swallows all of c1 into the diff. */
  ['column maths helpers', '/* ══ MODES c2 / c3 / c4', '\nfunction ColumnAddSettings'],
  ['new GamePreview branches', "  if(id==='c2')return(", '  return null;'],
];
for (const [name, from, to] of SHARED) {
  try {
    const a = region(S, 'space', from, to), b = region(U, 'unicorn', from, to);
    let detail = '';
    if (a !== b) {
      const la = a.split('\n'), lb = b.split('\n');
      for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        if (la[i] !== lb[i]) { detail = `first difference at line ${i + 1} of the block:\n      space:   ${la[i]}\n      unicorn: ${lb[i]}`; break; }
      }
    }
    ok(a === b, name, detail);
  } catch (e) { ok(false, name, e.message); }
}

const seam = s => (s.match(/^ *seam\(\).*$/m) || [null])[0];
ok(seam(S) && seam(S) === seam(U), 'Sound.seam()');

console.log('\n=== ColumnMath: exactly seven permitted differences, and no more ===');
/* Kept in the same order as the parity contract in the task record. Each rewrites one
   space-ism into its unicorn equivalent; the result must then equal unicorn's file. */
const SUBS = [
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function ColumnMath({modeId, onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function ColumnMath({modeId, onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const badT=useRef(null), nudgeT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const badT=useRef(null), nudgeT=useRef(null);'],
  ['  const next=useCallback(()=>{\n    resetForProblem(makeColumnProblem(cfg,preset,problem));\n  },[cfg,preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeColumnProblem(cfg,preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,cfg,preset,problem,resetForProblem]);'],
  ['    const arrived=addProgress();\n    Voice.lines([`${problem.answer}!`,`${problem.a} ${cfg.opWord} ${problem.b} is ${problem.answer}.`,arrived?null:praise()]);\n    setScore(s=>s+1);\n    setTimeout(()=>setConf(false),2500);\n  },[cursor,slots.length,won,muted,problem,cfg,setScore,addProgress]);',
   '    Voice.lines([`${problem.answer}!`,`${problem.a} ${cfg.opWord} ${problem.b} is ${problem.answer}.`,praise()]);\n    setScore(s=>s+1); addFlower();\n    setTimeout(()=>setConf(false),2500);\n  },[cursor,slots.length,won,muted,problem,cfg,setScore,addFlower]);'],
  ["    <div className=\"screen column-screen cm-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen column-screen cm-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp}/>'],
  ['          <button className="key-btn clear" onClick={back} aria-label="Undo"><BackspaceIcon/></button>',
   '          <button className="key-btn clear" onClick={back}>Undo</button>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];

try {
  const FROM = '/* One modal for all three new modes', TO = '\n/* ══ MODE m1';
  let derived = region(S, 'space', FROM, TO);
  const actual = region(U, 'unicorn', FROM, TO);
  for (const [from, to] of SUBS) {
    if (!derived.includes(from)) { ok(false, 'substitution anchor present', from.slice(0, 90)); continue; }
    derived = derived.replace(from, to);
  }
  let detail = '';
  if (derived !== actual) {
    const la = derived.split('\n'), lb = actual.split('\n');
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) { detail = `an EIGHTH difference at line ${i + 1} of ColumnMath:\n      derived: ${la[i]}\n      unicorn: ${lb[i]}`; break; }
    }
  }
  ok(derived === actual, 'unicorn ColumnMath is space ColumnMath + the seven differences', detail);
} catch (e) { ok(false, 'ColumnMath derivation', e.message); }

console.log('\n=== theme palettes must not leak across ===');
for (const [name, src, colours] of [['space', S, ['#ce93d8', '#a58bb8']], ['unicorn', U, ['#ab97f5', '#7b88a8']]]) {
  for (const c of colours) ok(!src.includes(c), `${name} does not use ${c}`);
}

console.log(`\n${fails === 0 ? 'PARITY OK' : fails + ' PARITY FAILURE(S)'}`);
process.exit(fails ? 1 : 0);
