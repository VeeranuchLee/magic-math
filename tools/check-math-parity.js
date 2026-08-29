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
  /* The block now ends at `num()` rather than at the Voice object's closing brace: the
     role tag is part of the same contract and both themes have to agree on it, or a
     tagged call site in one file means something different in the other. */
  ['Voice object and the num() tag', '/* ══ VOICE ══', '\nconst PRAISE=['],
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
  /* The 2026-08-29 expansion: puzzle generators take a seeded rng so the invariants
     harness (test-math-games.js) can reproduce any failure, and the teaching logic
     must never drift between worlds — a biased or wrong generator in one skin is the
     same class of bug as g1's biased comparator, caught only by the children playing
     the other skin. */
  ['math primitives', '/* ══ MATH PRIMITIVES (shared, pure) ══', '\n/* ══ SHARED COMPONENTS ══'],
  /* The shared manipulatives (ten-frame, pairing board) render the teaching model
     itself — pair-units that never split, counters crossed in their seats rather than
     a shrinking frame — so they are byte-identical on purpose; theming lives in CSS,
     not in the component. */
  ['expansion manipulatives', '/* ══ EXPANSION MANIPULATIVES (shared) ══', '\n/* ══ MODE oe1'],
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

/* Big Numbers deliberately uses the device's speech engine, and iPad Safari will drop
   its first utterance if it is started from a rendered clip's ended callback rather than
   the Read button's user gesture. Keep the complete read handler identical across themes
   and mechanically forbid the asynchronous preamble that caused the live defect. */
function bigNumberRead(src, name) {
  const component = region(src, name, 'function ReadBigNumbers(', '\n  const groups=digitGroups(ds);');
  const from = component.indexOf('  const read=useCallback(()=>{');
  if (from < 0) throw new Error(`Read Big Numbers handler not found in ${name}`);
  return component.slice(from);
}
try {
  const spaceRead = bigNumberRead(S, 'space');
  const unicornRead = bigNumberRead(U, 'unicorn');
  ok(spaceRead === unicornRead, 'Read Big Numbers handler is byte-identical in both themes');
  ok(spaceRead.includes('setSpeaking(true);') &&
     spaceRead.includes('Voice.notifyNextChain(stopTalking);') &&
     spaceRead.includes('Voice.lines([num(words)]);'),
     'Read Big Numbers starts the robot from the Read tap');
  ok(!spaceRead.includes('Voice.notifyNextChain(()=>') &&
     !spaceRead.includes('Let\'s hear the robot read it!'),
     'Read Big Numbers never defers first-use speech behind a companion clip');
} catch (e) {
  ok(false, 'Read Big Numbers iPad speech contract', e.message);
}

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
  ['    const arrived=addProgress();\n    Voice.lines([arrived?null:praise(),num(`${problem.answer}!`),num(`${problem.a} ${cfg.opWord} ${problem.b} is ${problem.answer}.`)]);\n    setScore(s=>s+1);\n    setTimeout(()=>setConf(false),2500);\n  },[cursor,slots.length,won,muted,problem,cfg,setScore,addProgress]);',
   '    Voice.lines([praise(),num(`${problem.answer}!`),num(`${problem.a} ${cfg.opWord} ${problem.b} is ${problem.answer}.`)]);\n    setScore(s=>s+1); addFlower();\n    setTimeout(()=>setConf(false),2500);\n  },[cursor,slots.length,won,muted,problem,cfg,setScore,addFlower]);'],
  ["    <div className=\"screen column-screen cm-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen column-screen cm-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
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
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),problem.sign==='='?'The same!':'Yum!',num(compareSentence(problem))]);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),problem.sign==='='?'The same!':'Yum!',num(compareSentence(problem))]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[problem,won,muted,addProgress,setScore]);',
   '  },[problem,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen cmp-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen cmp-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'CompareGame', label: 'unicorn CompareGame is space CompareGame + the reward-path differences',
  /* The closing anchor is the expansion block, not HOME, because the 2026-08-29
     expansion games sit between CompareGame and HOME and have their own regions. */
  from: 'function CompareSettings({current,onChange,onClose}){', to: '\n/* ══ EXPANSION MANIPULATIVES (shared) ══', subs: COMPARE_SUBS,
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
  ['    const arrived=addProgress();\n    Voice.lines([arrived?null:praise(),num(`${problem.answer}!`),num(missingSentence(problem))]);\n    setScore(s=>s+1);\n    setTimeout(()=>setConf(false),2600);\n  },[balanced,filled,won,muted,problem,setScore,addProgress]);',
   '    Voice.lines([praise(),num(`${problem.answer}!`),num(missingSentence(problem))]);\n    setScore(s=>s+1); addFlower();\n    setTimeout(()=>setConf(false),2600);\n  },[balanced,filled,won,muted,problem,setScore,addFlower]);'],
  ["    <div className=\"screen ms-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen ms-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'MissingGame', label: 'unicorn MissingGame is space MissingGame + the reward-path differences',
  from: 'function MissingSettings({current,onChange,onClose}){', to: '\n/* ══ MODE l2', subs: MISSING_SUBS,
});

/* oe1: Odd or Even. Same list as the three above — preset chrome, reward path, mascot,
   and the screen chrome space paints from the journey background. The pairing model
   itself lives in the shared manipulatives block, so what differs here is only the
   game shell around it. */
const ODDEVEN_SUBS = [
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function OddEvenGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function OddEvenGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeOddEvenProblem(Math.random,preset,problem));},[preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeOddEvenProblem(Math.random,preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,problem,resetForProblem]);'],
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),num(`${problem.n} is ${right}!`),problem.odd?'One is left without a partner.':'Everyone has a partner.']);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),num(`${problem.n} is ${right}!`),problem.odd?'One is left without a partner.':'Everyone has a partner.']);\n      setScore(s=>s+1); addFlower();"],
  ['  },[problem,won,muted,addProgress,setScore]);',
   '  },[problem,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen oe-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen oe-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'OddEvenGame', label: 'unicorn OddEvenGame is space OddEvenGame + the reward-path differences',
  from: 'function OddEvenSettings({current,onChange,onClose}){', to: '\n/* ══ MODES n1 / n2', subs: ODDEVEN_SUBS,
});

/* n1/n2: Make 10. Same story once more. TEN_CFG itself is identical in both skins and
   sits inside this region on purpose — the sentences it speaks are the maths. */
const TENBOND_SUBS = [
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function TenBondGame({modeId, onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function TenBondGame({modeId, onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeTenProblem(Math.random,modeId,q.p));},[modeId,q.p,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeTenProblem(Math.random,modeId,q.p));\n  },[flowers,setFlowers,setGardenFull,addBouquet,modeId,q.p,resetForProblem]);'],
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),num(`${q.p.answer}!`),cfg.win(q.p)]);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),num(`${q.p.answer}!`),cfg.win(q.p)]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[q,won,muted,addProgress,setScore,cfg]);',
   '  },[q,won,muted,addFlower,setScore,cfg]);'],
  ["    <div className=\"screen nb-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen nb-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'TenBondGame', label: 'unicorn TenBondGame is space TenBondGame + the reward-path differences',
  from: 'const TEN_CFG={', to: '\n/* ══ MODE h1', subs: TENBOND_SUBS,
});

/* h1: Hundred Board. The transforms and the board itself live in the shared blocks;
   what differs here is only the shell: preset chrome (emoji), the flower reward
   path, the mascot, and the journey-background styling. The preset arrays differ
   (icon vs emoji) and are the first substitution, applied to the whole region. */
const HUNDRED_SUBS = [
  ["const HUNDRED_PRESETS=[\n  {id:'h1step', icon:ICON_EARTH,  tag:'One step', kind:'step', desc:'±1 and ±10'},\n  {id:'h1jump', icon:ICON_ROCKET, tag:'Big jumps',kind:'jump', desc:'±20, ±11, ±9'},\n  {id:'h1edge', icon:ICON_SATURN, tag:'Across the edge',kind:'edge',desc:'39 and one more…'},\n  {id:'h1build',icon:ICON_GALAXY, tag:'Which move?',kind:'build',desc:'34 → 54 was…',ops:[20,10,2,1,-10,-20]},\n];",
   "const HUNDRED_PRESETS=[\n  {id:'h1step', emoji:'🌸',tag:'One step', kind:'step', desc:'±1 and ±10'},\n  {id:'h1jump', emoji:'🚀',tag:'Big jumps',kind:'jump', desc:'±20, ±11, ±9'},\n  {id:'h1edge', emoji:'🪐',tag:'Across the edge',kind:'edge',desc:'39 and one more…'},\n  {id:'h1build',emoji:'🌈',tag:'Which move?',kind:'build',desc:'34 → 54 was…',ops:[20,10,2,1,-10,-20]},\n];"],
  ["      Voice.lines([arrived?null:praise(),num(`${problem.target}!`),'It begins the next row — that is where the number lives!']);",
   "      Voice.lines([praise(),num(`${problem.target}!`),'It begins the next row — that is where the number lives!']);"],
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function HundredGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function HundredGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeHundredProblem(Math.random,preset,problem));},[preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeHundredProblem(Math.random,preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,problem,resetForProblem]);'],
  ['    const arrived=addProgress();\n    if(problem.kind===\'build\'){',
   '    if(problem.kind===\'build\'){'],
  ["      Voice.lines([arrived?null:praise(),num(`${problem.delta>0?'+':''}${problem.delta}!`),num(`${problem.start} plus ${problem.delta} is ${problem.target}.`)]);",
   "      Voice.lines([praise(),num(`${problem.delta>0?'+':''}${problem.delta}!`),num(`${problem.start} plus ${problem.delta} is ${problem.target}.`)]);"],
  ["      Voice.lines([arrived?null:praise(),num(`${problem.target}!`),num(`${hundredMoveWords(problem.delta)}.`)]);",
   "      Voice.lines([praise(),num(`${problem.target}!`),num(`${hundredMoveWords(problem.delta)}.`)]);"],
  ['    setScore(s=>s+1);\n    setTimeout(()=>setConf(false),2500);\n  },[problem,addProgress,setScore]);',
   '    setScore(s=>s+1); addFlower();\n    setTimeout(()=>setConf(false),2500);\n  },[problem,addFlower,setScore]);'],
  ["    <div className=\"screen hb-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen hb-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'HundredGame', label: 'unicorn HundredGame is space HundredGame + the reward-path differences',
  from: '/* ══ MODE h1: HUNDRED BOARD ══', to: '\n/* ══ MODE d1', subs: HUNDRED_SUBS,
});

/* d1: Share It Out. Same substitution family as the other expansion games; the
   ShareMat manipulative and the generator live in the shared blocks. */
const DIVISION_SUBS = [
  ["const DIVISION_PRESETS=[\n  {id:'d1share', icon:ICON_EARTH,  tag:'Share it out',kind:'share', desc:'Deal them fairly'},\n  {id:'d1each',  icon:ICON_ROCKET, tag:'How many each?',kind:'each', desc:'Count a basket'},\n  {id:'d1groups',icon:ICON_GALAXY, tag:'Make groups',kind:'groups',desc:'How many groups?'},\n];",
   "const DIVISION_PRESETS=[\n  {id:'d1share', emoji:'🌸',tag:'Share it out',kind:'share', desc:'Deal them fairly'},\n  {id:'d1each',  emoji:'🚀',tag:'How many each?',kind:'each', desc:'Count a basket'},\n  {id:'d1groups',emoji:'🌈',tag:'Make groups',kind:'groups',desc:'How many groups?'},\n];"],
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function DivisionGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function DivisionGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeDivisionProblem(Math.random,preset,problem));},[preset,problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeDivisionProblem(Math.random,preset,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,problem,resetForProblem]);'],
  ["      const arrived=addProgress();\n      if(problem.kind==='groups')",
   "      if(problem.kind==='groups')"],
  ["Voice.lines([arrived?null:praise(),num(`${problem.answer}!`),num(`${problem.total} is ${problem.g} groups of ${problem.e}.`)]);",
   "Voice.lines([praise(),num(`${problem.answer}!`),num(`${problem.total} is ${problem.g} groups of ${problem.e}.`)]);"],
  ["Voice.lines([arrived?null:praise(),num(`${problem.answer}!`),num(`${problem.total} shared between ${problem.g} is ${problem.answer} each.`)]);",
   "Voice.lines([praise(),num(`${problem.answer}!`),num(`${problem.total} shared between ${problem.g} is ${problem.answer} each.`)]);"],
  ["      setScore(s=>s+1);\n      setTimeout(()=>setConf(false),2500);\n    }else{",
   "      setScore(s=>s+1); addFlower();\n      setTimeout(()=>setConf(false),2500);\n    }else{"],
  ['  },[problem,won,muted,addProgress,setScore]);',
   '  },[problem,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen dv-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen dv-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'DivisionGame', label: 'unicorn DivisionGame is space DivisionGame + the reward-path differences',
  from: '/* ══ MODE d1: SHARING IS DIVISION ══', to: '\n/* ══ MODE q1', subs: DIVISION_SUBS,
});

/* q1: What's the Fraction? The shapes and the generator are shared; the shell
   differs the usual way. */
const FRACTION_SUBS = [
  ["const FRACTION_PRESETS=[\n  {id:'q1easy', icon:ICON_EARTH,  tag:'Halves – quarters',denoms:[2,3,4],   shapes:['bar','circle'],desc:'First fractions'},\n  {id:'q1wide', icon:ICON_ROCKET, tag:'Up to sixths',     denoms:[2,3,4,5,6],shapes:['bar','circle','grid','group'],desc:'Bars, pies, grids, groups'},\n  {id:'q1big',  icon:ICON_GALAXY, tag:'Fifths – tenths',  denoms:[5,6,8,10], shapes:['bar','grid','group'],desc:'Bigger families'},\n];",
   "const FRACTION_PRESETS=[\n  {id:'q1easy', emoji:'🌸',tag:'Halves – quarters',denoms:[2,3,4],   shapes:['bar','circle'],desc:'First fractions'},\n  {id:'q1wide', emoji:'🚀',tag:'Up to sixths',     denoms:[2,3,4,5,6],shapes:['bar','circle','grid','group'],desc:'Bars, pies, grids, groups'},\n  {id:'q1big',  emoji:'🌈',tag:'Fifths – tenths',  denoms:[5,6,8,10], shapes:['bar','grid','group'],desc:'Bigger families'},\n];"],
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function FractionGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function FractionGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeFractionProblem(Math.random,preset,q.p));},[preset,q.p,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeFractionProblem(Math.random,preset,q.p));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,q.p,resetForProblem]);'],
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),num(`${fractionWords(q.p.n,q.p.d)}.`),num(`${q.p.n} out of ${q.p.d} equal parts.`)]);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),num(`${fractionWords(q.p.n,q.p.d)}.`),num(`${q.p.n} out of ${q.p.d} equal parts.`)]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[q,won,muted,addProgress,setScore]);',
   '  },[q,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen fr-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen fr-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'FractionGame', label: 'unicorn FractionGame is space FractionGame + the reward-path differences',
  from: "/* ══ MODE q1: WHAT'S THE FRACTION? ══", to: '\n/* ══ MODE u1', subs: FRACTION_SUBS,
});

/* u1 + a1: Which Unit? and Cover It. The curated measure table and the area
   generator live in the shared blocks; the shells differ the usual way. The
   region covers both games — several shell lines are identical in each and the
   substitutions apply to both at once. */
const MEASURE_AREA_SUBS = [
  ["const AREA_PRESETS=[\n  {id:'a1rect', icon:ICON_EARTH,  tag:'Rectangles',kind:'rect',maxSide:5,min:4,max:20,desc:'Count the squares'},\n  {id:'alshape',icon:ICON_ROCKET, tag:'L-shapes',  kind:'l',   maxSide:5,min:5,max:20,desc:'Around the corner'},\n];",
   "const AREA_PRESETS=[\n  {id:'a1rect', emoji:'🌸',tag:'Rectangles',kind:'rect',maxSide:5,min:4,max:20,desc:'Count the squares'},\n  {id:'alshape',emoji:'🚀',tag:'L-shapes',  kind:'l',   maxSide:5,min:5,max:20,desc:'Around the corner'},\n];"],
  ['            <img className="preset-tag-img" src={p.icon} alt=""/>\n',
   '            <span className="preset-tag">{p.emoji}</span>\n'],
  ['function MeasureGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function MeasureGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['function AreaGame({onBack, journey, addProgress, trophies, journeyBg, score, setScore, muted, onToggleMute}){',
   'function AreaGame({onBack, flowers, gardenFull, setFlowers, setGardenFull, score, setScore, bouquets, addBouquet, muted, onToggleMute}){'],
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['  const next=useCallback(()=>{resetForProblem(makeMeasureProblem(Math.random,problem));},[problem,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeMeasureProblem(Math.random,problem));\n  },[flowers,setFlowers,setGardenFull,addBouquet,problem,resetForProblem]);'],
  ['  const next=useCallback(()=>{resetForProblem(makeAreaProblem(Math.random,preset,q.p));},[preset,q.p,resetForProblem]);',
   '  const next=useCallback(()=>{\n    if(flowers===MAX_FLOWERS){setFlowers(0);setGardenFull(false);addBouquet();}\n    resetForProblem(makeAreaProblem(Math.random,preset,q.p));\n  },[flowers,setFlowers,setGardenFull,addBouquet,preset,q.p,resetForProblem]);'],
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),`You measure it in ${MEASURE_WORDS[problem.unit]}!`]);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),`You measure it in ${MEASURE_WORDS[problem.unit]}!`]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[problem,won,muted,addProgress,setScore]);',
   '  },[problem,won,muted,addFlower,setScore]);'],
  ["      const arrived=addProgress();\n      Voice.lines([arrived?null:praise(),num(`${q.p.answer}!`),num(`The shape covers ${q.p.answer} squares.`)]);\n      setScore(s=>s+1);",
   "      Voice.lines([praise(),num(`${q.p.answer}!`),num(`The shape covers ${q.p.answer} squares.`)]);\n      setScore(s=>s+1); addFlower();"],
  ['  },[q,won,muted,addProgress,setScore]);',
   '  },[q,won,muted,addFlower,setScore]);'],
  ["    <div className=\"screen um-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen um-screen">'],
  ["    <div className=\"screen ag-screen\" style={{'--game-bg':`url('${journeyBg}')`}}>",
   '    <div className="screen ag-screen">'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
  /* The region holds two games; these shell lines occur once in EACH, and
     String.replace with a string pattern substitutes only the first — so the
     pair is listed twice. */
  ['  const mascot=useMascot();\n  const wrongT=useRef(null);',
   '  const mascot=useMascot();\n  const addFlower=useFlowerReward(flowers,setFlowers,setGardenFull,muted,addBouquet);\n  const wrongT=useRef(null);'],
  ['      <ScoreRow score={score} journey={journey} trophies={trophies}/>',
   '      <ScoreRow score={score} flowers={flowers} bouquets={bouquets}/>'],
  ['      <Mascot kind="rocket" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>',
   '      <Mascot kind="unicorn" mood={mascot.mood} stamp={mascot.stamp} onPoke={mascot.poke}/>'],
  ['      {won&&<button className="next-btn" onClick={next} aria-label="Next"><NextIcon/></button>}',
   '      {won&&<button className="next-btn" onClick={next}>Next</button>}'],
];
DERIVED.push({
  name: 'MeasureGame+AreaGame', label: 'unicorn u1/a1 are space u1/a1 + the reward-path differences',
  from: '/* ══ MODE u1: WHICH UNIT? ══', to: '\n/* ══ HOME', subs: MEASURE_AREA_SUBS,
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
