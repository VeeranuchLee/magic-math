/*
 * Our Maze — double-tap zoom guard (PILOT, 2026-09-25).
 *
 * Owner, 2026-09-25: "kids sometimes double tap, and on ipad it's zoom in, then they cant
 * zoom out." touch-action: manipulation on html and body does not stop iPadOS Safari from
 * double-tap zooming (INTERACTION-DIRECTION.md records the same observation from
 * 2026-09-07). This file is the pilot of the double-tap guard that the 2026-09-19 decision
 * deferred until real-iPad QA; it is not yet the estate-wide rule.
 *
 * What it does, and the one thing it must never do:
 *   - A SECOND single-finger tap that ends within 350 ms and 40 px of the previous one has
 *     its touchend default prevented, which is what stops Safari's double-tap zoom. Because
 *     that also cancels the browser's synthetic click, the tap is re-delivered with
 *     element.click() so a quick second tap still works.
 *   - Any gesture with more than one finger is ignored completely, so a pinch always
 *     reaches Safari. Whatever gets a child zoomed in must still get them out.
 * It adds no gesture-event handler and no viewport lock.
 */
(function () {
  "use strict";
  var WINDOW_MS = 350;
  var RADIUS_PX = 40;
  var lastEnd = 0;
  var lastX = 0;
  var lastY = 0;
  var multi = false;

  document.addEventListener("touchstart", function (e) {
    if (e.touches.length > 1) {
      multi = true;
    }
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (multi || e.touches.length > 0 || e.changedTouches.length !== 1) {
      // Part of a multi-finger gesture (a pinch): never interfere, and start afresh.
      if (e.touches.length === 0) {
        multi = false;
      }
      lastEnd = 0;
      return;
    }
    var t = e.changedTouches[0];
    var now = Date.now();
    var near = Math.abs(t.clientX - lastX) < RADIUS_PX && Math.abs(t.clientY - lastY) < RADIUS_PX;
    if (now - lastEnd < WINDOW_MS && near) {
      e.preventDefault();
      var target = document.elementFromPoint(t.clientX, t.clientY);
      if (target && typeof target.click === "function") {
        target.click();
      }
      lastEnd = 0;
      return;
    }
    lastEnd = now;
    lastX = t.clientX;
    lastY = t.clientY;
  }, { passive: false });
})();
