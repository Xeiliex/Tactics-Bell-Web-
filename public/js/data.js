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
  ROAD:        { name: 'Road',        passable: true,  defBonus: 0, resBonus: 0, hexColor: '#FFF176', r: 0.88, g: 0.84, b: 0.46 },
  LAVA:        { name: 'Lava',        passable: false, defBonus: 0, resBonus: 0, hexColor: '#FF5722', r: 1.00, g: 0.34, b: 0.13 },
  CRYSTAL:          { name: 'Crystal',          passable: true,  defBonus: 0, resBonus: 2, hexColor: '#CE93D8', r: 0.81, g: 0.58, b: 0.85 },
  BROKEN_ROAD:      { name: 'Broken Road',      passable: true,  defBonus: 0, resBonus: 0, hexColor: '#8D6E63', r: 0.55, g: 0.43, b: 0.39 },
  RUINS:            { name: 'Ruins',            passable: false, defBonus: 0, resBonus: 0, hexColor: '#6D4C41', r: 0.43, g: 0.30, b: 0.26 },
  COBBLESTONE_ROAD: { name: 'Cobblestone Road', passable: true,  defBonus: 0, resBonus: 0, hexColor: '#B0BEC5', r: 0.69, g: 0.75, b: 0.77 },
  DIRT_PATH:        { name: 'Dirt Path',        passable: true,  defBonus: 0, resBonus: 0, hexColor: '#A1887F', r: 0.63, g: 0.53, b: 0.50 }
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
// terrainChanges — (optional) map of terrain transformations this weather can cause.
//                  Keyed by the original terrain name (from TERRAIN).
//                  `to` is the new TERRAIN type.
//                  `prob` is the per-tile chance (0–1) of this change occurring each round.
//
var WEATHER_TYPES = {
  clear: { id: 'clear', name: 'Clear', emoji: '☀️',  description: 'Clear skies.',
    spdMod:  0, hitMod:  0
  },
  rain:  { id: 'rain',  name: 'Rain',  emoji: '🌧️', description: 'Rain slows movement and soaks gear. Can cool lava.',
    spdMod: -1, hitMod: -1,
    terrainChanges: {
      Lava: { to: TERRAIN.BROKEN_ROAD, prob: 0.35 }
    }
  },
  snow:  { id: 'snow',  name: 'Snow',  emoji: '❄️',  description: 'Snow buries the field and chills everyone. Can freeze water.',
    spdMod: -2, hitMod:  0,
    terrainChanges: {
      Water: { to: TERRAIN.GRASS, prob: 0.25 }
    }
  },
  wind:  { id: 'wind',  name: 'Wind',  emoji: '💨',  description: 'Howling winds throw off every shot.',
    spdMod:  0, hitMod: -2
  },
  fog:   { id: 'fog',   name: 'Fog',   emoji: '🌫️', description: 'Thick fog makes targeting nearly impossible.',
    spdMod:  0, hitMod: -3
  }
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
//  tier 0 = base (any level)
//  tier 1 = advanced (requires level 10)
//  tier 2 = elite   (requires level 25)
//  advancesFrom = array of classIds that can promote into this class
// ═══════════════════════════════════════

/** Gold required to voluntarily reclass a character. */
var RECLASS_COST = 100;

/** Character levels at which a free promotion is offered. */
var PROMOTION_LEVELS = [10, 25];

var CLASSES = {
  // ── Tier 0 — Base Classes ─────────────────────────────────────────────────
  warrior: {
    id: 'warrior', name: 'Warrior', emoji: '⚔️',
    description: 'Powerful melee fighter with high HP and DEF.',
    color: '#EF5350',
    tier: 0, requiresLevel: 1, advancesFrom: null,
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
    tier: 0, requiresLevel: 1, advancesFrom: null,
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
    tier: 0, requiresLevel: 1, advancesFrom: null,
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
    tier: 0, requiresLevel: 1, advancesFrom: null,
    baseStats: { hp: 38, atk: 5, def: 6, mag: 12, spd: 9, res: 11 },
    statGrowth: { hp: 5, atk: 1, def: 1, mag: 3, spd: 1, res: 3 },
    moveRange: 3, attackRange: 2,
    skills: [
      { id: 'holylight', name: 'Holy Light',   emoji: '✨', type: 'heal',    power: 1.5, range: 2, desc: 'Restore HP to an ally.', targetsAllies: true },
      { id: 'strike',    name: 'Light Strike',  emoji: '💫', type: 'magic',   power: 1.0, range: 2, desc: 'A holy magic attack.' }
    ]
  },

  // ── Tier 1 — Advanced Classes (requires level 10) ─────────────────────────

  knight: {
    id: 'knight', name: 'Knight', emoji: '🛡️',
    description: 'Armoured guardian with exceptional DEF and HP. Hard to kill.',
    color: '#90CAF9',
    tier: 1, requiresLevel: 10, advancesFrom: ['warrior'],
    baseStats: { hp: 68, atk: 13, def: 20, mag: 4, spd: 7, res: 9 },
    statGrowth: { hp: 10, atk: 2, def: 5, mag: 0, spd: 1, res: 2 },
    moveRange: 3, attackRange: 1,
    skills: [
      { id: 'ironwall',  name: 'Iron Wall',  emoji: '🛡️', type: 'physical', power: 0.8, range: 1, desc: 'A guarding blow that absorbs recoil.' },
      { id: 'holyblade', name: 'Holy Blade', emoji: '✝️',  type: 'physical', power: 1.4, range: 1, desc: 'A sacred sword strike.' }
    ]
  },
  berserker: {
    id: 'berserker', name: 'Berserker', emoji: '🪓',
    description: 'Reckless warrior with devastating ATK. High risk, high reward.',
    color: '#EF9A9A',
    tier: 1, requiresLevel: 10, advancesFrom: ['warrior'],
    baseStats: { hp: 58, atk: 22, def: 9, mag: 1, spd: 13, res: 3 },
    statGrowth: { hp: 9, atk: 5, def: 2, mag: 0, spd: 2, res: 1 },
    moveRange: 4, attackRange: 1,
    skills: [
      { id: 'frenzy',  name: 'Frenzy',   emoji: '😤', type: 'physical', power: 1.8, range: 1, desc: 'Unleash a furious flurry of blows.' },
      { id: 'warcry',  name: 'War Cry',  emoji: '📣', type: 'physical', power: 0.6, range: 1, desc: 'Intimidate the enemy before striking.' }
    ]
  },
  sorcerer: {
    id: 'sorcerer', name: 'Sorcerer', emoji: '🌪️',
    description: 'Master of destructive magic. Enormous spell power at a cost to survivability.',
    color: '#CE93D8',
    tier: 1, requiresLevel: 10, advancesFrom: ['mage'],
    baseStats: { hp: 28, atk: 3, def: 2, mag: 24, spd: 9, res: 9 },
    statGrowth: { hp: 3, atk: 0, def: 0, mag: 7, spd: 1, res: 2 },
    moveRange: 2, attackRange: 4,
    skills: [
      { id: 'thunder', name: 'Thunder', emoji: '⚡',  type: 'magic', power: 1.8, range: 4, desc: 'Call down a bolt of lightning.' },
      { id: 'meteor',  name: 'Meteor',  emoji: '☄️', type: 'magic', power: 2.2, range: 4, desc: 'Summon a meteor from the sky.' }
    ]
  },
  sage: {
    id: 'sage', name: 'Sage', emoji: '📚',
    description: 'Wise scholar who balances offensive and support magic.',
    color: '#80CBC4',
    tier: 1, requiresLevel: 10, advancesFrom: ['mage'],
    baseStats: { hp: 35, atk: 5, def: 6, mag: 20, spd: 10, res: 14 },
    statGrowth: { hp: 5, atk: 0, def: 2, mag: 5, spd: 1, res: 3 },
    moveRange: 3, attackRange: 3,
    skills: [
      { id: 'arcaneblast', name: 'Arcane Blast', emoji: '💥', type: 'magic', power: 1.4, range: 3, desc: 'A focused burst of pure arcane energy.' },
      { id: 'mindshock',   name: 'Mind Shock',   emoji: '🌀', type: 'magic', power: 1.0, range: 3, desc: 'Disorient and damage the target.' }
    ]
  },
  ranger: {
    id: 'ranger', name: 'Ranger', emoji: '🌲',
    description: 'Swift wilderness scout with superior mobility and precision.',
    color: '#A5D6A7',
    tier: 1, requiresLevel: 10, advancesFrom: ['archer'],
    baseStats: { hp: 46, atk: 17, def: 10, mag: 5, spd: 15, res: 7 },
    statGrowth: { hp: 6, atk: 4, def: 2, mag: 1, spd: 3, res: 1 },
    moveRange: 4, attackRange: 4,
    skills: [
      { id: 'eagleeye',  name: 'Eagle Eye',  emoji: '🦅', type: 'physical', power: 1.4, range: 4, desc: 'A pin-point shot that never misses.' },
      { id: 'multishot', name: 'Multi-Shot', emoji: '🏹', type: 'physical', power: 0.8, range: 4, desc: 'Fire multiple arrows in rapid succession.' }
    ]
  },
  assassin: {
    id: 'assassin', name: 'Assassin', emoji: '🗡️',
    description: 'Lethal predator who strikes from the shadows with blinding speed.',
    color: '#546E7A',
    tier: 1, requiresLevel: 10, advancesFrom: ['archer'],
    baseStats: { hp: 36, atk: 20, def: 6, mag: 3, spd: 19, res: 5 },
    statGrowth: { hp: 4, atk: 5, def: 1, mag: 0, spd: 4, res: 1 },
    moveRange: 5, attackRange: 2,
    skills: [
      { id: 'shadowstrike', name: 'Shadow Strike', emoji: '🌑', type: 'physical', power: 2.0, range: 2, desc: 'A devastating sneak attack.' },
      { id: 'doublecut',    name: 'Double Cut',    emoji: '✂️', type: 'physical', power: 0.9, range: 2, desc: 'Two swift blade attacks in quick succession.' }
    ]
  },
  cleric: {
    id: 'cleric', name: 'Cleric', emoji: '🕊️',
    description: 'Devoted healer with powerful restoration magic and holy attacks.',
    color: '#FFF59D',
    tier: 1, requiresLevel: 10, advancesFrom: ['healer'],
    baseStats: { hp: 46, atk: 7, def: 10, mag: 18, spd: 11, res: 17 },
    statGrowth: { hp: 6, atk: 1, def: 2, mag: 5, spd: 1, res: 4 },
    moveRange: 3, attackRange: 2,
    skills: [
      { id: 'greatheal', name: 'Greater Heal', emoji: '💖', type: 'heal',  power: 2.0, range: 2, desc: 'Restore a large amount of HP to an ally.', targetsAllies: true },
      { id: 'smite',     name: 'Smite',        emoji: '⚡', type: 'magic', power: 1.5, range: 2, desc: 'Call down divine wrath upon a foe.' }
    ]
  },
  exorcist: {
    id: 'exorcist', name: 'Exorcist', emoji: '☯️',
    description: 'Holy warrior who purges evil. Offensive magic with light support.',
    color: '#FFCC80',
    tier: 1, requiresLevel: 10, advancesFrom: ['healer'],
    baseStats: { hp: 42, atk: 11, def: 8, mag: 20, spd: 12, res: 11 },
    statGrowth: { hp: 5, atk: 2, def: 1, mag: 5, spd: 1, res: 3 },
    moveRange: 3, attackRange: 3,
    skills: [
      { id: 'holywrath', name: 'Holy Wrath', emoji: '🌟', type: 'magic', power: 1.8, range: 3, desc: 'Unleash burning holy energy upon the foe.' },
      { id: 'purify',    name: 'Purify',     emoji: '✨', type: 'heal',  power: 1.2, range: 2, desc: 'Cleanse an ally and restore HP.', targetsAllies: true }
    ]
  },

  // ── Tier 2 — Elite Classes (requires level 25) ────────────────────────────

  paladin: {
    id: 'paladin', name: 'Paladin', emoji: '⚜️',
    description: 'Supreme holy warrior. Unbreakable defence with righteous power.',
    color: '#FFD54F',
    tier: 2, requiresLevel: 25, advancesFrom: ['knight'],
    baseStats: { hp: 88, atk: 20, def: 28, mag: 10, spd: 9, res: 16 },
    statGrowth: { hp: 12, atk: 3, def: 6, mag: 1, spd: 1, res: 3 },
    moveRange: 3, attackRange: 1,
    skills: [
      { id: 'divinestrike', name: 'Divine Strike', emoji: '✝️',  type: 'physical', power: 1.6, range: 1, desc: 'A blessed attack that shakes the heavens.' },
      { id: 'sacredshield', name: 'Sacred Shield', emoji: '🔰', type: 'physical', power: 0.5, range: 1, desc: 'Shield an ally while striking the foe.' }
    ]
  },
  warlord: {
    id: 'warlord', name: 'Warlord', emoji: '🏆',
    description: 'Unstoppable force of destruction. The mightiest melee warrior.',
    color: '#E57373',
    tier: 2, requiresLevel: 25, advancesFrom: ['berserker'],
    baseStats: { hp: 78, atk: 32, def: 14, mag: 2, spd: 17, res: 6 },
    statGrowth: { hp: 11, atk: 8, def: 3, mag: 0, spd: 2, res: 1 },
    moveRange: 4, attackRange: 1,
    skills: [
      { id: 'titanslash', name: 'Titan Slash',  emoji: '💥', type: 'physical', power: 2.5, range: 1, desc: 'A devastating cleave that shakes the earth.' },
      { id: 'battleroar', name: 'Battle Roar',  emoji: '🦁', type: 'physical', power: 1.0, range: 1, desc: 'A terrifying attack that stuns the enemy.' }
    ]
  },
  archmage: {
    id: 'archmage', name: 'Archmage', emoji: '🌌',
    description: 'The pinnacle of magical mastery. Reality bends to their will.',
    color: '#7986CB',
    tier: 2, requiresLevel: 25, advancesFrom: ['sorcerer'],
    baseStats: { hp: 36, atk: 5, def: 4, mag: 35, spd: 11, res: 15 },
    statGrowth: { hp: 4, atk: 0, def: 1, mag: 10, spd: 1, res: 3 },
    moveRange: 2, attackRange: 5,
    skills: [
      { id: 'arcaneburst', name: 'Arcane Burst', emoji: '💫', type: 'magic', power: 2.8, range: 5, desc: 'An overwhelming surge of arcane power.' },
      { id: 'timewarp',    name: 'Time Warp',    emoji: '⏳', type: 'magic', power: 1.5, range: 5, desc: 'Distort time to confuse and damage the foe.' }
    ]
  },
  oracle: {
    id: 'oracle', name: 'Oracle', emoji: '🔮',
    description: 'Mystic seer who shapes fate. Supreme support mage.',
    color: '#4DB6AC',
    tier: 2, requiresLevel: 25, advancesFrom: ['sage'],
    baseStats: { hp: 42, atk: 6, def: 8, mag: 28, spd: 14, res: 20 },
    statGrowth: { hp: 6, atk: 0, def: 2, mag: 7, spd: 1, res: 5 },
    moveRange: 3, attackRange: 4,
    skills: [
      { id: 'fatecast',  name: 'Fate Cast',  emoji: '🌠', type: 'magic', power: 2.0, range: 4, desc: 'A cosmic beam that never misses.' },
      { id: 'prophecy',  name: 'Prophecy',   emoji: '📿', type: 'heal',  power: 1.8, range: 3, desc: 'A foreseen blessing that restores HP.', targetsAllies: true }
    ]
  },
  beastmaster: {
    id: 'beastmaster', name: 'Beastmaster', emoji: '🐲',
    description: 'Commander of wild beasts. Unmatched mobility and raw power.',
    color: '#8BC34A',
    tier: 2, requiresLevel: 25, advancesFrom: ['ranger'],
    baseStats: { hp: 58, atk: 24, def: 14, mag: 9, spd: 19, res: 10 },
    statGrowth: { hp: 7, atk: 6, def: 2, mag: 1, spd: 3, res: 2 },
    moveRange: 5, attackRange: 4,
    skills: [
      { id: 'wildhunt',  name: 'Wild Hunt',  emoji: '🦌', type: 'physical', power: 1.8, range: 4, desc: 'A relentless charge across the battlefield.' },
      { id: 'beastcall', name: 'Beast Call', emoji: '🐯', type: 'physical', power: 1.2, range: 4, desc: 'Summon a wild beast to savage the foe.' }
    ]
  },
  shadow: {
    id: 'shadow', name: 'Shadow', emoji: '🌑',
    description: 'Phantom killer who strikes unseen. Unmatched speed and lethality.',
    color: '#455A64',
    tier: 2, requiresLevel: 25, advancesFrom: ['assassin'],
    baseStats: { hp: 44, atk: 30, def: 8, mag: 6, spd: 26, res: 7 },
    statGrowth: { hp: 5, atk: 7, def: 1, mag: 0, spd: 5, res: 1 },
    moveRange: 6, attackRange: 2,
    skills: [
      { id: 'deathmark',    name: 'Death Mark',    emoji: '💀', type: 'physical', power: 2.8, range: 2, desc: 'Mark a target — a guaranteed critical blow.' },
      { id: 'phantomstep',  name: 'Phantom Step',  emoji: '👻', type: 'physical', power: 1.5, range: 2, desc: 'Teleport behind the target and strike.' }
    ]
  },
  archbishop: {
    id: 'archbishop', name: 'Archbishop', emoji: '👑',
    description: 'Supreme divine healer. The last hope on any battlefield.',
    color: '#F8BBD0',
    tier: 2, requiresLevel: 25, advancesFrom: ['cleric'],
    baseStats: { hp: 58, atk: 9, def: 14, mag: 26, spd: 14, res: 24 },
    statGrowth: { hp: 8, atk: 1, def: 3, mag: 6, spd: 1, res: 6 },
    moveRange: 3, attackRange: 3,
    skills: [
      { id: 'divinegrace', name: 'Divine Grace', emoji: '💝', type: 'heal',  power: 2.5, range: 3, desc: 'Shower an ally in powerful healing radiance.', targetsAllies: true },
      { id: 'holyguard',   name: 'Holy Guard',   emoji: '🔰', type: 'magic', power: 1.5, range: 3, desc: 'A shining holy blast to smite the wicked.' }
    ]
  },
  inquisitor: {
    id: 'inquisitor', name: 'Inquisitor', emoji: '⚖️',
    description: 'Righteous holy warrior who purges evil with overwhelming divine power.',
    color: '#FF8F00',
    tier: 2, requiresLevel: 25, advancesFrom: ['exorcist'],
    baseStats: { hp: 54, atk: 18, def: 12, mag: 28, spd: 15, res: 16 },
    statGrowth: { hp: 7, atk: 3, def: 2, mag: 6, spd: 1, res: 4 },
    moveRange: 3, attackRange: 3,
    skills: [
      { id: 'holyjudgment', name: 'Holy Judgment', emoji: '⚡', type: 'magic', power: 2.4, range: 3, desc: 'Divine lightning strikes down the unworthy.' },
      { id: 'purge',        name: 'Purge',          emoji: '🌟', type: 'magic', power: 1.8, range: 3, desc: 'Obliterate all impurity with holy fire.' }
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
//  HAIR STYLE + COLOUR PRESETS  (character customisation)
// ═══════════════════════════════════════
var HAIR_STYLES = [
  { id: 'none',   name: 'None',      icon: '○' },
  { id: 'short',  name: 'Short',     icon: '◔' },
  { id: 'medium', name: 'Medium',    icon: '◑' },
  { id: 'long',   name: 'Long',      icon: '◕' },
  { id: 'tied',   name: 'Tied Back', icon: '●' }
];

var HAIR_COLORS = [
  { id: 'dark',   name: 'Dark',    hex: '#1a0a00', r: 0.10, g: 0.06, b: 0.02 },
  { id: 'brown',  name: 'Brown',   hex: '#6B3E26', r: 0.42, g: 0.24, b: 0.15 },
  { id: 'auburn', name: 'Auburn',  hex: '#A0522D', r: 0.63, g: 0.32, b: 0.18 },
  { id: 'blonde', name: 'Blonde',  hex: '#E8C68A', r: 0.91, g: 0.78, b: 0.54 },
  { id: 'silver', name: 'Silver',  hex: '#C8CDD4', r: 0.78, g: 0.80, b: 0.83 },
  { id: 'white',  name: 'White',   hex: '#F0F0F0', r: 0.94, g: 0.94, b: 0.94 },
  { id: 'red',    name: 'Red',     hex: '#8B1A1A', r: 0.55, g: 0.10, b: 0.10 },
  { id: 'indigo', name: 'Indigo',  hex: '#2B3BA7', r: 0.17, g: 0.23, b: 0.65 }
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
