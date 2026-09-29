/* Number Catch — shared Space/Unicorn collecting shell. Rules and scoring stay
 * in TapWaitEngine; this adapter owns the painted board, feedback and controls. */
(function (root) {
  "use strict";
  var React = root.React, Engine = root.TapWaitEngine;
  var h = React && React.createElement;
  if (!React || !h || !Engine) return;

  var SCREEN_TITLE = "Number Catch";
  /* Measured by colour-region detection from the nine pad/soil interiors in the
     1024x768 painted boards. These are image-space fractions, not an inferred
     grid: both paintings have perspective. */
  var SPOT_RECTS = {
    space: [
      [0.1582,0.3424,0.1572,0.0872],[0.4170,0.3424,0.1660,0.0872],[0.6865,0.3424,0.1572,0.0872],
      [0.1328,0.4870,0.1855,0.1081],[0.4053,0.4870,0.1904,0.1081],[0.6895,0.4870,0.1855,0.1081],
      [0.0811,0.6745,0.2383,0.1393],[0.3750,0.6745,0.2500,0.1393],[0.6807,0.6745,0.2383,0.1393]
    ],
    unicorn: [
      [0.1348,0.3021,0.1787,0.1003],[0.4189,0.3034,0.1631,0.1003],[0.6875,0.3034,0.1777,0.0996],
      [0.0957,0.4479,0.2061,0.1133],[0.4121,0.4518,0.1768,0.1113],[0.7012,0.4479,0.2021,0.1133],
      [0.0576,0.6458,0.2393,0.1211],[0.3701,0.6484,0.2490,0.1211],[0.7070,0.6458,0.2568,0.1211]
    ]
  };
  var PRESETS = [
    { id: "odd", label: "Odd", ruleText: "Collect the odd numbers!", hint: "Odd numbers have one left over.", glyph: "1  3  5", max: 20, test: function (n) { return n % 2 !== 0; } },
    { id: "even", label: "Even", ruleText: "Collect the even numbers!", hint: "Even numbers pair up neatly.", glyph: "2  4  6", max: 30, test: function (n) { return n % 2 === 0; } },
    { id: "greater", label: "Greater", ruleText: "Collect numbers greater than 15!", hint: "Look for numbers above 15.", glyph: "> 15", max: 40, test: function (n) { return n > 15; } },
    { id: "less", label: "Less", ruleText: "Collect numbers less than 16!", hint: "Look for numbers below 16.", glyph: "< 16", max: 50, test: function (n) { return n < 16; } }
  ];
  PRESETS.forEach(function (p) { p.pool = range(1, p.max); });

  function range(from, to) { var a = []; for (var n = from; n <= to; n++) a.push(n); return a; }
  function sound(name) { var s = root.Sound; if (s && typeof s[name] === "function") { try { s[name](); } catch (_) {} } }
  function collectibleCount(eventIndex) { return eventIndex < 3 ? 1 : eventIndex < 7 ? 2 : 3; }
  function makeConfig() {
    return {
      itemPool: PRESETS[0].pool, rule: PRESETS[0].test, ruleText: PRESETS[0].ruleText,
      roundLength: 12,
      spawn: { mode: "positions", slots: [0,1,2,3,4,5,6,7,8], count: collectibleCount, visibleMs: 4200, gapMs: 500 },
      difficultyLevels: PRESETS.map(function (p) { return { itemPool: p.pool, rule: p.test, ruleText: p.ruleText, ruleHint: p.hint }; }),
      scoring: { streak: true, basePoints: 10, waitPoints: 5, streakStep: 2, maxStreakBonus: 10 },
      feedback: {},
      audio: {
        show: function () { sound("hop"); },
        correct: function (p) { sound("ding"); if (p && p.streak > 1 && p.streak % 3 === 0) setTimeout(function () { sound("twinkle"); }, 160); },
        wrong: function () { sound("wrong"); },
        waited: function () { sound("hop"); },
        missed: function () { sound("wrong"); },
        roundEnd: function () { sound("celebrate"); }
      }
    };
  }

  function Game(props) {
    props = props || {};
    var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useCallback = React.useCallback;
    var pair = useState(null), view = pair[0], setView = pair[1];
    var levelPair = useState(0), level = levelPair[0], setLevel = levelPair[1];
    var flashPair = useState(""), flash = flashPair[0], setFlash = flashPair[1];
    var gameRef = useRef(null), flashTimer = useRef(null), propsRef = useRef(props); propsRef.current = props;
    var signal = useCallback(function (kind) { setFlash(kind); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(function () { setFlash(""); }, kind === "waited" ? 700 : 480); }, []);

    useEffect(function () {
      var game = new Engine.Game(makeConfig(), { seed: props.seed == null ? Date.now() : props.seed });
      gameRef.current = game;
      root.__tapWaitMathGame = game;
      /* Browser QA must exercise the real React click path without racing the
         randomized spawner.  This test-only hook pauses automatic timers and
         installs one exact event; production never calls it. */
      root.__tapWaitMathTest = {
        force: function (spec) {
          spec = spec || {};
          game.clearTimer();
          game.auto = false;
          var now = game.clock.now();
          var entry = {
            id: "qa-" + String(spec.slot == null ? 4 : spec.slot) + "-" + String(spec.item == null ? 17 : spec.item),
            item: spec.item == null ? 17 : spec.item,
            target: spec.target !== false,
            slot: spec.slot == null ? 4 : spec.slot,
            tapped: false
          };
          game.state.phase = "showing";
          game.state.current = { index: game.state.eventIndex, items: [entry] };
          game.state.nextAt = null;
          game.state.visibleUntil = now + 60000;
          game.state.lastFeedback = null;
          game.emit("show", { itemEvent: game.state.current, now: now });
          game.emit("change", { now: now });
          return { slot: entry.slot, item: String(entry.item), target: entry.target };
        },
        expire: function () {
          game.tick(game.state.visibleUntil + 1);
          return game.getState();
        }
      };
      var update = function () { setView(game.getState()); };
      var offs = [game.on("change", update), game.on("correct", function () { var p = propsRef.current; if (typeof p.setScore === "function") p.setScore(function (v) { return v + 1; }); if (typeof p.onCorrect === "function") p.onCorrect(); signal("correct"); }), game.on("wrong", function () { signal("wrong"); }), game.on("waited", function () { signal("waited"); }), game.on("missed", function () { signal("missed"); }), game.on("roundEnd", function (d) { if (typeof propsRef.current.onRoundEnd === "function") propsRef.current.onRoundEnd(d.summary); })];
      game.start(); update();
      return function () { offs.forEach(function (off) { off(); }); clearTimeout(flashTimer.current); game.destroy(); gameRef.current = null; if (root.__tapWaitMathGame === game) delete root.__tapWaitMathGame; delete root.__tapWaitMathTest; };
    }, []);

    var state = view || { phase: "loading", score: 0, streak: 0, wrong: 0, eventIndex: 0, roundLength: 12, current: null };
    var activeIndex = gameRef.current ? gameRef.current.getDifficulty() : level;
    var preset = PRESETS[activeIndex] || PRESETS[0];
    var theme = props.theme === "unicorn" ? "unicorn" : "space";
    var items = state.current && state.current.items || [];
    var bySlot = {}; items.forEach(function (item) { bySlot[item.slot] = item; });
    var reteach = state.wrong >= 2, reveal = state.wrong >= 3;

    function choose(next) { if (next < 0 || next >= PRESETS.length) return; sound("tap"); setLevel(next); var g = gameRef.current; if (g) { g.setDifficulty(next); g.start(); setView(g.getState()); } }
    function again() { sound("tap"); var g = gameRef.current; if (g) { g.start(); setView(g.getState()); } }
    function harder() { sound("tap"); if (activeIndex < PRESETS.length - 1) choose(activeIndex + 1); }

    var spotRects = SPOT_RECTS[theme];
    var spots = Array.from({ length: 9 }, function (_, slot) {
      var item = bySlot[slot], rect = spotRects[slot];
      var spotStyle = { left:(rect[0]*100)+"%", top:(rect[1]*100)+"%", width:(rect[2]*100)+"%", height:(rect[3]*100)+"%" };
      return h("div", { key: slot, className: "tw-spot" + (item ? " occupied" : ""), style:spotStyle, "data-slot": String(slot), "aria-label": item ? undefined : (theme === "space" ? "Empty star cradle" : "Empty flower bed") }, item ?
        h("button", { type: "button", className: "tw-collectible up" + (item.target ? " target" : "") + (item.tapped ? " collected" : "") + (reveal && item.target ? " hint-match" : ""), "data-slot": String(slot), "data-target": item.target ? "true" : "false", "aria-label": String(item.item), onClick: function () { if (gameRef.current) gameRef.current.tap(item); } }, [
          h("span", { key: "visual", className: "tw-collectible-visual" }, [
            h("span", { key: "sprite", className: "tw-collectible-art", "aria-hidden": "true" }),
            h("span", { key: "sign", className: "tw-number-sign" + (String(item.item).length > 1 ? " two-digit" : "") }, String(item.item))
          ]),
          h("span", { key: "burst", className: "tw-collect-burst", "aria-hidden": "true" })
        ]) : null);
    });

    var body = [
      h("div", { key: "marquee", className: "tw-marquee" }, [
        h("button", { key: "back", type: "button", className: "back-btn", "aria-label": "Back to Math", onClick: function () { sound("tap"); if (props.onBack) props.onBack(); } }, "←"),
        h("div", { key: "score", className: "tw-score-box" }, [h("small", { key: "l" }, "SCORE"), h("b", { key: "v" }, String(state.score || 0))]),
        h("div", { key: "title", className: "tw-title" }, SCREEN_TITLE),
        h("div", { key: "streak", className: "tw-streak-box " + theme, "aria-label": "Collection streak " + (state.streak || 0) }, [h("small", { key: "l" }, theme === "space" ? "STAR JAR" : "BOUQUET"), h("span", { key: "meter", className: "tw-collection-meter" }, Array.from({length:5}, function (_, i) { return h("i", { key:i, className:i < Math.min(state.streak || 0,5) ? "filled" : "" }, theme === "space" ? "★" : "✿"); }))]),
        h("button", { key: "sound", type: "button", className: "sound-btn", "aria-label": props.muted ? "Turn sound on" : "Turn sound off", onClick: function () { sound("tap"); if (props.onToggleMute) props.onToggleMute(); } }, props.muted ? "🔇" : "🔊")
      ]),
      h("div", { key: "rule", className: "tw-rule" + (reveal ? " reteach" : "") }, [h("span", { key: "word", className: "tw-rule-word" }, preset.label), h("strong", { key: "glyph", className: "tw-glyph" }, preset.glyph), h("span", { key: "line", className: "tw-rule-line" }, reteach ? preset.hint : preset.ruleText)]),
      h("div", { key: "stage", className: "tw-stage " + flash, "aria-label": theme === "space" ? "Nine-spot star collecting board" : "Nine-bed flower collecting board" }, spots),
      h("div", { key: "footer", className: "tw-footer" }, [
        h("div", { key: "rules", className: "tw-ribbon", "aria-label": "Choose a collecting rule" }, PRESETS.map(function (p, i) { return h("button", { key: p.id, type: "button", className: "tw-chip" + (i === activeIndex ? " on" : ""), "aria-pressed": i === activeIndex, onClick: function () { choose(i); } }, p.label); })),
        h("div", { key: "message", className: "tw-message", "aria-live": "polite" }, flash === "wrong" ? (theme === "space" ? "Let that star twinkle away." : "Let that flower close.") : flash === "waited" ? "Good waiting! ★" : flash === "missed" ? "Look for the matching numbers." : (theme === "space" ? "Collect matching stars. Let the others fade." : "Pick matching flowers. Let the others close.")),
        h("span", { key: "progress", className: "tw-progress" }, Math.min((state.eventIndex || 0) + 1, state.roundLength || 12) + " / " + (state.roundLength || 12))
      ])
    ];
    if (state.phase === "ended") body.push(h("div", { key: "finish", className: "tw-finish" }, [h("div", { key: "ticket", className: "tw-ticket" }, [h("span", { key: "t" }, theme === "space" ? "STAR COLLECTION" : "FLOWER BOUQUET"), h("b", { key: "s" }, (theme === "space" ? "★ " : "✿ ") + (state.score || 0))]), h("div", { key: "copy", className: "tw-finish-copy" }, "Great collecting and waiting!"), h("div", { key: "buttons", className: "tw-finish-buttons" }, [h("button", { key: "again", type: "button", className: "tw-finish-button", onClick: again }, "Play again"), h("button", { key: "harder", type: "button", className: "tw-finish-button", disabled: activeIndex >= PRESETS.length - 1, onClick: harder }, "Next rule ›")]) ]));
    return h("div", { className: "screen tap-wait-math-screen " + theme, style: props.journeyBg ? { "--game-bg": "url('" + props.journeyBg + "')" } : undefined }, body);
  }
  root.TapWaitMath = { Game: Game, presets: PRESETS, makeConfig: makeConfig, SCREEN_TITLE: SCREEN_TITLE };
})(typeof self !== "undefined" ? self : this);
