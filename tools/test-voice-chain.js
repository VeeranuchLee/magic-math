/* Exercises the shipped Voice object against a fake speech engine.
   The browser pane is hidden, which throttles timers to >=1s and distorts the very gaps
   this fix is about; and a real engine cannot be made to drop onend on demand, which is
   the iOS Safari failure the safety net exists for. Both are testable here exactly. */
const fs = require('fs'), vm = require('vm');

const SRC = require('path').join(__dirname, '..', 'space-math.html');
const html = fs.readFileSync(SRC, 'utf8');
const start = html.indexOf('/* ══ VOICE ══');
const end = html.indexOf('const PRAISE=[', start);
const voiceSrc = html.slice(start, end);
if (!voiceSrc.includes('notifyNextChain')) { console.error('FAIL: did not extract the new Voice'); process.exit(1); }
if (!voiceSrc.includes('const num=')) { console.error('FAIL: the num() role tag was not extracted with it'); process.exit(1); }

let now = 0, timers = [], seq = 0;
const clock = {
  setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: now + ms, fn }); return id; },
  clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
  run(until) {            // virtual clock: advance to each due timer in order
    for (;;) {
      const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter(t => t !== due);
      now = due.at;
      due.fn();
    }
    now = until;
  },
};

function makeEngine({ fireOnEnd = true, speakMs = 900, stuckSpeaking = false } = {}) {
  const log = [];
  const engine = {
    speaking: false,
    cancel() { engine.speaking = false; log.push(['cancel', now]); },
    speak(u) {
      engine.speaking = true;
      log.push(['start', now, u.text, u.rate, u.pitch]);
      clock.setTimeout(() => {
        log.push(['end', now, u.text]);
        if (!stuckSpeaking) engine.speaking = false;
        if (fireOnEnd && u.onend) u.onend();
      }, speakMs);
    },
  };
  return { engine, log };
}

/* Voice now reaches for two more globals. The sandboxes below supply both.
   `Clips.url` returning null is the "no rendered file for this line" case, which is the
   world every test here was written in, so those tests are unchanged in meaning.
   fakeAudio models the one property that made the clip path worth having: it reports
   when it finished, without being polled. */
function makeAudio(log, playMs = 700, { failPlay = false } = {}) {
  const created = [];
  class FakeAudio {
    constructor(src) {
      this.src = src; this.onended = null; this.onerror = null;
      created.push(this);
    }
    play() {
      log.push(['audio-start', now, this.src]);
      if (failPlay) return Promise.reject(new Error('blocked'));
      clock.setTimeout(() => {
        log.push(['audio-end', now, this.src]);
        if (this.onended) this.onended();
      }, playMs);
      return Promise.resolve();
    }
    pause() { log.push(['audio-pause', now, this.src]); }
  }
  return { FakeAudio, created };
}
function makeClips(map) {
  // map: text -> url, or null for "no clip"
  return { url(t) { return (map && map[t]) || null; } };
}
/* ROLE-AWARE STUB, modelling the shipped rule: an exact generated match resolves for the
   companion in any mode, and a number resolves only where the whole number space was
   rendered. `voiced` says whether this is one of those modes. */
function makeRoleClips({ companion = {}, numbers = {}, voiced = false } = {}) {
  return { url(t, role) {
    if (role === 'robot') return (voiced && numbers[t]) || null;
    return companion[t] || null;
  } };
}
/* Keeps rate and pitch, so a test can prove WHICH of the two voices spoke rather than
   only that something did. */
class FakeUtterance { constructor(t) { this.text = t; } }

function run(opts, parts, { muteAt = null, stopAt = null, horizon = 40000 } = {}) {
  const { engine, log } = makeEngine(opts);
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: makeClips(null), Audio: makeAudio(log).FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  let notified = null;
  V.notifyNextChain(() => { notified = now; log.push(['chain-done', now]); });
  V.lines(parts);
  if (muteAt !== null) { clock.run(muteAt); V.muted = true; V.stop(); }
  if (stopAt !== null) { clock.run(stopAt); V.stop(); }
  clock.run(horizon);
  return { log, notified, pendingTimers: timers.length };
}

function gaps(log) {
  const out = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i][0] !== 'end') continue;
    const nxt = log.slice(i + 1).find(e => e[0] === 'start');
    if (nxt) out.push(nxt[1] - log[i][1]);
  }
  return out;
}

const LINES = ['26!', '2 times 13 is 26.', 'You did it!'];
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) fails++;
};

console.log("=== 1. owner's reported case: Count By 13, answer 26 (onend works, as in Chromium) ===");
{ now = 0; timers = [];
  const r = run({}, LINES);
  const g = gaps(r.log);
  console.log('   timeline:', JSON.stringify(r.log));
  check('three lines spoken', r.log.filter(e => e[0] === 'start').length === 3);
  check('two real gaps', g.length === 2, 'gaps=' + JSON.stringify(g));
  check('first gap is the long one (480ms)', g[0] === 480);
  check('later gap is 380ms', g[1] === 380);
  check('a seam tick lands in every gap', r.log.filter(e => e[0] === 'seam').length === 2);
  check('chain reports completion', r.notified !== null, 'at ' + r.notified + 'ms');
  check('no timer leaked', r.pendingTimers === 0);
}

console.log('\n=== 2. iOS Safari worst case: onend NEVER fires — the safety net must carry it ===');
{ now = 0; timers = [];
  const r = run({ fireOnEnd: false }, LINES);
  const starts = r.log.filter(e => e[0] === 'start');
  check('all three lines still spoken', starts.length === 3, JSON.stringify(starts.map(s => s[1])));
  check('chain still completes', r.notified !== null, 'at ' + r.notified + 'ms');
  check('no timer leaked', r.pendingTimers === 0);
}

console.log('\n=== 3. engine wedged: onend missing AND speaking stuck true (the poll cap) ===');
{ now = 0; timers = [];
  const r = run({ fireOnEnd: false, stuckSpeaking: true }, LINES);
  check('all three lines still spoken', r.log.filter(e => e[0] === 'start').length === 3);
  check('no seam faked over a wedged engine', r.log.filter(e => e[0] === 'seam').length === 0,
        'capped path must not tick mid-word');
  check('chain still completes', r.notified !== null);
  check('no timer leaked', r.pendingTimers === 0);
}

console.log('\n=== 4. child taps Back mid-sentence ===');
{ now = 0; timers = [];
  const r = run({}, LINES, { stopAt: 1000 });
  const after = r.log.filter(e => e[0] === 'start' && e[1] > 1000);
  check('nothing new is spoken after stop()', after.length === 0, JSON.stringify(after));
  check('engine was cancelled', r.log.some(e => e[0] === 'cancel' && e[1] >= 1000));
  check('arrival callback does NOT fire on a cancelled chain', r.notified === null);
  check('no timer leaked', r.pendingTimers === 0);
}

console.log('\n=== 5. child mutes mid-sentence ===');
{ now = 0; timers = [];
  const r = run({}, LINES, { muteAt: 1000 });
  check('nothing new is spoken after mute', !r.log.some(e => e[0] === 'start' && e[1] > 1000));
  check('the line in flight is cut, not just the next', r.log.some(e => e[0] === 'cancel' && e[1] >= 1000));
  check('no timer leaked', r.pendingTimers === 0);
}

console.log('\n=== 6. a second answer interrupts the first (gen guard) ===');
{ now = 0; timers = [];
  const { engine, log } = makeEngine({});
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine }, Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: makeClips(null), Audio: makeAudio(log).FakeAudio,
    Clips: makeClips(null), Audio: makeAudio(log).FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  V.lines(['OLD one', 'OLD two', 'OLD three']);
  clock.run(1000);
  V.lines(['NEW one', 'NEW two']);
  clock.run(40000);
  const spokenAfter = log.filter(e => e[0] === 'start' && e[1] >= 1000).map(e => e[2]);
  check('no OLD line is spoken after the interrupt', !spokenAfter.some(t => t.startsWith('OLD')),
        JSON.stringify(spokenAfter));
  check('the NEW chain completes in full', spokenAfter.filter(t => t.startsWith('NEW')).length === 2);
  check('no timer leaked', timers.length === 0);
}

console.log('\n=== 7. muted: lines() must return immediately so the 7s ceiling drives arrival ===');
{ now = 0; timers = [];
  const { engine, log } = makeEngine({});
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine }, Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: makeClips(null), Audio: makeAudio(log).FakeAudio,
    Clips: makeClips(null), Audio: makeAudio(log).FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  let notified = false;
  V.muted = true;
  V.notifyNextChain(() => { notified = true; });
  V.lines(LINES);
  clock.run(40000);
  check('nothing spoken while muted', log.filter(e => e[0] === 'start').length === 0);
  check('the stale callback is dropped, not leaked to a later chain', notified === false);
  check('no timer leaked', timers.length === 0);
}

/* ── The clip path ──
   These two exist because the rendered clips introduced a SECOND engine into a chain
   whose every guarantee was written against the first. The risk is not that audio fails
   to play; it is that the chain's ordering, its seam, its gaps and its completion
   callback quietly stop applying the moment a line is a file instead of an utterance. */
console.log('\n=== 8. a chain of rendered clips: order, seam, gaps, completion ===');
{ now = 0; timers = [];
  const log = [];
  const { FakeAudio } = makeAudio(log, 700);
  const engine = { speaking: false, cancel() {}, speak() { log.push(['SPEECH-USED', now]); } };
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: makeClips({ '26!': 'a.m4a', '2 times 13 is 26.': 'b.m4a', 'You did it!': 'c.m4a' }),
    Audio: FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  let done = false;
  V.notifyNextChain(() => { done = true; });
  V.lines(['26!', '2 times 13 is 26.', 'You did it!']);
  clock.run(200);
  check('busy() is true while a clip is playing', V.busy() === true);
  clock.run(40000);
  const played = log.filter(e => e[0] === 'audio-start').map(e => e[2]);
  check('every line played as a file, none fell through to speech',
        log.every(e => e[0] !== 'SPEECH-USED') && played.length === 3);
  check('clips played in manifest order  — ' + JSON.stringify(played),
        JSON.stringify(played) === JSON.stringify(['a.m4a', 'b.m4a', 'c.m4a']));
  check('the seam still sounds between clips', log.filter(e => e[0] === 'seam').length === 2);
  const starts = log.filter(e => e[0] === 'audio-start').map(e => e[1]);
  check(`the first gap is the long one (${starts[1] - starts[0]}ms vs ${starts[2] - starts[1]}ms)`,
        starts[1] - starts[0] > starts[2] - starts[1]);
  check('the chain reported completion', done === true);
  check('no timer leaked', timers.length === 0);
  check('busy() is false once the chain has finished', V.busy() === false);
}

console.log('\n=== 9. a half-rendered chain falls back line by line ===');
{ now = 0; timers = [];
  const log = [];
  const { FakeAudio } = makeAudio(log, 700);
  const engine = {
    speaking: false,
    cancel() { engine.speaking = false; },
    speak(u) {
      engine.speaking = true; log.push(['start', now, u.text]);
      clock.setTimeout(() => { engine.speaking = false; if (u.onend) u.onend(); }, 900);
    },
  };
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    // Only the middle line has been rendered.
    Clips: makeClips({ '2 times 13 is 26.': 'b.m4a' }),
    Audio: FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  let done = false;
  V.notifyNextChain(() => { done = true; });
  V.lines(['26!', '2 times 13 is 26.', 'You did it!']);
  clock.run(40000);
  const order = log.filter(e => e[0] === 'start' || e[0] === 'audio-start').map(e => e[2]);
  check('all three lines were delivered, mixing both engines — ' + JSON.stringify(order),
        JSON.stringify(order) === JSON.stringify(['26!', 'b.m4a', 'You did it!']));
  check('the chain still completed across the engine switch', done === true);
  check('no timer leaked', timers.length === 0);
}

console.log('\n=== 10. stop() cuts a playing clip, not just a pending one ===');
{ now = 0; timers = [];
  const log = [];
  const { FakeAudio } = makeAudio(log, 700);
  const engine = { speaking: false, cancel() {}, speak() {} };
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: makeClips({ '26!': 'a.m4a', '2 times 13 is 26.': 'b.m4a' }),
    Audio: FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;', sandbox);
  const V = sandbox.Voice;
  let done = false;
  V.notifyNextChain(() => { done = true; });
  V.lines(['26!', '2 times 13 is 26.']);
  clock.run(200);
  V.stop();
  clock.run(40000);
  check('the clip in flight was paused', log.some(e => e[0] === 'audio-pause'));
  check('the second clip never started',
        log.filter(e => e[0] === 'audio-start').length === 1);
  check('the arrival callback did not fire on a stopped chain', done === false);
  check('busy() is false after stop()', V.busy() === false);
  check('no timer leaked', timers.length === 0);
}

/* ── The two roles ──
   Owner decision, 2026-08-21: the companion speaks the words and the ship's computer
   reads the numbers. The thing that has to be true, and that nothing else here checks, is
   that the seam is DELIBERATE — the same line always gets the same voice, the robot is
   audibly a machine, and it announces itself. The tests below hold that shape in place,
   because the previous version of two-voices-in-one-game was a bug and the difference
   between that and this is entirely in these invariants. */
function roleRun(parts, clips, { horizon = 40000, stopAt = null } = {}) {
  now = 0; timers = [];
  const log = [];
  const engine = {
    speaking: false,
    cancel() { engine.speaking = false; log.push(['cancel', now]); },
    speak(u) {
      engine.speaking = true; log.push(['start', now, u.text, u.rate, u.pitch]);
      clock.setTimeout(() => {
        engine.speaking = false; log.push(['end', now, u.text]);
        if (u.onend) u.onend();
      }, 900);
    },
  };
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance,
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); }, readout() { log.push(['readout', now]); } },
    Clips: clips || makeRoleClips({}),
    Audio: makeAudio(log, 700).FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;this.num=num;', sandbox);
  const V = sandbox.Voice;
  let done = false;
  V.notifyNextChain(() => { done = true; });
  V.lines(parts(sandbox.num));
  if (stopAt !== null) { clock.run(stopAt); V.stop(); }
  clock.run(horizon);
  return { log, done, V, pending: timers.length, said: log.filter(e => e[0] === 'start') };
}

console.log('\n=== 11. an all-robot mode: companion praise, then the computer reads the answer ===');
{
  const r = roleRun(num => ['Stellar!', num('47!'), num('23 plus 24 is 47.')],
                    makeRoleClips({ voiced: false }));
  console.log('   timeline:', JSON.stringify(r.log.filter(e => e[0] !== 'end')));
  check('all three lines spoken in order  — ' + JSON.stringify(r.said.map(e => e[2])),
        JSON.stringify(r.said.map(e => e[2])) === JSON.stringify(['Stellar!', '47!', '23 plus 24 is 47.']));
  check('the companion keeps her own delivery (rate .95, pitch 1.15)',
        r.said[0][3] === 0.95 && r.said[0][4] === 1.15, `${r.said[0][3]}/${r.said[0][4]}`);
  check('both number lines are flat and low (rate .86, pitch .7)',
        r.said.slice(1).every(e => e[3] === 0.86 && e[4] === 0.7),
        JSON.stringify(r.said.slice(1).map(e => [e[3], e[4]])));
  check('the two voices are audibly different, not nearly the same',
        r.said[0][4] - r.said[1][4] >= 0.4);
  check('a console blip announces each number line, and only those',
        r.log.filter(e => e[0] === 'readout').length === 2);
  check('no neutral seam tick is used in front of a number line',
        r.log.filter(e => e[0] === 'seam').length === 0);
  check('the chain completed', r.done === true);
  check('no timer leaked', r.pending === 0);
}

console.log('\n=== 12. the long gap follows the VALUE now, not position one ===');
{
  /* Before roles, the long gap was hard-coded to the FIRST seam, because line one was
     always the number the child had just typed. Line one is now the companion reacting,
     so the rule had to move onto the role or the value would be the one crowded. */
  const r = roleRun(num => ['Stellar!', num('47!'), num('23 plus 24 is 47.')],
                    makeRoleClips({ voiced: false }));
  const g = gaps(r.log);
  check(`the opening line still gets the long gap (${g[0]}ms)`, g[0] === 480);
  check(`and so does the value, though it is line TWO (${g[1]}ms)`, g[1] === 480);

  /* The control: a companion line in the middle of a chain is not a value, so it keeps
     the short gap. Without this, "every gap is 480" would pass the two checks above. */
  const c = roleRun(num => ['Stellar!', 'The same!', num('47!')],
                    makeRoleClips({ voiced: false }));
  const cg = gaps(c.log);
  check(`a mid-chain companion line keeps the short gap (${cg[1]}ms)`, cg[1] === 380);
  check('so the gap really does follow the role, not the position',
        g[1] === 480 && cg[1] === 380);
}

console.log('\n=== 13. a chain that OPENS on a number: the blip must clear the first digit ===');
{
  const r = roleRun(num => [num('47!'), num('23 plus 24 is 47.')],
                    makeRoleClips({ voiced: false }));
  const blip = r.log.find(e => e[0] === 'readout');
  check('the blip sounds before anything is said', blip && blip[1] === 0);
  check(`the first word waits for it (${r.said[0][1]}ms)`, r.said[0][1] === 140);
  check('both lines still spoken', r.said.length === 2);
  check('no timer leaked', r.pending === 0);
}

console.log('\n=== 14. Times Tables: the number is RENDERED, so no robot and no blip ===');
{
  const r = roleRun(num => ['Stellar!', num('56!'), num('7 times 8 is 56.')],
                    makeRoleClips({
                      companion: { 'Stellar!': 'praise.m4a' },
                      numbers: { '56!': 'tt-n-56.m4a', '7 times 8 is 56.': 'tt-a-7x8.m4a' },
                      voiced: true }));
  check('every line played as a file', r.log.filter(e => e[0] === 'audio-start').length === 3);
  check('the robot engine was never reached', r.said.length === 0);
  check('and no console blip fired: this is the companion, not the computer',
        r.log.filter(e => e[0] === 'readout').length === 0);
  check('the neutral seam marks the joins instead',
        r.log.filter(e => e[0] === 'seam').length === 2);
  check('the chain completed', r.done === true);
}

console.log('\n=== 15. THE MISSING-ASSET CASE: an unrendered companion line must not break ===');
{
  const r = roleRun(num => ['Stellar!', 'Jupiter is the biggest planet of all!', num('47!')],
                    makeRoleClips({ companion: { 'Stellar!': 'praise.m4a' }, voiced: false }));
  const order = r.log.filter(e => e[0] === 'start' || e[0] === 'audio-start').map(e => e[2]);
  check('the rendered line plays and the missing one falls to the engine — ' + JSON.stringify(order),
        JSON.stringify(order) === JSON.stringify(['praise.m4a', 'Jupiter is the biggest planet of all!', '47!']));
  check('the fallback speaks in the COMPANION voice, not the robot one',
        r.said[0][3] === 0.95 && r.said[0][4] === 1.15);
  check('the chain still completed across two engines and a gap in the render',
        r.done === true);
  check('no timer leaked', r.pending === 0);
}

console.log('\n=== 16. Voice.say(num(...)): the lone readout, and interrupting its lead-in ===');
{
  now = 0; timers = [];
  const log = [];
  const engine = {
    speaking: false, cancel() { log.push(['cancel', now]); },
    speak(u) { log.push(['start', now, u.text, u.rate, u.pitch]); },
  };
  const sandbox = {
    SpeechSynthesisUtterance: FakeUtterance, window: { speechSynthesis: engine },
    Sound: { seam() {}, readout() { log.push(['readout', now]); } },
    Clips: makeRoleClips({}), Audio: makeAudio(log).FakeAudio,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(voiceSrc + '\nthis.Voice=Voice;this.num=num;', sandbox);
  const V = sandbox.Voice, num = sandbox.num;
  V.say(num('47'));
  check('the blip fires immediately', log.some(e => e[0] === 'readout' && e[1] === 0));
  check('busy() is true across the lead-in, so a mascot poke cannot land on it',
        V.busy() === true);
  clock.run(500);
  check('the number is then read out flat and low',
        log.some(e => e[0] === 'start' && e[2] === '47' && e[3] === 0.86 && e[4] === 0.7));
  check('no timer leaked', timers.length === 0);

  // and the same call interrupted inside its 140ms lead-in
  now = 0; timers = []; log.length = 0;
  V.say(num('47'));
  clock.run(60);
  V.stop();
  clock.run(500);
  check('a lead-in cut short never speaks', !log.some(e => e[0] === 'start'));
  check('no timer leaked', timers.length === 0);

  // an untagged string is the companion, which is the safe default for anything unlabelled
  now = 0; timers = []; log.length = 0;
  V.say('Off we go!');
  check('an untagged line is the companion, with no blip',
        log.some(e => e[0] === 'start' && e[3] === 0.95 && e[4] === 1.15)
        && !log.some(e => e[0] === 'readout'));
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails ? 1 : 0);
