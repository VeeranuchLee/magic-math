/* Exercises the SHIPPED Clips resolver, not a stub.

   test-voice-chain.js supplies its own fake Clips, because what it tests is how Voice
   sequences a chain. That left the resolver itself — which decides whether a line speaks
   in the rendered voice or the robot one — with no test at all, and that is precisely
   where the two bugs found on 2026-08-20 lived:

     `tt-card` was rendered, paid for, shipped and silent, because no rule resolved to it.
     Nothing failed. It was found by instrumenting Audio in a browser.

     `praise()` is called by all nine modes and `tt-praise-*` matched it in every one, and
     `${answer}!` matched /^(\d+)!$/ whenever an ordinary arithmetic answer happened to
     coincide with one of the 152 times-table products. So Carry Add spoke roughly half its
     answers in the rendered voice and the rest in the robot voice, switching mid-sentence.
     Nothing failed here either.

   Both are resolver bugs invisible to every other test, so the resolver gets its own. */
const fs = require('fs'), vm = require('vm'), path = require('path');

let failed = 0, passed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name); }
}

/* Pull the real module out of the page, with the two globals it closes over. */
function loadClips(skin) {
  const html = fs.readFileSync(path.join(__dirname, '..', skin), 'utf8');

  const grab = (startMark, endMark) => {
    const a = html.indexOf(startMark);
    if (a < 0) throw new Error(`${skin}: could not find ${startMark}`);
    const b = html.indexOf(endMark, a);
    if (b < 0) throw new Error(`${skin}: could not find ${endMark} after ${startMark}`);
    return html.slice(a, b);
  };

  const praiseSrc = grab('const PRAISE=[', '\n');
  const clipsSrc  = grab('const Clips=(()=>{', '/* ══ MENU MUSIC ══');
  if (!clipsSrc.includes('VOICED')) throw new Error(`${skin}: Clips has no VOICED gate`);

  // space has CARD_VOICE and resolves it; unicorn has none. Supply an empty stand-in so
  // the same extraction works for both.
  const cardSrc = html.includes('const CARD_VOICE=')
    ? grab('const CARD_VOICE=', '\n};') + '\n};'
    : 'const CARD_VOICE={};';

  /* URL-aware, because Clips now loads three sets and builds the path from the set the
     id came from. A stub that answered every URL identically would hide a wrong path. */
  const sandbox = {
    fetch: (url) => {
      const set = String(url).split('/').slice(-2)[0];
      const body = SETS[set];
      if (!body) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(cardSrc + '\n' + praiseSrc + '\n' + clipsSrc
                  + '\nthis.Clips=Clips;this.PRAISE=PRAISE;this.CARD_VOICE=CARD_VOICE;',
                  sandbox);
  return sandbox;
}

/* A representative slice of what is actually shipped.

   times-tables: two pattern clips plus a bare number that is ALSO an ordinary
   subtraction answer (48 = 6x8) -- the collision that leaked the voice into Carry Add.

   shared: a fixed string reachable ONLY through the generated text map, which is the
   case a regex cannot cover and the case that shipped tt-card silent.

   count-by is deliberately absent, to prove a set whose clips.json is missing costs
   only its own lines. */
const SETS = {
  'times-tables': { set: 'times-tables', clips: ['tt-q-6x8', 'tt-a-6x8', 'tt-n-48', 'tt-praise-1', 'tt-praise-u1', 'tt-card'] },
  'shared': { set: 'shared', clips: ['sh-mascot-s1'],
              texts: { 'Hello there!': 'sh-mascot-s1' } },
};
const CLIPS = SETS['times-tables'].clips;

(async () => {
  for (const skin of ['space-math.html', 'unicorn-math.html']) {
    console.log(`\n=== ${skin} ===`);
    const s = loadClips(skin);
    const { Clips, PRAISE } = s;

    /* Give the stubbed `shared` set this skin's card names, mirroring the shipped split:
       every card is an `sh-card-<key>` entry in the generated text map EXCEPT m1's, which
       stays out because build-narration-manifest.py drops it as already rendered — it is
       `tt-card`, in the times-tables set, which ships no text map at all. Reproducing that
       asymmetry here is the whole value of the card assertions below; a stub that mapped
       all eleven would pass whether or not the m1 rule existed. */
    SETS.shared.clips = ['sh-mascot-s1'];
    SETS.shared.texts = { 'Hello there!': 'sh-mascot-s1' };
    for (const [key, text] of Object.entries(s.CARD_VOICE || {})) {
      if (key === 'm1') continue;
      SETS.shared.clips.push('sh-card-' + key);
      SETS.shared.texts[text] = 'sh-card-' + key;
    }

    Clips.load();
    await new Promise(r => setImmediate(r));   // let the stubbed fetch settle

    /* TWO ROLES NOW, and the resolver's whole job is to treat them differently.
       Owner decision, 2026-08-21. Every url() call below says which role is asking,
       because that is what the app does — `num()` at the call site is the caller
       declaring it is reading a value out. */
    const asNum = (text) => Clips.url(text, 'robot');
    const asComp = (text) => Clips.url(text, 'companion');
    const inMode = (mode, fn, text) => { Clips.setMode(mode); return fn(text); };
    const ROBOT_MODES = ['b1', 'b2', 'b3', 'l2', 'c1', 'c2', 'c3', 'c4', 'g1'];

    // Sanity: the clip set really did load, or every assertion below passes vacuously.
    Clips.setMode('m1');
    check('the clip list loaded (else nothing below means anything)', asNum('6 times 8?') !== null);

    console.log('-- Times Tables bought the whole number space, so it keeps using the files');
    check('the question resolves',      /tt-q-6x8\.m4a$/.test(asNum('6 times 8?') || ''));
    check('the answer resolves',        /tt-a-6x8\.m4a$/.test(asNum('6 times 8 is 48.') || ''));
    check('the bare number resolves',   /tt-n-48\.m4a$/.test(asNum('48!') || ''));
    check('praise resolves',            (asComp(PRAISE[0]) || '').includes('praise'));

    /* ── THE REVERSAL, 2026-08-21 ──
       These two assertions used to say the opposite, and the flip is the entire change,
       so it is worth stating why it is not a regression to the bug of 2026-08-20.

       That bug was a seam that fell WHERE THE DATA HAPPENED TO LAND: `${answer}!` matched
       the bare-number clips, those clips are 152 arbitrary products, and so Carry Add
       spoke roughly half its answers in the rendered voice depending on whether the
       child's answer happened to be one. Arbitrary, and audible.

       What resolves in every mode now is only what is in the GENERATED text map — lines
       we enumerated, chose, paid for and encoded. There is no unbounded space behind an
       exact match and nothing to be surprised by. The patterns, which are the unbounded
       part, are still gated. */
    console.log('-- NEW: the companion keeps her own voice in an all-robot mode');
    for (const mode of ROBOT_MODES) {
      check(`${mode}: praise is the companion, so it plays her file`,
            (inMode(mode, asComp, PRAISE[0]) || '').includes('praise'));
      check(`${mode}: so does a mapped fixed line`,
            /sh-mascot-s1\.m4a$/.test(inMode(mode, asComp, 'Hello there!') || ''));
    }

    console.log('-- STILL TRUE: a number in an all-robot mode never reaches a clip');
    for (const mode of ROBOT_MODES) {
      check(`${mode}: "48!" stays on the engine`, inMode(mode, asNum, '48!') === null);
      check(`${mode}: and so does the sentence around it`,
            inMode(mode, asNum, '6 times 8 is 48.') === null);
    }

    /* THE HOLE THIS CLOSES, and it is the one a future call site will actually fall
       into: forgetting `num()` on a number line. If the companion path could reach the
       pattern rules, an untagged "48!" in Carry Add would resolve to tt-n-48 and the
       old bug would be back through the front door. It cannot — the companion path
       consults the generated map and praise, and no regex at all. */
    console.log('-- A number asked for as a COMPANION line still cannot reach a clip');
    for (const mode of ROBOT_MODES.concat(['m1', 's1'])) {
      check(`${mode}: an untagged "48!" resolves nothing`, inMode(mode, asComp, '48!') === null);
    }
    check('nor does an untagged times-table sentence',
          inMode('m1', asComp, '6 times 8 is 48.') === null);

    console.log('-- Count By and the home screen still resolve their numbers');
    check('s1: its answer chain uses the files', /tt-n-48\.m4a$/.test(inMode('s1', asNum, '48!') || ''));
    check('s1: so does the times-table sentence it shares with m1',
          /tt-a-6x8\.m4a$/.test(inMode('s1', asNum, '6 times 8 is 48.') || ''));
    check('home: praise resolves', (inMode(null, asComp, PRAISE[0]) || '').includes('praise'));

    console.log('-- The path is built from the set each id came from');
    Clips.setMode('m1');
    check('a times-tables id resolves under times-tables/', (asNum('6 times 8?') || '').includes('/times-tables/'));
    check('a shared id resolves under shared/', (asComp('Hello there!') || '').includes('/shared/'));

    console.log('-- A set whose clips.json is missing costs only its own lines');
    Clips.setMode('m1');
    check('a count-by line falls back to the engine', asNum('Count by 7!') === null);

    /* ══ EVERY HOME-SCREEN CARD NAME, AS THE COMPANION ASKS FOR IT ══
       This file opens by naming `tt-card` as the bug it exists to prevent, listed the id
       in its stub — and then never asked the resolver for it. So the bug came back, in a
       new shape, and shipped: `shared` correctly declined to buy a second copy of
       "Times Tables!", the only rule claiming the clip sat in idFor(), and idFor() is the
       ROBOT resolver. Card names are `Voice.say(CARD_VOICE[id])` with no role — the
       COMPANION — so one card of eleven played nothing and spoke through the OS voice on
       an otherwise fully-voiced home screen. Found 2026-08-29, by reading, not by failing.

       Asked here EXACTLY as the app asks: companion role, home screen (mode null). The
       stub mirrors the shipped split — every card name lives in `shared`'s generated text
       map except m1's, which is `tt-card` over in times-tables and reachable only through
       the hand-written rule. Skipped for unicorn, which has no CARD_VOICE. */
    const cards = Object.keys(s.CARD_VOICE || {});
    if (cards.length) {
      console.log('-- Every home-screen card name resolves for the companion');
      for (const key of cards) {
        const url = inMode(null, asComp, s.CARD_VOICE[key]) || '';
        check(`card ${key} plays a file, not the engine`, /\.m4a$/.test(url));
      }
      check('and m1 is specifically tt-card, over in the times-tables set',
            /\/times-tables\/tt-card\.m4a$/.test(inMode(null, asComp, s.CARD_VOICE.m1) || ''));
    }

    console.log('-- An unrendered line is null whoever asks for it');
    check('an unrendered number falls back',   asNum('7 times 7?') === null);
    check('an unrendered fact falls back',     asComp('Off we go!') === null);
    check('and so does gibberish',             asComp('wombat') === null);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log('CLIPS GATE FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})();
