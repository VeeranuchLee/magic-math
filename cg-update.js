/* cg-update.js -- shared by every Children Games app; copy BYTE-IDENTICAL from
   shared/update/cg-update.js (scripts/check-update-script.py fails a drifted copy).

   WHY (owner, 2026-10-24): "Can we make it better for user? Other users will not know."
   Each app's service worker serves the copy it already has, so the visit that finds a new
   version still shows the old one; families had to close and reopen, and the obvious
   "fix" -- clearing Safari history -- deletes saved progress (planet game, stickers...).

   WHAT IT DOES. The workers already skipWaiting() + clients.claim(), so a new version takes
   control of the open page a moment after it is found; this file decides when to show it:
     - the child has not touched the page yet  -> reload now (usually unnoticed);
     - the child is playing                    -> never interrupt; reload the next time the
                                                  page comes back after 5+ minutes away;
     - every return to the page                -> ask the worker to check for a new version,
                                                  so an app left open for days still updates.
   Saved progress lives in localStorage / IndexedDB, which a reload never touches.
   The first ever visit also fires controllerchange (clients.claim) and is ignored.
   A Test Hub copy registers no worker, so nothing here ever runs there. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  var sw = navigator.serviceWorker;
  var hadController = !!sw.controller;
  var touched = false, pending = false, reloading = false, hiddenAt = 0;
  var AWAY_MS = 5 * 60 * 1000;

  function reload() {
    if (reloading) return;
    reloading = true;
    location.reload();
  }
  ["pointerdown", "touchstart", "keydown"].forEach(function (type) {
    addEventListener(type, function () { touched = true; }, { capture: true, passive: true });
  });
  sw.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (touched) pending = true; else reload();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (pending && hiddenAt && Date.now() - hiddenAt >= AWAY_MS) { reload(); return; }
    if (sw.getRegistration) {
      sw.getRegistration().then(function (r) { if (r) return r.update(); }).catch(function () {});
    }
  });
})();
