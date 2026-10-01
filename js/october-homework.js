/*
 * October homework (ป.2) — the page. Three interaction types only:
 *   งาน 1  place value: tap ร้อย / สิบ / หน่วย pieces to build the F number
 *   งาน 6  Thai reading: tap word chunks in order to build the I number's reading
 *   others one keypad screen for +, −, ×, +10 and the bracketed two-step งาน 19 and 20
 * All questions come from js/october-homework-data.js. No audio files, no drag, no locking:
 * the child (or the parent) opens any งาน in any order. A wrong answer is never marked red;
 * it nudges, then hints at two tries, then shows the answer at three, and the child still
 * types it so every one of the 200 gets an answer.
 */
(function () {
  "use strict";
  var H = window.OctoberHomework;
  var params = new URLSearchParams(location.search);
  var THEME = params.get("theme") === "unicorn" ? "unicorn" : "space";
  var STORE_KEY = "cg.octoberHomework.v1"; // one key for both themes

  var ART = {
    space: {
      bg: "assets-runtime/space/bg-galaxy.webp",
      happy: "assets-runtime/space/icons/robot-reader-talk.webp",
      think: "assets-runtime/space/icons/robot-reader.webp",
      star: "assets-runtime/space/icons/star.webp",
      back: "../children-apps/",
      other: "unicorn", otherIcon: "assets-runtime/unicorn/icons/unicorn-happy.webp",
      stops: ["earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "venus", "mercury", "sun",
        "comet", "rocket", "satellite", "asteroid", "orb-blue", "orb-purple", "crystal-cyan", "gem-green",
        "diamond-gold", "trophy"].map(function (n) { return "assets-runtime/space/icons/" + n + ".webp"; })
    },
    unicorn: {
      bg: "assets-runtime/unicorn/bg-home.webp",
      happy: "assets-runtime/unicorn/icons/unicorn-happy.webp",
      think: "assets-runtime/unicorn/icons/unicorn-sit.webp",
      star: "assets-runtime/unicorn/icons/star.webp",
      back: "../children-apps/",
      other: "space", otherIcon: "assets-runtime/space/icons/rocket.webp",
      stops: ["flower-pink", "flower-blue", "flower-coral", "flower-purple", "flower-yellow", "heart-pink",
        "heart-purple", "heart-yellow", "cloud-blue", "cloud-pink", "rainbow", "bouquet", "heart-gem", "crown",
        "petal-pink", "petal-purple", "petal-yellow", "star-purple", "unicorn-flower", "sparkle"]
        .map(function (n) { return "assets-runtime/unicorn/icons/" + n + ".webp"; })
    }
  }[THEME];

  var PRAISE = ["เก่งมาก!", "ถูกต้อง!", "เยี่ยมเลย!", "สุดยอด!", "ถูกแล้ว เก่งจัง!"];
  var PLACE_NAME = { h: "ร้อย", t: "สิบ", o: "หน่วย" };

  // ---------- progress (private-mode Safari can throw on any access) ----------
  function loadProgress() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (p && p.done && typeof p.done === "object") return p;
    } catch (e) { /* storage unavailable: play on without saving */ }
    return { v: 1, done: {} };
  }
  function saveProgress() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }
  var progress = loadProgress();

  function isDone(q) { return !!progress.done[q.id]; }
  function doneCount(m) { return m.questions.filter(isDone).length; }
  function totalDone() { return H.ALL.reduce(function (s, m) { return s + doneCount(m); }, 0); }
  function missionById(id) { return H.ALL[id - 1]; }

  // ---------- state ----------
  var state = {
    screen: "map", missionId: 1, qi: 0,
    tries: 0, input: "", built: [], picked: 0, misses: 0,
    mood: "idle", bubble: "", solved: false, missionDone: false, resetArmed: false
  };
  var resetTimer = null;

  function freshQuestion() {
    state.tries = 0; state.input = ""; state.built = []; state.picked = 0; state.misses = 0;
    state.mood = "idle"; state.solved = false;
    var q = currentQ();
    if (isDone(q)) { state.solved = true; state.bubble = "ข้อนี้ทำแล้ว"; return; }
    state.bubble = q.kind === "arith" ? "ทำในสมุด แล้วกดคำตอบ"
      : q.kind === "place" ? "กดบล็อกให้ได้ " + q.target
      : "แตะคำอ่านทีละส่วน เริ่มจากหลักร้อย";
  }
  function currentMission() { return missionById(state.missionId); }
  function currentQ() { return currentMission().questions[state.qi]; }
  function firstOpen(m, from) {
    for (var k = 0; k < m.questions.length; k++) {
      var i = (from + k) % m.questions.length;
      if (!isDone(m.questions[i])) return i;
    }
    return -1;
  }
  function openMission(id, qi) {
    var m = missionById(id);
    state.screen = "mission"; state.missionId = id; state.missionDone = false;
    state.qi = qi != null ? qi : Math.max(0, firstOpen(m, 0));
    // A finished mission opens on its "done" card, which offers ทำงานนี้ใหม่ (redo this one).
    if (qi == null && firstOpen(m, 0) < 0) state.missionDone = true;
    freshQuestion(); render();
    window.scrollTo(0, 0);
  }
  function nextMissionId() {
    for (var k = 1; k <= H.ALL.length; k++) {
      var id = ((state.missionId - 1 + k) % H.ALL.length) + 1;
      if (doneCount(missionById(id)) < 10) return id;
    }
    return 0;
  }

  // ---------- tiny chime on a right answer (WebAudio, no files) ----------
  var audioCtx = null;
  function chime() {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      audioCtx = audioCtx || new A();
      [660, 880].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.12;
        o.type = "sine"; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.32);
      });
    } catch (e) { /* silent is fine */ }
  }

  function solve(q, answer) {
    progress.done[q.id] = { a: answer };
    saveProgress();
    state.solved = true; state.mood = "happy";
    state.bubble = state.tries >= 3 ? "ถูกแล้ว! จำวิธีนี้ไว้นะ" : PRAISE[(q.row + q.mission) % PRAISE.length];
    chime();
  }
  function goNext() {
    var m = currentMission(), i = firstOpen(m, state.qi + 1);
    if (i < 0) { state.missionDone = true; state.mood = "happy"; render(); return; }
    state.qi = i; freshQuestion(); render();
  }

  // ---------- keypad ----------
  function press(key) {
    var q = currentQ();
    if (state.solved || q.kind !== "arith") return;
    if (key === "del") { state.input = state.input.slice(0, -1); render(); return; }
    if (key === "ok") { check(); return; }
    if (state.input.length >= 4) return;
    state.input = (state.input === "0" ? "" : state.input) + key;
    render();
  }
  function check() {
    var q = currentQ();
    if (!state.input) return;
    if (Number(state.input) === q.answer) { solve(q, q.answer); render(); return; }
    state.tries++; state.input = ""; state.mood = "think";
    state.bubble = state.tries === 1 ? "ลองอีกครั้งนะ" : state.tries === 2 ? "ลองดูวิธีนี้นะ" : "คำตอบคือ " + q.answer + " ลองพิมพ์ดูนะ";
    render(); nudge(".answer");
  }

  // ---------- place value ----------
  function counts(list) {
    var c = { h: 0, t: 0, o: 0 };
    list.forEach(function (p) { c[p]++; });
    return c;
  }
  function addPiece(p) {
    var q = currentQ();
    if (state.solved) return;
    var c = counts(state.built);
    if (c[p] >= 9) { nudge('[data-piece="' + p + '"]'); return; }
    state.built.push(p); c[p]++;
    if (c.h === q.parts.h && c.t === q.parts.t && c.o === q.parts.o) {
      solve(q, q.target); render(); return;
    }
    if (c[p] > q.parts[p]) {
      state.tries++; state.mood = "think";
      state.bubble = "หลัก" + PLACE_NAME[p] + "มีเกินแล้ว กด ↶ ย้อน นะ";
    } else if (state.mood === "think") {
      state.mood = "idle"; state.bubble = "กดบล็อกให้ได้ " + q.target;
    }
    render();
  }
  function undoPiece() {
    if (state.solved || !state.built.length) return;
    state.built.pop(); state.mood = "idle"; state.bubble = "กดบล็อกให้ได้ " + currentQ().target;
    render();
  }

  // ---------- Thai reading ----------
  function pickTile(idx, el) {
    var q = currentQ();
    if (state.solved) return;
    if (q.tiles[idx] === q.chunks[state.picked] && !el.classList.contains("used")) {
      state.picked++;
      if (state.picked === q.chunks.length) solve(q, q.answer);
      else if (state.mood === "think") { state.mood = "idle"; state.bubble = "ใช่แล้ว ต่อเลย"; }
      render(); return;
    }
    state.misses++;
    if (state.misses >= 2) {
      state.tries = Math.max(state.tries, 2); state.mood = "think";
      state.bubble = "อ่านจากหลักร้อย ไปหลักสิบ แล้วหลักหน่วย";
      render();
      el = document.querySelector('[data-tile="' + idx + '"]');
    }
    if (el) wiggle(el);
  }

  function wiggle(el) {
    el.classList.remove("wiggle"); void el.offsetWidth; el.classList.add("wiggle");
  }
  function nudge(sel) { var el = document.querySelector(sel); if (el) wiggle(el); }

  // ---------- rendering ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dots(m) {
    return '<span class="dots">' + m.questions.map(function (q) {
      return '<i class="' + (isDone(q) ? "on" : "") + '"></i>';
    }).join("") + "</span>";
  }
  function buddy() {
    var src = state.mood === "think" ? ART.think : ART.happy;
    return '<div class="buddy ' + state.mood + '"><img src="' + src + '" alt="">' +
      '<div class="bubble">' + esc(state.bubble) + "</div></div>";
  }

  function mapCols() { return window.innerWidth > window.innerHeight ? 5 : 4; }
  var renderedCols = 0;

  function renderMap() {
    var cols = mapCols(), rows = Math.ceil(H.ALL.length / cols), pts = [];
    renderedCols = cols;
    var stops = H.ALL.map(function (m, i) {
      var r = Math.floor(i / cols), c = r % 2 === 0 ? i % cols : cols - 1 - (i % cols);
      pts.push((c + 0.5) + "," + (r + 0.5));
      var n = doneCount(m), complete = n === 10;
      return '<button class="stop' + (complete ? " complete" : "") + '" data-act="open" data-id="' + m.id +
        '" style="grid-row:' + (r + 1) + ";grid-column:" + (c + 1) + '" aria-label="งาน ' + m.id + " " + esc(m.title) + " ทำแล้ว " + n + ' ข้อ">' +
        '<span class="stop-icon"><img src="' + ART.stops[i] + '" alt="">' +
        (complete ? '<img class="badge" src="' + ART.star + '" alt="">' : "") + "</span>" +
        '<span class="stop-num">งาน ' + m.id + "</span>" +
        '<span class="stop-title">' + esc(m.title) + "</span>" + dots(m) + "</button>";
    }).join("");
    var all = totalDone();
    return '<header class="bar">' +
      '<a class="round" href="' + ART.back + '" aria-label="กลับ">←</a>' +
      '<h1 class="title">การบ้านปิดเทอม ป.2 <small>ตุลาคม</small></h1>' +
      '<span class="count"><img src="' + ART.star + '" alt="">' + all + " / 200</span>" +
      '<a class="round swap" href="?theme=' + ART.other + '" aria-label="เปลี่ยนธีม"><img src="' + ART.otherIcon + '" alt=""></a>' +
      "</header>" +
      '<p class="note"><b>** จงแสดงวิธีทำลงในสมุดและลอกโจทย์ทุกครั้ง</b><span>ทำในสมุดก่อน แล้วมาเช็กคำตอบที่นี่</span></p>' +
      (all === 200 ? '<p class="note all-done">ทำครบ 200 ข้อแล้ว เก่งที่สุดเลย!</p>' : "") +
      // Owner 2026-10-01: "make clear all button ... so kids can redo" -- in plain sight under the
      // counter instead of below all 20 stops; still two taps so a stray tap cannot wipe the work.
      '<div class="clear-row"><button class="reset' + (state.resetArmed ? " armed" : "") + '" data-act="reset">' +
      (state.resetArmed ? "แตะอีกครั้ง เพื่อล้างทั้งหมด" : "ล้างทั้งหมด ทำใหม่") + "</button></div>" +
      '<div class="map" style="grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:repeat(' + rows + ',auto)">' +
      '<svg class="path" viewBox="0 0 ' + cols + " " + rows + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts.join(" ") + '"/></svg>' + stops + "</div>" +
      '';
  }

  function columnHint(a, b, op) {
    var w = Math.max(String(a).length, String(b).length);
    var heads = ["พัน", "ร้อย", "สิบ", "หน่วย"].slice(4 - w);
    function cells(n) {
      var s = String(n); while (s.length < w) s = " " + s;
      return s.split("").map(function (d) { return "<span>" + (d === " " ? "" : d) + "</span>"; }).join("");
    }
    var g = 'style="grid-template-columns:2ch repeat(' + w + ',3ch)"';
    return '<div class="col-hint" ' + g + "><span></span>" + heads.map(function (h) { return "<em>" + h + "</em>"; }).join("") +
      "<span></span>" + cells(a) + "<span>" + op + "</span>" + cells(b) + '<hr style="grid-column:1/-1"></div>';
  }
  function hintHtml(q) {
    var h = q.hint;
    if (h.type === "column") return columnHint(h.a, h.b, h.op) + "<p>ตั้งหลักให้ตรงกัน คิดหลักหน่วยก่อน</p>";
    if (h.type === "ten") return columnHint(h.a, h.b, "+") + "<p>บวก 10 หลักสิบเพิ่ม 1 หลักหน่วยเท่าเดิม</p>";
    if (h.type === "repeat") return "<p>การคูณคือการบวกซ้ำ</p><p class='big-hint'>" + esc(h.text) + "</p>";
    return "<p>ทำในวงเล็บก่อน</p><p class='big-hint'>" + esc(h.first) + "</p><p class='big-hint'>" + esc(h.then) + "</p>";
  }

  function arithCard(q) {
    var shown = state.solved ? String(q.answer) : state.input;
    var body = '<div class="sum"><span class="expr">' + esc(q.prompt) + ' =</span> <span class="answer' +
      (state.solved ? " right" : "") + '">' + (shown || "&nbsp;") + "</span></div>";
    if (!state.solved && state.tries >= 2) body += '<div class="hint">' + hintHtml(q) + "</div>";
    return body;
  }
  function arithPad() {
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];
    return '<div class="keypad">' + keys.map(function (k) {
      var label = k === "del" ? "⌫" : k === "ok" ? "ตกลง" : k;
      var aria = k === "del" ? ' aria-label="ลบ"' : "";
      return '<button class="key k-' + k + '" data-act="key" data-k="' + k + '"' + aria + (state.solved ? " disabled" : "") + ">" + label + "</button>";
    }).join("") + "</div>";
  }

  function blocks(kind, n) {
    var out = "";
    for (var i = 0; i < n; i++) out += '<i class="blk ' + kind + '"></i>';
    return out;
  }
  function placeCard(q) {
    var c = state.solved ? q.parts : counts(state.built);
    var value = c.h * 100 + c.t * 10 + c.o;
    var parts = [c.h * 100, c.t * 10, c.o].filter(Boolean);
    var body = '<div class="sum"><span class="expr">สร้างจำนวน</span> <span class="answer target">' + q.target + "</span></div>" +
      '<div class="tray">' +
      ["h", "t", "o"].map(function (p) {
        return '<div class="place p-' + p + '"><em>' + PLACE_NAME[p] + " " + c[p] + "</em><div class=\"blks\">" + blocks(p, c[p]) + "</div></div>";
      }).join("") + "</div>" +
      '<p class="built">' + (state.solved ? esc(q.expanded) : value + (parts.length > 1 ? " = " + parts.join(" + ") : "")) + "</p>";
    if (!state.solved && state.tries >= 2) {
      body += '<div class="hint"><p class="big-hint">' + q.target + " มี " + q.parts.h + " ร้อย " + q.parts.t + " สิบ " + q.parts.o + " หน่วย</p></div>";
    }
    return body;
  }
  function placePad() {
    var dis = state.solved ? " disabled" : "";
    return '<div class="pieces">' +
      ["h", "t", "o"].map(function (p) {
        return '<button class="piece p-' + p + '" data-act="piece" data-piece="' + p + '"' + dis + '><i class="blk ' + p + '"></i>+ ' + PLACE_NAME[p] + "</button>";
      }).join("") +
      '<button class="piece undo" data-act="undo"' + dis + ">↶ ย้อน</button></div>";
  }

  function thaiCard(q) {
    var slots = q.chunks.map(function (ch, i) {
      return '<span class="slot' + (i < state.picked || state.solved ? " filled" : "") + '">' + (i < state.picked || state.solved ? esc(ch) : "&nbsp;") + "</span>";
    }).join("");
    var body = '<div class="sum"><span class="expr">เขียนคำอ่าน</span> <span class="answer target">' + q.target + "</span></div>" +
      '<div class="reading">' + slots + "</div>";
    if (state.solved) body += '<p class="built">' + q.target + " อ่านว่า " + esc(q.answer) + "</p>";
    return body;
  }
  function thaiPad(q) {
    if (state.solved) return ""; // the reading is built; leftover tiles would only distract
    var nextIdx = -1;
    if (!state.solved && state.misses >= 2) nextIdx = q.tiles.indexOf(q.chunks[state.picked]);
    return '<div class="tiles">' + q.tiles.map(function (t, i) {
      var used = state.solved ? q.chunks.indexOf(t) >= 0 : q.chunks.slice(0, state.picked).indexOf(t) >= 0;
      return '<button class="tile' + (used ? " used" : "") + (i === nextIdx ? " glow" : "") + '" data-act="tile" data-tile="' + i + '"' +
        (used || state.solved ? " disabled" : "") + ">" + esc(t) + "</button>";
    }).join("") + "</div>";
  }

  function renderMission() {
    var m = currentMission(), q = currentQ();
    var nav = m.questions.map(function (x, i) {
      return '<button class="qdot' + (isDone(x) ? " on" : "") + (i === state.qi ? " here" : "") + '" data-act="goq" data-i="' + i +
        '" aria-label="ข้อ ' + (i + 1) + '">' + (i + 1) + "</button>";
    }).join("");
    var card = q.kind === "arith" ? arithCard(q) : q.kind === "place" ? placeCard(q) : thaiCard(q);
    var pad = q.kind === "arith" ? arithPad() : q.kind === "place" ? placePad() : thaiPad(q);
    // Owner 2026-10-01: "add 'clear' on each question too" -- empties what the child built on this
    // question and, if it was already answered, reopens it so it can be done again.
    pad += '<button class="clear-q" data-act="clearq">ล้างข้อนี้</button>';
    var next = state.solved ? '<button class="next" data-act="next">ข้อต่อไป →</button>' : "";
    var html = '<header class="bar">' +
      '<button class="round" data-act="map" aria-label="แผนที่">←</button>' +
      '<h1 class="title">งาน ' + m.id + " <small>" + esc(m.title) + "</small></h1>" +
      '<span class="count">' + doneCount(m) + " / 10</span></header>" +
      '<nav class="qnav">' + nav + "</nav>" +
      '<div class="play kind-' + q.kind + '">' +
      '<div class="card">' + buddy() + '<p class="row">แถวที่ ' + q.row + "</p>" + card + next + "</div>" +
      '<div class="pad">' + pad + "</div></div>";
    if (state.missionDone) {
      var nid = nextMissionId();
      html += '<div class="done-cover"><div class="done-box"><img src="' + ART.star + '" alt="">' +
        "<h2>งาน " + m.id + " เสร็จแล้ว!</h2><p>" + totalDone() + " / 200</p>" +
        (nid ? '<button class="next" data-act="open" data-id="' + nid + '">ไปงาน ' + nid + " →</button>" : "<p>ทำครบทุกงานแล้ว!</p>") +
        '<button class="ghost" data-act="redo" data-id="' + m.id + '">ทำงานนี้ใหม่</button>' +
        '<button class="ghost" data-act="map">แผนที่</button></div></div>';
    }
    return html;
  }

  function render() {
    var app = document.getElementById("app");
    app.className = "oh theme-" + THEME + " screen-" + state.screen;
    app.style.backgroundImage = "url('" + ART.bg + "')";
    app.innerHTML = state.screen === "map" ? renderMap() : renderMission();
  }

  // ---------- events (one delegated listener; survives every re-render) ----------
  document.getElementById("app").addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    if (act === "open") openMission(Number(el.getAttribute("data-id")));
    else if (act === "map") { state.screen = "map"; state.missionDone = false; render(); window.scrollTo(0, 0); }
    else if (act === "goq") { state.qi = Number(el.getAttribute("data-i")); freshQuestion(); render(); }
    else if (act === "key") press(el.getAttribute("data-k"));
    else if (act === "next") goNext();
    else if (act === "piece") addPiece(el.getAttribute("data-piece"));
    else if (act === "undo") undoPiece();
    else if (act === "tile") pickTile(Number(el.getAttribute("data-tile")), el);
    else if (act === "clearq") {
      var cq = currentQ();
      if (progress.done[cq.id]) { delete progress.done[cq.id]; saveProgress(); }
      freshQuestion(); render();
    }
    else if (act === "redo") {
      var rm = missionById(Number(el.getAttribute("data-id")));
      rm.questions.forEach(function (q) { delete progress.done[q.id]; });
      saveProgress(); openMission(rm.id, 0);
    }
    else if (act === "reset") {
      if (!state.resetArmed) {
        state.resetArmed = true; render();
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () { state.resetArmed = false; if (state.screen === "map") render(); }, 4000);
      } else {
        clearTimeout(resetTimer); state.resetArmed = false;
        progress = { v: 1, done: {} }; saveProgress(); render();
      }
    }
  });
  document.addEventListener("keydown", function (e) {
    if (state.screen !== "mission" || state.missionDone) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("del");
    else if (e.key === "Enter") { if (state.solved) goNext(); else press("ok"); }
  });
  window.addEventListener("resize", function () {
    if (state.screen === "map" && mapCols() !== renderedCols) render();
  });

  render();
  window.__octoberHomework = { state: state, progress: function () { return progress; }, H: H };
})();
