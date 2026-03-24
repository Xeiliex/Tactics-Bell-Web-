// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR CONSTANTS & CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

var GRID_SIZE = 10; // 10x10 grid

var TERRAIN_TYPES = {
  grass: { name: 'Grass', color: '#2d9624', moveCost: 1 },
  water: { name: 'Water', color: '#1956b3', moveCost: 3, blocking: true },
  mountain: { name: 'Mountain', color: '#7a6652', moveCost: 2, blocking: true },
  forest: { name: 'Forest', color: '#194d0a', moveCost: 2 },
  lava: { name: 'Lava', color: '#ff4d00', moveCost: 4, blocking: true }
};

var UNIT_CLASSES = {
  warrior: { name: 'Warrior', outfit: 'ranger', weapon: 'sword' },
  archer: { name: 'Archer', outfit: 'ranger', weapon: 'bow' },
  mage: { name: 'Mage', outfit: 'peasant', weapon: 'staff' },
  healer: { name: 'Healer', outfit: 'peasant', weapon: 'staff' }
};

var TEAMS = {
  1: { name: 'Player', color: '#2d9624' },
  2: { name: 'Enemy', color: '#d41e00' },
  3: { name: 'Ally', color: '#2555d4' }
};

// ─── Phase 2 Constants ───

var PROP_TYPES = {
  BARREL: {
    id: 'barrel',
    name: 'Barrel',
    blocking: true,
    icon: '🪣',
    health: 20
  },
  CRATE: {
    id: 'crate',
    name: 'Crate',
    blocking: true,
    icon: '📦',
    health: 30
  },
  TREE: {
    id: 'tree',
    name: 'Tree',
    blocking: true,
    icon: '🌳',
    health: 50
  },
  WALL: {
    id: 'wall',
    name: 'Stone Wall',
    blocking: true,
    icon: '🧱',
    health: 100
  },
  TORCH: {
    id: 'torch',
    name: 'Torch',
    blocking: false,
    icon: '🔥',
    health: null
  },
  STATUE: {
    id: 'statue',
    name: 'Statue',
    blocking: true,
    icon: '🗿',
    health: 80
  },
  FOUNTAIN: {
    id: 'fountain',
    name: 'Fountain',
    blocking: true,
    icon: '⛲',
    health: 60
  },
  SPIKES: {
    id: 'spikes',
    name: 'Spike Trap',
    blocking: false,
    icon: '⚔️',
    damageOnEnter: 10
  }
};

var OBJECTIVE_TYPES = {
  DEFEAT_ALL: {
    id: 'defeat_all',
    name: 'Defeat All Enemies',
    description: 'Defeat all enemy units to win',
    params: { teamToDefeat: 2 }
  },
  DEFEAT_BOSS: {
    id: 'defeat_boss',
    name: 'Defeat Boss Unit',
    description: 'Defeat a specific unit',
    params: { targetUnitId: null }
  },
  REACH_LOCATION: {
    id: 'reach_location',
    name: 'Reach Location',
    description: 'Move a unit to a specific grid location',
    params: { gridRow: 0, gridCol: 0 }
  },
  TURN_LIMIT: {
    id: 'turn_limit',
    name: 'Turn Limit',
    description: 'Survive for X turns without defeating all enemies',
    params: { turns: 10 }
  },
  PROTECT_UNIT: {
    id: 'protect_unit',
    name: 'Protect Unit',
    description: 'Keep a friendly unit alive',
    params: { targetUnitId: null }
  },
  OCCUPY_REGION: {
    id: 'occupy_region',
    name: 'Occupy Region',
    description: 'Control a specified area for X turns',
    params: { startRow: 0, startCol: 0, endRow: 3, endCol: 3, turns: 5 }
  }
};

var AI_BEHAVIORS = {
  PATROL: {
    id: 'patrol',
    name: 'Patrol',
    description: 'Move between waypoints',
    params: { waypoints: [] }
  },
  DEFEND: {
    id: 'defend',
    name: 'Defend Position',
    description: 'Stay near starting position, attack threats',
    params: { defendRadius: 3 }
  },
  AGGRESSIVE: {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Hunt down and attack player units',
    params: { targetTeams: [1] }
  },
  PASSIVE: {
    id: 'passive',
    name: 'Passive',
    description: 'Only attack if provoked',
    params: { targetTeams: [1] }
  },
  RETREAT: {
    id: 'retreat',
    name: 'Retreat',
    description: 'Flee from combat towards spawn',
    params: { fleeRadius: 4 }
  },
  AMBUSH: {
    id: 'ambush',
    name: 'Ambush',
    description: 'Hide and wait for units to approach',
    params: { ambushRadius: 5 }
  }
};

var AI_DIFFICULTIES = {
  EASY: { id: 'easy', name: 'Easy', accuracy: 0.6, reactionTime: 2 },
  NORMAL: { id: 'normal', name: 'Normal', accuracy: 0.75, reactionTime: 1 },
  HARD: { id: 'hard', name: 'Hard', accuracy: 0.9, reactionTime: 0.5 },
  INSANE: { id: 'insane', name: 'Insane', accuracy: 1.0, reactionTime: 0 }
};
