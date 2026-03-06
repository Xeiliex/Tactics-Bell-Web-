/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GRID & STAGE GENERATION
// ═══════════════════════════════════════

var GRID_SIZE = 10;

// ─── Perlin noise generator ───────────────────────────────────────────────────
// Classic 2D Perlin noise implementation for procedural terrain generation.
// Adapted from the public-domain Java implementation by Ken Perlin.

var PerlinNoise = (function () {
  var p = new Uint8Array(512);

  function _init() {
    var permutation = [];
    for (var i = 0; i < 256; i++) { permutation[i] = i; }
    // Shuffle permutation array
    for (var i = 255; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = permutation[i]; permutation[i] = permutation[j]; permutation[j] = tmp;
    }
    for (var i = 0; i < 256; i++) { p[i] = p[i + 256] = permutation[i]; }
  }

  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(t, a, b) { return a + t * (b - a); }
  function _grad(hash, x, y) {
    var h = hash & 15;
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /** Generate a 2D Perlin noise value for coordinates (x, y). Returns [-1, 1]. */
  function noise(x, y) {
    var xi = Math.floor(x) & 255;
    var yi = Math.floor(y) & 255;
    var xf = x - Math.floor(x);
    var yf = y - Math.floor(y);

    var u = _fade(xf);
    var v = _fade(yf);

    var aa = p[p[xi] + yi];
    var ab = p[p[xi] + yi + 1];
    var ba = p[p[xi + 1] + yi];
    var bb = p[p[xi + 1] + yi + 1];

    var n1 = _grad(aa, xf, yf);
    var n2 = _grad(ba, xf - 1, yf);
    var n3 = _grad(ab, xf, yf - 1);
    var n4 = _grad(bb, xf - 1, yf - 1);

    var n_x1 = _lerp(u, n1, n2);
    var n_x2 = _lerp(u, n3, n4);
    return _lerp(v, n_x1, n_x2);
  }

  /** Octave-summed ("fractal") noise for more detail. Returns [-1, 1]. */
  function fractal(x, y, octaves, persistence) {
    var total = 0, frequency = 1, amplitude = 1, maxValue = 0;
    for (var i = 0; i < octaves; i++) {
      total += noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence; frequency *= 2;
    }
    return total / maxValue;
  }

  _init();
  return { noise: noise, fractal: fractal, reseed: _init };
}());

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
 * Return the grid size appropriate for the given stage number.
 * Stages 1–4: 10×10 (default)
 * Stages 5–8: 12×12
 * Stages 9+:  14×14
 * @param {number} stage
 * @returns {number}
 */
function gridSizeForStage(stage) {
  if (stage >= 9) return 14;
  if (stage >= 5) return 12;
  return 10;
}

/**
 * Generate a random battle stage from a randomly chosen known-good map config.
 * @param {number} stage  – stage number (used to filter eligible configs)
 * @returns {Grid}
 */
function generateStage(stage) {
  var size = gridSizeForStage(stage);
  var grid = new Grid(size);

  // 1. Pick a map config appropriate for this stage and grid size
  var config = selectMapConfig(stage, size);

  // 2. Generate terrain using Perlin noise
  PerlinNoise.reseed();
  var elevNoiseScale   = 6.5 / size;
  var featureNoiseScale = 9.0 / size;

  grid.tiles = [];
  for (var r = 0; r < size; r++) {
    grid.tiles[r] = [];
    for (var c = 0; c < size; c++) {
      var elev    = PerlinNoise.fractal(c * elevNoiseScale,    r * elevNoiseScale,    4, 0.5);
      var feature = PerlinNoise.fractal(c * featureNoiseScale, r * featureNoiseScale, 5, 0.6);

      var terrain = TERRAIN.GRASS;
      if (elev < -0.45) {
        terrain = TERRAIN.WATER;
      } else if (elev > 0.6) {
        terrain = TERRAIN.MOUNTAIN;
      } else if (elev > 0.5) {
        terrain = TERRAIN.BROKEN_ROAD;
      } else {
        // Grasslands: add features based on the second noise map
        if (feature > 0.55) {
          terrain = TERRAIN.FOREST;
        } else if (feature < -0.6) {
          // Place ruins in "drier" areas
          var isWall = PerlinNoise.noise(c * 2, r * 2) > 0.3;
          terrain = isWall ? TERRAIN.RUINS : TERRAIN.BROKEN_ROAD;
        } else if (Math.abs(feature) > 0.5 && elev > 0.3) {
          terrain = TERRAIN.CRYSTAL;
        }
      }

      grid.tiles[r][c] = new Tile(r, c, terrain);
    }
  });


/** Cellular-automata-style blob painter */
function paintCluster(grid, seedRow, seedCol, terrain, spreadChance) {
  var stack = [{ row: seedRow, col: seedCol, chance: spreadChance }];
  var visited = {};
  visited[seedRow + ',' + seedCol] = true;

  while (stack.length) {
    var cur = stack.pop();
    var tile = grid.tiles[cur.row][cur.col];

    // For mountains, leave some BROKEN_ROAD at the edges for a more rugged feel.
    if (terrain === TERRAIN.MOUNTAIN && Math.random() > 0.75) {
      tile.terrain = TERRAIN.BROKEN_ROAD;
    } else {
      tile.terrain = terrain;
    }

    var nbrs = grid.neighbours(cur.row, cur.col);
    for (var i = 0; i < nbrs.length; i++) {
      var key = nbrs[i].row + ',' + nbrs[i].col;
      // For forests, make them denser in the middle by reducing spread chance.
      var nextChance = (terrain === TERRAIN.FOREST) ? cur.chance * 0.85 : cur.chance;
      if (!visited[key] && Math.random() < nextChance) {
        visited[key] = true;
        stack.push({ row: nbrs[i].row, col: nbrs[i].col, chance: nextChance });
      }
    }
  }
}

/** Paints a rectangular building ruin with walls and a floor. */
function paintBuilding(grid, r, c, width, height) {
  for (var i = 0; i < width; i++) {
    for (var j = 0; j < height; j++) {
      var tile = grid.getTile(r + j, c + i);
      if (tile) {
        var isWall = (i === 0 || j === 0 || i === width - 1 || j === height - 1);
        tile.terrain = isWall ? TERRAIN.RUINS : TERRAIN.BROKEN_ROAD;
      }
    }
  }
}

  // 3. Add road tiles connecting the spawn zones
  var p0 = config.playerSpawns[0];
  var e0 = config.enemySpawns[0];
  addRoad(grid, p0.row, p0.col, e0.row, e0.col);

  // 4. Clear spawn zones so they are always accessible (must run after addRoad)
  clearSpawnArea(grid, config.playerSpawns);
  clearSpawnArea(grid, config.enemySpawns);

  // 5. Assign spawn positions from the config
  grid.playerSpawns = config.playerSpawns;
  grid.enemySpawns  = config.enemySpawns;

  return grid;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return a random map config eligible for the given stage and grid size.
 * Falls back to all configs of the requested size if none match by stage.
 */
function selectMapConfig(stage, size) {
  var eligible = MAP_CONFIGS.filter(function (c) {
    return c.size === size && c.minStage <= stage;
  });
  if (!eligible.length) {
    eligible = MAP_CONFIGS.filter(function (c) { return c.size === size; });
  }
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

/** Adds a loose road path connecting two points, with ~25% of tiles as broken road */
function addRoad(grid, r1, c1, r2, c2) {
  var r = r1, c = c1;
  var size = grid.size;
  var roadType = (Math.random() < 0.5) ? TERRAIN.COBBLESTONE_ROAD : TERRAIN.DIRT_PATH;

  while (r !== r2 || c !== c2) {
    if (grid.getTile(r, c)) {
      var t = grid.tiles[r][c];
      if (t.terrain === TERRAIN.GRASS || t.terrain === TERRAIN.CRYSTAL) {
        t.terrain = (Math.random() < 0.25) ? TERRAIN.BROKEN_ROAD : roadType;
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
