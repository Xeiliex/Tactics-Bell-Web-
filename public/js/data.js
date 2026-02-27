/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  TERRAIN TYPES
// ═══════════════════════════════════════
var TERRAIN = {
  GRASS:    { name: 'Grass',    passable: true,  defBonus: 0, resBonus: 0, hexColor: '#66BB6A', r: 0.40, g: 0.73, b: 0.30 },
  FOREST:   { name: 'Forest',   passable: true,  defBonus: 2, resBonus: 0, hexColor: '#2E7D32', r: 0.18, g: 0.49, b: 0.20 },
  WATER:    { name: 'Water',    passable: false, defBonus: 0, resBonus: 0, hexColor: '#1E88E5', r: 0.12, g: 0.53, b: 0.90 },
  MOUNTAIN: { name: 'Mountain', passable: false, defBonus: 0, resBonus: 0, hexColor: '#78909C', r: 0.47, g: 0.56, b: 0.61 },
  ROAD:     { name: 'Road',     passable: true,  defBonus: 0, resBonus: 0, hexColor: '#FFF176', r: 0.88, g: 0.84, b: 0.46 },
  LAVA:     { name: 'Lava',     passable: false, defBonus: 0, resBonus: 0, hexColor: '#FF5722', r: 1.00, g: 0.34, b: 0.13 },
  CRYSTAL:  { name: 'Crystal',  passable: true,  defBonus: 0, resBonus: 2, hexColor: '#CE93D8', r: 0.81, g: 0.58, b: 0.85 }
};

// ═══════════════════════════════════════
//  RACES
// ═══════════════════════════════════════
var RACES = {
  human: {
    id: 'human', name: 'Human', emoji: '👤',
    description: 'Versatile and adaptable warriors with extra EXP gains.',
    color: '#FFD700',
    mr: 1.00, mg: 0.85, mb: 0.20,   // mesh colour RGB 0-1
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, res: 0 },
    expMultiplier: 1.10
  },
  elf: {
    id: 'elf', name: 'Elf', emoji: '🧝',
    description: 'Graceful and magically gifted. High MAG and SPD.',
    color: '#00E676',
    mr: 0.00, mg: 0.90, mb: 0.46,
    statBonuses: { hp: -5, atk: -2, def: -2, mag: 5, spd: 3, res: 3 },
    expMultiplier: 1.00
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf', emoji: '🧔',
    description: 'Incredibly tough and resilient. High HP and DEF.',
    color: '#FF8A65',
    mr: 1.00, mg: 0.54, mb: 0.40,
    statBonuses: { hp: 15, atk: 3, def: 5, mag: -3, spd: -3, res: 2 },
    expMultiplier: 1.00
  },
  beastkin: {
    id: 'beastkin', name: 'Beastkin', emoji: '🐯',
    description: 'Wild and fierce. High ATK and SPD but low MAG.',
    color: '#FF6B9D',
    mr: 1.00, mg: 0.42, mb: 0.62,
    statBonuses: { hp: 5, atk: 5, def: -2, mag: -3, spd: 5, res: -1 },
    expMultiplier: 0.95
  }
};

// ═══════════════════════════════════════
//  CLASSES
// ═══════════════════════════════════════
var CLASSES = {
  warrior: {
    id: 'warrior', name: 'Warrior', emoji: '⚔️',
    description: 'Powerful melee fighter with high HP and DEF.',
    color: '#EF5350',
    baseStats: { hp: 55, atk: 14, def: 12, mag: 2, spd: 8, res: 5 },
    statGrowth: { hp: 8, atk: 3, def: 3, mag: 0, spd: 1, res: 1 },
    moveRange: 3, attackRange: 1,
    skills: [
      { id: 'slash',  name: 'Power Slash', emoji: '⚔️', type: 'physical', power: 1.3, range: 1, desc: 'A powerful melee slash.' },
      { id: 'bash',   name: 'Shield Bash', emoji: '🛡️', type: 'physical', power: 0.7, range: 1, desc: 'Knock the enemy back.' }
    ]
  },
  mage: {
    id: 'mage', name: 'Mage', emoji: '🔮',
    description: 'Long-range magical attacker. High MAG.',
    color: '#AB47BC',
    baseStats: { hp: 30, atk: 4, def: 3, mag: 16, spd: 7, res: 8 },
    statGrowth: { hp: 4, atk: 0, def: 1, mag: 4, spd: 1, res: 2 },
    moveRange: 2, attackRange: 3,
    skills: [
      { id: 'fireball', name: 'Fireball',  emoji: '🔥', type: 'magic', power: 1.5, range: 3, desc: 'Hurl a blazing fireball.' },
      { id: 'icelance', name: 'Ice Lance',  emoji: '❄️', type: 'magic', power: 1.2, range: 3, desc: 'A piercing lance of ice.' }
    ]
  },
  archer: {
    id: 'archer', name: 'Archer', emoji: '🏹',
    description: 'Precise long-range attacker. Highest SPD.',
    color: '#66BB6A',
    baseStats: { hp: 38, atk: 13, def: 6, mag: 4, spd: 11, res: 4 },
    statGrowth: { hp: 5, atk: 3, def: 1, mag: 1, spd: 2, res: 1 },
    moveRange: 3, attackRange: 4,
    skills: [
      { id: 'trueshot', name: 'True Shot',    emoji: '🏹', type: 'physical', power: 1.1, range: 4, desc: 'A pin-point accurate shot.' },
      { id: 'volley',   name: 'Arrow Volley', emoji: '🌧️', type: 'physical', power: 0.7, range: 4, desc: 'Shower of arrows.' }
    ]
  },
  healer: {
    id: 'healer', name: 'Healer', emoji: '💚',
    description: 'Restores HP to allies. High RES.',
    color: '#26C6DA',
    baseStats: { hp: 38, atk: 5, def: 6, mag: 12, spd: 9, res: 11 },
    statGrowth: { hp: 5, atk: 1, def: 1, mag: 3, spd: 1, res: 3 },
    moveRange: 3, attackRange: 2,
    skills: [
      { id: 'holylight', name: 'Holy Light',   emoji: '✨', type: 'heal',    power: 1.5, range: 2, desc: 'Restore HP to an ally.', targetsAllies: true },
      { id: 'strike',    name: 'Light Strike',  emoji: '💫', type: 'magic',   power: 1.0, range: 2, desc: 'A holy magic attack.' }
    ]
  }
};

// ═══════════════════════════════════════
//  EXP TABLE
// ═══════════════════════════════════════
/** EXP required to reach the NEXT level from current level. */
function expToNextLevel(level) {
  return Math.floor(100 * Math.pow(1.25, level - 1));
}

// ═══════════════════════════════════════
//  ENEMY PRESETS  (auto-scaled to stage)
// ═══════════════════════════════════════
var ENEMY_PRESETS = [
  { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️',  mr: 0.7, mg: 0.1, mb: 0.1 },
  { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑',  mr: 0.3, mg: 0.1, mb: 0.5 },
  { race: 'dwarf',    classId: 'warrior', name: 'Orc Crusher',   emoji: '👹',  mr: 0.2, mg: 0.5, mb: 0.1 },
  { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🎯',  mr: 0.2, mg: 0.2, mb: 0.2 },
  { race: 'human',    classId: 'healer',  name: 'Dark Witch',    emoji: '🧙',  mr: 0.6, mg: 0.1, mb: 0.4 }
];

// ═══════════════════════════════════════
//  ALLY PRESETS  (CPU-controlled allies)
// ═══════════════════════════════════════
var ALLY_PRESETS = [
  { race: 'human',    classId: 'warrior', name: 'Knight',   emoji: '🛡️' },
  { race: 'elf',      classId: 'mage',    name: 'Sorcerer', emoji: '🔮' },
  { race: 'beastkin', classId: 'archer',  name: 'Ranger',   emoji: '🏹' }
];

// ═══════════════════════════════════════
//  BODY COLOUR PRESETS  (character customisation)
// ═══════════════════════════════════════
var BODY_COLORS = [
  { id: 'default', name: 'Default', hex: null,      r: null, g: null, b: null },
  { id: 'crimson', name: 'Crimson', hex: '#E53935',  r: 0.90, g: 0.22, b: 0.21 },
  { id: 'sapphire', name: 'Sapphire', hex: '#1E88E5',  r: 0.12, g: 0.53, b: 0.90 },
  { id: 'emerald', name: 'Emerald', hex: '#43A047',  r: 0.26, g: 0.63, b: 0.28 },
  { id: 'violet',  name: 'Violet',  hex: '#8E24AA',  r: 0.56, g: 0.14, b: 0.67 },
  { id: 'amber',   name: 'Amber',   hex: '#FFB300',  r: 1.00, g: 0.70, b: 0.00 },
  { id: 'silver',  name: 'Silver',  hex: '#78909C',  r: 0.47, g: 0.56, b: 0.61 }
];

// ═══════════════════════════════════════
//  STAGE ENEMY CONFIGURATIONS
//  Mixed enemy teams that scale with story progression
// ═══════════════════════════════════════
var STAGE_ENEMY_CONFIGS = [
  {
    minStage: 1, maxStage: 2,
    team: [
      { race: 'human', classId: 'warrior', name: 'Dark Knight', emoji: '🗡️', mr: 0.7, mg: 0.1, mb: 0.1 },
      { race: 'human', classId: 'warrior', name: 'Iron Guard',  emoji: '⚔️',  mr: 0.5, mg: 0.1, mb: 0.1 }
    ]
  },
  {
    minStage: 3, maxStage: 5,
    team: [
      { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️', mr: 0.7, mg: 0.1, mb: 0.1 },
      { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑', mr: 0.3, mg: 0.1, mb: 0.5 },
      { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🎯', mr: 0.2, mg: 0.2, mb: 0.2 }
    ]
  },
  {
    minStage: 6, maxStage: 9,
    team: [
      { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️', mr: 0.7, mg: 0.1, mb: 0.1 },
      { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑', mr: 0.3, mg: 0.1, mb: 0.5 },
      { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🎯', mr: 0.2, mg: 0.2, mb: 0.2 },
      { race: 'human',    classId: 'healer',  name: 'Dark Witch',    emoji: '🧙', mr: 0.6, mg: 0.1, mb: 0.4 }
    ]
  },
  {
    minStage: 10, maxStage: null,
    team: [
      { race: 'dwarf',    classId: 'warrior', name: 'Orc Crusher',   emoji: '👹', mr: 0.2, mg: 0.5, mb: 0.1 },
      { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑', mr: 0.3, mg: 0.1, mb: 0.5 },
      { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🎯', mr: 0.2, mg: 0.2, mb: 0.2 },
      { race: 'human',    classId: 'healer',  name: 'Dark Witch',    emoji: '🧙', mr: 0.6, mg: 0.1, mb: 0.4 },
      { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️', mr: 0.7, mg: 0.1, mb: 0.1 }
    ]
  }
];
