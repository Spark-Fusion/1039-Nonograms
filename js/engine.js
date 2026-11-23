(function (root) {
  "use strict";

  function cluesForLine(line) {
    var clues = [];
    var run = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === 1) {
        run += 1;
      } else if (run) {
        clues.push(run);
        run = 0;
      }
    }
    if (run) clues.push(run);
    return clues.length ? clues : [0];
  }

  function buildPuzzle(def) {
    var rows = def.rows;
    var size = rows.length;
    if (!size) throw new Error(def.id + " 没有行");
    var solution = [];
    var solutionFlat = [];
    for (var r = 0; r < size; r++) {
      var row = rows[r];
      if (row.length !== size) {
        throw new Error(def.id + " 第 " + (r + 1) + " 行长度是 " + row.length + "，不是 " + size);
      }
      var line = [];
      for (var c = 0; c < size; c++) {
        if (row.charAt(c) !== "0" && row.charAt(c) !== "1") {
          throw new Error(def.id + " 含有非法字符");
        }
        var v = row.charAt(c) === "1" ? 1 : 0;
        line.push(v);
        solutionFlat.push(v);
      }
      solution.push(line);
    }
    var rowClues = solution.map(cluesForLine);
    var colClues = [];
    for (var col = 0; col < size; col++) {
      var column = [];
      for (var rr = 0; rr < size; rr++) column.push(solution[rr][col]);
      colClues.push(cluesForLine(column));
    }
    var blacks = 0;
    for (var i = 0; i < solutionFlat.length; i++) blacks += solutionFlat[i];
    return {
      id: def.id,
      name: def.name,
      difficulty: def.difficulty,
      coach: def.coach || "",
      size: size,
      solution: solution,
      solutionFlat: solutionFlat,
      rowClues: rowClues,
      colClues: colClues,
      blacks: blacks,
      maxRowClues: Math.max.apply(null, rowClues.map(function (c) { return c.length; })),
      maxColClues: Math.max.apply(null, colClues.map(function (c) { return c.length; }))
    };
  }

  function isSolved(cells, solutionFlat) {
    if (!cells || cells.length !== solutionFlat.length) return false;
    for (var i = 0; i < solutionFlat.length; i++) {
      if ((cells[i] === 1) !== (solutionFlat[i] === 1)) return false;
    }
    return true;
  }

  function mistakeIndices(cells, solutionFlat) {
    var bad = [];
    for (var i = 0; i < solutionFlat.length; i++) {
      if (cells[i] === 1 && solutionFlat[i] === 0) bad.push(i);
      else if (cells[i] === 2 && solutionFlat[i] === 1) bad.push(i);
    }
    return bad;
  }

  // Prefer revealing a missing black cell. If every black cell is already
  // filled, point at one extra fill so the hint can still unblock a stuck board.
  function nextHint(cells, solutionFlat) {
    var i;
    for (i = 0; i < solutionFlat.length; i++) {
      if (solutionFlat[i] === 1 && cells[i] !== 1) return { i: i, value: 1 };
    }
    for (i = 0; i < solutionFlat.length; i++) {
      if (solutionFlat[i] === 0 && cells[i] === 1) return { i: i, value: 0 };
    }
    return null;
  }

  var api = {
    cluesForLine: cluesForLine,
    buildPuzzle: buildPuzzle,
    isSolved: isSolved,
    mistakeIndices: mistakeIndices,
    nextHint: nextHint
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  root.Nono = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
