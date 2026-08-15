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
const CACHE_NAME = "magic-math-v6";

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
