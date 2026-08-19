#!/usr/bin/env node
/* Parity check for the two math themes.  node tools/check-math-parity.js
 *
 * space-math.html and unicorn-math.html are the same games in two themes, and the
 * standing failure mode of every change to them is that it lands in one file and not
 * the other, or lands differently. This makes that mechanical instead of aspirational:
 *
 *   1. the blocks that must be byte-identical are diffed;
 *   2. the games that legitimately differ — ColumnMath and CompareGame — are checked
 *      by deriving unicorn's version from space's through a fixed list of permitted
 *      differences and comparing. Any difference not on the list is a failure.
 *
 * The permitted differences are always the same thing: the theme's reward path (the
 * space journey versus the flower garden), its preset chrome, its mascot, and text
 * buttons where space uses an icon. If a substitution you are adding is not one of
 * those, it probably wants to be fixed in the source rather than allowed here.
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
  /* g1's helpers — the problem generator, the mouth SVG and one side of the
     comparison — carry the teaching decisions, so they are the half of the game that
     must never drift. The generator especially: it took three attempts to stop it
     favouring one answer, and a fix that landed in only one theme would leave half
     the children playing the biased version. */
  ['which is bigger helpers', '/* ══ MODE g1: WHICH IS BIGGER? ══', '\nfunction CompareSettings'],
  /* b3's helpers carry the same kind of decision g1's do: the layout of each rung, the
     generator behind the first rung's bias to tens, the four sentences, and the grid that
     makes "the same amount" visible as "the same shape". A fix that landed in one theme
     would leave half the children playing a different game. */
  ['what is missing helpers', "/* ══ MODE b3: WHAT'S MISSING? ══", '\nfunction MissingSettings'],
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

/* Both themes must offer the same games. A card added to one home screen and not the
   other is the cheapest possible version of this whole failure mode, and none of the
   region diffs above would see it. */
/* space's cards go through pick(), which speaks the card name and plays the launch
   animation before selecting; unicorn's call onSelect() directly. Both spellings count. */
const modeIds = src => [...src.matchAll(/(?:pick|onSelect)\('([a-z]\d)'\)/g)].map(m => m[1]).sort().join(',');
ok(modeIds(S) === modeIds(U), 'both home screens offer the same games',
   `space: ${modeIds(S)}\n      unicorn: ${modeIds(U)}`);
const routed = src => [...src.matchAll(/mode==='([a-z]\d)'/g)].map(m => m[1]).sort().join(',');
ok(routed(S) === modeIds(S), 'space routes every game its home screen offers',
   `routed: ${routed(S)}\n      offered: ${modeIds(S)}`);
ok(routed(U) === modeIds(U), 'unicorn routes every game its home screen offers',
   `routed: ${routed(U)}\n      offered: ${modeIds(U)}`);

/* Each entry: the region both files hold, and every rewrite that turns space's copy
   into unicorn's. Kept in the order the differences appear in the file. */
const DERIVED = [];

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
DERIVED.push({
  name: 'ColumnMath', label: 'unicorn ColumnMath is space ColumnMath + the seven differences',
  from: '/* One modal for all three new modes', to: '\n/* ══ MODE m1', subs: SUBS,
});

/* g1's settings modal and game screen. Same story as ColumnMath: everything that
   differs is the theme's reward path and chrome, and nothing else may. */
const COMPARE_SUBS = [
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function CompareGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function CompareGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{\n    resetForProblem(makeCompareProblem(preset,problem));\n  },[preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeCompareProblem(preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,problem,resetForProblem]);'],
  ["      const arrived=addProgress();\n      Voice.lines([problem.sign==='='?'The same!':'Yum!',compareSentence(problem),arrived?null:praise()]);\n      setScore(s=>s+1);",
   "      Voice.lines([problem.sign==='='?'The same!':'Yum!',compareSentence(problem),praise()]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[problem,won,muted,addProgress,setScore]);',
   '  },[problem,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen cmp-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen cmp-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'CompareGame', label: 'unicorn CompareGame is space CompareGame + the reward-path differences',
  from: 'function CompareSettings({current,onChange,onClose}){', to: '\n/* ══ HOME ══', subs: COMPARE_SUBS,
});

/* b3's settings modal and game screen. Same list as the two above, one item longer only
   because this screen has no theme-neutral place to put the background: space paints it
   from the journey stop the child has reached, unicorn from a CSS class. */
const MISSING_SUBS = [
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function MissingGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function MissingGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const overRef=useRef(false);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const overRef=useRef(false);'],
  ['  const next=useCallback(()=>{\n    resetForProblem(makeMissingProblem(preset,problem));\n  },[preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeMissingProblem(preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,problem,resetForProblem]);'],
  ['    const arrived=addProgress();\n    Voice.lines([`${problem.answer}!`,missingSentence(problem),arrived?null:praise()]);\n    setScore(s=>s+1);\n    setTimeout(()=>setConf(false),2600);\n  },[balanced,filled,won,muted,problem,setScore,addProgress]);',
   '    Voice.lines([`${problem.answer}!`,missingSentence(problem),praise()]);\n    setScore(s=>s+1); addFlower();\n    setTimeout(()=>setConf(false),2600);\n  },[balanced,filled,won,muted,problem,setScore,addFlower]);'],
  ["    <div className=\"screen ms-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen ms-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'MissingGame', label: 'unicorn MissingGame is space MissingGame + the reward-path differences',
  from: 'function MissingSettings({current,onChange,onClose}){', to: '\n/* ══ MODE l2', subs: MISSING_SUBS,
});

for (const { name, label, from: FROM, to: TO, subs } of DERIVED) {
  console.log(`\n=== ${name}: the listed differences, and no more ===`);
  try {
    let derived = region(S, 'space', FROM, TO);
    const actual = region(U, 'unicorn', FROM, TO);
    for (const [from, to] of subs) {
      if (!derived.includes(from)) { ok(false, `${name}: substitution anchor present`, from.slice(0, 90)); continue; }
      derived = derived.replace(from, to);
    }
    let detail = '';
    if (derived !== actual) {
      const la = derived.split('\n'), lb = actual.split('\n');
      for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        if (la[i] !== lb[i]) { detail = `an UNLISTED difference at line ${i + 1} of ${name}:\n      derived: ${la[i]}\n      unicorn: ${lb[i]}`; break; }
      }
    }
    ok(derived === actual, label, detail);
  } catch (e) { ok(false, `${name} derivation`, e.message); }
}

console.log('\n=== theme palettes must not leak across ===');
for (const [name, src, colours] of [['space', S, ['#ce93d8', '#a58bb8']], ['unicorn', U, ['#ab97f5', '#7b88a8']]]) {
  for (const c of colours) ok(!src.includes(c), `${name} does not use ${c}`);
}

console.log(`\n${fails === 0 ? 'PARITY OK' : fails + ' PARITY FAILURE(S)'}`);
process.exit(fails ? 1 : 0);
