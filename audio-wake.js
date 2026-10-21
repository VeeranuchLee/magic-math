(function (root) {
  "use strict";

  function attach(getContext, onClosed) {
    if (typeof getContext !== "function") return function () {};
    var watched = null;
    var rebuilding = false;

    function rebuild() {
      if (rebuilding || typeof onClosed !== "function") return;
      rebuilding = true;
      try { onClosed(); } catch (_) { /* app recovery is best-effort */ }
      rebuilding = false;
    }

    function wake() {
      var ctx = null;
      try { ctx = getContext(); } catch (_) { return; }
      if (!ctx) return;
      if (ctx !== watched) {
        watched = ctx;
        try {
          if (typeof ctx.addEventListener === "function") ctx.addEventListener("statechange", wake);
          else {
            var previous = ctx.onstatechange;
            ctx.onstatechange = function (event) {
              try { if (typeof previous === "function") previous.call(ctx, event); } catch (_) {}
              wake();
            };
          }
        } catch (_) {}
      }
      if (ctx.state === "closed") { rebuild(); return; }
      if (ctx.state !== "running") {
        try {
          var result = ctx.resume();
          if (result && typeof result.catch === "function") result.catch(function () {});
        } catch (_) {}
      }
    }

    function gesture() {
      /* No navigator.audioSession.type change (owner 2026-10-20: crackly/hissy sound in
         every app, voice broken even in a private window). Switching the iPad session
         category after audio has started can change the hardware sample rate under a
         running AudioContext/media element; leave Safari's default session alone. */
      wake();
      try { Promise.resolve().then(wake); } catch (_) {}
    }

    function visible() { if (!document.hidden) wake(); }
    var events = ["pointerdown", "touchend", "keydown"];
    events.forEach(function (name) { document.addEventListener(name, gesture, { capture: true, passive: true }); });
    document.addEventListener("visibilitychange", visible, { passive: true });
    root.addEventListener("pageshow", wake, { passive: true });
    wake();

    return function detach() {
      events.forEach(function (name) { document.removeEventListener(name, gesture, true); });
      document.removeEventListener("visibilitychange", visible);
      root.removeEventListener("pageshow", wake);
    };
  }

  root.AudioWake = { attach: attach };
})(window);
