/* Exercises the shipped Voice object against a fake speech engine.
   The browser pane is hidden, which throttles timers to >=1s and distorts the very gaps
   this fix is about; and a real engine cannot be made to drop onend on demand, which is
   the iOS Safari failure the safety net exists for. Both are testable here exactly. */
const fs = require('fs'), vm = require('vm');

const SRC = require('path').join(__dirname, '..', 'space-math.html');
const html = fs.readFileSync(SRC, 'utf8');
const start = html.indexOf('/* ══ VOICE (Web Speech) ══ */');
const end = html.indexOf('const PRAISE=[', start);
const voiceSrc = html.slice(start, end);
if (!voiceSrc.includes('notifyNextChain')) { console.error('FAIL: did not extract the new Voice'); process.exit(1); }

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
      log.push(['start', now, u.text]);
      clock.setTimeout(() => {
        log.push(['end', now, u.text]);
        if (!stuckSpeaking) engine.speaking = false;
        if (fireOnEnd && u.onend) u.onend();
      }, speakMs);
    },
  };
  return { engine, log };
}

function run(opts, parts, { muteAt = null, stopAt = null, horizon = 40000 } = {}) {
  const { engine, log } = makeEngine(opts);
  const sandbox = {
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    window: { speechSynthesis: engine },
    Sound: { seam() { log.push(['seam', now]); } },
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
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    window: { speechSynthesis: engine }, Sound: { seam() { log.push(['seam', now]); } },
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
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    window: { speechSynthesis: engine }, Sound: { seam() { log.push(['seam', now]); } },
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

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails ? 1 : 0);
