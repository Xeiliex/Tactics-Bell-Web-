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
//   size         – grid side length (10, 12, or 14); defaults to 10 if omitted
//   minStage     – earliest stage this config may appear (1 = always)
//   palette      – terrain painting instructions:
//                    type   : TERRAIN constant
//                    seeds  : number of cluster starting points
//                    spread : probability of expansion to a neighbour (0–1)
//   playerSpawns – ordered spawn cells for player + allies (row, col)
//   enemySpawns  – ordered spawn cells for enemies (row, col)
//
// Spawn positions must match the declared size of the config.
// generateStage() picks the appropriate size from the stage number, then
// filters eligible configs by that size and minStage.

var MAP_CONFIGS = [

  // ── 10×10 — Stage 1+ ──────────────────────────────────────────────────────

  {
    id: 'rolling_plains',
    name: 'Rolling Plains',
    size: 10,
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
    size: 10,
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

  // ── 10×10 — Stage 2+ ──────────────────────────────────────────────────────

  {
    id: 'riverside_crossing',
    name: 'Riverside Crossing',
    size: 10,
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
    size: 10,
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

  // ── 10×10 — Stage 3+ ──────────────────────────────────────────────────────

  {
    id: 'volcanic_badlands',
    name: 'Volcanic Badlands',
    size: 10,
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
    size: 10,
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
  },

  // ── 12×12 — Stage 5+ ──────────────────────────────────────────────────────

  {
    id: 'broad_plains',
    name: 'Broad Plains',
    size: 12,
    minStage: 5,
    palette: [
      { type: TERRAIN.FOREST, seeds: 4, spread: 0.42 },
      { type: TERRAIN.WATER,  seeds: 2, spread: 0.30 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 11, col: 11 }, { row: 10, col: 11 }, { row: 11, col: 10 },
      { row: 9,  col: 11 }, { row: 11, col: 9  }
    ]
  },

  {
    id: 'twin_rivers',
    name: 'Twin Rivers',
    size: 12,
    minStage: 5,
    palette: [
      { type: TERRAIN.WATER,  seeds: 3, spread: 0.40 },
      { type: TERRAIN.FOREST, seeds: 3, spread: 0.35 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 11, col: 11 }, { row: 10, col: 11 }, { row: 11, col: 10 },
      { row: 9,  col: 11 }, { row: 11, col: 9  }
    ]
  },

  {
    id: 'highland_pass',
    name: 'Highland Pass',
    size: 12,
    minStage: 6,
    palette: [
      { type: TERRAIN.MOUNTAIN, seeds: 3, spread: 0.38 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.30 },
      { type: TERRAIN.FOREST,   seeds: 2, spread: 0.30 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 11, col: 11 }, { row: 10, col: 11 }, { row: 11, col: 10 },
      { row: 9,  col: 11 }, { row: 11, col: 9  }
    ]
  },

  {
    id: 'lava_fields',
    name: 'Lava Fields',
    size: 12,
    minStage: 7,
    palette: [
      { type: TERRAIN.LAVA,     seeds: 3, spread: 0.32 },
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.30 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.28 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 11, col: 11 }, { row: 10, col: 11 }, { row: 11, col: 10 },
      { row: 9,  col: 11 }, { row: 11, col: 9  }
    ]
  },

  // ── 14×14 — Stage 9+ ──────────────────────────────────────────────────────

  {
    id: 'grand_battlefield',
    name: 'Grand Battlefield',
    size: 14,
    minStage: 9,
    palette: [
      { type: TERRAIN.FOREST, seeds: 5, spread: 0.42 },
      { type: TERRAIN.WATER,  seeds: 2, spread: 0.30 },
      { type: TERRAIN.MOUNTAIN, seeds: 2, spread: 0.28 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 13, col: 13 }, { row: 12, col: 13 }, { row: 13, col: 12 },
      { row: 11, col: 13 }, { row: 13, col: 11 }
    ]
  },

  {
    id: 'volcanic_wastes',
    name: 'Volcanic Wastes',
    size: 14,
    minStage: 9,
    palette: [
      { type: TERRAIN.LAVA,     seeds: 4, spread: 0.32 },
      { type: TERRAIN.MOUNTAIN, seeds: 3, spread: 0.35 },
      { type: TERRAIN.CRYSTAL,  seeds: 2, spread: 0.28 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 13, col: 13 }, { row: 12, col: 13 }, { row: 13, col: 12 },
      { row: 11, col: 13 }, { row: 13, col: 11 }
    ]
  },

  {
    id: 'deep_crystal_expanse',
    name: 'Deep Crystal Expanse',
    size: 14,
    minStage: 10,
    palette: [
      { type: TERRAIN.CRYSTAL,  seeds: 5, spread: 0.40 },
      { type: TERRAIN.MOUNTAIN, seeds: 3, spread: 0.32 },
      { type: TERRAIN.LAVA,     seeds: 2, spread: 0.25 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 13, col: 13 }, { row: 12, col: 13 }, { row: 13, col: 12 },
      { row: 11, col: 13 }, { row: 13, col: 11 }
    ]
  },

  // ── 10×10 — Stage 2+ (with broken paths and ruins) ───────────────────────

  {
    id: 'broken_ruins',
    name: 'Broken Ruins',
    size: 10,
    minStage: 2,
    palette: [
      { type: TERRAIN.RUINS,       seeds: 3, spread: 0.28 },
      { type: TERRAIN.BROKEN_ROAD, seeds: 2, spread: 0.30 },
      { type: TERRAIN.FOREST,      seeds: 2, spread: 0.32 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  // ── 10×10 — Stage 4+ (mountain pass with broken paths) ───────────────────

  {
    id: 'ancient_pass',
    name: 'Ancient Pass',
    size: 10,
    minStage: 4,
    palette: [
      { type: TERRAIN.MOUNTAIN,    seeds: 4, spread: 0.38 },
      { type: TERRAIN.BROKEN_ROAD, seeds: 3, spread: 0.32 },
      { type: TERRAIN.FOREST,      seeds: 1, spread: 0.25 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 9, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 8 },
      { row: 7, col: 9 }, { row: 9, col: 7 }
    ]
  },

  // ── 12×12 — Stage 6+ (ruined citadel with trees) ─────────────────────────

  {
    id: 'ruined_citadel',
    name: 'Ruined Citadel',
    size: 12,
    minStage: 6,
    palette: [
      { type: TERRAIN.RUINS,       seeds: 4, spread: 0.30 },
      { type: TERRAIN.BROKEN_ROAD, seeds: 3, spread: 0.35 },
      { type: TERRAIN.FOREST,      seeds: 3, spread: 0.35 },
      { type: TERRAIN.MOUNTAIN,    seeds: 1, spread: 0.22 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 11, col: 11 }, { row: 10, col: 11 }, { row: 11, col: 10 },
      { row: 9,  col: 11 }, { row: 11, col: 9  }
    ]
  },

  // ── 14×14 — Stage 9+ (shattered valley with all new terrain types) ────────

  {
    id: 'shattered_valley',
    name: 'Shattered Valley',
    size: 14,
    minStage: 9,
    palette: [
      { type: TERRAIN.RUINS,       seeds: 4, spread: 0.30 },
      { type: TERRAIN.BROKEN_ROAD, seeds: 4, spread: 0.35 },
      { type: TERRAIN.MOUNTAIN,    seeds: 3, spread: 0.33 },
      { type: TERRAIN.FOREST,      seeds: 4, spread: 0.38 },
      { type: TERRAIN.WATER,       seeds: 1, spread: 0.22 }
    ],
    playerSpawns: [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 0 }
    ],
    enemySpawns: [
      { row: 13, col: 13 }, { row: 12, col: 13 }, { row: 13, col: 12 },
      { row: 11, col: 13 }, { row: 13, col: 11 }
    ]
  }

];
