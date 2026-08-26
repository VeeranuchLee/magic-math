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
const CACHE_NAME = "magic-math-v16";

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
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
