/* Invariant tests for the Magic Spelling session engine.
 *
 * The engine that runs a pack — tile generation, the three-rung help ladder, the
 * practice passes, the stars — is pure and lives in the SPELLING PRIMITIVES block of
 * magic-spelling.html, with randomness injected as an `rng` so this harness can replay
 * it from a seed: the same discipline as test-math-games.js for the maths primitives.
 * It loads the SAME block the page ships, so it tests the engine the child gets, not a
 * copy. It also parses the embedded word universe out of the same page and runs every
 * one of the 729 real words through the tile generator — contractions, capitals and
 * the 11-letter words included — because fixtures never contained the word that broke.
 *
 * Run: node tools/test-spelling-game.js   (exit non-zero on any failure)
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
}

/* ── lift the primitives block out of the shipped page ── */
const PAGE = path.join(__dirname, '..', 'magic-spelling.html');
const html = fs.readFileSync(PAGE, 'utf8');
const a = html.indexOf('/* ══ SPELLING PRIMITIVES (shared, pure) ══');
if (a < 0) throw new Error('primitives block not found in magic-spelling.html');
const b = html.indexOf('/* ══ SHARED COMPONENTS ══', a);
if (b < 0) throw new Error('primitives block does not terminate');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(html.slice(a, b) + '\nthis.__x={mulberry32,randR,shuffleR,decoyCount,makeTiles,lineFor,starsFor,packId,defaultState,recordPack,addBouquet,initSession,applyTap,nextWord,DECOY_ALPHABET};', sandbox);
const P = sandbox.__x;

/* ── the embedded universe, from the same page ── */
const jm = html.match(/<script type="application\/json" id="spelling-universe">([\s\S]*?)<\/script>/);
if (!jm) throw new Error('spelling-universe JSON block not found');
const UNIVERSE = JSON.parse(jm[1]);
const ALL_WORDS = ['1', '2', '3'].flatMap(g => UNIVERSE.grades[g].flat());

/* ── seeded rng ── */
{
  const r1 = P.mulberry32(42), r2 = P.mulberry32(42);
  const s1 = Array.from({ length: 8 }, () => r1()), s2 = Array.from({ length: 8 }, () => r2());
  check('mulberry32 is deterministic for a seed', JSON.stringify(s1) === JSON.stringify(s2));
  const r3 = P.mulberry32(7);
  const spread = Array.from({ length: 2000 }, () => r3());
  check('mulberry32 returns values in [0,1) across the range',
    spread.every(v => v >= 0 && v < 1) && Math.min(...spread) < 0.05 && Math.max(...spread) > 0.95);
}

/* ── tiles: multiset honesty ── */
function multiset(str) {
  const m = {};
  for (const c of str) m[c] = (m[c] || 0) + 1;
  return m;
}
function sameMultiset(x, y) {
  const kx = Object.keys(x), ky = Object.keys(y);
  return kx.length === ky.length && kx.every(k => x[k] === y[k]);
}
{
  const rng = P.mulberry32(1);
  check('decoyCount scales with word length',
    P.decoyCount(1) === 2 && P.decoyCount(4) === 2 && P.decoyCount(5) === 3 &&
    P.decoyCount(7) === 3 && P.decoyCount(8) === 4 && P.decoyCount(11) === 4);
  /* EVERY real word, not fixtures: contractions, capitals, periods, the 11-letter words.
     The tile multiset must be exactly the word plus decoyCount lowercase letters that do
     not occur in the word (case-insensitively), so a child can never eliminate a decoy
     by shape and every letter of the word is present to be tapped. */
  let allOk = true, firstBad = '';
  for (const w of ALL_WORDS) {
    const tiles = P.makeTiles(w, rng);
    const tileM = multiset(tiles.map(t => t.c).join(''));
    const target = multiset(w);
    let extra = {};
    for (const k of Object.keys(tileM)) {
      const d = tileM[k] - (target[k] || 0);
      if (d > 0) extra[k] = d;
      else if (d < 0) { allOk = false; firstBad = firstBad || `${w}: missing ${k}`; }
    }
    const extraTotal = Object.values(extra).reduce((s, v) => s + v, 0);
    if (extraTotal !== P.decoyCount(w.length)) { allOk = false; firstBad = firstBad || `${w}: ${extraTotal} decoys`; }
    for (const k of Object.keys(extra)) {
      if (!/^[a-z]$/.test(k) || target[k] !== undefined || target[k.toUpperCase()] !== undefined) {
        allOk = false; firstBad = firstBad || `${w}: bad decoy ${k}`;
      }
    }
    if (new Set(tiles.map(t => t.id)).size !== tiles.length) { allOk = false; firstBad = firstBad || `${w}: duplicate tile ids`; }
  }
  check('makeTiles: every real word yields word + decoyCount lowercase decoys, unique ids', allOk, firstBad);

  /* capitals survive: the I of I'll and the M of Mrs. are real tiles */
  const ill = P.makeTiles("I'll", P.mulberry32(3)).map(t => t.c);
  check("makeTiles keeps the capital in I'll", ill.filter(c => c === 'I').length === 1 && ill.includes("'"));
  const mrs = P.makeTiles('Mrs.', P.mulberry32(4)).map(t => t.c);
  check('makeTiles keeps the capital and period in Mrs.', mrs.filter(c => c === 'M').length === 1 && mrs.includes('.'));
}

/* ── the spoken line ── */
{
  check('lineFor returns the bare word when no line exists', P.lineFor('cat', UNIVERSE.homophones) === 'cat');
  const two = P.lineFor('two', UNIVERSE.homophones);
  check('lineFor composes word + context for homophones', two === 'two. ' + UNIVERSE.homophones.two, two);
  check('lineFor with no map at all still works', P.lineFor('dog', null) === 'dog');
}

/* ── stars ── */
{
  check('starsFor: no wrong taps is three stars', P.starsFor({ wrongTaps: 0, autoFills: 0 }) === 3);
  check('starsFor: wrong taps but no auto-fill is two stars', P.starsFor({ wrongTaps: 4, autoFills: 0 }) === 2);
  check('starsFor: an auto-fill drops to one star', P.starsFor({ wrongTaps: 1, autoFills: 1 }) === 1);
}

/* ── storage ── */
{
  let s = P.defaultState();
  s = P.recordPack(s, 'G1-01', 2);
  s = P.recordPack(s, 'G1-01', 1);          /* a worse replay must not lower it */
  s = P.recordPack(s, 'G1-02', 3);
  check('recordPack keeps the best stars per pack', s.stars['G1-01'] === 2 && s.stars['G1-02'] === 3);
  check('packId matches the CSV label shape', P.packId(1, 0) === 'G1-01' && P.packId(3, 27) === 'G3-28');
  s = P.addBouquet(s);
  check('addBouquet increments', s.bouquets === 1 && P.addBouquet(s).bouquets === 2);
}

/* ── the session engine ── */
function rightTileFor(s) {
  const need = s.word[s.filled];
  return s.tiles.find(t => t.c === need && !s.used.includes(t.id));
}
function wrongTileFor(s) {
  const need = s.word[s.filled];
  return s.tiles.find(t => t.c !== need && !s.used.includes(t.id));
}
/* Play the current word out perfectly from wherever it stands. */
function playWordClean(s, rng) {
  let cur = s;
  while (!cur.celebrating) {
    const t = rightTileFor(cur);
    cur = P.applyTap(cur, t.id).s;
  }
  return P.nextWord(cur, rng);
}
{
  /* a perfect pack: three stars, no practice pass */
  const words = ['cat', 'dog', 'sun'];
  let s = P.initSession(words, P.mulberry32(10));
  check('initSession shuffles without losing words',
    JSON.stringify([...s.q].sort()) === JSON.stringify([...words].sort()) && s.word === s.q[0]);
  while (!s.complete) s = playWordClean(s, P.mulberry32(11));
  check('a perfect pack completes with three stars', s.stars === 3 && s.passNo === 1);

  /* the help ladder rung by rung */
  let s2 = P.initSession(['cat'], P.mulberry32(20));
  const w1 = P.applyTap(s2, wrongTileFor(s2).id);
  check('first wrong tap: buzz, no hint yet', w1.s.posMisses === 1 && w1.s.hint === false && w1.fx.kind === 'wrong');
  const w2 = P.applyTap(w1.s, wrongTileFor(w1.s).id);
  check('second wrong tap at the same position: tiles glow', w2.s.posMisses === 2 && w2.s.hint === true);
  const w3 = P.applyTap(w2.s, wrongTileFor(w2.s).id);
  check('third wrong tap: the game fills the letter in', w3.fx.kind === 'autofill' && w3.s.filled === 1 && w3.s.wordAuto === true);
  check('auto-fill consumes a real tile from the bank', w3.s.used.length === w3.s.filled);
  const w4 = P.applyTap(w3.s, wrongTileFor(w3.s).id);
  check('a fresh position after an auto-fill restarts the ladder', w4.s.posMisses === 1 && w4.s.hint === false);
  /* finish the word with auto-fills already on it */
  let done = w4.s;
  while (!done.celebrating) done = P.applyTap(done, (wrongTileFor(done) || rightTileFor(done)).id).s;
  check('a helped word still completes', done.celebrating === true);
  const after = P.nextWord(done, P.mulberry32(21));
  check('the helped word is queued for the practice pass and the pack is not complete',
    after.complete === false && after.relearnPulse === true && after.q.length === 1 && after.passNo === 2);
  check("stars were sealed on pass one, before the practice pass inflated anything", after.stars === 1);
  let fin = after;
  while (!fin.complete) fin = playWordClean(fin, P.mulberry32(22));
  check('a clean practice pass completes the pack', fin.complete === true && fin.stars === 1);

  /* a wrong tap that the child then self-corrects must NOT requeue the word */
  let s3 = P.initSession(['cat'], P.mulberry32(30));
  const one = P.applyTap(s3, wrongTileFor(s3).id).s;      /* miss */
  let s4 = one;
  while (!s4.celebrating) s4 = P.applyTap(s4, rightTileFor(s4).id).s;
  const end3 = P.nextWord(s4, P.mulberry32(31));
  check('a self-corrected word is not re-asked; pack completes with two stars',
    end3.complete === true && end3.stars === 2);

  /* taps during celebration and completion are inert */
  let s5 = P.initSession(['cat'], P.mulberry32(40));
  s5 = (() => { let c = s5; while (!c.celebrating) c = P.applyTap(c, rightTileFor(c).id).s; return c; })();
  check('a tap during celebration changes nothing',
    JSON.stringify(P.applyTap(s5, s5.tiles[0].id)) === JSON.stringify({ s: s5, fx: null }));

  /* the one-word pack the curriculum genuinely ends Grade 1 with */
  const s6 = playWordClean(P.initSession(['a'], P.mulberry32(50)), P.mulberry32(51));
  check('a one-word pack still completes', s6.complete === true && s6.stars === 3);
}

/* ── determinism of a whole session ── */
{
  const words = UNIVERSE.grades['3'][0]; /* a real 12-word Grade 3 pack */
  const run = seed => {
    let s = P.initSession(words, P.mulberry32(seed));
    let rng = P.mulberry32(seed ^ 0x5f5f);
    let guard = 0;
    while (!s.complete && guard++ < 500) {
      if (s.celebrating) { s = P.nextWord(s, rng); continue; }
      /* deliberately miss 1 in 3 positions to exercise ladder and practice passes */
      if (guard % 3 === 0) {
        const w = wrongTileFor(s);
        if (w) { s = P.applyTap(s, w.id).s; continue; }
      }
      s = P.applyTap(s, rightTileFor(s).id).s;
    }
    return { stars: s.stars, passNo: s.passNo, guard };
  };
  const r1 = run(99), r2 = run(99);
  check('a whole session replays identically from one seed',
    JSON.stringify(r1) === JSON.stringify(r2) && r1.guard < 500);
  const r3 = run(7);
  check('the engine terminates on every exercised seed', r3.guard < 500);
}

/* ── the universe itself feeds the engine safely ── */
{
  const rng = P.mulberry32(2026);
  let ok = true, bad = '';
  for (const w of ALL_WORDS) {
    const s = P.initSession([w], rng);
    let cur = s, guard = 0;
    while (!cur.complete && guard++ < 60) {
      if (cur.celebrating) { cur = P.nextWord(cur, rng); continue; }
      const t = wrongTileFor(cur) && guard % 4 === 0 ? wrongTileFor(cur) : rightTileFor(cur);
      cur = P.applyTap(cur, t.id).s;
    }
    if (!cur.complete) { ok = false; bad = w + ' did not terminate'; break; }
  }
  check('every real word terminates and completes through the engine', ok, bad);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
