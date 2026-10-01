/*
 * October homework (ป.2, การบ้านปิดเทอม ตุลาคม) — the worksheet as data.
 *
 * The A–J table is stored ONCE, below. Every one of the 200 questions and its answer is
 * generated from the 20 mission definitions; nothing is typed twice. Pure functions only:
 * no DOM, no storage. A plain script so iPad Safari loads it with no build step; it sets
 * window.OctoberHomework in the browser and module.exports under node (the test in
 * math-app/tools/test-october-homework.mjs requires it).
 */
(function (root) {
  "use strict";

  // แถวที่ 1..10 of the school sheet. J is on the sheet but no งาน uses it; kept anyway.
  var TABLE = {
    A: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
    B: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    C: [112, 125, 231, 342, 454, 563, 678, 786, 857, 911],
    D: [42, 61, 55, 23, 19, 72, 84, 47, 78, 99],
    E: [100, 150, 200, 250, 300, 350, 400, 450, 500, 550],
    F: [245, 978, 368, 746, 679, 987, 795, 897, 699, 789],
    G: [11, 22, 33, 44, 55, 66, 77, 88, 99, 100],
    H: [15, 25, 35, 45, 55, 65, 75, 85, 95, 105],
    I: [133, 297, 371, 463, 578, 679, 798, 898, 985, 999],
    J: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
  };
  var ROWS = 10;

  // งาน 1..20, titles exactly as printed. An expr term is a column letter, a number, or a
  // nested [term, op, term] (the bracketed first step of งาน 19 and 20).
  var MISSIONS = [
    { id: 1, title: "กระจายจำนวนแถว F", kind: "place", col: "F" },
    { id: 2, title: "E + B", kind: "arith", expr: ["E", "+", "B"] },
    { id: 3, title: "B + A", kind: "arith", expr: ["B", "+", "A"] },
    { id: 4, title: "E - B", kind: "arith", expr: ["E", "-", "B"] },
    { id: 5, title: "C + A", kind: "arith", expr: ["C", "+", "A"] },
    { id: 6, title: "เขียนคำอ่านแถว I", kind: "thai", col: "I" },
    { id: 7, title: "D × 2", kind: "arith", expr: ["D", "×", 2] },
    { id: 8, title: "E + A", kind: "arith", expr: ["E", "+", "A"] },
    { id: 9, title: "B × 3", kind: "arith", expr: ["B", "×", 3] },
    { id: 10, title: "B × 5", kind: "arith", expr: ["B", "×", 5] },
    { id: 11, title: "E + D", kind: "arith", expr: ["E", "+", "D"] },
    { id: 12, title: "D × 5", kind: "arith", expr: ["D", "×", 5] },
    { id: 13, title: "F - D", kind: "arith", expr: ["F", "-", "D"] },
    { id: 14, title: "F - H", kind: "arith", expr: ["F", "-", "H"] },
    { id: 15, title: "D + B", kind: "arith", expr: ["D", "+", "B"] },
    { id: 16, title: "D + 10", kind: "arith", expr: ["D", "+", 10] },
    { id: 17, title: "I - C", kind: "arith", expr: ["I", "-", "C"] },
    { id: 18, title: "H × 6", kind: "arith", expr: ["H", "×", 6] },
    { id: 19, title: "( G × 5 ) + 50", kind: "arith", expr: [["G", "×", 5], "+", 50] },
    { id: 20, title: "( D × 6 ) + 50", kind: "arith", expr: [["D", "×", 6], "+", 50] }
  ];

  function termValue(term, row) {
    if (typeof term === "number") return term;
    if (typeof term === "string") return TABLE[term][row - 1];
    return evalExpr(term, row);
  }
  function evalExpr(expr, row) {
    var a = termValue(expr[0], row), b = termValue(expr[2], row);
    if (expr[1] === "+") return a + b;
    if (expr[1] === "-") return a - b;
    if (expr[1] === "×") return a * b;
    throw new Error("unknown operator " + expr[1]);
  }
  var SHOW_OP = { "+": "+", "-": "−", "×": "×" };
  function formatExpr(expr, row) {
    function t(term) {
      if (Array.isArray(term)) return "( " + formatExpr(term, row) + " )";
      return String(termValue(term, row));
    }
    return t(expr[0]) + " " + SHOW_OP[expr[1]] + " " + t(expr[2]);
  }

  // ---- Thai number reading (1..999) ----
  var DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  function tensWord(t) { return t === 1 ? "สิบ" : t === 2 ? "ยี่สิบ" : DIGIT[t] + "สิบ"; }
  function digitsOf(n) { return { h: Math.floor(n / 100), t: Math.floor(n / 10) % 10, o: n % 10 }; }
  function thaiChunks(n) {
    var d = digitsOf(n), out = [];
    if (d.h) out.push(DIGIT[d.h] + "ร้อย");
    if (d.t) out.push(tensWord(d.t));
    if (d.o) out.push(d.o === 1 && d.t ? "เอ็ด" : DIGIT[d.o]);
    return out;
  }
  function thaiReading(n) { return thaiChunks(n).join(""); }

  // Deterministic PRNG so a question always shows the same tiles in the same order.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, seed) {
    var a = list.slice(), r = rng(seed);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), tmp = a[i];
      a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  // Distractors are the mistakes a ป.2 child actually makes, never a second right answer.
  function thaiDistractors(n) {
    var d = digitsOf(n), correct = thaiChunks(n), pool = [];
    if (d.o === 1 && d.t) pool.push("หนึ่ง");          // 371: สามร้อยเจ็ดสิบหนึ่ง
    if (d.t === 2) pool.push("สองสิบ");                 // 297: สองร้อยสองสิบเจ็ด
    if (d.t === 1) pool.push("หนึ่งสิบ");               // 11x: never หนึ่งสิบ
    if (d.o) pool.push(DIGIT[d.o] + "ร้อย");            // digits swapped between places
    if (d.h) pool.push(DIGIT[d.h]);
    if (d.t) pool.push(DIGIT[d.t]);
    var near = d.h === 9 ? 8 : d.h + 1;
    pool.push(DIGIT[near] + "ร้อย");
    pool.push(tensWord(d.t === 9 ? 8 : d.t + 1));
    var out = [];
    for (var i = 0; i < pool.length && out.length < 3; i++) {
      var w = pool[i];
      if (w && correct.indexOf(w) < 0 && out.indexOf(w) < 0) out.push(w);
    }
    return out;
  }

  // ---- Hints (data only; the page renders them) ----
  function repeatedAddition(a, times) {
    var parts = [];
    for (var i = 0; i < times; i++) parts.push(a);
    return parts.join(" + ");
  }
  function arithHint(expr, row) {
    if (Array.isArray(expr[0])) {
      var inner = expr[0], innerVal = evalExpr(inner, row);
      return {
        type: "step",
        first: formatExpr(inner, row) + " = " + innerVal,
        then: innerVal + " " + SHOW_OP[expr[1]] + " " + termValue(expr[2], row) + " = ?"
      };
    }
    var a = termValue(expr[0], row), b = termValue(expr[2], row);
    if (expr[1] === "×") return { type: "repeat", text: a + " × " + b + " = " + repeatedAddition(a, b) };
    if (expr[1] === "+" && expr[2] === 10) return { type: "ten", a: a, b: b, op: "+" };
    return { type: "column", a: a, b: b, op: SHOW_OP[expr[1]] };
  }

  // ---- The 200 questions ----
  function buildQuestions(mission) {
    var qs = [];
    for (var row = 1; row <= ROWS; row++) {
      var q = { id: mission.id + "-" + row, mission: mission.id, row: row, kind: mission.kind };
      if (mission.kind === "arith") {
        q.prompt = formatExpr(mission.expr, row);
        q.answer = evalExpr(mission.expr, row);
        q.hint = arithHint(mission.expr, row);
      } else if (mission.kind === "place") {
        var n = TABLE[mission.col][row - 1], d = digitsOf(n);
        q.target = n;
        q.answer = n;
        q.parts = { h: d.h, t: d.t, o: d.o };
        q.expanded = n + " = " + [d.h * 100, d.t * 10, d.o].filter(Boolean).join(" + ");
      } else if (mission.kind === "thai") {
        var m = TABLE[mission.col][row - 1], chunks = thaiChunks(m);
        q.target = m;
        q.chunks = chunks;
        q.answer = chunks.join("");
        q.tiles = shuffle(chunks.concat(thaiDistractors(m)), mission.id * 1000 + row * 37 + m);
      }
      qs.push(q);
    }
    return qs;
  }
  var ALL = MISSIONS.map(function (m) {
    return { id: m.id, title: m.title, kind: m.kind, questions: buildQuestions(m) };
  });

  var api = {
    TABLE: TABLE, ROWS: ROWS, MISSIONS: MISSIONS, ALL: ALL,
    evalExpr: evalExpr, formatExpr: formatExpr, buildQuestions: buildQuestions,
    thaiChunks: thaiChunks, thaiReading: thaiReading, thaiDistractors: thaiDistractors,
    shuffle: shuffle, arithHint: arithHint
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OctoberHomework = api;
})(typeof window !== "undefined" ? window : this);
