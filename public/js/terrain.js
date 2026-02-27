/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  MAP CONFIGS  — known good terrain layouts
// ═══════════════════════════════════════
//
// Each entry in MAP_CONFIGS describes a balanced, playable map layout:
//
//   id           – unique identifier
//   name         – display / debug label
//   minStage     – earliest stage this config may appear (1 = always)
//   palette      – terrain painting instructions:
//                    type   : TERRAIN constant
//                    seeds  : number of cluster starting points
//                    spread : probability of expansion to a neighbour (0–1)
//   playerSpawns – ordered spawn cells for player + allies (row, col)
//   enemySpawns  – ordered spawn cells for enemies (row, col)
//
// Spawn positions assume the default GRID_SIZE of 10.  All configs share the
// same diagonal layout (top-left player, bottom-right enemy) by design: this
// guarantees a consistent travel distance and road connection regardless of
// which config is chosen.  Future configs may use different corner pairs as
// long as GRID_SIZE remains 10.
//
// generateStage() in grid.js filters eligible configs by minStage, selects
// one at random, paints the board, then clears and assigns the spawn areas.

var MAP_CONFIGS = [

  // ── Stage 1+ ──────────────────────────────────────────────────────────────

  {
    id: 'rolling_plains',
    name: 'Rolling Plains',
    minStage: 1,
    palette: [
      { type: TERRAIN.FOREST, seeds: 3, spread: 0.42 },
      { type: TERRAIN.WATER,  seeds: 1, spread: 0.28 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  {
    id: 'misty_woodland',
    name: 'Misty Woodland',
    minStage: 1,
    palette: [
      { type: TERRAIN.FOREST, seeds: 5, spread: 0.48 },
      { type: TERRAIN.WATER,  seeds: 1, spread: 0.18 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  // ── Stage 2+ ──────────────────────────────────────────────────────────────

  {
    id: 'riverside_crossing',
    name: 'Riverside Crossing',
    minStage: 2,
    palette: [
      { type: TERRAIN.WATER,  seeds: 2, spread: 0.45 },
      { type: TERRAIN.FOREST, seeds: 3, spread: 0.35 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  {
    id: 'rocky_highlands',
    name: 'Rocky Highlands',
    minStage: 2,
    palette: [
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.35 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.30 },
      { type: TERRAIN.FOREST,   seeds: 2, spread: 0.30 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  // ── Stage 3+ ──────────────────────────────────────────────────────────────

  {
    id: 'volcanic_badlands',
    name: 'Volcanic Badlands',
    minStage: 3,
    palette: [
      { type: TERRAIN.LAVA,     seeds: 2, spread: 0.30 },
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.30 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.28 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  {
    id: 'crystal_caverns',
    name: 'Crystal Caverns',
    minStage: 3,
    palette: [
      { type: TERRAIN.CRYSTAL,  seeds: 3, spread: 0.38 },
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.30 },
      { type: TERRAIN.LAVA,     seeds: 1, spread: 0.22 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  }

];
