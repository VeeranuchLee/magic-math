/*
 * Tap / Wait — one small, data-driven game engine.
 *
 * The engine owns the round, the rule decision, the streak, and the timing state.
 * It deliberately does not know what a heart, a number, or a flower is. An app gives
 * it an item pool, a rule, a theme renderer, and feedback/audio hooks. The optional
 * DOM adapter at the bottom is intentionally thin: it turns the current event into
 * buttons and sends taps back to the same engine.
 *
 * This file is the canonical copy. Keep math-app/js/tap-wait-engine.js and
 * tap-wait-app/js/tap-wait-engine.js in sync with scripts/sync-tap-wait-engine.sh.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TapWaitEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var noop = function () {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function isFunction(value) { return typeof value === "function"; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function copyObject(value) {
    var out = {};
    if (value && typeof value === "object") Object.keys(value).forEach(function (key) { out[key] = value[key]; });
    return out;
  }
  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var part = arguments[i];
      if (!part) continue;
      Object.keys(part).forEach(function (key) { out[key] = part[key]; });
    }
    return out;
  }

  /** A small deterministic RNG. A string seed is hashed; no global Math.random is touched. */
  function createRng(seed) {
    var state;
    if (typeof seed === "number" && isFinite(seed)) state = seed >>> 0;
    else {
      var text = seed == null ? "tap-wait" : String(seed);
      state = 2166136261;
      for (var i = 0; i < text.length; i++) {
        state ^= text.charCodeAt(i);
        state = Math.imul(state, 16777619);
      }
      state >>>= 0;
    }
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, values) {
    if (!values || !values.length) throw new Error("TapWaitEngine: itemPool must not be empty");
    return values[Math.floor(rng() * values.length)];
  }

  function evaluateRule(rule, item) {
    if (!isFunction(rule)) return false;
    return !!rule(item);
  }

  function resolvePool(config) {
    var pool = config.itemPool;
    if (isFunction(pool)) pool = pool();
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error("TapWaitEngine: itemPool must contain at least one item");
    }
    return pool;
  }

  function levelFor(config, index) {
    var levels = Array.isArray(config.difficultyLevels) ? config.difficultyLevels : [];
    var level = levels[index] || levels[levels.length - 1] || {};
    if (isFunction(level)) level = level(index);
    level = level || {};
    var active = merge(config, level);
    active.spawn = merge(config.spawn || {}, level.spawn || {});
    active.scoring = merge(config.scoring || {}, level.scoring || {});
    active.feedback = merge(config.feedback || {}, level.feedback || {});
    active.theme = merge(config.theme || {}, level.theme || {});
    active.audio = merge(config.audio || {}, level.audio || {});
    active.difficultyIndex = index;
    return active;
  }

  function normaliseConfig(config) {
    config = config || {};
    var spawn = merge({
      mode: "single",
      slots: null,
      visibleMs: 2200,
      gapMs: 180
    }, config.spawn || {});
    if (spawn.mode !== "single" && spawn.mode !== "positions") {
      throw new Error("TapWaitEngine: spawn.mode must be 'single' or 'positions'");
    }
    var roundLength = Number(config.roundLength == null ? 12 : config.roundLength);
    if (!isFinite(roundLength) || roundLength < 1) throw new Error("TapWaitEngine: roundLength must be positive");
    roundLength = Math.floor(roundLength);

    if (!Array.isArray(config.difficultyLevels) || !config.difficultyLevels.length) {
      config = merge(config, { difficultyLevels: [{}] });
    }
    var first = levelFor(config, 0);
    // Validate the first level early. Later levels are validated when selected.
    resolvePool(first);
    if (!isFunction(first.rule)) throw new Error("TapWaitEngine: rule(item) must be a function");

    return merge({
      itemPool: [],
      rule: noop,
      ruleText: "Tap the right ones!",
      difficultyLevels: [{}],
      scoring: { streak: true, basePoints: 10, streakStep: 2, maxStreakBonus: 10 },
      feedback: {},
      theme: {},
      audio: {}
    }, config, {
      spawn: spawn,
      roundLength: roundLength
    });
  }

  function itemKey(item) {
    if (item && typeof item === "object" && item.id != null) return item.id;
    return item;
  }

  function makeEvent(config, rng, eventIndex) {
    var pool = resolvePool(config);
    var mode = config.spawn.mode;
    var supplied = Array.isArray(config.events) ? config.events[eventIndex] : undefined;
    if (supplied != null) {
      var suppliedItems = Array.isArray(supplied) ? supplied : (Array.isArray(supplied.items) ? supplied.items : [supplied]);
      return {
        index: eventIndex,
        items: suppliedItems.map(function (entry, index) {
          var value = entry && entry.item !== undefined ? entry.item : entry;
          return makeEntry(value, config, mode === "positions" ? (config.spawn.slots || [])[index] : null, index);
        })
      };
    }
    if (mode === "positions") {
      var slots = Array.isArray(config.spawn.slots) && config.spawn.slots.length
        ? config.spawn.slots
        : [0, 1, 2, 3];
      return {
        index: eventIndex,
        items: slots.map(function (slot, index) {
          return makeEntry(pick(rng, pool), config, slot, index);
        })
      };
    }
    return { index: eventIndex, items: [makeEntry(pick(rng, pool), config, null, 0)] };
  }

  function makeEntry(value, config, slot, index) {
    return {
      id: itemKey(value),
      item: value,
      slot: slot == null ? index : slot,
      target: evaluateRule(config.rule, value),
      tapped: false
    };
  }

  function copyEntry(entry) {
    return { id: entry.id, item: entry.item, slot: entry.slot, target: entry.target, tapped: entry.tapped };
  }

  function summaryOf(state) {
    return {
      score: state.score,
      streak: state.streak,
      bestStreak: state.bestStreak,
      correct: state.correct,
      wrong: state.wrong,
      missed: state.missed,
      roundLength: state.roundLength,
      difficultyIndex: state.difficultyIndex
    };
  }

  function Game(config, options) {
    options = options || {};
    this.config = normaliseConfig(config);
    this.options = options;
    this.rng = options.rng || createRng(options.seed != null ? options.seed : this.config.seed);
    var host = typeof globalThis !== "undefined" ? globalThis : this;
    var hostNow = host.performance && typeof host.performance.now === "function"
      ? host.performance.now.bind(host.performance)
      : Date.now;
    this.clock = {
      now: options.now || hostNow,
      /* Bind the host timers before calling them as methods. In browsers, an unbound
         window.setTimeout has the illegal-invocation brand when reached through an
         object; passing the functions through the config keeps custom clocks intact. */
      setTimeout: options.setTimeout || (typeof setTimeout === "function" ? setTimeout.bind(host) : null),
      clearTimeout: options.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout.bind(host) : null)
    };
    this.listeners = [];
    this.timer = null;
    this.sequence = [];
    this.activeConfig = levelFor(this.config, 0);
    this.roundLength = this.activeConfig.roundLength;
    this.difficultyIndex = 0;
    this.state = this.freshState();
    this.auto = options.auto !== false;
    this.mountedView = null;
    this.advanceAt = null;
  }

  Game.prototype.freshState = function () {
    return {
      phase: "idle",
      eventIndex: 0,
      roundLength: this.roundLength,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      wrong: 0,
      missed: 0,
      difficultyIndex: this.difficultyIndex,
      current: null,
      nextAt: null,
      visibleUntil: null,
      lastFeedback: null
    };
  };

  Game.prototype.on = function (event, listener) {
    if (!isFunction(listener)) throw new TypeError("TapWaitEngine: listener must be a function");
    var entry = { event: event, listener: listener };
    this.listeners.push(entry);
    var self = this;
    return function () {
      self.listeners = self.listeners.filter(function (candidate) { return candidate !== entry; });
    };
  };

  Game.prototype.emit = function (event, payload) {
    var detail = merge(payload || {}, { event: event, state: this.getState() });
    this.listeners.slice().forEach(function (entry) {
      if (entry.event === event || entry.event === "*") entry.listener(detail);
    });
    return detail;
  };

  Game.prototype.getState = function () {
    var state = copyObject(this.state);
    state.current = this.state.current ? {
      index: this.state.current.index,
      items: this.state.current.items.map(copyEntry)
    } : null;
    return state;
  };

  Game.prototype.getDifficulty = function () {
    return this.difficultyIndex;
  };

  Game.prototype.setDifficulty = function (index) {
    var levels = Array.isArray(this.config.difficultyLevels) ? this.config.difficultyLevels : [{}];
    var next = clamp(Math.floor(Number(index) || 0), 0, levels.length - 1);
    this.difficultyIndex = next;
    this.activeConfig = levelFor(this.config, next);
    this.roundLength = this.activeConfig.roundLength;
    this.sequence = [];
    this.state.difficultyIndex = next;
    this.state.roundLength = this.roundLength;
    this.emit("difficulty", { index: next, config: this.activeConfig });
    return next;
  };

  Game.prototype.nextDifficulty = function () {
    return this.setDifficulty(Math.min(this.difficultyIndex + 1,
      (this.config.difficultyLevels || [{}]).length - 1));
  };

  Game.prototype.buildSequence = function () {
    var events = [];
    for (var i = 0; i < this.roundLength; i++) events.push(makeEvent(this.activeConfig, this.rng, i));
    this.sequence = events;
    return events;
  };

  Game.prototype.clearTimer = function () {
    if (this.timer != null && this.clock.clearTimeout) this.clock.clearTimeout(this.timer);
    this.timer = null;
  };

  Game.prototype.schedule = function (delay, callback) {
    if (!this.auto || !this.clock.setTimeout) return;
    var self = this;
    this.clearTimer();
    this.timer = this.clock.setTimeout(function () {
      self.timer = null;
      callback();
    }, Math.max(0, delay));
  };

  Game.prototype.start = function (startOptions) {
    startOptions = startOptions || {};
    if (startOptions.difficulty != null) this.setDifficulty(startOptions.difficulty);
    if (startOptions.auto != null) this.auto = startOptions.auto !== false;
    this.clearTimer();
    this.advanceAt = null;
    this.state = this.freshState();
    this.roundLength = this.activeConfig.roundLength;
    this.buildSequence();
    this.state.phase = "showing";
    this.showEvent(this.clock.now());
    return this;
  };

  Game.prototype.restart = function (options) { return this.start(options); };

  Game.prototype.showEvent = function (now) {
    if (this.state.eventIndex >= this.roundLength) {
      this.finishRound(now);
      return;
    }
    var event = this.sequence[this.state.eventIndex];
    event.items.forEach(function (entry) { entry.tapped = false; });
    this.state.current = event;
    this.state.phase = "showing";
    this.state.lastFeedback = null;
    this.state.visibleUntil = now + Math.max(1200, Number(this.activeConfig.spawn.visibleMs) || 2200);
    this.state.nextAt = null;
    this.emit("show", { itemEvent: event, now: now });
    this.emit("change", { now: now });
    var self = this;
    this.schedule(this.state.visibleUntil - now, function () { self.tick(self.clock.now()); });
  };

  Game.prototype.findEntry = function (value) {
    if (!this.state.current) return null;
    var wanted = value && value.item !== undefined && value.target !== undefined ? value : null;
    var entries = this.state.current.items;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (wanted && entry === wanted) return entry;
      if (!wanted && (entry === value || entry.id === value || entry.item === value)) return entry;
      if (wanted && (entry.id === wanted.id || entry.item === wanted.item)) return entry;
    }
    return null;
  };

  Game.prototype.callHook = function (name, payload) {
    var feedback = this.activeConfig.feedback || {};
    var hook = feedback[name];
    if (isFunction(hook)) hook(payload);
    var audio = this.activeConfig.audio || {};
    var audioName = name === "onRoundEnd" ? "roundEnd" : name.replace(/^on/, "").toLowerCase();
    if (isFunction(audio[audioName])) audio[audioName](payload);
  };

  Game.prototype.award = function (entry) {
    var scoring = this.activeConfig.scoring || {};
    var streakEnabled = scoring.streak !== false;
    if (streakEnabled) this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    var base = Number(scoring.basePoints == null ? 10 : scoring.basePoints);
    var step = Number(scoring.streakStep == null ? 2 : scoring.streakStep);
    var maxBonus = Number(scoring.maxStreakBonus == null ? 10 : scoring.maxStreakBonus);
    var bonus = streakEnabled ? Math.min(maxBonus, Math.max(0, this.state.streak - 1) * step) : 0;
    this.state.score += base + bonus;
    this.state.correct += 1;
    var payload = {
      item: entry.item,
      entry: entry,
      correct: true,
      score: this.state.score,
      streak: this.state.streak
    };
    this.callHook("onCorrect", payload);
    this.emit("correct", payload);
    return payload;
  };

  Game.prototype.wrong = function (entry) {
    this.state.wrong += 1;
    this.state.streak = 0;
    this.state.lastFeedback = "wrong";
    var payload = {
      item: entry.item,
      entry: entry,
      correct: false,
      score: this.state.score,
      streak: 0
    };
    this.callHook("onWrong", payload);
    this.emit("wrong", payload);
    this.emit("change", { now: this.clock.now() });
    return payload;
  };

  Game.prototype.missed = function (event) {
    this.state.missed += 1;
    this.state.streak = 0;
    this.state.lastFeedback = "missed";
    var payload = {
      itemEvent: event,
      items: event.items.slice(),
      score: this.state.score,
      streak: 0
    };
    this.callHook("onMissed", payload);
    this.emit("missed", payload);
    return payload;
  };

  Game.prototype.tap = function (value) {
    if (this.state.phase !== "showing" || !this.state.current) return { handled: false, correct: false };
    var entry = this.findEntry(value);
    if (!entry || entry.tapped) return { handled: false, correct: false };
    if (!entry.target) {
      this.wrong(entry);
      return { handled: true, correct: false, entry: entry };
    }
    entry.tapped = true;
    var result = this.award(entry);
    var targets = this.state.current.items.filter(function (candidate) { return candidate.target; });
    if (targets.every(function (candidate) { return candidate.tapped; })) {
      this.resolveEvent("correct", this.clock.now());
    } else {
      this.emit("change", { now: this.clock.now() });
    }
    return { handled: true, correct: true, entry: entry, result: result };
  };

  Game.prototype.waited = function (event) {
    /* A correctly waited non-target is a success, not a miss. This distinction is
       the whole point of tap-or-wait: expiring a distractor must not punish the child
       or break the encouraging streak. */
    this.state.lastFeedback = "waited";
    var payload = { itemEvent: event, items: event.items.slice(), score: this.state.score, streak: this.state.streak };
    this.callHook("onWaited", payload);
    this.emit("waited", payload);
    return payload;
  };

  Game.prototype.resolveEvent = function (reason, now) {
    if (this.state.phase !== "showing") return;
    this.clearTimer();
    this.state.current.resolved = reason;
    this.state.eventIndex += 1;
    this.state.phase = "between";
    this.state.nextAt = now + Math.max(0, Number(this.activeConfig.spawn.gapMs) || 0);
    this.emit("resolve", { reason: reason, now: now });
    this.emit("change", { now: now });
    var self = this;
    if (this.state.eventIndex >= this.roundLength) {
      this.schedule(this.state.nextAt - now, function () { self.tick(self.clock.now()); });
    } else {
      this.schedule(this.state.nextAt - now, function () { self.tick(self.clock.now()); });
    }
  };

  Game.prototype.finishRound = function (now) {
    this.clearTimer();
    this.state.phase = "ended";
    this.state.current = null;
    this.state.nextAt = null;
    this.state.visibleUntil = null;
    var summary = summaryOf(this.state);
    this.callHook("onRoundEnd", summary);
    this.emit("roundEnd", { summary: summary, now: now });
    this.emit("change", { now: now });
    return summary;
  };

  Game.prototype.tick = function (at) {
    var now = at == null ? this.clock.now() : at;
    this.advanceAt = now;
    var guard = 0;
    while (guard++ < 8) {
      if (this.state.phase === "showing" && this.state.visibleUntil != null && now >= this.state.visibleUntil) {
        var event = this.state.current;
        var unresolvedTarget = event.items.some(function (entry) { return entry.target && !entry.tapped; });
        if (unresolvedTarget) {
          this.missed(event);
          this.resolveEvent("missed", now);
        } else {
          this.waited(event);
          this.resolveEvent("waited", now);
        }
        continue;
      }
      if (this.state.phase === "between" && this.state.nextAt != null && now >= this.state.nextAt) {
        if (this.state.eventIndex >= this.roundLength) this.finishRound(now);
        else this.showEvent(now);
        continue;
      }
      break;
    }
    return this.getState();
  };

  Game.prototype.advance = function (milliseconds) {
    var amount = Math.max(0, Number(milliseconds) || 0);
    var base = this.advanceAt == null ? this.clock.now() : this.advanceAt;
    return this.tick(base + amount);
  };

  Game.prototype.stop = function () {
    this.clearTimer();
    this.state.phase = "idle";
    this.emit("change", { now: this.clock.now() });
    return this;
  };

  Game.prototype.destroy = function () {
    this.clearTimer();
    this.listeners = [];
    if (this.mountedView && isFunction(this.mountedView.destroy)) this.mountedView.destroy();
    this.mountedView = null;
  };

  function renderItem(entry, activeConfig, doc) {
    var theme = activeConfig.theme || {};
    var rendered = isFunction(theme.render) ? theme.render(entry.item, entry, activeConfig) : entry.item;
    var element;
    if (rendered && rendered.nodeType === 1) element = rendered;
    else {
      element = doc.createElement("span");
      element.className = "tap-wait-item-label";
      if (rendered && typeof rendered === "object" && rendered.text != null) element.textContent = rendered.text;
      else element.textContent = rendered == null ? "" : String(rendered);
    }
    return element;
  }

  function mount(container, config, options) {
    options = options || {};
    var root = typeof container === "string" ? document.querySelector(container) : container;
    if (!root) throw new Error("TapWaitEngine: mount(container) needs an element");
    var doc = root.ownerDocument || document;
    var game = options.game || new Game(config, options);
    var stage = doc.createElement("div");
    stage.className = "tap-wait-stage";
    stage.setAttribute("data-phase", "idle");
    root.appendChild(stage);

    function render(detail) {
      var state = game.getState();
      stage.setAttribute("data-phase", state.phase);
      stage.setAttribute("data-difficulty", String(state.difficultyIndex));
      while (stage.firstChild) stage.removeChild(stage.firstChild);
      if (state.phase !== "showing" || !state.current) return;
      state.current.items.forEach(function (entry) {
        var button = doc.createElement("button");
        button.type = "button";
        button.className = "tap-wait-item" + (entry.target ? " is-target" : "") + (entry.tapped ? " is-tapped" : "");
        button.setAttribute("data-slot", String(entry.slot));
        button.setAttribute("aria-label", String(entry.item && entry.item.label != null ? entry.item.label : entry.item));
        button.appendChild(renderItem(entry, game.activeConfig, doc));
        button.addEventListener("click", function () { game.tap(entry); });
        stage.appendChild(button);
      });
      if (detail && detail.event) stage.setAttribute("data-last-event", detail.event);
    }

    var off = game.on("*", render);
    render();
    if (options.start !== false) game.start(options);
    var view = {
      game: game,
      element: stage,
      destroy: function () {
        off();
        game.destroy();
        if (stage.parentNode) stage.parentNode.removeChild(stage);
      }
    };
    game.mountedView = view;
    return view;
  }

  var api = {
    version: 1,
    Game: Game,
    createGame: function (config, options) { return new Game(config, options); },
    mount: mount,
    renderItem: renderItem,
    createRng: createRng,
    evaluateRule: evaluateRule,
    levelFor: levelFor,
    normaliseConfig: normaliseConfig,
    makeEvent: makeEvent
  };
  return api;
});
