/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GRID & STAGE GENERATION
// ═══════════════════════════════════════

var GRID_SIZE = 10;

/**
 * Represents a single tile on the battle grid.
 */
function Tile(row, col, terrain) {
  this.row     = row;
  this.col     = col;
  this.terrain = terrain;
  this.unit    = null;   // reference to occupying Unit
  this.mesh    = null;   // Babylon.js mesh
}

/**
 * Grid — holds all tile data and spawn positions.
 */
function Grid(size) {
  this.size   = size || GRID_SIZE;
  this.tiles  = [];          // 2-D array [row][col]
  this.playerSpawns = [];    // [{row,col}, ...]
  this.enemySpawns  = [];
}

Grid.prototype.getTile = function (row, col) {
  if (row < 0 || row >= this.size || col < 0 || col >= this.size) return null;
  return this.tiles[row][col];
};

Grid.prototype.isPassable = function (row, col) {
  var t = this.getTile(row, col);
  return t !== null && t.terrain.passable && t.unit === null;
};

Grid.prototype.isPassableIgnoreUnits = function (row, col) {
  var t = this.getTile(row, col);
  return t !== null && t.terrain.passable;
};

// Cardinal neighbours
Grid.prototype.neighbours = function (row, col) {
  var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  var result = [];
  for (var i = 0; i < dirs.length; i++) {
    var t = this.getTile(row + dirs[i][0], col + dirs[i][1]);
    if (t) result.push(t);
  }
  return result;
};

// ─── BFS reachable tiles (movement range, ignores unit-blocking for path) ───
Grid.prototype.reachableTiles = function (startRow, startCol, range) {
  var visited = {};
  var queue   = [{ row: startRow, col: startCol, steps: 0 }];
  var result  = [];
  visited[startRow + ',' + startCol] = true;

  while (queue.length) {
    var cur = queue.shift();
    if (cur.steps > 0) result.push(this.getTile(cur.row, cur.col));
    if (cur.steps >= range) continue;

    var nbrs = this.neighbours(cur.row, cur.col);
    for (var i = 0; i < nbrs.length; i++) {
      var key = nbrs[i].row + ',' + nbrs[i].col;
      if (!visited[key] && nbrs[i].terrain.passable) {
        visited[key] = true;
        queue.push({ row: nbrs[i].row, col: nbrs[i].col, steps: cur.steps + 1 });
      }
    }
  }
  return result;
};

// BFS path from start → end, returns array of tiles or null
Grid.prototype.findPath = function (startRow, startCol, endRow, endCol) {
  var visited = {};
  var prev    = {};
  var queue   = [{ row: startRow, col: startCol }];
  var startKey = startRow + ',' + startCol;
  visited[startKey] = true;

  while (queue.length) {
    var cur = queue.shift();
    var key = cur.row + ',' + cur.col;
    if (cur.row === endRow && cur.col === endCol) {
      // Reconstruct path
      var path = [];
      var k = endRow + ',' + endCol;
      while (k !== startKey) {
        var rc = k.split(',');
        path.unshift(this.getTile(parseInt(rc[0]), parseInt(rc[1])));
        k = prev[k];
      }
      return path;
    }
    var nbrs = this.neighbours(cur.row, cur.col);
    for (var i = 0; i < nbrs.length; i++) {
      var nk = nbrs[i].row + ',' + nbrs[i].col;
      if (!visited[nk] && nbrs[i].terrain.passable) {
        visited[nk] = true;
        prev[nk] = key;
        queue.push({ row: nbrs[i].row, col: nbrs[i].col });
      }
    }
  }
  return null;
};

// Tiles within attackRange (Manhattan distance, no terrain restriction)
Grid.prototype.tilesInRange = function (row, col, range) {
  var result = [];
  for (var r = 0; r < this.size; r++) {
    for (var c = 0; c < this.size; c++) {
      var dist = Math.abs(r - row) + Math.abs(c - col);
      if (dist >= 1 && dist <= range) result.push(this.tiles[r][c]);
    }
  }
  return result;
};

// ─── PROCEDURAL STAGE GENERATION ────────────────────────────────────────────

/**
 * Generate a random battle stage.
 * @param {number} stage  – stage number (affects terrain variety)
 * @returns {Grid}
 */
function generateStage(stage) {
  var grid = new Grid(GRID_SIZE);
  var size = GRID_SIZE;

  // 1. Fill with grass
  grid.tiles = [];
  for (var r = 0; r < size; r++) {
    grid.tiles[r] = [];
    for (var c = 0; c < size; c++) {
      grid.tiles[r][c] = new Tile(r, c, TERRAIN.GRASS);
    }
  }

  // 2. Terrain palette for this stage
  var palette = selectPalette(stage);

  // 3. Paint random terrain clusters
  palette.forEach(function (entry) {
    var seeds  = entry.seeds;
    var spread = entry.spread;
    var type   = entry.type;
    for (var s = 0; s < seeds; s++) {
      var sr = randInt(1, size - 2);
      var sc = randInt(1, size - 2);
      paintCluster(grid, sr, sc, type, spread);
    }
  });

  // 4. Guarantee spawn zones (top-left and bottom-right corners)
  var spawnZone = [
    [0,0],[0,1],[1,0],[1,1],[2,0],[0,2]
  ];
  var enemyZone = [
    [size-1,size-1],[size-1,size-2],[size-2,size-1],
    [size-2,size-2],[size-3,size-1],[size-1,size-3]
  ];

  spawnZone.forEach(function (rc) {
    grid.tiles[rc[0]][rc[1]].terrain = TERRAIN.GRASS;
  });
  enemyZone.forEach(function (rc) {
    grid.tiles[rc[0]][rc[1]].terrain = TERRAIN.GRASS;
  });

  // 5. Add some road tiles between spawn zones (aesthetic)
  addRoad(grid, 1, 1, size - 2, size - 2);

  // 6. Assign spawn positions
  grid.playerSpawns = [
    { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }
  ];
  grid.enemySpawns = [
    { row: size-1, col: size-1 },
    { row: size-2, col: size-1 },
    { row: size-1, col: size-2 },
    { row: size-3, col: size-1 },
    { row: size-1, col: size-3 }
  ];

  return grid;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function selectPalette(stage) {
  // Stage 1 = gentle terrain; higher stages = more obstacles
  var palettes = [
    // stage 1
    [
      { type: TERRAIN.FOREST, seeds: 3, spread: 0.45 },
      { type: TERRAIN.WATER,  seeds: 1, spread: 0.30 }
    ],
    // stage 2
    [
      { type: TERRAIN.FOREST,  seeds: 3, spread: 0.45 },
      { type: TERRAIN.WATER,   seeds: 2, spread: 0.35 },
      { type: TERRAIN.CRYSTAL, seeds: 2, spread: 0.30 }
    ],
    // stage 3+
    [
      { type: TERRAIN.FOREST,   seeds: 3, spread: 0.40 },
      { type: TERRAIN.WATER,    seeds: 2, spread: 0.35 },
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.30 },
      { type: TERRAIN.LAVA,     seeds: 1, spread: 0.25 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.30 }
    ]
  ];
  return palettes[Math.min(stage - 1, palettes.length - 1)];
}

/** Cellular-automata-style blob painter */
function paintCluster(grid, seedRow, seedCol, terrain, spreadChance) {
  var stack = [{ row: seedRow, col: seedCol }];
  var visited = {};
  visited[seedRow + ',' + seedCol] = true;

  while (stack.length) {
    var cur = stack.pop();
    grid.tiles[cur.row][cur.col].terrain = terrain;
    var nbrs = grid.neighbours(cur.row, cur.col);
    for (var i = 0; i < nbrs.length; i++) {
      var key = nbrs[i].row + ',' + nbrs[i].col;
      if (!visited[key] && Math.random() < spreadChance) {
        visited[key] = true;
        stack.push({ row: nbrs[i].row, col: nbrs[i].col });
      }
    }
  }
}

/** Adds a loose road path connecting two points */
function addRoad(grid, r1, c1, r2, c2) {
  var r = r1, c = c1;
  var size = grid.size;
  while (r !== r2 || c !== c2) {
    if (grid.getTile(r, c)) {
      var t = grid.tiles[r][c];
      if (t.terrain === TERRAIN.GRASS || t.terrain === TERRAIN.CRYSTAL) {
        t.terrain = TERRAIN.ROAD;
      }
    }
    // Randomly step toward target
    if (r !== r2 && (c === c2 || Math.random() > 0.5)) {
      r += (r2 > r) ? 1 : -1;
    } else if (c !== c2) {
      c += (c2 > c) ? 1 : -1;
    }
    // safety clamp
    r = Math.max(0, Math.min(size - 1, r));
    c = Math.max(0, Math.min(size - 1, c));
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
