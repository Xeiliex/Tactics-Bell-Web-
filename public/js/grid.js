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
 * Generate a random battle stage from a randomly chosen known-good map config.
 * @param {number} stage  – stage number (used to filter eligible configs)
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

  // 2. Pick a map config appropriate for this stage
  var config = selectMapConfig(stage);

  // 3. Paint terrain clusters from the config's palette
  config.palette.forEach(function (entry) {
    for (var s = 0; s < entry.seeds; s++) {
      var sr = randInt(1, size - 2);
      var sc = randInt(1, size - 2);
      paintCluster(grid, sr, sc, entry.type, entry.spread);
    }
  });

  // 4. Add road tiles connecting the spawn zones
  var p0 = config.playerSpawns[0];
  var e0 = config.enemySpawns[0];
  addRoad(grid, p0.row, p0.col, e0.row, e0.col);

  // 5. Clear spawn zones so they are always accessible (must run after addRoad)
  clearSpawnArea(grid, config.playerSpawns);
  clearSpawnArea(grid, config.enemySpawns);

  // 6. Assign spawn positions from the config
  grid.playerSpawns = config.playerSpawns;
  grid.enemySpawns  = config.enemySpawns;

  return grid;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return a random map config eligible for the given stage.
 * Falls back to all configs if none match (should not happen with minStage: 1 entries).
 */
function selectMapConfig(stage) {
  var eligible = MAP_CONFIGS.filter(function (c) { return c.minStage <= stage; });
  if (!eligible.length) eligible = MAP_CONFIGS;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Clear the tile at each spawn point and its cardinal neighbours to grass,
 * ensuring units can always be placed and can move on the first turn.
 * getTile() returns null for out-of-bounds coords, so the null guard on `t`
 * is intentional; grid.neighbours() already filters invalid tiles internally.
 */
function clearSpawnArea(grid, spawns) {
  spawns.forEach(function (sp) {
    var t = grid.getTile(sp.row, sp.col);
    if (t) t.terrain = TERRAIN.GRASS;
    grid.neighbours(sp.row, sp.col).forEach(function (n) { n.terrain = TERRAIN.GRASS; });
  });
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
