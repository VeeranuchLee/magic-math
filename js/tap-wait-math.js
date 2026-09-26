/*
 * Tap or Wait — the small React shell used by both Magic Math worlds.
 * The game rules and round state live in the canonical TapWaitEngine. This file
 * supplies only the numbers, the four rule presets, the activity ribbon, and the
 * screen chrome. It deliberately uses no speech and no audio files: the page's
 * existing Sound object supplies runtime WebAudio cues.
 */
(function (root) {
  "use strict";
  var React = root.React;
  var Engine = root.TapWaitEngine;
  var h = React && React.createElement;
  if (!React || !h || !Engine) return;

  var PRESETS = [
    { id: "odd", label: "Odd", ruleText: "Tap the odd numbers!", hint: "Odd numbers have one left over.", glyph: "1 3 5", max: 20, test: function (n) { return n % 2 !== 0; } },
    { id: "even", label: "Even", ruleText: "Tap the even numbers!", hint: "Even numbers pair up neatly.", glyph: "2 4 6", max: 30, test: function (n) { return n % 2 === 0; } },
    { id: "greater", label: "Greater", ruleText: "Tap numbers greater than 15!", hint: "Find numbers above 15.", glyph: "> 15", max: 40, test: function (n) { return n > 15; } },
    { id: "less", label: "Less", ruleText: "Tap numbers less than 16!", hint: "Find numbers below 16.", glyph: "< 16", max: 50, test: function (n) { return n < 16; } }
  ];
  PRESETS.forEach(function (preset) { preset.pool = range(1, preset.max); });

  function range(from, to) {
    var values = [];
    for (var n = from; n <= to; n++) values.push(n);
    return values;
  }

  function sound(name) {
    var s = root.Sound;
    if (!s || typeof s[name] !== "function") return;
    try { s[name](); } catch (e) { /* a missing sound must never break a maths turn */ }
  }

  function makeConfig() {
    var levels = PRESETS.map(function (preset) {
      return { itemPool: preset.pool, rule: preset.test, ruleText: preset.ruleText, ruleHint: preset.hint };
    });
    return {
      itemPool: PRESETS[0].pool,
      rule: PRESETS[0].test,
      ruleText: PRESETS[0].ruleText,
      roundLength: 12,
      spawn: { mode: "single", visibleMs: 2200, gapMs: 300 },
      difficultyLevels: levels,
      scoring: { streak: true, basePoints: 10, streakStep: 2, maxStreakBonus: 10 },
      feedback: {},
      audio: {
        correct: function () { sound("ding"); },
        wrong: function () { sound("wrong"); },
        missed: function () { sound("hop"); },
        roundEnd: function () { sound("celebrate"); }
      }
    };
  }

  function Game(props) {
    props = props || {};
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;
    var [level, setLevel] = useState(0);
    var [view, setView] = useState(null);
    var [flash, setFlash] = useState("");
    var gameRef = useRef(null);
    var flashTimer = useRef(null);
    var propsRef = useRef(props);
    propsRef.current = props;

    var signal = useCallback(function (kind) {
      setFlash(kind);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(function () { setFlash(""); }, 460);
    }, []);

    useEffect(function () {
      var game = new Engine.Game(makeConfig(), { seed: props.seed == null ? Date.now() : props.seed });
      gameRef.current = game;
      var update = function () { setView(game.getState()); };
      var offChange = game.on("change", update);
      var offCorrect = game.on("correct", function () {
        var currentProps = propsRef.current;
        if (typeof currentProps.setScore === "function") currentProps.setScore(function (value) { return value + 1; });
        if (typeof currentProps.onCorrect === "function") currentProps.onCorrect();
        signal("correct");
      });
      var offWrong = game.on("wrong", function () { signal("wrong"); });
      var offMissed = game.on("missed", function () { signal("missed"); });
      var offEnd = game.on("roundEnd", function (detail) {
        var currentProps = propsRef.current;
        if (typeof currentProps.onRoundEnd === "function") currentProps.onRoundEnd(detail.summary);
      });
      game.start();
      update();
      return function () {
        offChange(); offCorrect(); offWrong(); offMissed(); offEnd();
        if (flashTimer.current) clearTimeout(flashTimer.current);
        game.destroy();
        gameRef.current = null;
      };
    }, []);

    var state = view || (gameRef.current && gameRef.current.getState()) || { phase: "loading", score: 0, streak: 0, eventIndex: 0, roundLength: 12, current: null };
    var activeIndex = gameRef.current ? gameRef.current.getDifficulty() : level;
    var preset = PRESETS[activeIndex] || PRESETS[0];
    var theme = props.theme === "unicorn" ? "unicorn" : "space";
    var current = state.current;
    var item = current && current.items && current.items[0];
    var progress = Math.min((state.eventIndex || 0) + 1, state.roundLength || 12);

    function choose(next) {
      if (next < 0 || next >= PRESETS.length) return;
      sound("tap");
      setLevel(next);
      var game = gameRef.current;
      if (game) {
        game.setDifficulty(next);
        game.start();
        setView(game.getState());
      }
    }

    function again() {
      sound("tap");
      var game = gameRef.current;
      if (game) { game.start(); setView(game.getState()); }
    }

    function harder() {
      sound("tap");
      if (activeIndex < PRESETS.length - 1) choose(activeIndex + 1);
    }

    var topChildren = [
      h("button", { key: "back", type: "button", className: "back-btn", "aria-label": "Back to Math", onClick: function () { sound("tap"); if (props.onBack) props.onBack(); } }, "←"),
      h("div", { key: "title", className: "tw-score-title" }, [
        h("div", { key: "score", className: "tw-score" }, String(state.score || 0)),
        h("div", { key: "streak", className: "tw-streak" }, "Streak " + (state.streak || 0))
      ]),
      h("button", { key: "sound", type: "button", className: "sound-btn", "aria-label": props.muted ? "Turn sound on" : "Turn sound off", onClick: function () { sound("tap"); if (props.onToggleMute) props.onToggleMute(); } }, props.muted ? "🔇" : "🔊")
    ];

    var ribbon = h("div", { className: "tw-ribbon", "aria-label": "Choose a Tap or Wait rule" }, PRESETS.map(function (entry, index) {
      return h("button", {
        key: entry.id,
        type: "button",
        className: "tw-chip" + (index === activeIndex ? " on" : ""),
        "aria-pressed": index === activeIndex,
        onClick: function () { choose(index); }
      }, entry.label);
    }));

    var stage = h("div", { className: "tw-stage " + (flash || ""), "aria-label": "Tap or wait area" },
      item ? h("button", {
        key: String(item.slot),
        type: "button",
        className: "tw-number" + (item.target ? " target" : "") + (item.tapped ? " tapped" : ""),
        "aria-label": String(item.item),
        onClick: function () { if (gameRef.current) gameRef.current.tap(item); }
      }, String(item.item)) : h("div", { className: "tw-waiting" }, state.phase === "ended" ? "Round complete" : "Get ready…")
    );

    var body = [
      h("div", { key: "top", className: "tw-top" }, topChildren),
      h("div", { key: "rule", className: "tw-rule" }, [
        h("span", { key: "glyph", className: "tw-glyph", "aria-hidden": "true" }, preset.glyph),
        h("div", { key: "words", className: "tw-words" }, [
          h("div", { key: "line", className: "tw-rule-line" + (flash === "wrong" ? " pulse" : "") }, preset.ruleText),
          h("div", { key: "hint", className: "tw-hint" }, preset.hint)
        ])
      ]),
      ribbon,
      stage,
      h("div", { key: "progress", className: "tw-progress" }, [
        h("span", { key: "count" }, progress + " / " + (state.roundLength || 12)),
        h("span", { key: "message" }, state.phase === "ended" ? "Nice looking!" : flash === "wrong" ? "That one can wait." : flash === "missed" ? "It floated away." : "Tap a match, or wait.")
      ])
    ];

    if (state.phase === "ended") {
      body.push(h("div", { key: "finish", className: "tw-finish" }, [
        h("div", { key: "stars", className: "tw-stars" }, "⭐".repeat(Math.max(1, Math.min(3, Math.ceil((state.correct || 0) / Math.max(1, state.roundLength || 12) * 3))))),
        h("div", { key: "copy", className: "tw-finish-copy" }, "You noticed some good ones."),
        h("div", { key: "buttons", className: "tw-finish-buttons" }, [
          h("button", { key: "again", type: "button", className: "tw-finish-button", onClick: again }, "Again"),
          h("button", { key: "harder", type: "button", className: "tw-finish-button primary", disabled: activeIndex >= PRESETS.length - 1, onClick: harder }, "Harder ›")
        ])
      ]));
    }

    return h("div", {
      className: "screen tap-wait-math-screen " + theme,
      style: props.journeyBg ? { "--game-bg": "url('" + props.journeyBg + "')" } : undefined
    }, [h("div", { key: "bg", className: "screen-bg" })].concat(body));
  }

  root.TapWaitMath = { Game: Game, presets: PRESETS, makeConfig: makeConfig };
})(typeof self !== "undefined" ? self : this);
