(function () {
  "use strict";

  var KEY = "nonogram.v1";
  var LEVEL_MODEL = "campaign";
  var app = document.getElementById("app");
  var live = document.getElementById("live");

  if (!window.Nono || !window.NonoPuzzles) {
    app.textContent = "脚本没有载入，数织打不开。";
    return;
  }

  var built;
  try {
    built = window.NonoPuzzles.map(window.Nono.buildPuzzle);
  } catch (err) {
    app.textContent = "题面有误：" + err.message;
    return;
  }

  var byId = {};
  built.forEach(function (p) { byId[p.id] = p; });

  var order = [];
  ["入门", "进阶", "挑战"].forEach(function (name) {
    built.forEach(function (p) {
      if (p.difficulty === name) order.push(p);
    });
  });

  var save = loadSave();
  var state = {
    view: "home",
    puzzle: null,
    cells: [],
    tool: "fill",
    seconds: 0,
    hints: 3,
    history: [],
    future: [],
    won: false,
    started: false,
    timer: null,
    tickAt: 0,
    sound: !!save.sound,
    audio: null,
    axis: -1,
    pointerId: null,
    dragKind: null,
    dragBefore: null,
    cursor: 0,
    toastTimer: 0,
    panMode: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    pointers: {},
    gesture: null,
    pinch: null,
    panLast: null,
    adPending: null,
    adSeq: 0,
    coloring: false,
    colorTimer: 0,
    colorTimer2: 0,
    zoomMax: 3
  };
  var EMPTY_LEVEL = { highestCleared: 0, clearedCount: 0, currentLevel: 0 };
  var levelSync = {
    queryId: "",
    saveId: "",
    known: null,
    blocked: false,
    dirty: false,
    saveRetries: 0,
    queryRetries: 0
  };
  var requestSerial = 0;

  boot();

  function loadSave() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { sound: false, puzzles: {} };
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return { sound: false, puzzles: {} };
      data.puzzles = data.puzzles && typeof data.puzzles === "object" ? data.puzzles : {};
      data.sound = !!data.sound;
      return data;
    } catch (e) {
      return { sound: false, puzzles: {} };
    }
  }

  function writeSave() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
  }

  function hintAllowance(size) {
    if (size <= 5) return 3;
    if (size <= 10) return 4;
    if (size <= 15) return 5;
    if (size <= 20) return 7;
    if (size <= 30) return 10;
    if (size <= 40) return 14;
    return 18;
  }

  function pack(cells) { return cells.join(""); }

  function unpack(value, n) {
    if (typeof value !== "string" || value.length !== n || /[^012]/.test(value)) {
      return new Array(n).fill(0);
    }
    return value.split("").map(Number);
  }

  function formatTime(total) {
    var s = Math.max(0, Math.floor(total));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  function same(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function recordOf(id) {
    return save.puzzles[id] || null;
  }

  function statusOf(id) {
    var rec = recordOf(id);
    if (!rec) return "fresh";
    if (rec.cleared || rec.best != null) return "done";
    var puzzle = byId[id];
    var cells = unpack(rec.cells, puzzle.size * puzzle.size);
    if (rec.won && window.Nono.isSolved(cells, puzzle.solutionFlat)) return "done";
    var ink = cells.some(function (v) { return v !== 0; });
    if (ink || rec.seconds > 0) return "mid";
    return "fresh";
  }

  function tallyDone() {
    var n = 0;
    order.forEach(function (p) { if (statusOf(p.id) === "done") n += 1; });
    return n;
  }

  function orderIndex(id) {
    for (var i = 0; i < order.length; i++) if (order[i].id === id) return i;
    return -1;
  }

  function frontier() {
    for (var i = 0; i < order.length; i++) {
      if (statusOf(order[i].id) !== "done") return i;
    }
    return order.length;
  }

  function isUnlocked(id) {
    var i = orderIndex(id);
    return i >= 0 && i <= frontier();
  }

  function boot() {
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("contextmenu", function (e) {
      if (e.target.closest && e.target.closest("#grid")) e.preventDefault();
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", function () {
      if (state.view === "play") persistProgress();
      pushLevelProgress();
    });
    window.addEventListener("resize", onResize);

    var initial = location.hash.replace(/^#/, "");
    if (initial && byId[initial] && isUnlocked(initial)) {
      history.replaceState({ view: "play", id: initial, root: true }, "", "#" + initial);
      openPuzzle(initial, true);
    } else {
      history.replaceState({ view: "home" }, "", location.pathname + location.search);
      goHome(true);
      if (initial && byId[initial]) toast("先完成上一题。");
    }
  }

  function onPop() {
    var entry = history.state;
    if (entry && entry.view === "settings") {
      openSettings(true);
      return;
    }
    var id = location.hash.replace(/^#/, "");
    if (id && byId[id]) openPuzzle(id, true);
    else goHome(true);
  }

  function goHome(fromHistory) {
    if (state.view === "play") persistProgress();
    stopTimer();
    state.adPending = null;
    cancelColoring();
    state.view = "home";
    state.puzzle = null;
    state.pointerId = null;
    state.dragBefore = null;
    renderHome();
    document.title = "数织";
    if (fromHistory) return;
    var entry = history.state;
    if (entry && entry.view === "play" && !entry.root) {
      history.back();
      return;
    }
    if (location.hash || !entry || entry.view !== "home") {
      history.replaceState({ view: "home" }, "", location.pathname + location.search);
    }
  }

  function openPuzzle(id, fromHistory) {
    var puzzle = byId[id];
    if (!puzzle) return goHome(fromHistory);
    if (!isUnlocked(id)) {
      goHome(true);
      history.replaceState({ view: "home" }, "", location.pathname + location.search);
      toast("先完成上一题。");
      return;
    }
    if (state.view === "play" && state.puzzle && state.puzzle.id !== id) persistProgress();
    stopTimer();
    state.adPending = null;
    cancelColoring();

    var rec = recordOf(id);
    var total = puzzle.size * puzzle.size;
    var cells = rec ? unpack(rec.cells, total) : new Array(total).fill(0);
    var seconds = rec && Number.isFinite(rec.seconds) && rec.seconds > 0 ? Math.floor(rec.seconds) : 0;
    var allowance = hintAllowance(puzzle.size);
    var hints = allowance;
    if (rec && Number.isInteger(rec.hints) && rec.hints >= 0 && rec.hints <= allowance) hints = rec.hints;
    var won = !!(rec && rec.won && window.Nono.isSolved(cells, puzzle.solutionFlat));

    state.view = "play";
    state.puzzle = puzzle;
    state.cells = cells;
    state.seconds = seconds;
    state.hints = hints;
    state.won = won;
    state.started = seconds > 0 || cells.some(function (v) { return v !== 0; });
    state.history = [];
    state.future = [];
    state.tool = "fill";
    state.panMode = false;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.pointers = {};
    state.gesture = null;
    state.pinch = null;
    state.panLast = null;
    state.cursor = 0;
    state.axis = -1;
    state.pointerId = null;
    state.dragBefore = null;

    if (rec && rec.won && !won) {
      rec.won = false;
      rec.cells = pack(cells);
      writeSave();
    }

    renderPlay();
    document.title = state.won ? puzzle.name + " · 数织" : "数织";
    if (!fromHistory) {
      var entry = { view: "play", id: id };
      if (history.state && history.state.view === "play") history.replaceState(entry, "", "#" + id);
      else if (location.hash !== "#" + id) history.pushState(entry, "", "#" + id);
    }
    if (!state.won && state.started) startTimer();
  }

  function renderHome() {
    var done = tallyDone();
    var html = '<div class="sheet view home">';
    html += '<div class="home-head">';
    html += '<div class="brand">';
    html += "<div><h1>数织</h1></div>";
    html += '<div class="brand-side"><button type="button" class="icon-btn" data-act="settings" aria-label="设置"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg></button><div class="brand-seal" aria-hidden="true">格</div></div>';
    html += "</div>";
    html += "<p class=\"lead\">数字是线索，格子是画布。每一行、每一列旁边的数字，都会告诉你黑格怎么排。</p>";
    html += '<div class="tally-row"><p class="tally">已完成 <b>' + done + "</b> / " + built.length + "</p>";
    html += '<div class="meter" aria-hidden="true"><span style="width:' + Math.round((done / built.length) * 100) + '%"></span></div></div>';
    if (done === built.length) html += '<p class="done-note">这一本都画完了。</p>';
    html += '<p class="toast" id="toast" hidden></p>';
    html += "</div>";
    html += '<div class="catalog">';

    var index = 0;
    var lastGroup = "";
    order.forEach(function (puzzle) {
      if (puzzle.difficulty !== lastGroup) {
        lastGroup = puzzle.difficulty;
        var count = 0;
        order.forEach(function (p) { if (p.difficulty === lastGroup) count += 1; });
        html += '<h2 class="group">' + esc(lastGroup) + "<span>" + count + " 题</span></h2>";
      }
      index += 1;
      var open = isUnlocked(puzzle.id);
      var st = open ? statusOf(puzzle.id) : "locked";
      var rec = recordOf(puzzle.id);
      var label = st === "done" ? "已完成" : st === "mid" ? "画到一半" : st === "locked" ? "未解锁" : "未下笔";
      var time = open && rec && rec.best != null ? '<small>最佳 ' + formatTime(rec.best) + "</small>" : "";
      if (open) html += '<button type="button" class="puzzle-row is-' + st + '" data-id="' + esc(puzzle.id) + '">';
      else html += '<button type="button" class="puzzle-row is-locked" data-act="locked" aria-disabled="true">';
      html += '<span class="idx">' + String(index).padStart(2, "0") + "</span>";
      html += '<canvas class="thumb" width="45" height="45" data-thumb="' + esc(puzzle.id) + '" data-reveal="' + (st === "done" ? "1" : "0") + '"></canvas>';
      html += '<span class="nm"><strong>' + (st === "done" ? esc(puzzle.name) : "未揭晓") + "</strong><small>" + puzzle.size + "×" + puzzle.size + "</small></span>";
      html += '<span class="stat ' + st + '"><b>' + label + "</b>" + time + "</span>";
      html += "</button>";
    });

    html += '<p class="colophon">通关记在这台设备上。登录后，同一账号里也会接着算。</p>';
    html += "</div></div>";
    app.innerHTML = html;
    app.querySelectorAll("canvas[data-thumb]").forEach(function (canvas) {
      drawThumb(canvas, byId[canvas.dataset.thumb], canvas.dataset.reveal === "1");
    });
  }

  function renderSettings() {
    var on = !!state.sound;
    var html = '<div class="sheet view settings">';
    html += '<header class="hud">';
    html += '<button type="button" class="back" data-act="back" aria-label="返回"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.2 2.8 5 8l5.2 5.2"/></svg></button>';
    html += '<div class="hud-main">';
    html += "<h1>设置</h1></div></header>";
    html += '<div class="setting-list">';
    html += '<div class="setting-row">';
    html += "<div><strong>声音</strong><p>落笔和过关时的提示音。</p></div>";
    html += '<button type="button" class="switch" data-act="sound" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="声音">';
    html += '<span class="switch-word">' + (on ? "开" : "关") + "</span>";
    html += '<span class="switch-knob" aria-hidden="true"></span>';
    html += "</button></div>";
    html += '<button type="button" class="setting-row setting-link" data-act="help">';
    html += "<span><strong>玩法说明</strong><p>数字怎么读，格子怎么涂。</p></span>";
    html += '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.8 2.8 11 8l-5.2 5.2"/></svg>';
    html += "</button></div>";
    html += '<div class="modal" id="help" hidden>';
    html += '<div class="modal-card help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">';
    html += '<p class="kicker" id="help-title">玩法说明</p>';
    html += '<div class="help-body">';
    html += "<p>旁边的数字按顺序读。它表示连续黑格有多长，两段数字之间至少空一格。比如 2 1，就是两格黑、至少一格空、再一格黑，前后也可以留空。</p>";
    html += "<p>涂黑是你认定要画上的格子。打叉只用来排除，不计入数字。每一行、每一列都对上，画就完成了。</p>";
    html += "<p>按住可以连续涂。选中「拖动」后再按住，移动的是棋盘。双指张开或滚轮可以放大缩小。</p>";
    html += "<p>电脑上右键直接打叉。键盘：1 涂黑，2 打叉，方向键移动，回车落笔，Z 撤销，Y 重做，H 提示，C 检查。</p>";
    html += "<p>题目按目录从第一题往后开。做完上一题，下一题才会亮出来。</p>";
    html += "</div>";
    html += '<div class="confirm-actions"><button type="button" class="tool primary" data-act="close-help">知道了</button></div>';
    html += "</div></div>";
    html += '<p class="colophon">这个开关只存在这台设备上。</p>';
    html += "</div>";
    app.innerHTML = html;
  }

  function openSettings(fromHistory) {
    var from = "home";
    var puzzleId = null;
    if (fromHistory && history.state && history.state.view === "settings") {
      from = history.state.from === "play" ? "play" : "home";
      puzzleId = history.state.id || null;
    } else if (state.view === "play" && state.puzzle) {
      persistProgress();
      from = "play";
      puzzleId = state.puzzle.id;
    }
    stopTimer();
    state.adPending = null;
    cancelColoring();
    state.settingsFrom = from;
    state.settingsPuzzle = puzzleId;
    state.view = "settings";
    renderSettings();
    document.title = "设置 · 数织";
    if (fromHistory) return;
    history.pushState({ view: "settings", from: from, id: puzzleId }, "", location.pathname + location.search + location.hash);
  }

  function closeSettings(fromHistory) {
    if (!fromHistory && history.state && history.state.view === "settings") {
      history.back();
      return;
    }
    if (state.settingsFrom === "play" && state.settingsPuzzle && isUnlocked(state.settingsPuzzle)) {
      openPuzzle(state.settingsPuzzle, true);
    } else {
      goHome(true);
    }
  }

  function drawThumb(canvas, puzzle, reveal) {
    var n = puzzle.size;
    var scale = n >= 40 ? 1 : n >= 20 ? 2 : 3;
    canvas.width = n * scale;
    canvas.height = n * scale;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!reveal) {
      ctx.strokeStyle = "#e3d5c3";
      ctx.lineWidth = 1;
      var g = 4;
      for (var i = 1; i < g; i++) {
        var p = Math.round((canvas.width / g) * i) + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 2);
        ctx.lineTo(p, canvas.height - 2);
        ctx.moveTo(2, p);
        ctx.lineTo(canvas.width - 2, p);
        ctx.stroke();
      }
      return;
    }
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!puzzle.solution[r][c]) continue;
        ctx.fillStyle = pictureColor(puzzle.id, r, c);
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }

  function renderPlay() {
    var puzzle = state.puzzle;
    var idx = orderIndex(puzzle.id);
    var hasNext = idx >= 0 && idx < order.length - 1;
    var html = '<div class="sheet view play">';
    html += '<header class="hud">';
    html += '<button type="button" class="back" data-act="back" aria-label="返回选题"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.2 2.8 5 8l5.2 5.2"/></svg></button>';
    html += '<div class="hud-main">';
    html += "<h1 id=\"puzzle-title\">" + esc(state.won ? puzzle.name : "关卡") + "</h1></div>";
    html += '<div class="hud-side">';
    html += '<div class="hud-meta"><span id="time">' + formatTime(state.seconds) + '</span><span id="progress"></span></div>';
    html += "</div></header>";
    if (puzzle.coach) html += '<p class="coach" id="coach">' + esc(puzzle.coach) + "</p>";
    html += '<div class="stage"><div class="board" id="board">';
    html += '<div class="corner"></div>';
    html += '<div class="col-clues" id="col-clues">';
    puzzle.colClues.forEach(function (clues, c) {
      html += '<div class="col-clue clue" data-line="c' + c + '">' + clueSpans(clues) + "</div>";
    });
    html += "</div>";
    html += '<div class="row-clues" id="row-clues">';
    puzzle.rowClues.forEach(function (clues, r) {
      html += '<div class="row-clue clue" data-line="r' + r + '">' + clueSpans(clues) + "</div>";
    });
    html += "</div>";
    html += '<div class="cells" id="grid" role="grid" aria-label="' + (state.won ? esc(puzzle.name) + " " : "") + '棋盘">';
    var n = puzzle.size;
    for (var i = 0; i < state.cells.length; i++) {
      var r = Math.floor(i / n);
      var c = i % n;
      var cls = "cell";
      if (c === n - 1 || c % 5 === 4) cls += " b-r";
      if (r === n - 1 || r % 5 === 4) cls += " b-b";
      if (state.cells[i] === 1) cls += " fill";
      if (state.cells[i] === 2) cls += " mark";
      var swatch = puzzle.solution[r][c] ? ' style="--swatch:' + pictureColor(puzzle.id, r, c) + '"' : "";
      html += '<button type="button" class="' + cls + '"' + swatch + ' role="gridcell" data-i="' + i + '" tabindex="' + (i === 0 ? "0" : "-1") + '" aria-label="' + esc(cellLabel(i)) + '"></button>';
    }
    html += "</div></div></div>";

    html += '<div class="modal" id="confirm" hidden>';
    html += '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">';
    html += '<p class="kicker" id="confirm-title">清空这题</p>';
    html += "<p>当前的涂色会去掉，计时也重新开始。最好成绩还留着。</p>";
    html += '<div class="confirm-actions">';
    html += '<button type="button" class="tool" data-act="cancel-reset">取消</button>';
    html += '<button type="button" class="tool danger" data-act="confirm-reset">清空</button>';
    html += "</div></div></div>";

    html += '<div class="modal" id="winbar" hidden>';
    html += '<div class="modal-card win-card" role="dialog" aria-modal="true" aria-labelledby="win-title">';
    html += '<div class="seal" aria-hidden="true">成</div>';
    html += '<p class="win-kicker" id="win-title"></p>';
    html += '<p class="win-msg" id="win-msg"></p>';
    html += '<div class="win-actions">';
    html += '<button type="button" class="tool primary" data-act="next">' + (hasNext ? "下一题" : "返回选题") + "</button>";
    html += '<button type="button" class="tool" data-act="again">再玩一次</button>';
    html += '<button type="button" class="tool" data-act="back">返回</button>';
    html += "</div></div></div>";

    html += '<p class="toast" id="toast" hidden></p>';
    html += '<div class="tools">';
    html += '<div class="mode-row">';
    html += '<div class="segment" role="group" aria-label="涂色或移动">';
    html += '<button type="button" class="tool" data-act="tool-fill" aria-pressed="true">涂黑</button>';
    html += '<button type="button" class="tool" data-act="tool-mark" aria-pressed="false">打叉</button>';
    html += '<button type="button" class="tool" data-act="tool-pan" aria-pressed="false">拖动</button>';
    html += "</div>";
    html += '<div class="segment zoom-segment" role="group" aria-label="缩放">';
    html += '<button type="button" class="tool" data-act="zoom-out" aria-label="缩小">−</button>';
    html += '<button type="button" class="tool" data-act="zoom-in" aria-label="放大">+</button>';
    html += "</div></div>";
    html += '<div class="tool-row quiet">';
    html += '<button type="button" class="tool" data-act="undo" id="act-undo">撤销</button>';
    html += '<button type="button" class="tool" data-act="hint" id="act-hint">提示 <em id="hint-left">' + state.hints + "</em></button>";
    html += '<button type="button" class="tool" data-act="reset" id="act-reset">清空</button>';
    html += "</div>";
    html += '<p class="fineprint" id="gesture-note">按住拖动可以连续涂。<span class="fine-only">右键直接打叉。</span>双指或滚轮缩放。</p>';
    html += "</div></div>";

    app.innerHTML = html;
    fitBoard();
    refreshBoard();
  }

  function clueSpans(clues) {
    return clues.map(function (n) {
      return '<span class="' + (n === 0 ? "zero" : "") + '">' + n + "</span>";
    }).join("");
  }

  function cellLabel(i) {
    var n = state.puzzle.size;
    var r = Math.floor(i / n) + 1;
    var c = (i % n) + 1;
    var v = state.cells[i];
    var name = v === 1 ? "涂黑" : v === 2 ? "打叉" : "空白";
    return "第" + r + "行第" + c + "列，" + name;
  }

  function zoomLimit(value) {
    return Math.max(0.6, Math.min(state.zoomMax || 3, value));
  }

  function paintCells(size) {
    var board = document.getElementById("board");
    var puzzle = state.puzzle;
    if (!board || !puzzle) return;
    size = Math.max(4, Math.round(size));
    var cols = "repeat(" + puzzle.size + ", " + size + "px)";
    var rows = "repeat(" + puzzle.size + ", " + size + "px)";
    board.style.setProperty("--cell", size + "px");
    board.style.setProperty("--n", String(puzzle.size));
    var clue = size >= 28 ? 13 : size >= 22 ? 12 : size >= 16 ? 10 : Math.max(7, Math.round(size * 0.8));
    board.style.setProperty("--clue", clue + "px");
    board.style.setProperty("--clue-gap", (size >= 16 ? 4 : 1) + "px");
    var lineW = 1;
    var groupW = size >= 28 ? 2 : 1;
    var markW = size >= 22 ? 2 : 1;
    board.style.setProperty("--line-w", lineW + "px");
    board.style.setProperty("--group-w", groupW + "px");
    board.style.setProperty("--mark-w", markW + "px");
    var colClues = document.getElementById("col-clues");
    var rowClues = document.getElementById("row-clues");
    var grid = document.getElementById("grid");
    if (colClues) {
      colClues.style.gridTemplateColumns = cols;
      colClues.style.marginLeft = groupW + "px";
    }
    if (rowClues) {
      rowClues.style.gridTemplateRows = rows;
      rowClues.style.marginTop = groupW + "px";
    }
    if (grid) {
      grid.style.gridTemplateColumns = cols;
      grid.style.gridTemplateRows = rows;
    }
  }

  function fitBoard() {
    var board = document.getElementById("board");
    if (!board || !state.puzzle) return;
    var puzzle = state.puzzle;
    var stage = document.querySelector(".sheet.play .stage");
    var wrapW = stage && stage.clientWidth > 40 ? stage.clientWidth : Math.min(window.innerWidth - 36, 640);
    var wrapH = stage && stage.clientHeight > 40 ? stage.clientHeight : Math.max(180, window.innerHeight - 230);
    var byW = Math.floor((wrapW - 8) / (puzzle.size + puzzle.maxRowClues * 1.15));
    var byH = Math.floor((wrapH - 8) / (puzzle.size + puzzle.maxColClues * 0.72));
    if (!isFinite(byW) || byW <= 0) byW = 22;
    if (!isFinite(byH) || byH <= 0) byH = 28;
    var cell = Math.max(4, Math.min(44, byW, byH));

    paintCells(cell);
    if (stage && stage.clientWidth > 40 && stage.clientHeight > 40) {
      var slackW = stage.clientWidth - 2;
      var slackH = stage.clientHeight - 2;
      if (board.offsetWidth > slackW || board.offsetHeight > slackH) {
        var fit = Math.min(slackW / board.offsetWidth, slackH / board.offsetHeight);
        cell = Math.max(4, Math.floor(cell * fit));
        paintCells(cell);
      }
    }
    state.baseCell = cell;
    state.zoomMax = cell >= 20 ? 3 : Math.max(3, Math.min(8, 40 / cell));
    applyView();
  }

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.view === "play") fitBoard();
    }, 80);
  }

  function refreshBoard() {
    refreshLines();
    refreshProgress();
    refreshActions();
    var coach = document.getElementById("coach");
    if (coach) coach.hidden = !!state.won;
    var board = document.getElementById("board");
    if (board) {
      if (state.puzzle) board.style.setProperty("--picture", pictureColor(state.puzzle.id));
      if (!state.coloring) board.classList.toggle("is-done", !!state.won);
    }
    var title = document.getElementById("puzzle-title");
    if (title && state.puzzle) {
      var name = state.won ? state.puzzle.name : "关卡";
      title.textContent = name;
      document.title = state.won ? name + " · 数织" : "数织";
      var grid = document.getElementById("grid");
      if (grid) grid.setAttribute("aria-label", state.won ? name + " 棋盘" : "棋盘");
    }
  }

  function refreshProgress() {
    var el = document.getElementById("progress");
    if (!el || !state.puzzle) return;
    var filled = 0;
    for (var i = 0; i < state.cells.length; i++) if (state.cells[i] === 1) filled += 1;
    el.textContent = "黑格 " + filled + "/" + state.puzzle.blacks;
  }

  function refreshActions() {
    var undo = document.getElementById("act-undo");
    var hint = document.getElementById("act-hint");
    if (undo) undo.disabled = state.history.length === 0;
    if (hint) hint.disabled = state.won || state.hints <= 0 || !!state.adPending;
    var left = document.getElementById("hint-left");
    if (left) left.textContent = String(state.hints);
    syncTools();
  }

  function lineCorrect(indices) {
    var sol = state.puzzle.solutionFlat;
    for (var k = 0; k < indices.length; k++) {
      var i = indices[k];
      if ((state.cells[i] === 1) !== (sol[i] === 1)) return false;
    }
    return true;
  }

  function refreshLines() {
    if (!state.puzzle) return;
    var n = state.puzzle.size;
    var r, c, idx, el;
    for (r = 0; r < n; r++) {
      idx = [];
      for (c = 0; c < n; c++) idx.push(r * n + c);
      el = document.querySelector('[data-line="r' + r + '"]');
      if (el) el.classList.toggle("done", lineCorrect(idx));
    }
    for (c = 0; c < n; c++) {
      idx = [];
      for (r = 0; r < n; r++) idx.push(r * n + c);
      el = document.querySelector('[data-line="c' + c + '"]');
      if (el) el.classList.toggle("done", lineCorrect(idx));
    }
  }

  function paintCellDom(i, animate) {
    var grid = document.getElementById("grid");
    if (!grid) return;
    var el = grid.children[i];
    if (!el) return;
    var v = state.cells[i];
    el.classList.toggle("fill", v === 1);
    el.classList.toggle("mark", v === 2);
    el.classList.remove("bad");
    el.setAttribute("aria-label", cellLabel(i));
    if (animate && v !== 0) {
      el.classList.remove("ink");
      void el.offsetWidth;
      el.classList.add("ink");
    }
  }

  function syncAllCells() {
    for (var i = 0; i < state.cells.length; i++) paintCellDom(i, false);
  }

  function clearBad() {
    document.querySelectorAll(".cell.bad").forEach(function (el) { el.classList.remove("bad"); });
  }

  function setAxis(i) {
    var grid = document.getElementById("grid");
    if (!grid || !state.puzzle) return;
    if (state.axis === i) return;
    state.axis = i;
    var n = state.puzzle.size;
    var row = i >= 0 ? Math.floor(i / n) : -1;
    var col = i >= 0 ? i % n : -1;
    for (var k = 0; k < grid.children.length; k++) {
      var el = grid.children[k];
      var on = i >= 0 && (Math.floor(k / n) === row || k % n === col);
      el.classList.toggle("axis", on);
      el.classList.toggle("hot", k === i);
    }
  }

  function kindFrom(i, tool) {
    var cur = state.cells[i];
    if (tool === "fill") return cur === 1 ? "clear-fill" : "fill";
    return cur === 2 ? "clear-mark" : "mark";
  }

  function applyKind(i, kind) {
    var cur = state.cells[i];
    var next = cur;
    if (kind === "fill") next = cur === 2 ? cur : 1;
    else if (kind === "mark") next = cur === 1 ? cur : 2;
    else if (kind === "clear-fill") next = cur === 1 ? 0 : cur;
    else if (kind === "clear-mark") next = cur === 2 ? 0 : cur;
    else if (kind === "clear-any") next = 0;
    if (next === cur) return false;
    state.cells[i] = next;
    return true;
  }

  function pushHistory(before) {
    if (same(before, state.cells)) return false;
    state.history.push(before.slice());
    if (state.history.length > 100) state.history.shift();
    state.future = [];
    return true;
  }

  function markStarted() {
    if (state.started) return;
    state.started = true;
    startTimer();
  }

  function maybeSolve(chime) {
    var solved = window.Nono.isSolved(state.cells, state.puzzle.solutionFlat);
    if (solved && !state.won) {
      state.won = true;
      stopTimer();
      var info = recordBest();
      persistProgress();
      pushLevelProgress();
      celebrate(chime ? winMessage(info) : reopenMessage(), !!chime);
      return true;
    }
    if (!solved && state.won) {
      state.won = false;
      cancelColoring();
      hideWin();
      if (state.started) startTimer();
      persistProgress();
    }
    return false;
  }

  function pictureColor(id, r, c) {
    if (!window.NonoPaints) return "#c23c2a";
    return window.NonoPaints.swatch(id, r == null ? 0 : r, c == null ? 0 : c);
  }

  function clearColorTimers() {
    if (state.colorTimer) clearTimeout(state.colorTimer);
    if (state.colorTimer2) clearTimeout(state.colorTimer2);
    state.colorTimer = 0;
    state.colorTimer2 = 0;
  }

  function cancelColoring() {
    clearColorTimers();
    state.coloring = false;
    var board = document.getElementById("board");
    if (!board) return;
    board.classList.remove("coloring", "is-done");
    board.querySelectorAll(".cell").forEach(function (el) { el.style.transitionDelay = ""; });
  }

  function celebrate(message, animate) {
    clearColorTimers();
    var board = document.getElementById("board");
    var grid = document.getElementById("grid");
    if (board && state.puzzle) board.style.setProperty("--picture", pictureColor(state.puzzle.id));
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce || !board || !grid) {
      state.coloring = false;
      if (board) board.classList.add("is-done");
      revealWin(message, false);
      if (animate) chimeWin();
      return;
    }
    state.coloring = true;
    state.colorTimer = setTimeout(function () {
      if (!state.coloring || !state.won || !state.puzzle) return;
      var fills = [];
      for (var i = 0; i < grid.children.length; i++) {
        if (grid.children[i].classList.contains("fill")) fills.push(grid.children[i]);
      }
      var stagger = fills.length > 1 ? Math.max(4, Math.min(22, Math.floor(560 / (fills.length - 1)))) : 0;
      fills.forEach(function (el, n) { el.style.transitionDelay = (n * stagger) + "ms"; });
      board.classList.add("coloring");
      void board.offsetWidth;
      board.classList.add("is-done");
      chimeWin();
      var wait = (fills.length > 1 ? (fills.length - 1) * stagger : 0) + 460;
      state.colorTimer2 = setTimeout(function () {
        if (!state.coloring || !state.won) return;
        state.coloring = false;
        board.classList.remove("coloring");
        fills.forEach(function (el) { el.style.transitionDelay = ""; });
        revealWin(message, true);
      }, wait);
    }, 220);
  }

  function ensureRec() {
    var id = state.puzzle.id;
    if (!save.puzzles[id]) {
      save.puzzles[id] = { cells: "", seconds: 0, hints: state.hints, won: false, best: null };
    }
    return save.puzzles[id];
  }

  function recordBest() {
    var rec = ensureRec();
    var prev = rec.best == null ? null : rec.best;
    var improved = prev == null || state.seconds < prev;
    if (improved) rec.best = state.seconds;
    rec.won = true;
    rec.cleared = true;
    rec.seconds = state.seconds;
    rec.cells = pack(state.cells);
    rec.hints = state.hints;
    return { prev: prev, improved: improved };
  }

  function winMessage(info) {
    var t = formatTime(state.seconds);
    if (info.prev == null) return "用时 " + t + "，已记成最好成绩。";
    if (state.seconds < info.prev) return "用时 " + t + "，比上次更快。";
    if (state.seconds === info.prev) return "用时 " + t + "，再次追平最好成绩。";
    return "用时 " + t + "。最好成绩是 " + formatTime(info.prev) + "。";
  }

  function reopenMessage() {
    var rec = recordOf(state.puzzle.id);
    var best = rec && rec.best != null ? rec.best : state.seconds;
    return "用时 " + formatTime(state.seconds) + "，最佳 " + formatTime(best) + "。";
  }

  function revealWin(message, animate) {
    var bar = document.getElementById("winbar");
    if (!bar) return;
    toast("");
    document.getElementById("win-title").textContent = state.puzzle.name + "画好了";
    document.getElementById("win-msg").textContent = message;
    bar.hidden = false;
    refreshBoard();
    var seal = bar.querySelector(".seal");
    if (animate && seal) {
      seal.classList.remove("pop");
      void seal.offsetWidth;
      seal.classList.add("pop");
    }
    var next = bar.querySelector('[data-act="next"]');
    if (next) next.focus({ preventScroll: true, focusVisible: false });
    if (live) live.textContent = state.puzzle.name + "画好了。" + message;
  }

  function persistProgress() {
    if (!state.puzzle) return;
    if (!state.started && !state.won) return;
    var rec = ensureRec();
    var cleared = !!rec.cleared;
    rec.cells = pack(state.cells);
    rec.seconds = state.seconds;
    rec.hints = state.hints;
    rec.won = !!state.won && window.Nono.isSolved(state.cells, state.puzzle.solutionFlat);
    if (rec.won) cleared = true;
    rec.cleared = cleared;
    save.sound = state.sound;
    writeSave();
  }

  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    clearTimeout(state.toastTimer);
    if (text) {
      state.toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
      if (live) live.textContent = text;
    }
  }

  function helpOpen() {
    var el = document.getElementById("help");
    return !!(el && !el.hidden);
  }

  function showHelp() {
    var el = document.getElementById("help");
    if (!el) return;
    el.hidden = false;
    var btn = el.querySelector('[data-act="close-help"]');
    if (btn) btn.focus({ preventScroll: true, focusVisible: false });
  }

  function hideHelp() {
    var el = document.getElementById("help");
    if (el) el.hidden = true;
  }

  function confirmOpen() {
    var el = document.getElementById("confirm");
    return !!(el && !el.hidden);
  }

  function winOpen() {
    var el = document.getElementById("winbar");
    return !!(el && !el.hidden);
  }

  function hideWin() {
    var el = document.getElementById("winbar");
    if (el) el.hidden = true;
  }

  function hideConfirm() {
    var el = document.getElementById("confirm");
    if (!el || el.hidden) return;
    el.hidden = true;
    var reset = document.getElementById("act-reset");
    if (reset) reset.focus({ preventScroll: true, focusVisible: false });
  }

  function showConfirm() {
    var el = document.getElementById("confirm");
    if (!el) return;
    var fromKeyboard = document.activeElement && document.activeElement.matches(":focus-visible");
    el.hidden = false;
    var btn = el.querySelector('[data-act="cancel-reset"]');
    if (btn) btn.focus({ preventScroll: true, focusVisible: !!fromKeyboard });
  }

  function onClick(e) {
    var help = document.getElementById("help");
    if (help && !help.hidden && e.target === help) {
      hideHelp();
      return;
    }
    var modal = document.getElementById("confirm");
    if (modal && !modal.hidden && e.target === modal) {
      hideConfirm();
      return;
    }
    var win = document.getElementById("winbar");
    if (win && !win.hidden && e.target === win) {
      hideWin();
      return;
    }
    var opener = e.target.closest ? e.target.closest("[data-id]") : null;
    if (opener && opener.dataset.id) {
      openPuzzle(opener.dataset.id, false);
      return;
    }
    var btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn || btn.disabled) return;
    onAct(btn.dataset.act);
  }

  function onAct(act) {
    if (act === "locked") return toast("先完成上一题。");
    if (act === "settings") return openSettings(false);
    if (act === "help") return showHelp();
    if (act === "close-help") return hideHelp();
    if (act === "sound") return toggleSound();
    if (act === "back") {
      if (state.view === "settings") return closeSettings(false);
      return goHome(false);
    }
    if (act === "tool-fill") return setTool("fill");
    if (act === "tool-mark") return setTool("mark");
    if (act === "tool-pan") return setPanMode(!state.panMode);
    if (act === "zoom-in") return zoomBy(1.25);
    if (act === "zoom-out") return zoomBy(0.8);
    if (act === "undo") return undo();
    if (act === "redo") return redo();
    if (act === "hint") return useHint();
    if (act === "check") return runCheck();
    if (act === "reset") return askReset();
    if (act === "confirm-reset") return resetPuzzle();
    if (act === "cancel-reset") return hideConfirm();
    if (act === "again") return resetPuzzle();
    if (act === "next") return goNext();
  }

  function setTool(tool) {
    state.tool = tool;
    state.panMode = false;
    syncTools();
  }

  function setPanMode(on) {
    state.panMode = !!on;
    syncTools();
  }

  function syncTools() {
    document.querySelectorAll('[data-act^="tool-"]').forEach(function (btn) {
      var on = state.panMode ? btn.dataset.act === "tool-pan" : btn.dataset.act === "tool-" + state.tool;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var stage = document.querySelector(".sheet.play .stage");
    if (stage) stage.classList.toggle("is-pan", !!state.panMode);
    var note = document.getElementById("gesture-note");
    if (!note) return;
    note.innerHTML = state.panMode
      ? "拖动可以移动棋盘。双指或滚轮缩放。"
      : "按住拖动可以连续涂。<span class=\"fine-only\">右键直接打叉。</span>双指或滚轮缩放。";
  }

  function stagePoint(clientX, clientY) {
    var stage = document.querySelector(".sheet.play .stage");
    if (!stage) return [0, 0];
    var rect = stage.getBoundingClientRect();
    return [clientX - rect.left - rect.width / 2, clientY - rect.top - rect.height / 2];
  }

  function clampPan() {
    var board = document.getElementById("board");
    var stage = document.querySelector(".sheet.play .stage");
    if (!board || !stage) return;
    var bw = board.offsetWidth;
    var bh = board.offsetHeight;
    var keep = 56;
    var limitX = Math.max(20, (bw + stage.clientWidth) / 2 - keep);
    var limitY = Math.max(20, (bh + stage.clientHeight) / 2 - keep);
    state.panX = Math.max(-limitX, Math.min(limitX, state.panX));
    state.panY = Math.max(-limitY, Math.min(limitY, state.panY));
  }

  function scaleFor(zoom) {
    zoom = zoomLimit(zoom);
    if (!state.baseCell) return zoom;
    return Math.max(4, Math.round(state.baseCell * zoom)) / state.baseCell;
  }

  function applyView() {
    var board = document.getElementById("board");
    if (!board) return;
    state.zoom = zoomLimit(state.zoom);
    if (state.baseCell) paintCells(state.baseCell * state.zoom);
    clampPan();
    board.style.transform = "translate(" + state.panX.toFixed(2) + "px, " + state.panY.toFixed(2) + "px)";
  }

  function zoomAt(clientX, clientY, next) {
    next = zoomLimit(next);
    var pt = stagePoint(clientX, clientY);
    var prev = scaleFor(state.zoom) || 1;
    var lx = (pt[0] - state.panX) / prev;
    var ly = (pt[1] - state.panY) / prev;
    state.zoom = next;
    var scale = scaleFor(state.zoom);
    state.panX = pt[0] - lx * scale;
    state.panY = pt[1] - ly * scale;
    applyView();
  }

  function zoomBy(factor) {
    var stage = document.querySelector(".sheet.play .stage");
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, state.zoom * factor);
  }

  function onWheel(e) {
    if (state.view !== "play" || confirmOpen() || winOpen()) return;
    if (!e.target.closest || !e.target.closest(".stage")) return;
    e.preventDefault();
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= 120;
    zoomAt(e.clientX, e.clientY, state.zoom * Math.exp(-delta * 0.0016));
  }

  function toggleSound() {
    state.sound = !state.sound;
    save.sound = state.sound;
    writeSave();
    document.querySelectorAll('[data-act="sound"]').forEach(function (btn) {
      btn.setAttribute("aria-checked", state.sound ? "true" : "false");
      var word = btn.querySelector(".switch-word");
      if (word) word.textContent = state.sound ? "开" : "关";
    });
    if (state.sound) tone(620, 0.05, 0, 0.03);
  }

  function goNext() {
    var idx = orderIndex(state.puzzle.id);
    if (idx >= 0 && idx < order.length - 1) openPuzzle(order[idx + 1].id, false);
    else goHome(false);
  }

  function askReset() {
    var blank = state.cells.every(function (v) { return v === 0; }) && state.seconds === 0 && !state.won;
    if (blank) {
      toast("还是空白的。");
      return;
    }
    showConfirm();
  }

  function resetPuzzle() {
    hideConfirm();
    stopTimer();
    state.cells = new Array(state.puzzle.size * state.puzzle.size).fill(0);
    state.seconds = 0;
    state.hints = hintAllowance(state.puzzle.size);
    state.history = [];
    state.future = [];
    state.won = false;
    state.started = false;
    state.adPending = null;
    cancelColoring();
    hideWin();
    var time = document.getElementById("time");
    if (time) time.textContent = formatTime(0);
    syncAllCells();
    clearBad();
    refreshBoard();
    var rec = recordOf(state.puzzle.id);
    if (rec) {
      rec.cells = pack(state.cells);
      rec.seconds = 0;
      rec.hints = state.hints;
      rec.won = false;
      writeSave();
    }
    toast("已清空，可以重画。");
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(state.cells.slice());
    state.cells = state.history.pop();
    afterHistory(false);
    tone(200, 0.04, 0, 0.02);
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(state.cells.slice());
    state.cells = state.future.pop();
    afterHistory(true);
  }

  function afterHistory(chimeIfWin) {
    syncAllCells();
    clearBad();
    maybeSolve(chimeIfWin);
    refreshBoard();
    persistProgress();
  }

  function useHint() {
    if (state.won || state.adPending) return;
    if (state.hints <= 0) {
      toast("这题的提示用完了。");
      return;
    }
    var action = window.Nono.nextHint(state.cells, state.puzzle.solutionFlat);
    if (!action) {
      maybeSolve(true);
      if (!state.won) toast("已经和答案一致。");
      return;
    }
    if (!interstitialReady()) {
      applyHint(action);
      return;
    }
    var requestId = "hint-" + (++state.adSeq);
    state.adPending = { requestId: requestId, puzzleId: state.puzzle.id, action: action };
    stopTimer();
    refreshActions();
    try {
      window.SuperSpeedCalc.showInterstitialAd(requestId, "hint");
    } catch (err) {
      state.adPending = null;
      applyHint(action);
      if (state.started && !state.won && state.view === "play") startTimer();
    }
  }

  function interstitialReady() {
    var bridge = window.SuperSpeedCalc;
    return !!(bridge && typeof bridge.showInterstitialAd === "function");
  }

  function readPayload(payload) {
    if (typeof payload === "string") {
      try { return JSON.parse(payload); } catch (err) { return null; }
    }
    return payload && typeof payload === "object" ? payload : null;
  }

  function finishHintAd(payload) {
    payload = readPayload(payload);
    var pending = state.adPending;
    if (!pending || !payload || payload.requestId !== pending.requestId) return;
    state.adPending = null;
    var same = state.view === "play" && state.puzzle && state.puzzle.id === pending.puzzleId && !state.won;
    if (!same) return;
    applyHint(pending.action);
    if (state.started && !state.won && state.view === "play") startTimer();
  }

  function applyHint(action) {
    var before = state.cells.slice();
    state.cells[action.i] = action.value;
    state.hints -= 1;
    pushHistory(before);
    markStarted();
    paintCellDom(action.i, true);
    var grid = document.getElementById("grid");
    var el = grid && grid.children[action.i];
    if (el) {
      el.classList.add("hinted");
      setTimeout(function () { el.classList.remove("hinted"); }, 1100);
    }
    tone(740, 0.07, 0, 0.03);
    var solved = maybeSolve(true);
    refreshBoard();
    persistProgress();
    if (!solved) {
      toast(action.value === 1 ? "提示：这一格可以涂黑。" : "提示：这一格不该涂黑。");
    }
  }

  function runCheck() {
    if (state.won) {
      toast("这幅画已经完成。");
      return;
    }
    clearBad();
    var bad = window.Nono.mistakeIndices(state.cells, state.puzzle.solutionFlat);
    if (!bad.length) {
      if (window.Nono.isSolved(state.cells, state.puzzle.solutionFlat)) maybeSolve(true);
      else toast("目前没有涂错。空白的地方还可以再看看。");
      return;
    }
    var grid = document.getElementById("grid");
    bad.forEach(function (i) { grid.children[i].classList.add("bad"); });
    grid.classList.remove("shake");
    void grid.offsetWidth;
    grid.classList.add("shake");
    toast(bad.length + " 处和答案不符，标出来了。");
  }

  function doSingle(i, tool) {
    if (state.view !== "play" || state.won || i < 0) return;
    var before = state.cells.slice();
    var kind = tool === "clear" ? "clear-any" : kindFrom(i, tool);
    if (!applyKind(i, kind)) return;
    clearBad();
    pushHistory(before);
    markStarted();
    paintCellDom(i, true);
    tone(tool === "mark" ? 300 : 520, 0.045, 0, 0.025);
    maybeSolve(true);
    refreshBoard();
    persistProgress();
  }

  function pointerList() {
    var ids = Object.keys(state.pointers);
    var list = [];
    for (var i = 0; i < ids.length; i++) list.push(state.pointers[ids[i]]);
    return list;
  }

  function cancelStroke() {
    if (state.dragBefore) {
      state.cells = state.dragBefore.slice();
      state.dragBefore = null;
      refreshBoard();
    }
    state.pointerId = null;
    state.dragKind = null;
    if (state.gesture === "paint") state.gesture = null;
  }

  function beginPinch() {
    var pts = pointerList();
    if (pts.length < 2) return;
    var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    state.pinch = {
      dist: dist,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      mx: (pts[0].x + pts[1].x) / 2,
      my: (pts[0].y + pts[1].y) / 2
    };
    state.gesture = "pinch";
  }

  function movePinch() {
    var pts = pointerList();
    if (pts.length < 2 || !state.pinch) return;
    var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    var mx = (pts[0].x + pts[1].x) / 2;
    var my = (pts[0].y + pts[1].y) / 2;
    var next = zoomLimit(state.pinch.zoom * (dist / state.pinch.dist));
    var origin = stagePoint(state.pinch.mx, state.pinch.my);
    var start = scaleFor(state.pinch.zoom) || 1;
    var lx = (origin[0] - state.pinch.panX) / start;
    var ly = (origin[1] - state.pinch.panY) / start;
    var now = stagePoint(mx, my);
    state.zoom = next;
    var scale = scaleFor(next);
    state.panX = now[0] - lx * scale;
    state.panY = now[1] - ly * scale;
    applyView();
  }

  function onPointerDown(e) {
    if (confirmOpen()) return;
    if (winOpen()) return;
    if (state.adPending) return;
    if (state.view !== "play") return;
    if (e.button !== 0 && e.button !== 2) return;
    var stage = e.target.closest ? e.target.closest(".stage") : null;
    if (!stage) return;

    state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pointerList().length >= 2) {
      cancelStroke();
      beginPinch();
      e.preventDefault();
      return;
    }

    if (state.panMode) {
      if (e.button !== 0) {
        delete state.pointers[e.pointerId];
        return;
      }
      state.gesture = "pan";
      state.panLast = { x: e.clientX, y: e.clientY, id: e.pointerId };
      stage.classList.add("is-panning");
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (state.won || state.pointerId != null) return;
    var cell = e.target.closest ? e.target.closest("#grid .cell") : null;
    if (!cell) return;
    e.preventDefault();
    state.gesture = "paint";
    state.pointerId = e.pointerId;
    var i = Number(cell.dataset.i);
    var tool = e.button === 2 ? "mark" : state.tool;
    state.dragKind = kindFrom(i, tool);
    state.dragBefore = state.cells.slice();
    state.cursor = i;
    clearBad();
    focusCell(i, "pointer");
    paintDrag(i, true);
    var grid = document.getElementById("grid");
    if (grid && grid.setPointerCapture) {
      try { grid.setPointerCapture(e.pointerId); } catch (err2) {}
    }
  }

  function onPointerMove(e) {
    if (state.view !== "play") return;
    if (state.pointers[e.pointerId]) {
      state.pointers[e.pointerId].x = e.clientX;
      state.pointers[e.pointerId].y = e.clientY;
    }
    if (state.gesture === "pinch") {
      movePinch();
      return;
    }
    if (state.gesture === "pan" && state.panLast && e.pointerId === state.panLast.id) {
      state.panX += e.clientX - state.panLast.x;
      state.panY += e.clientY - state.panLast.y;
      state.panLast.x = e.clientX;
      state.panLast.y = e.clientY;
      applyView();
      return;
    }
    if (state.gesture !== "paint" || state.pointerId == null || e.pointerId !== state.pointerId) {
      var hover = e.target.closest ? e.target.closest("#grid .cell") : null;
      if (state.pointerId == null && state.gesture !== "pan") setAxis(hover ? Number(hover.dataset.i) : -1);
      return;
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var cell = el && el.closest ? el.closest("#grid .cell") : null;
    if (!cell) return;
    paintDrag(Number(cell.dataset.i), false);
  }

  function onPointerUp(e) {
    delete state.pointers[e.pointerId];
    if (state.gesture === "pinch") {
      if (pointerList().length >= 2) beginPinch();
      else {
        state.gesture = null;
        state.pinch = null;
      }
      return;
    }
    if (state.gesture === "pan" && state.panLast && e.pointerId === state.panLast.id) {
      state.gesture = null;
      state.panLast = null;
      var stage = document.querySelector(".sheet.play .stage");
      if (stage) {
        stage.classList.remove("is-panning");
        if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) {
          try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
        }
      }
      return;
    }
    if (state.gesture !== "paint" || state.pointerId == null || e.pointerId !== state.pointerId) return;
    var grid = document.getElementById("grid");
    if (grid && grid.hasPointerCapture && grid.hasPointerCapture(e.pointerId)) {
      try { grid.releasePointerCapture(e.pointerId); } catch (err2) {}
    }
    finishDrag();
    state.gesture = null;
  }

  function paintDrag(i, first) {
    if (state.won || state.dragBefore == null) return;
    var changed = applyKind(i, state.dragKind);
    setAxis(i);
    if (!changed) return;
    paintCellDom(i, true);
    if (first) tone(state.dragKind === "mark" || state.dragKind === "clear-mark" ? 300 : 520, 0.04, 0, 0.025);
    markStarted();
    refreshBoard();
    if (window.Nono.isSolved(state.cells, state.puzzle.solutionFlat)) {
      pushHistory(state.dragBefore);
      state.dragBefore = null;
      maybeSolve(true);
      persistProgress();
      refreshBoard();
    }
  }

  function finishDrag() {
    state.pointerId = null;
    if (state.dragBefore) {
      if (pushHistory(state.dragBefore)) persistProgress();
      state.dragBefore = null;
      refreshBoard();
    }
  }

  function focusCell(i, source) {
    var grid = document.getElementById("grid");
    if (!grid) return;
    state.cursor = i;
    for (var k = 0; k < grid.children.length; k++) grid.children[k].tabIndex = k === i ? 0 : -1;
    if (source) {
      grid.children[i].focus({ preventScroll: true, focusVisible: source === "keyboard" });
    }
    setAxis(i);
  }

  function moveCursor(key) {
    var n = state.puzzle.size;
    var r = Math.floor(state.cursor / n);
    var c = state.cursor % n;
    if (key === "ArrowLeft") c = Math.max(0, c - 1);
    if (key === "ArrowRight") c = Math.min(n - 1, c + 1);
    if (key === "ArrowUp") r = Math.max(0, r - 1);
    if (key === "ArrowDown") r = Math.min(n - 1, r + 1);
    focusCell(r * n + c, "keyboard");
    var grid = document.getElementById("grid");
    if (grid) grid.children[state.cursor].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKey(e) {
    if (e.target && e.target.matches && e.target.matches("input, textarea")) return;
    var key = e.key;
    if (confirmOpen()) {
      if (key === "Escape") {
        hideConfirm();
        e.preventDefault();
      } else if (key !== "Tab" && key !== "Enter" && key !== " ") {
        e.preventDefault();
      }
      return;
    }
    if (winOpen()) {
      if (key === "Escape") {
        hideWin();
        e.preventDefault();
      } else if (key !== "Tab" && key !== "Enter" && key !== " ") {
        e.preventDefault();
      }
      return;
    }
    if (helpOpen()) {
      if (key === "Escape") {
        hideHelp();
        e.preventDefault();
      } else if (key !== "Tab" && key !== "Enter" && key !== " ") {
        e.preventDefault();
      }
      return;
    }
    if (key === "Escape") {
      if (state.view === "settings") {
        closeSettings(false);
        e.preventDefault();
      } else if (state.view === "play") {
        goHome(false);
        e.preventDefault();
      }
      return;
    }
    if (state.view !== "play") return;
    if (state.adPending) {
      e.preventDefault();
      return;
    }
    var lower = key.toLowerCase();
    if (lower === "1") { setTool("fill"); e.preventDefault(); return; }
    if (lower === "2") { setTool("mark"); e.preventDefault(); return; }
    if (lower === "z" && !e.shiftKey) { undo(); e.preventDefault(); return; }
    if (lower === "y" || (lower === "z" && e.shiftKey) || (lower === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey)) {
      redo();
      e.preventDefault();
      return;
    }
    if (lower === "h") { useHint(); e.preventDefault(); return; }
    if (lower === "c" && !e.ctrlKey && !e.metaKey) { runCheck(); e.preventDefault(); return; }

    var inGrid = e.target.closest && e.target.closest("#grid");
    var onForeignButton = e.target.closest && e.target.closest("button") && !inGrid;
    if (key === "Enter" || key === " ") {
      if (inGrid) {
        e.preventDefault();
        doSingle(Number(e.target.dataset.i), state.tool);
      }
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      if (!onForeignButton) {
        e.preventDefault();
        doSingle(inGrid ? Number(e.target.dataset.i) : state.cursor, "clear");
      }
      return;
    }
    if (key === "x" || key === "X") {
      if (!onForeignButton) {
        e.preventDefault();
        doSingle(inGrid ? Number(e.target.dataset.i) : state.cursor, "mark");
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(key) >= 0) {
      if (onForeignButton) return;
      e.preventDefault();
      moveCursor(key);
    }
  }

  function startTimer() {
    if (state.timer || state.won || state.view !== "play") return;
    state.tickAt = Date.now();
    state.timer = setInterval(onTick, 250);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function onTick() {
    if (document.hidden || state.won || state.adPending) return;
    var now = Date.now();
    var delta = Math.floor((now - state.tickAt) / 1000);
    if (delta <= 0) return;
    state.seconds += delta;
    state.tickAt += delta * 1000;
    var el = document.getElementById("time");
    if (el) el.textContent = formatTime(state.seconds);
    if (state.seconds % 5 === 0) persistProgress();
  }

  function onVisibility() {
    if (document.hidden) {
      stopTimer();
      if (state.view === "play") persistProgress();
      return;
    }
    if (state.view === "play" && !state.won && state.started && !state.adPending) startTimer();
  }

  function audioCtx() {
    if (!state.sound) return null;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!state.audio) state.audio = new Ctx();
      if (state.audio.state === "suspended") state.audio.resume();
      return state.audio;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, dur, when, gain) {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(gain || 0.03, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function chimeWin() {
    tone(523, 0.12, 0, 0.03);
    tone(659, 0.14, 0.09, 0.03);
    tone(784, 0.2, 0.18, 0.035);
  }

  function nextRequestId(prefix) {
    requestSerial += 1;
    return prefix + "-" + requestSerial;
  }

  function clampLevel(n) {
    n = Math.floor(Number(n));
    if (!isFinite(n) || n < 0) return 0;
    if (n > 1000000) return 1000000;
    return n;
  }

  function currentUserId() {
    var bridge = window.SuperSpeedCalc;
    if (!bridge) return "";
    try {
      if (typeof bridge.getUserId === "function") return bridge.getUserId() || "";
      if (typeof bridge.getUser !== "function") return "";
      var raw = bridge.getUser();
      var user = typeof raw === "string" ? JSON.parse(raw) : raw;
      return user && user.userId ? String(user.userId) : "";
    } catch (e) {
      return "";
    }
  }

  function loggedIn() {
    var bridge = window.SuperSpeedCalc;
    if (!bridge) return false;
    try {
      if (typeof bridge.isLoggedIn === "function") return !!bridge.isLoggedIn();
      if (typeof bridge.getUser !== "function") return false;
      var raw = bridge.getUser();
      var user = typeof raw === "string" ? JSON.parse(raw) : raw;
      return !!(user && user.loggedIn);
    } catch (e) {
      return false;
    }
  }

  function hasModuleId() {
    var bridge = window.SuperSpeedCalc;
    if (!bridge || typeof bridge.getContext !== "function") return false;
    try {
      var raw = bridge.getContext();
      var ctx = typeof raw === "string" ? JSON.parse(raw) : raw;
      return !!(ctx && ctx.moduleId);
    } catch (e) {
      return false;
    }
  }

  function canLevelSync() {
    if (levelSync.blocked) return false;
    var bridge = window.SuperSpeedCalc;
    if (!bridge || typeof bridge.saveLevelProgress !== "function" || typeof bridge.queryLevelProgress !== "function") return false;
    return loggedIn() && hasModuleId();
  }

  function campaignSnapshot() {
    var highest = frontier();
    var cleared = tallyDone();
    var best = {};
    for (var i = 0; i < order.length; i++) {
      if (statusOf(order[i].id) !== "done") continue;
      var rec = recordOf(order[i].id);
      if (rec && typeof rec.best === "number" && isFinite(rec.best) && rec.best >= 0 && rec.best <= 1000000000) {
        best[order[i].id] = Math.floor(rec.best);
      }
    }
    var detail = JSON.stringify({ v: 1, best: best });
    if (detail.length > 50000) detail = "{\"v\":1}";
    return {
      highestCleared: clampLevel(highest),
      clearedCount: clampLevel(cleared),
      currentLevel: clampLevel(highest + 1),
      detailJson: detail
    };
  }

  function knownOrEmpty() {
    return levelSync.known || EMPTY_LEVEL;
  }

  function levelAhead(snap) {
    var known = knownOrEmpty();
    if (snap.highestCleared > known.highestCleared) return true;
    if (snap.clearedCount > known.clearedCount) return true;
    return snap.highestCleared > 0 && snap.currentLevel > known.currentLevel;
  }

  function rememberRemote(payload) {
    var next = {
      highestCleared: clampLevel(payload.highestCleared),
      clearedCount: clampLevel(payload.clearedCount),
      currentLevel: clampLevel(payload.currentLevel)
    };
    var known = levelSync.known;
    if (!known) {
      levelSync.known = next;
      return;
    }
    levelSync.known = {
      highestCleared: Math.max(known.highestCleared, next.highestCleared),
      clearedCount: Math.max(known.clearedCount, next.clearedCount),
      currentLevel: Math.max(known.currentLevel, next.currentLevel)
    };
  }

  function detailBest(json) {
    var data = null;
    var best = {};
    if (json && typeof json === "object") data = json;
    else if (typeof json === "string" && json) {
      try { data = JSON.parse(json); } catch (e) { return best; }
    } else return best;
    if (!data || typeof data.best !== "object" || !data.best) return best;
    Object.keys(data.best).forEach(function (id) {
      var n = data.best[id];
      if (typeof n === "number" && isFinite(n) && n >= 0 && n <= 1000000000) best[id] = Math.floor(n);
    });
    return best;
  }

  function markCleared(id, best) {
    var puzzle = byId[id];
    if (!puzzle) return false;
    var rec = save.puzzles[id];
    var changed = false;
    if (!rec) {
      rec = save.puzzles[id] = {
        cells: "",
        seconds: 0,
        hints: hintAllowance(puzzle.size),
        won: false,
        best: null,
        cleared: true
      };
      changed = true;
    } else if (!rec.cleared) {
      rec.cleared = true;
      changed = true;
    }
    if (typeof best === "number" && (rec.best == null || best < rec.best)) {
      rec.best = best;
      changed = true;
    }
    return changed;
  }

  function applyRemoteProgress(payload) {
    var n = Math.min(order.length, clampLevel(payload.highestCleared));
    var best = detailBest(payload.detailJson);
    var changed = false;
    for (var i = 0; i < n; i++) {
      if (markCleared(order[i].id, best[order[i].id])) changed = true;
    }
    if (!changed) return;
    writeSave();
    if (state.view === "home") renderHome();
  }

  function replaceLocalProgress(uid) {
    stopTimer();
    cancelColoring();
    state.adPending = null;
    state.view = "home";
    state.puzzle = null;
    state.pointerId = null;
    state.dragBefore = null;
    state.won = false;
    state.started = false;
    save.puzzles = {};
    save.boundUserId = uid;
    writeSave();
    levelSync.known = null;
    levelSync.saveId = "";
    levelSync.dirty = false;
    levelSync.saveRetries = 0;
    levelSync.queryRetries = 0;
    history.replaceState({ view: "home" }, "", location.pathname + location.search);
    document.title = "数织";
  }

  function queryLevelProgress() {
    if (!canLevelSync()) return;
    if (levelSync.queryId) return;
    var requestId = nextRequestId("levelq");
    levelSync.queryId = requestId;
    try {
      window.SuperSpeedCalc.queryLevelProgress(requestId, JSON.stringify({
        model: LEVEL_MODEL,
        userId: ""
      }));
    } catch (e) {
      levelSync.queryId = "";
    }
  }

  function pushLevelProgress() {
    if (!canLevelSync()) return;
    var snap = campaignSnapshot();
    if (!levelAhead(snap)) {
      levelSync.dirty = false;
      return;
    }
    if (levelSync.saveId) {
      levelSync.dirty = true;
      return;
    }
    if (!levelSync.known) levelSync.known = EMPTY_LEVEL;
    var requestId = nextRequestId("level");
    levelSync.saveId = requestId;
    levelSync.dirty = false;
    try {
      window.SuperSpeedCalc.saveLevelProgress(requestId, JSON.stringify({
        model: LEVEL_MODEL,
        highestCleared: snap.highestCleared,
        clearedCount: snap.clearedCount,
        currentLevel: snap.currentLevel,
        starsTotal: 0,
        detailJson: snap.detailJson
      }));
    } catch (e) {
      levelSync.saveId = "";
      levelSync.dirty = true;
    }
  }

  function onLevelQueried(payload) {
    if (!payload.requestId || payload.requestId !== levelSync.queryId) return;
    levelSync.queryId = "";
    if (!payload.ok) {
      if (payload.code === "NOT_LOGIN" || payload.code === "NO_MODULE") {
        levelSync.blocked = true;
        return;
      }
      if (!levelSync.known) levelSync.known = EMPTY_LEVEL;
      pushLevelProgress();
      if (levelSync.queryRetries < 2) {
        levelSync.queryRetries += 1;
        setTimeout(queryLevelProgress, 600 * levelSync.queryRetries);
      }
      return;
    }
    if (payload.model && payload.model !== LEVEL_MODEL) return;
    var uid = currentUserId();
    var replaced = false;
    if (uid && save.boundUserId && save.boundUserId !== uid) {
      replaceLocalProgress(uid);
      replaced = true;
    } else if (uid && save.boundUserId !== uid) {
      save.boundUserId = uid;
      writeSave();
    }
    var hasRecord = payload.highestCleared != null
      || payload.clearedCount != null
      || payload.currentLevel != null;
    if (hasRecord) applyRemoteProgress(payload);
    if (replaced) renderHome();
    rememberRemote(hasRecord ? payload : EMPTY_LEVEL);
    levelSync.queryRetries = 0;
    levelSync.saveRetries = 0;
    pushLevelProgress();
  }

  function onLevelSaved(payload) {
    if (!payload.requestId || payload.requestId !== levelSync.saveId) return;
    levelSync.saveId = "";
    if (payload.ok) {
      rememberRemote(payload);
      levelSync.saveRetries = 0;
      if (levelSync.dirty) pushLevelProgress();
      return;
    }
    if (payload.code === "NOT_LOGIN" || payload.code === "NO_MODULE") {
      levelSync.blocked = true;
      return;
    }
    if (levelSync.saveRetries < 2) {
      levelSync.saveRetries += 1;
      pushLevelProgress();
      return;
    }
    if (levelSync.dirty) pushLevelProgress();
  }

  function onLevelProgress(payload) {
    payload = readPayload(payload);
    if (!payload) return;
    if (payload.action === "save") onLevelSaved(payload);
    else if (payload.action === "query") onLevelQueried(payload);
  }

  window.SuperSpeedCalcH5 = {
    onReady: function () { queryLevelProgress(); },
    onLoginResult: function (payload) {
      payload = readPayload(payload);
      if (!payload || !payload.ok) return;
      levelSync.blocked = false;
      queryLevelProgress();
    },
    onUserChanged: function (payload) {
      payload = readPayload(payload);
      if (!payload || !payload.ok || !payload.user || !payload.user.loggedIn) return;
      var uid = payload.user.userId || "";
      if (uid && uid === save.boundUserId && levelSync.known) return;
      levelSync.blocked = false;
      queryLevelProgress();
    },
    onAdResult: function () {},
    onInterstitialResult: function (payload) { finishHintAd(payload); },
    onScoreResult: function () {},
    onLeaderboardResult: function () {},
    onMyScoreResult: function () {},
    onCurrencyResult: function () {},
    onCurrencyHistoryResult: function () {},
    onHistoryResult: function () {},
    onLevelProgressResult: function (payload) { onLevelProgress(payload); },
    onReplay: function () {},
    onAndroidBack: function () {
      if (helpOpen()) { hideHelp(); return true; }
      if (confirmOpen()) { hideConfirm(); return true; }
      if (winOpen()) { hideWin(); return true; }
      if (state.view === "settings") { closeSettings(false); return true; }
      if (state.view === "play") { goHome(false); return true; }
      return false;
    }
  };

  if (window.SuperSpeedCalc && typeof window.SuperSpeedCalc.ready === "function") {
    try { window.SuperSpeedCalc.ready(); } catch (err) {}
  }
  queryLevelProgress();
})();
