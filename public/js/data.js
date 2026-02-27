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
//  WEATHER TYPES
// ═══════════════════════════════════════
//
// spdMod — subtracted from each unit's effective move range (min 1 tile).
//          Snow buries the field (−2), Rain soaks gear (−1).
// hitMod — added to the d20 attack roll before the hit check.
//          Negative values make attacks harder to land.
//          Fog (−3) severely obscures targeting; Wind (−2) deflects shots.
//
var WEATHER_TYPES = {
  clear: { id: 'clear', name: 'Clear', emoji: '\u2600\uFE0F',  description: 'Clear skies.',                                    spdMod:  0, hitMod:  0 },
  rain:  { id: 'rain',  name: 'Rain',  emoji: '\uD83C\uDF27\uFE0F', description: 'Rain slows movement and soaks gear.',             spdMod: -1, hitMod: -1 },
  snow:  { id: 'snow',  name: 'Snow',  emoji: '\u2744\uFE0F',  description: 'Snow buries the field and chills everyone.',      spdMod: -2, hitMod:  0 },
  wind:  { id: 'wind',  name: 'Wind',  emoji: '\uD83D\uDCA8',  description: 'Howling winds throw off every shot.',             spdMod:  0, hitMod: -2 },
  fog:   { id: 'fog',   name: 'Fog',   emoji: '\uD83C\uDF2B\uFE0F', description: 'Thick fog makes targeting nearly impossible.', spdMod:  0, hitMod: -3 }
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
//  Varied humans, animals, and monsters.
// ═══════════════════════════════════════
var ENEMY_PRESETS = [
  // ── Humans ──────────────────────────────────────────────────────────────────
  { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️', mr: 0.70, mg: 0.10, mb: 0.10 },
  { race: 'human',    classId: 'warrior', name: 'Bandit',        emoji: '🔪', mr: 0.55, mg: 0.35, mb: 0.15 },
  { race: 'human',    classId: 'warrior', name: 'Iron Guard',    emoji: '⚔️', mr: 0.50, mg: 0.50, mb: 0.55 },
  { race: 'human',    classId: 'archer',  name: 'Mercenary',     emoji: '🏹', mr: 0.45, mg: 0.40, mb: 0.20 },
  { race: 'human',    classId: 'archer',  name: 'Assassin',      emoji: '🎯', mr: 0.10, mg: 0.10, mb: 0.15 },
  { race: 'human',    classId: 'mage',    name: 'Cultist',       emoji: '🌀', mr: 0.20, mg: 0.10, mb: 0.40 },
  { race: 'human',    classId: 'healer',  name: 'Dark Priest',   emoji: '☠️', mr: 0.30, mg: 0.05, mb: 0.35 },
  { race: 'human',    classId: 'healer',  name: 'Dark Witch',    emoji: '🧙', mr: 0.60, mg: 0.10, mb: 0.40 },
  // ── Animals ─────────────────────────────────────────────────────────────────
  { race: 'beastkin', classId: 'warrior', name: 'Wolf',          emoji: '🐺', mr: 0.45, mg: 0.45, mb: 0.50 },
  { race: 'beastkin', classId: 'warrior', name: 'Panther',       emoji: '🐆', mr: 0.15, mg: 0.15, mb: 0.20 },
  { race: 'beastkin', classId: 'archer',  name: 'Hawk',          emoji: '🦅', mr: 0.60, mg: 0.50, mb: 0.20 },
  { race: 'dwarf',    classId: 'warrior', name: 'Bear',          emoji: '🐻', mr: 0.55, mg: 0.35, mb: 0.20 },
  // ── Monsters ────────────────────────────────────────────────────────────────
  { race: 'beastkin', classId: 'warrior', name: 'Goblin',        emoji: '👺', mr: 0.20, mg: 0.55, mb: 0.15 },
  { race: 'beastkin', classId: 'archer',  name: 'Goblin Scout',  emoji: '🏹', mr: 0.25, mg: 0.50, mb: 0.10 },
  { race: 'dwarf',    classId: 'warrior', name: 'Orc',           emoji: '👹', mr: 0.15, mg: 0.50, mb: 0.15 },
  { race: 'dwarf',    classId: 'warrior', name: 'Troll',         emoji: '👾', mr: 0.25, mg: 0.45, mb: 0.25 },
  { race: 'human',    classId: 'warrior', name: 'Skeleton',      emoji: '💀', mr: 0.85, mg: 0.85, mb: 0.80 },
  { race: 'elf',      classId: 'mage',    name: 'Wraith',        emoji: '👻', mr: 0.40, mg: 0.35, mb: 0.55 },
  { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑', mr: 0.30, mg: 0.10, mb: 0.50 },
  { race: 'elf',      classId: 'healer',  name: 'Necromancer',   emoji: '💠', mr: 0.20, mg: 0.10, mb: 0.45 },
  { race: 'dwarf',    classId: 'warrior', name: 'Orc Crusher',   emoji: '🪨', mr: 0.20, mg: 0.50, mb: 0.10 },
  { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🏹', mr: 0.20, mg: 0.20, mb: 0.20 }
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
//  BACKGROUNDS  (D&D-style origin bonus)
// ═══════════════════════════════════════
var BACKGROUNDS = {
  soldier: {
    id: 'soldier', name: 'Soldier', emoji: '🪖',
    color: '#EF5350',
    description: 'Trained in military discipline. Combat experience gives you an edge on the battlefield.',
    flavor: '"I have seen a thousand battles. Each one had a lesson."',
    statBonuses: { hp: 5, atk: 2, def: 2, mag: 0, spd: 0, res: 0 }
  },
  scholar: {
    id: 'scholar', name: 'Scholar', emoji: '📚',
    color: '#AB47BC',
    description: 'Years of study sharpened your mind and deepened your mastery of arcane forces.',
    flavor: '"Knowledge is the sharpest weapon of all."',
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 3, spd: 0, res: 2 }
  },
  wanderer: {
    id: 'wanderer', name: 'Wanderer', emoji: '🌿',
    color: '#66BB6A',
    description: 'Roaming wild lands forged your endurance. You are swift and hard to pin down.',
    flavor: '"Every road leads somewhere new."',
    statBonuses: { hp: 5, atk: 0, def: 0, mag: 0, spd: 3, res: 0 }
  },
  noble: {
    id: 'noble', name: 'Noble', emoji: '👑',
    color: '#FFD700', // matches --gold CSS variable
    description: 'Born to privilege, you received the finest training across all disciplines.',
    flavor: '"Duty above all. Honour above all."',
    statBonuses: { hp: 0, atk: 1, def: 1, mag: 1, spd: 0, res: 1 }
  },
  outcast: {
    id: 'outcast', name: 'Outcast', emoji: '🌑',
    color: '#78909C',
    description: 'Surviving on the margins made you resilient and resourceful. You trust your instincts.',
    flavor: '"They cast me out. I became stronger for it."',
    statBonuses: { hp: 10, atk: 0, def: 0, mag: 0, spd: 2, res: 0 }
  },
  mystic: {
    id: 'mystic', name: 'Mystic', emoji: '✨',
    color: '#00E5FF',
    description: 'Touched by arcane energies since birth. Magic flows through your very being.',
    flavor: '"The veil between worlds is thinner than you think."',
    statBonuses: { hp: -5, atk: 0, def: 0, mag: 4, spd: 0, res: 3 }
  }
};

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
//  Themed enemy parties that scale with story progression.
//  Party names reflect the narrative encounter type.
// ═══════════════════════════════════════
var STAGE_ENEMY_CONFIGS = [
  {
    // Stage 1-2 — Bandit Ambush: a pair of human thugs
    minStage: 1, maxStage: 2, partyName: 'Bandit Ambush',
    team: [
      { race: 'human', classId: 'warrior', name: 'Bandit',     emoji: '🔪', mr: 0.55, mg: 0.35, mb: 0.15 },
      { race: 'human', classId: 'archer',  name: 'Mercenary',  emoji: '🏹', mr: 0.45, mg: 0.40, mb: 0.20 }
    ]
  },
  {
    // Stage 3-4 — Goblin Raid: small monsters with a wolf companion
    minStage: 3, maxStage: 4, partyName: 'Goblin Raid',
    team: [
      { race: 'beastkin', classId: 'warrior', name: 'Goblin',     emoji: '👺', mr: 0.20, mg: 0.55, mb: 0.15 },
      { race: 'beastkin', classId: 'warrior', name: 'Wolf',       emoji: '🐺', mr: 0.45, mg: 0.45, mb: 0.50 },
      { race: 'beastkin', classId: 'archer',  name: 'Goblin Scout', emoji: '🏹', mr: 0.25, mg: 0.50, mb: 0.10 }
    ]
  },
  {
    // Stage 5-6 — Mercenary Company: mixed human fighters
    minStage: 5, maxStage: 6, partyName: 'Mercenary Company',
    team: [
      { race: 'human', classId: 'warrior', name: 'Dark Knight', emoji: '🗡️', mr: 0.70, mg: 0.10, mb: 0.10 },
      { race: 'human', classId: 'archer',  name: 'Assassin',    emoji: '🎯', mr: 0.10, mg: 0.10, mb: 0.15 },
      { race: 'human', classId: 'healer',  name: 'Dark Priest', emoji: '☠️', mr: 0.30, mg: 0.05, mb: 0.35 }
    ]
  },
  {
    // Stage 7-8 — Dark Cult: mages and undead
    minStage: 7, maxStage: 8, partyName: 'Dark Cult',
    team: [
      { race: 'human',    classId: 'warrior', name: 'Skeleton',    emoji: '💀', mr: 0.85, mg: 0.85, mb: 0.80 },
      { race: 'elf',      classId: 'mage',    name: 'Wraith',      emoji: '👻', mr: 0.40, mg: 0.35, mb: 0.55 },
      { race: 'human',    classId: 'mage',    name: 'Cultist',     emoji: '🌀', mr: 0.20, mg: 0.10, mb: 0.40 },
      { race: 'elf',      classId: 'healer',  name: 'Necromancer', emoji: '💠', mr: 0.20, mg: 0.10, mb: 0.45 }
    ]
  },
  {
    // Stage 9-11 — Beast Horde: animals and beastkin warriors
    minStage: 9, maxStage: 11, partyName: 'Beast Horde',
    team: [
      { race: 'beastkin', classId: 'warrior', name: 'Panther',  emoji: '🐆', mr: 0.15, mg: 0.15, mb: 0.20 },
      { race: 'dwarf',    classId: 'warrior', name: 'Bear',     emoji: '🐻', mr: 0.55, mg: 0.35, mb: 0.20 },
      { race: 'beastkin', classId: 'archer',  name: 'Hawk',     emoji: '🦅', mr: 0.60, mg: 0.50, mb: 0.20 },
      { race: 'beastkin', classId: 'warrior', name: 'Wolf',     emoji: '🐺', mr: 0.45, mg: 0.45, mb: 0.50 }
    ]
  },
  {
    // Stage 12+ — Elite Forces: full mixed team of the hardest enemies
    minStage: 12, maxStage: null, partyName: 'Elite Forces',
    team: [
      { race: 'dwarf',    classId: 'warrior', name: 'Orc Crusher',   emoji: '🪨', mr: 0.20, mg: 0.50, mb: 0.10 },
      { race: 'elf',      classId: 'mage',    name: 'Shadow Mage',   emoji: '🌑', mr: 0.30, mg: 0.10, mb: 0.50 },
      { race: 'beastkin', classId: 'archer',  name: 'Shadow Archer', emoji: '🏹', mr: 0.20, mg: 0.20, mb: 0.20 },
      { race: 'human',    classId: 'healer',  name: 'Dark Witch',    emoji: '🧙', mr: 0.60, mg: 0.10, mb: 0.40 },
      { race: 'human',    classId: 'warrior', name: 'Dark Knight',   emoji: '🗡️', mr: 0.70, mg: 0.10, mb: 0.10 }
    ]
  }
];

// ═══════════════════════════════════════
//  QUICK MATCH HERO PARTIES
//  Pre-built party configurations for the Quick Match feature.
//  Each entry has a label and an array of 3 party-member configs.
// ═══════════════════════════════════════
var QUICK_MATCH_HERO_PARTIES = [
  {
    label: 'Warriors',
    members: [
      { name: 'Grunt',   race: 'human',    classId: 'warrior', backgroundId: 'soldier',  colorId: 'crimson'  },
      { name: 'Scout',   race: 'beastkin', classId: 'archer',  backgroundId: 'wanderer', colorId: 'emerald'  },
      { name: 'Cleric',  race: 'human',    classId: 'healer',  backgroundId: 'mystic',   colorId: 'default'  }
    ]
  },
  {
    label: 'Mages',
    members: [
      { name: 'Wizard',  race: 'elf',   classId: 'mage',    backgroundId: 'scholar',  colorId: 'violet'   },
      { name: 'Guard',   race: 'dwarf', classId: 'warrior', backgroundId: 'soldier',  colorId: 'amber'    },
      { name: 'Sage',    race: 'elf',   classId: 'healer',  backgroundId: 'mystic',   colorId: 'sapphire' }
    ]
  },
  {
    label: 'Rangers',
    members: [
      { name: 'Ranger',  race: 'beastkin', classId: 'archer',  backgroundId: 'wanderer', colorId: 'emerald'  },
      { name: 'Knight',  race: 'human',    classId: 'warrior', backgroundId: 'noble',    colorId: 'amber'    },
      { name: 'Shaman',  race: 'elf',      classId: 'mage',    backgroundId: 'mystic',   colorId: 'violet'   }
    ]
  }
];
