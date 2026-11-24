(function (root) {
  "use strict";

  function compile(base, rules) {
    var fns = rules.map(function (rule) {
      var kind = rule[0];
      if (kind === "rows") {
        return function (r) {
          return r >= rule[1] && r <= rule[2] ? rule[3] : "";
        };
      }
      if (kind === "cols") {
        return function (r, c) {
          return c >= rule[1] && c <= rule[2] ? rule[3] : "";
        };
      }
      if (kind === "box") {
        return function (r, c) {
          return r >= rule[1] && r <= rule[2] && c >= rule[3] && c <= rule[4] ? rule[5] : "";
        };
      }
      if (kind === "cells") {
        var set = {};
        rule[1].forEach(function (p) { set[p[0] + "," + p[1]] = rule[2]; });
        return function (r, c) { return set[r + "," + c] || ""; };
      }
      return function () { return ""; };
    });
    return function (r, c) {
      var color = base;
      for (var i = 0; i < fns.length; i++) {
        var hit = fns[i](r, c);
        if (hit) color = hit;
      }
      return color;
    };
  }

  var pictures = {
    plus: compile("#c23c2a", []),
    heart: compile("#d23b3b", []),
    heart15: compile("#d23b3b", []),
    arrow: compile("#6ea4c4", [
      ["rows", 3, 4, "#3d6b8c"]
    ]),
    gem: compile("#1e6e78", [
      ["cells", [[1, 2], [2, 1], [2, 3], [3, 2]], "#3eaaa8"],
      ["cells", [[2, 2]], "#b7ecec"]
    ]),
    mushroom: compile("#c23c2a", [
      ["rows", 5, 9, "#f3e0c4"],
      ["cells", [[1, 4], [2, 3], [2, 6], [3, 1], [3, 8], [4, 3], [4, 6]], "#f7efe4"]
    ]),
    mushroom15: compile("#c23c2a", [
      ["rows", 7, 14, "#f3e0c4"],
      ["cells", [[1, 5], [1, 9], [2, 4], [2, 10], [3, 3], [3, 7], [3, 11], [4, 5], [4, 9], [5, 6], [5, 8]], "#f7efe4"]
    ]),
    house: compile("#a35a3a", [
      ["rows", 5, 8, "#f4e6d0"],
      ["rows", 9, 9, "#c4a574"]
    ]),
    cup: compile("#d7eef3", [
      ["rows", 0, 0, "#4d8f9a"],
      ["rows", 6, 8, "#5aa0a8"],
      ["rows", 9, 9, "#3d7d8a"],
      ["box", 1, 4, 8, 9, "#7eb8c4"]
    ]),
    cat: compile("#d4843c", [
      ["rows", 0, 0, "#e7a098"],
      ["cells", [[4, 4], [4, 5]], "#3d4a5c"],
      ["rows", 9, 9, "#b86a28"]
    ]),
    ghost: compile("#e7eef6", [
      ["rows", 8, 8, "#d5e0ec"],
      ["rows", 9, 9, "#b7c6d6"]
    ]),
    apple: compile("#d23b3b", [
      ["box", 4, 6, 5, 7, "#f08a82"],
      ["rows", 0, 1, "#3f8f4a"],
      ["cells", [[2, 7]], "#8a5a32"]
    ]),
    boat: compile("#3d6f8a", [
      ["rows", 2, 6, "#f6f1e6"],
      ["box", 0, 7, 7, 7, "#8a5a32"]
    ]),
    tree5: compile("#2f7a45", [
      ["rows", 2, 4, "#8a5a32"]
    ]),
    flag: compile("#c23c2a", [
      ["cols", 0, 0, "#8a5a32"]
    ]),
    moon: compile("#e2b84a", [
      ["cells", [[0, 3], [1, 1], [2, 0], [3, 1], [4, 3]], "#f8e7a4"]
    ]),
    key: compile("#e2b84a", [
      ["rows", 3, 4, "#b8893a"]
    ]),
    person: compile("#3d6b8c", [
      ["rows", 0, 0, "#e2b08a"],
      ["cells", [[1, 1], [1, 3]], "#e2b08a"],
      ["rows", 3, 4, "#3d4a5c"]
    ]),
    fish: compile("#3d7eb5", [
      ["rows", 6, 8, "#7eb6d6"],
      ["cols", 8, 9, "#245e86"],
      ["rows", 9, 9, "#e08a4a"]
    ]),
    tree: compile("#2f7a45", [
      ["rows", 5, 9, "#8a5a32"]
    ]),
    snow: compile("#f4f7fb", [
      ["rows", 3, 3, "#c23c2a"],
      ["rows", 7, 7, "#c47a4a"],
      ["rows", 9, 9, "#d5dee8"]
    ]),
    car: compile("#c4453a", [
      ["rows", 6, 8, "#2c2824"],
      ["box", 1, 2, 2, 7, "#c5e4f2"]
    ]),
    flower: compile("#d4567a", [
      ["rows", 5, 9, "#2f7a45"],
      ["box", 1, 3, 4, 5, "#e2b84a"]
    ]),
    rocket: compile("#f4f1ea", [
      ["rows", 0, 1, "#d4563a"],
      ["rows", 6, 8, "#d4563a"],
      ["rows", 9, 9, "#e07a3d"],
      ["box", 3, 4, 4, 5, "#7eb6d6"]
    ]),
    duck: compile("#e0a04a", [
      ["cells", [[2, 6], [2, 7]], "#e06a2a"],
      ["rows", 6, 8, "#c98a3a"]
    ]),
    penguin: compile("#2c3440", [
      ["cells", [[3, 5], [3, 7], [3, 9]], "#f7f4ef"],
      ["box", 4, 4, 7, 9, "#e07a3d"],
      ["rows", 11, 13, "#e07a3d"]
    ]),
    pine: compile("#2f7a45", [
      ["rows", 8, 14, "#8a5a32"]
    ]),
    balloon: compile("#e06a8a", [
      ["rows", 1, 1, "#f7efe4"],
      ["rows", 3, 3, "#5aa0c8"],
      ["rows", 4, 4, "#f7efe4"],
      ["rows", 6, 6, "#5aa0c8"],
      ["rows", 8, 10, "#8a7560"],
      ["rows", 11, 14, "#c47a4a"]
    ]),
    castle: compile("#d9cbb8", [
      ["rows", 0, 0, "#c23c2a"],
      ["rows", 1, 2, "#8d7b6a"],
      ["rows", 14, 14, "#8d7b6a"]
    ]),
    note: compile("#2c3440", [
      ["rows", 0, 2, "#c23c2a"]
    ]),
    umbrella: compile("#d4567a", [
      ["rows", 2, 4, "#8a5a32"]
    ]),
    mountain: compile("#6d7a55", [
      ["rows", 0, 1, "#f4f7fb"],
      ["rows", 2, 2, "#8a7b68"]
    ]),
    smile: compile("#e0b03a", [
      ["cells", [[1, 0], [1, 4]], "#e07a6a"]
    ]),
    candle: compile("#f6f0e4", [
      ["rows", 0, 0, "#e2b84a"],
      ["rows", 1, 1, "#e07a3d"],
      ["rows", 4, 4, "#c47a4a"]
    ]),
    hat: compile("#2c3440", [
      ["rows", 2, 2, "#c23c2a"]
    ]),
    hammer: compile("#c47a4a", [
      ["rows", 0, 0, "#9aa3b0"]
    ]),
    butterfly5: compile("#e07aa8", [
      ["rows", 3, 4, "#8a4a86"],
      ["cols", 2, 2, "#3d4a5c"]
    ]),
    stairs: compile("#c4a574", [
      ["rows", 1, 1, "#b8956a"],
      ["rows", 2, 2, "#a67c52"],
      ["rows", 3, 3, "#8a6848"],
      ["rows", 4, 4, "#6e5340"]
    ]),
    boat5: compile("#f6f1e6", [
      ["rows", 2, 2, "#c4a574"],
      ["rows", 3, 4, "#3d6f8a"]
    ]),
    rabbit: compile("#f0d8c4", [
      ["rows", 0, 1, "#e7a8a0"],
      ["box", 4, 4, 4, 5, "#e07a8a"],
      ["rows", 9, 9, "#d7b39a"]
    ]),
    turtle: compile("#2f7a45", [
      ["rows", 0, 1, "#7dba78"],
      ["rows", 7, 9, "#245c34"],
      ["box", 3, 3, 0, 1, "#245c34"],
      ["box", 3, 3, 8, 9, "#245c34"]
    ]),
    plane: compile("#4a6fa5", [
      ["rows", 0, 1, "#2f4d78"],
      ["box", 2, 4, 0, 1, "#7aa0d0"],
      ["box", 2, 4, 8, 9, "#7aa0d0"],
      ["cells", [[3, 2], [3, 3], [3, 6], [3, 7]], "#d7eef8"],
      ["rows", 8, 9, "#2c3440"]
    ]),
    cake: compile("#f0d2a8", [
      ["rows", 0, 0, "#c23c2a"],
      ["rows", 1, 2, "#f7c1d4"],
      ["rows", 5, 5, "#f7c1d4"],
      ["rows", 6, 7, "#e7a0b0"],
      ["rows", 8, 8, "#c47a4a"],
      ["rows", 9, 9, "#efe6d6"]
    ]),
    gift: compile("#c23c2a", [
      ["rows", 0, 3, "#e2b84a"],
      ["rows", 8, 8, "#e2b84a"]
    ]),
    cactus: compile("#3d7a45", [
      ["rows", 0, 0, "#e07aa8"],
      ["rows", 8, 9, "#c47a4a"]
    ]),
    train: compile("#c4453a", [
      ["rows", 3, 3, "#e2b84a"],
      ["rows", 4, 4, "#3d5a4a"],
      ["rows", 6, 8, "#2c2824"],
      ["rows", 9, 9, "#8a7560"]
    ]),
    butterfly: compile("#e07aa8", [
      ["rows", 6, 9, "#8a4a86"],
      ["cols", 4, 5, "#3d4a5c"]
    ]),
    letter: compile("#f3e6c8", [
      ["box", 0, 1, 8, 9, "#c23c2a"]
    ]),
    anchor: compile("#4d6278", [
      ["rows", 0, 0, "#e2b84a"],
      ["rows", 5, 5, "#c47a4a"]
    ]),
    snail: compile("#e2b08a", [
      ["rows", 0, 4, "#c47a4a"],
      ["box", 2, 2, 2, 3, "#8a5a32"]
    ]),
    dog: compile("#c48a4a", [
      ["rows", 0, 0, "#8a5a32"],
      ["cells", [[4, 4], [4, 5]], "#3d4a5c"]
    ]),
    bee: compile("#e0b03a", [
      ["rows", 0, 0, "#2c3440"],
      ["rows", 2, 2, "#2c3440"],
      ["rows", 4, 4, "#2c3440"],
      ["rows", 7, 9, "#2c3440"],
      ["box", 2, 4, 0, 1, "#d5eaf2"],
      ["box", 2, 4, 8, 9, "#d5eaf2"]
    ]),
    lighthouse: compile("#f7f4ef", [
      ["rows", 0, 1, "#e2b84a"],
      ["rows", 2, 2, "#c23c2a"],
      ["rows", 5, 6, "#c23c2a"],
      ["rows", 9, 10, "#c23c2a"],
      ["rows", 13, 14, "#c4b5a4"]
    ]),
    crown: compile("#e0b03a", [
      ["rows", 13, 14, "#c4922a"],
      ["cells", [[0, 1]], "#c23c2a"],
      ["cells", [[0, 7]], "#3d7eb5"],
      ["cells", [[0, 13]], "#3d7a45"]
    ]),
    robot: compile("#8aa0ae", [
      ["cells", [[2, 6], [2, 8]], "#3dceb0"],
      ["cells", [[2, 4], [2, 10]], "#e2b84a"],
      ["box", 7, 7, 6, 8, "#3d7eb5"],
      ["rows", 11, 14, "#5a6e7c"]
    ]),
    owl: compile("#8a6a4a", [
      ["rows", 0, 0, "#5c4632"],
      ["rows", 3, 3, "#f0e0c8"],
      ["rows", 7, 8, "#c4a882"],
      ["cells", [[9, 7]], "#e2b84a"],
      ["rows", 13, 13, "#e2b84a"]
    ]),
    swan: compile("#f7f4ef", [
      ["cells", [[0, 12], [0, 13], [1, 13]], "#e07a3d"]
    ]),
    star15: compile("#e0b03a", [
      ["cells", [[7, 7]], "#f6e7a2"]
    ]),
    crab: compile("#c4453a", [
      ["rows", 0, 2, "#e07a55"],
      ["rows", 9, 14, "#9a342c"]
    ]),
    sun20: compile("#e07a3d", [
      ["box", 5, 14, 5, 14, "#e2b84a"]
    ]),
    house20: compile("#f4e6d0", [
      ["rows", 1, 8, "#a35a3a"]
    ]),
    fish20: compile("#3d7eb5", [
      ["cols", 0, 5, "#245e86"],
      ["box", 2, 6, 9, 15, "#7eb6d6"]
    ]),
    mushroom25: compile("#c23c2a", [
      ["rows", 13, 24, "#f3e0c4"]
    ]),
    boat25: compile("#3d6f8a", [
      ["rows", 2, 16, "#f6f1e6"],
      ["cols", 12, 13, "#8a5a32"]
    ]),
    pine30: compile("#2f7a45", [
      ["box", 22, 29, 12, 16, "#8a5a32"],
      ["rows", 28, 29, "#8a5a32"]
    ]),
    cat30: compile("#d4843c", [
      ["rows", 1, 5, "#e7a098"]
    ]),
    castle40: compile("#d9cbb8", [
      ["rows", 6, 14, "#8d7b6a"],
      ["rows", 34, 37, "#8a7560"],
      ["box", 10, 12, 18, 21, "#c23c2a"]
    ]),
    land50: compile("#8a7b68", [
      ["rows", 0, 14, "#e2b84a"],
      ["rows", 45, 49, "#6d7a55"],
      ["box", 22, 40, 2, 14, "#2f7a45"],
      ["box", 30, 45, 6, 10, "#8a5a32"],
      ["box", 36, 45, 36, 47, "#f4e6d0"],
      ["box", 22, 36, 35, 49, "#a35a3a"]
    ]),
    koi50: compile("#e07a3d", [
      ["box", 26, 34, 16, 40, "#f4c98a"],
      ["cols", 0, 14, "#c4453a"],
      ["rows", 6, 16, "#c4453a"],
      ["rows", 36, 46, "#c4453a"],
      ["cells", [[21, 38], [21, 39]], "#2c3440"]
    ])
  };

  if (root.NonoPuzzles) {
    root.NonoPuzzles.forEach(function (puzzle) {
      if (!puzzle.paint || pictures[puzzle.id]) return;
      pictures[puzzle.id] = compile(puzzle.paint.base, puzzle.paint.rules || []);
    });
  }

  function swatch(id, r, c) {
    var paint = pictures[id];
    if (paint) return paint(r, c);
    return "#c23c2a";
  }

  var api = { swatch: swatch };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NonoPaints = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
