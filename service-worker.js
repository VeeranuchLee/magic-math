/* Magic Math offline cache.
 *
 * Three tiers on purpose.
 *
 * 1. The shell — the five game pages, React, Babel, the fonts and the app icons —
 *    is precached at install, because without every one of those the app cannot
 *    start at all.
 * 2. The menu and mascot images are *warmed* in the background right after the
 *    worker activates. They cannot wait for a later visit: a page loads its menu
 *    art before the worker controls that page on a very first visit, so without
 *    this the home screen renders broken the first time the app is opened
 *    offline. They are not precached either, because ~8.6 MB would make adding
 *    the app to a home screen feel broken.
 * 3. Everything else — backgrounds and the large per-game art, about 21 MB — is
 *    cached as it is used, so a game becomes fully playable offline once it has
 *    been played once with a connection.
 *
 * Bump CACHE_NAME on every publish. The activate handler deletes every other
 * cache, which is what actually ships an update to a device that already has the
 * app installed.
 */

importScripts("./cache-list.js"); // defines self.__WARM_IMAGES

// Bump on every publish; the activate handler drops every other cache, which is what
// actually delivers an update to a device that already installed the app.
//   v2 -> v3  every image path moved to assets-runtime/*.webp, so v2 had to go wholesale
//             rather than keep serving PNGs nothing references any more.
//   v3 -> v4  Count By lost its "how many jumps" row and fixed the ladder at 20 rungs.
//   v4 -> v5  the unclosed @media brace fix, the JSX precompile (Babel stops shipping,
//             so it also leaves SHELL), and game previews on the home cards.
//   v5 -> v6  correct answers are spoken as separate lines instead of one run-on.
//   v6 -> v7  column take away, carry and borrow levels, and a real pause between
//             spoken lines — v6 split them into separate utterances but the engine
//             still ran them back to back with a 5 ms seam, so nothing was audible.
//   v7 -> v8  the two big-kid badges on the hard column cards.
//   v8 -> v9  the column cards reordered easy pair first, and no version in the title.
//   v9 -> v10 Which is Bigger? (greater than, less than, equal to) goes public — it
//             merged without a bump, so v9 devices never saw it — and Times Tables
//             starts on 12 x 12 instead of on its picker.
//   v10 -> v11 Which is Bigger? opens on the 1 - 10 blocks rung instead of 1 - 1000.
//   v11 -> v12 What's Missing?, plus the hundreds-of-blocks rungs of Which is Bigger?,
//              which had merged without a bump and so had reached nobody.
//   v12 -> v13 the counting stage. Exactly one change, checked against origin/main
//              rather than assumed, because the v12 assumption had been wrong.
//   v13 -> v14 the sound publish: music, WebAudio cues and the first rendered narration.
//              The ~24 MB of audio deliberately stayed OUT of SHELL and cache-list.js and
//              joined tier 3, because precaching it would undo the launch-weight work.
//   v14 -> v15 the voice splits by ROLE — the companion speaks words, the ship's computer
//              reads numbers — four facts at every journey stop, and the column-maths
//              opener in her voice.
//              WHY THIS BUMP IS LOAD-BEARING EVEN THOUGH NARRATION IS TIER 3: the clip
//              files are fetched on use, but `assets-runtime/narration/*/clips.json` is
//              the index that decides whether a line resolves to a clip AT ALL. A device
//              holding the old index never asks for the new files, so it would keep the
//              engine voice on every line this publish rendered — while happily being
//              able to download them. Observed locally: a stale cache served the previous
//              index and answered 200 for a clip already deleted from disk.
//   v15 -> v16 the tables reach 30 x 30, the times table chart, Read Big Numbers, and the
//              companion's stuck line. (Recorded late: v16 and v17 shipped without
//              extending this list, which is how a history stops being one.)
//   v16 -> v17 the home shelves split -- Number Games and Times Tables -- so no row wraps
//              4 + 1, published alongside the hub's own first push in weeks.
//   v17 -> v18 four things a child can see: the start-over key stops saying "C", the math
//              front door lists only math, a journey stop is ten answers rather than five,
//              and both game home screens get a back arrow out to Children Games.
//   v18 -> v19 Read Big Numbers: start over leaves the keypad for the title row, half a
//              screen from the backspace, and the backspace centres itself alone.
//   v19 -> v20 the AI-voice line stops speaking for voices we did not make: this app
//              falls back to the device's own speech, and some OS voices are built from
//              a real speaker's recordings.
//   v20 -> v21 Read Fractions: a wall of bars the child taps to build a fraction and hear
//              it named, in the times table chart's teaching style.
//   v21 -> v22 the robot reader is drawn rather than implied -- a talking head for Read Big
//              Numbers and Magic Spelling -- and every app grew a way back out.
//   v22 -> v23 Read Big Numbers reaches nineteen digits, so the robot names quadrillions and
//              quintillions, and Read Fractions opens as a grid of pies with the bar wall one
//              tap away.
//   NOTE: v22 was never published. Devices went straight from v21 to v23 on 2026-08-27,
//              so that publish delivered both of the entries above in one release.
//   v23 -> v24 Unicorn Math gets the Times Tables blocks hint Space Math has had since v22:
//              two misses draw the groups, three add the total. Both worlds now teach the
//              same fact with the same picture.
//   v24 -> v25 the beat that teaches finally has a voice. The second-miss line -- "8 groups
//              of 7. Count them!" -- fell through to the device's own speech in both worlds
//              while the third-miss "here is a peek" played paid narration, so the one beat
//              carrying the teaching was the one beat not in Ari's voice. 144 clips, plus
//              the three Read Fractions lines that #236 added and nobody rendered.
// v26 -- 2026-08-29, the eight-game expansion: Odd or Even?, Add to 10, Take from 10,
//        Hundred Board, Share It Out, What's the Fraction?, Which Unit? and Cover It,
//        in both worlds. Backfilled here 2026-08-29 -- it shipped without extending this
//        list, which is the second time that has happened; the list is the only record of
//        what a version actually carried, so a bump-only commit still owes it an entry.
// v27 -- 2026-08-29, the owner's four calls on the expansion games: the Hundred
//        Board opens on mixed moves and carries a drawn move key, What's the Fraction?
//        opens on every family and every shape, Which Unit? became a chart instead of a
//        quiz, and Cover It opens on L-shapes. Both pages changed, so an installed iPad
//        holding v26 would keep playing the old defaults until this name changes.
//        The same bump carries the Magic Spelling rebuild (PR #322): the page is new,
//        and the tier-3 spelling clips.json has to be discovered by installed devices.
// v28 -- 2026-08-29, the robot voice retreats from the eight newest games. 34 clips give
//        their card names and every fixed companion line the rendered narrator, in every
//        mode -- an exact text match resolves outside the VOICED gate, so the numbers stay
//        the ship's computer and only the sentences change voice. Carries two fixes an
//        installed iPad cannot get any other way: the Times Tables card resolved to
//        nothing and spoke through the device (its clip had shipped, paid for and silent,
//        since v26), and Which Unit?'s card name was re-rendered after v27 reworded it.
//        Both pages changed, so a device holding v27 keeps the old audio until this name
//        changes.
// v29 -- 2026-08-29, equation formats (owner): Make 10 prints the number sentence with
//        the ten-frame and Share It Out prints 9 ÷ 3 = ? on every rung plus a "With
//        numbers" rung where the equation alone asks; the Hundred Board WRITES the move
//        words at the reveal. Both pages changed.
//        WRITTEN AS v28 ON MAIN, RENUMBERED HERE, AND THE REASON IS THAT v28 ALREADY
//        EXISTS IN THE WORLD. Two branches bumped v27 -> v28 independently on the same
//        evening, and one of them was published: the live worker has served v28 since
//        23:20 ICT, carrying the robot-voice entry above and NOT this one. (Written as
//        bare "v28" on purpose -- the full cache name is spelled out exactly once in this
//        file, on the CACHE_NAME line, because both the publish runbook and this repo's
//        own checks read the version with `grep -o 'magic-math-v[0-9]*' | head -1`. A
//        second literal in a comment ABOVE that line makes every one of them report the
//        wrong version, on the live file as well, since comments ship.)
//        Keeping both at v28 would leave every device that already downloaded
//        the live v28 permanently unable to see this work -- the activate handler drops
//        every cache whose NAME differs, so a name that does not change delivers nothing.
//        The entry above is therefore left exactly as it shipped: a version number is a
//        claim about a public artefact, and rewriting one that devices are already
//        holding would make this list lie about what it delivered. This release carries
//        both change sets and must publish as v29.
// v30 -- 2026-08-30, Number Toys (np1, PR #338): the free-play sentence builder, in both
//        math skins, taking each to 23 games. Carries 7 new rendered narrator clips in
//        `shared`, which an installed iPad cannot discover without this name changing --
//        the page and the clips arrive together or the new mode speaks through the device.
//        Merged to main on 2026-08-30 and unpublished until now.
//        This release is also the first published by scripts/publish-app.sh from hosted
//        Actions rather than by a person copying files, and the first to RETIRE anything:
//        the 21 developer tools under tools/ stop shipping and are deleted from the public
//        repository in the same commit. Nothing a device fetches is affected by that --
//        the browser never asked for any of them -- so it does not change what v30
//        delivers, only what the public tree stops carrying.
// v31 -- 2026-09-06, Make 100 (n3, PR #362) plus Number Toys' reward-collection row,
//        in both math skins, taking each to 24 games. Complements to a hundred over a
//        10 x 10 hundred block, asked both ways round.
//        WRITTEN HERE AFTER THE FACT. The bump that armed this release (f1486642)
//        moved the constant and added no entry, so this list said v30 while devices
//        were served v31 -- the one thing the list exists to prevent. The entry is
//        reconstructed from the publish record
//        (coordination/tasks/2026-09-06-0930-claudecode-publish-make-100.md) and from
//        the diff the release actually carried, not from memory. It claims nothing new:
//        v31 is already in the world and this only writes down what it delivered.
// v32 -- 2026-09-06, the Hundred Board stops marking the counting wrong (PR #365).
//        A child asked 70 - 7 who taps 69, 68, 67 down to 63 was collecting six wrong
//        answers on the way to being right, and the second of them fired the rule and
//        lit the answer. The seats a real route passes through are now counted rather
//        than guessed -- no miss, no red -- and they stay lit as the child's own trail.
//        Both pages changed, and nothing else does: no new asset, no narration clip.
//        An installed iPad holding v31 cannot see any of it until this name changes.
const CACHE_NAME = "magic-math-v32";

const SHELL = [
  "./",
  "./index.html",
  "./space-math.html",
  "./unicorn-math.html",
  "./magic-spelling.html",
  "./classical-music.html",
  "./manifest.webmanifest",

  // Without these three the games are a blank screen, so they are never optional.
  "./vendor/react-18.3.1.production.min.js",
  "./vendor/react-dom-18.3.1.production.min.js",

  "./fonts.css",
  "./fonts/Nunito-latin.woff2",
  "./fonts/Nunito-latin-ext.woff2",
  "./fonts/FredokaOne-latin.woff2",

  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      /* Evict only this app's old versions (magic-math-v*). Several repo apps
         share one origin when published, each with its own worker — deleting
         every cache that is not ours would evict the neighbours' offline caches
         (the children-apps hub's own header documents the shared origin).
         Foreign cache names are not ours to touch. */
      .then((keys) => Promise.all(keys.filter((key) => /^magic-math-v/.test(key) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(warmImages)
  );
  self.clients.claim();
});

/* Fetch the menu and mascot art one at a time and tolerate failures. Sequential
   keeps it out of the way of whatever the child is actually loading, and a single
   404 must not abandon the rest of the list the way cache.addAll would. */
function warmImages() {
  const list = self.__WARM_IMAGES || [];
  return caches.open(CACHE_NAME).then((cache) =>
    list.reduce(
      (chain, url) =>
        chain.then(() =>
          cache.match(url).then((hit) => (hit ? undefined : cache.add(url).catch(() => {})))
        ),
      Promise.resolve()
    )
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Never touch another origin: speech, and anything else added later, should
  // fail normally rather than be served a stale cached copy.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Only store real, complete same-origin responses. Caching an error
          // page would pin the failure until the next version bump.
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached. For a page navigation, show the menu rather
          // than the browser's error page — from there every cached game still opens.
          if (request.mode === "navigate") return caches.match("./index.html");
          throw new Error("offline and not cached: " + url.pathname);
        });
    })
  );
});
