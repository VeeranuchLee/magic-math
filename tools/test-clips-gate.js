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
  vm.runInContext(cardSrc + '\n' + praiseSrc + '\n' + clipsSrc + '\nthis.Clips=Clips;this.PRAISE=PRAISE;',
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
    Clips.load();
    await new Promise(r => setImmediate(r));   // let the stubbed fetch settle

    // Sanity: the clip set really did load, or every assertion below passes vacuously.
    Clips.setMode('m1');
    check('the clip list loaded (else nothing below means anything)',
          Clips.url('6 times 8?') !== null);

    console.log('-- Times Tables is fully rendered, so it uses the files');
    check('the question resolves',      /tt-q-6x8\.m4a$/.test(Clips.url('6 times 8?') || ''));
    check('the answer resolves',        /tt-a-6x8\.m4a$/.test(Clips.url('6 times 8 is 48.') || ''));
    check('the bare number resolves',   /tt-n-48\.m4a$/.test(Clips.url('48!') || ''));
    check('praise resolves',            (Clips.url(PRAISE[0]) || '').includes('praise'));

    /* Drive the real API — setMode is how the app switches screens. */
    const inMode = (mode, text) => { Clips.setMode(mode); return Clips.url(text); };

    console.log('-- THE BUG: an all-robot mode must never reach a clip');
    for (const mode of ['b1', 'b2', 'b3', 'l2', 'c1', 'c2', 'c3', 'c4', 'g1']) {
      check(`${mode}: praise stays on the engine`,  inMode(mode, PRAISE[0]) === null);
      check(`${mode}: "48!" stays on the engine`,   inMode(mode, '48!') === null);
    }

    /* s1 and the home screen joined VOICED on 2026-08-20, once
       `build-narration-manifest.py --verify` reported 518/518 lines rendered AND
       reachable. Before that they were deliberately all-robot, and these two assertions
       are the ones that flipped -- so they are worth reading as the record of why. */
    console.log('-- Count By joined VOICED once its 481 prompts were rendered');
    check('s1: its answer chain uses the files',
          /tt-n-48\.m4a$/.test(inMode('s1', '48!') || ''));
    check('s1: so does the times-table sentence it shares with m1',
          /tt-a-6x8\.m4a$/.test(inMode('s1', '6 times 8 is 48.') || ''));

    console.log('-- The home screen joined too: its only lines are the ten card names');
    check('home: a rendered line resolves',
          (inMode(null, PRAISE[0]) || '').includes('praise'));

    console.log('-- The eight impossible modes are out PERMANENTLY, not pending work');
    for (const mode of ['b1', 'b2', 'b3', 'l2', 'c1', 'c2', 'c3', 'c4', 'g1']) {
      check(`${mode}: still all-robot`, inMode(mode, '48!') === null);
    }

    console.log('-- The path is built from the set each id came from');
    Clips.setMode('m1');
    check('a times-tables id resolves under times-tables/',
          (Clips.url('6 times 8?') || '').includes('/times-tables/'));
    check('a shared id resolves under shared/',
          (Clips.url('Hello there!') || '').includes('/shared/'));

    console.log('-- A fixed string resolves only through the generated text map');
    check('the mascot line resolves',
          /sh-mascot-s1\.m4a$/.test(Clips.url('Hello there!') || ''));
    check('and it obeys the mode gate like everything else',
          inMode('c4', 'Hello there!') === null);

    console.log('-- A set whose clips.json is missing costs only its own lines');
    Clips.setMode('m1');
    check('a count-by line falls back to the engine',
          Clips.url('Count by 7!') === null);

    console.log('-- An unrendered line is null even in a voiced mode');
    check('an unrendered line falls back',  Clips.url('7 times 7?') === null);
    check('gibberish falls back',           Clips.url('Off we go!') === null);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log('CLIPS GATE FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})();
