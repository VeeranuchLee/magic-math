/* Ask & Answer pure rules. Kept outside the JSX so the shipped page and Node check
   execute the same parser, whole-number gate, player scoring and save validation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AskAnswerLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const OPS = ["+", "−", "×", "÷"];
  const MAX_DIGITS = 4;
  const MAX_PLAYERS = 4;
  const SMALL_PER_BIG = 10;
  const MAX_BIG_STICKERS = 10;
  const SCORE_PER_SPECIAL = MAX_BIG_STICKERS * SMALL_PER_BIG;
  const SPECIAL_DESIGNS = 10;
  const DEFAULT_PLAYERS = [
    { id: "p1", name: "", score: 0 },
    { id: "p2", name: "", score: 0 }
  ];

  function cleanTokens(tokens) {
    if (!Array.isArray(tokens)) return null;
    const clean = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (i % 2 === 0) {
        const text = String(token);
        if (!/^\d+$/.test(text) || text.length > MAX_DIGITS) return null;
        clean.push(text);
      } else {
        if (!OPS.includes(token)) return null;
        clean.push(token);
      }
    }
    return clean.length && clean.length % 2 === 1 ? clean : null;
  }

  function compute(tokens) {
    const clean = cleanTokens(tokens);
    if (!clean) return { ok: false, reason: "unfinished" };
    const values = clean.filter((_, i) => i % 2 === 0).map(BigInt);
    const fraction = value => ({ numerator: value, denominator: 1n });
    const multiply = (left, right) => ({
      numerator: left.numerator * right.numerator,
      denominator: left.denominator * right.denominator
    });
    const divide = (left, right) => ({
      numerator: left.numerator * right.denominator,
      denominator: left.denominator * right.numerator
    });
    const add = (left, right, sign) => ({
      numerator: left.numerator * right.denominator + sign * right.numerator * left.denominator,
      denominator: left.denominator * right.denominator
    });
    const workValues = [fraction(values[0])];
    const workOps = [];
    for (let i = 1; i < clean.length; i += 2) {
      const op = clean[i], value = fraction(BigInt(clean[i + 1]));
      if (op === "×" || op === "÷") {
        const left = workValues.pop();
        if (op === "÷" && value.numerator === 0n) return { ok: false, reason: "divide-zero" };
        workValues.push(op === "×" ? multiply(left, value) : divide(left, value));
      } else {
        workOps.push(op);
        workValues.push(value);
      }
    }
    let result = workValues[0];
    workOps.forEach((op, index) => { result = add(result, workValues[index + 1], op === "+" ? 1n : -1n); });
    if (result.numerator % result.denominator !== 0n) return { ok: false, reason: "not-whole" };
    const whole = result.numerator / result.denominator;
    if (whole < 0n) return { ok: false, reason: "negative" };
    return { ok: true, value: String(whole), tokens: clean };
  }

  function normalisePlayers(value) {
    const raw = value && Array.isArray(value.players) ? value.players : DEFAULT_PLAYERS;
    const seen = new Set();
    const players = raw.slice(0, MAX_PLAYERS).map((player, index) => {
      let id = typeof player.id === "string" && /^p\d+$/.test(player.id) ? player.id : `p${index + 1}`;
      while (seen.has(id)) id = `p${index + 1}-${seen.size}`;
      seen.add(id);
      const rawScore = Number.isSafeInteger(player.score) && player.score >= 0 ? player.score : 0;
      const savedCollection = Array.isArray(player.collection)
        ? player.collection.filter(value => Number.isInteger(value) && value >= 0 && value < SPECIAL_DESIGNS).slice(0, SPECIAL_DESIGNS)
        : Array.from({ length: Math.min(Math.floor(rawScore / SCORE_PER_SPECIAL), SPECIAL_DESIGNS) }, (_, design) => design);
      return {
        id,
        name: typeof player.name === "string" ? Array.from(player.name).slice(0, 10).join("") : "",
        score: rawScore % SCORE_PER_SPECIAL,
        collection: savedCollection
      };
    });
    while (players.length < 2) players.push({ ...DEFAULT_PLAYERS[players.length], collection: [] });
    const selectedId = players.some(player => player.id === value?.selectedId) ? value.selectedId : players[0].id;
    return { version: 1, players, selectedId };
  }

  function scoreSelected(state) {
    const clean = normalisePlayers(state);
    return { ...clean, players: clean.players.map(player => {
      if (player.id !== clean.selectedId) return player;
      const nextScore = player.score + 1;
      if (nextScore < SCORE_PER_SPECIAL) return { ...player, score: nextScore };
      const collection = player.collection.length < SPECIAL_DESIGNS
        ? [...player.collection, player.collection.length]
        : player.collection;
      return { ...player, score: 0, collection };
    }) };
  }

  function isCollectionComplete(player) {
    return !!player && Array.isArray(player.collection) && player.collection.length >= SPECIAL_DESIGNS;
  }

  function stickersForScore(score) {
    const safe = Number.isSafeInteger(score) && score >= 0 ? score % SCORE_PER_SPECIAL : 0;
    return {
      big: Math.floor(safe / SMALL_PER_BIG),
      small: safe % SMALL_PER_BIG
    };
  }

  function resetScores(state) {
    const clean = normalisePlayers(state);
    return { ...clean, players: clean.players.map(player => ({ ...player, score: 0 })) };
  }

  function emptyCollections(state) {
    const clean = normalisePlayers(state);
    return { ...clean, players: clean.players.map(player => ({ ...player, collection: [] })) };
  }

  return { OPS, MAX_DIGITS, MAX_PLAYERS, SMALL_PER_BIG, MAX_BIG_STICKERS, SCORE_PER_SPECIAL, SPECIAL_DESIGNS, DEFAULT_PLAYERS, cleanTokens, compute, normalisePlayers, scoreSelected, isCollectionComplete, stickersForScore, resetScores, emptyCollections };
});
