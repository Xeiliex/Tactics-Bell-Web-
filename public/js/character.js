/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  CHARACTER — stat management, EXP & levelling
// ═══════════════════════════════════════

var _unitIdCounter = 0;

/** Neutral stat-bonus object used as fallback when no background is set. */
var _ZERO_STAT_BONUSES = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, res: 0 };

/**
 * Create a new character.
 * @param {object} opts
 *   - name, raceId, classId, level, isEnemy, isPlayer, isAlly
 *   - overrideColor  (optional, {r,g,b} 0-1 for enemy models)
 *   - emoji (optional)
 */
function Character(opts) {
  this.id       = ++_unitIdCounter;
  this.name     = opts.name      || 'Unit';
  this.race     = opts.raceId    || 'human';
  this.classId  = opts.classId   || 'warrior';
  this.level    = opts.level     || 1;
  this.isEnemy  = !!opts.isEnemy;
  this.isPlayer = !!opts.isPlayer;
  this.isAlly   = !!opts.isAlly;
  this.emoji    = opts.emoji     || CLASSES[this.classId].emoji;
  this.overrideMeshColor = opts.overrideMeshColor || null;
  this.backgroundId = opts.backgroundId || null;
  this.portrait     = opts.portrait     || null;  // data-URL captured from wizard preview

  // Grid position
  this.gridRow = 0;
  this.gridCol = 0;

  // EXP
  this.exp          = opts.exp || 0;
  this.expToNext    = expToNextLevel(this.level);

  // Compute base stats
  this._buildStats();

  // Current HP = max HP
  this.hp = this.maxHp;

  // Turn state (reset each turn)
  this.hasMoved    = false;
  this.hasActed    = false;

  // Status effects — always initialised so startTurn never hits undefined
  this.statusEffects = { burn: 0, stun: 0 };

  // Babylon mesh reference
  this.meshes = null;
}

Character.prototype._buildStats = function () {
  var raceData  = RACES[this.race];
  var classData = CLASSES[this.classId];
  var lvl       = this.level - 1; // growth iterations (0 at level 1)

  var bgBonus = (this.backgroundId && typeof BACKGROUNDS !== 'undefined' && BACKGROUNDS[this.backgroundId])
    ? BACKGROUNDS[this.backgroundId].statBonuses
    : _ZERO_STAT_BONUSES;

  this.maxHp  = classData.baseStats.hp  + raceData.statBonuses.hp  + classData.statGrowth.hp  * lvl + (bgBonus.hp  || 0);
  this.atk    = classData.baseStats.atk + raceData.statBonuses.atk + classData.statGrowth.atk * lvl + (bgBonus.atk || 0);
  this.def    = classData.baseStats.def + raceData.statBonuses.def + classData.statGrowth.def * lvl + (bgBonus.def || 0);
  this.mag    = classData.baseStats.mag + raceData.statBonuses.mag + classData.statGrowth.mag * lvl + (bgBonus.mag || 0);
  this.spd    = classData.baseStats.spd + raceData.statBonuses.spd + classData.statGrowth.spd * lvl + (bgBonus.spd || 0);
  this.res    = classData.baseStats.res + raceData.statBonuses.res + classData.statGrowth.res * lvl + (bgBonus.res || 0);

  this.moveRange   = classData.moveRange;
  this.attackRange = classData.attackRange;
  this.skills      = classData.skills;

  // Clamp to 1 minimum
  this.maxHp = Math.max(1, this.maxHp);
  this.atk   = Math.max(1, this.atk);
  this.def   = Math.max(0, this.def);
  this.mag   = Math.max(0, this.mag);
  this.spd   = Math.max(1, this.spd);
  this.res   = Math.max(0, this.res);
};

/** Restore HP to max (used for new stage). */
Character.prototype.restoreHp = function () {
  this.hp = this.maxHp;
};

/** Returns true if the unit is alive. */
Character.prototype.isAlive = function () {
  return this.hp > 0;
};

/** Returns HP ratio 0-1. */
Character.prototype.hpRatio = function () {
  return Math.max(0, Math.min(1, this.hp / this.maxHp));
};

/** Take damage. Returns actual damage dealt. */
Character.prototype.takeDamage = function (amount) {
  var dmg = Math.max(1, Math.round(amount));
  this.hp = Math.max(0, this.hp - dmg);
  return dmg;
};

/** Heal. Returns amount healed. */
Character.prototype.healHp = function (amount) {
  var heal = Math.max(1, Math.round(amount));
  var before = this.hp;
  this.hp = Math.min(this.maxHp, this.hp + heal);
  return this.hp - before;
};

/** Reset per-turn flags and tick active status effects. Returns an array of
 *  status-tick messages (may be empty) so the caller can show them in the log. */
Character.prototype.startTurn = function () {
  this.hasMoved  = false;
  this.hasActed  = false;

  var messages = [];
  var self = this;

  // Stun: unit skips its action this turn
  if (this.statusEffects.stun > 0) {
    this.statusEffects.stun--;
    this.hasActed = true;   // mark already acted so the action menu is skipped
    messages.push(this.name + ' is Stunned and cannot act! 💫');
  }

  // Burn: deal 2 damage per remaining turn
  if (this.statusEffects.burn > 0) {
    var burnDmg = 2;
    this.hp = Math.max(0, this.hp - burnDmg);
    this.statusEffects.burn--;
    messages.push(this.name + ' takes ' + burnDmg + ' burn damage! 🔥 (' + this.hp + ' HP left)');
  }

  return messages;
};

/**
 * Apply a status effect with the given duration (turns).
 * @param {'burn'|'stun'} status
 * @param {number} turns
 */
Character.prototype.applyStatus = function (status, turns) {
  this.statusEffects[status] = Math.max(this.statusEffects[status] || 0, turns);
};

/** Returns true if the unit is "bloodied" (HP below 50 % of max). */
Character.prototype.isBloodied = function () {
  return this.hp > 0 && this.hp < this.maxHp * 0.5;
};

/**
 * Grant EXP. Returns the stat-gains object if the unit levelled up, or null.
 */
Character.prototype.gainExp = function (amount) {
  var raceData = RACES[this.race];
  this.exp += Math.round(amount * raceData.expMultiplier);

  if (this.exp >= this.expToNext) {
    return this.levelUp();   // returns { hp, atk, def, mag, spd, res } gains
  }
  return null;
};

/**
 * Level up! Recalculate stats and return the stat gains.
 */
Character.prototype.levelUp = function () {
  this.exp -= this.expToNext;
  this.level++;
  this.expToNext = expToNextLevel(this.level);

  var oldMaxHp = this.maxHp;
  var oldAtk   = this.atk;
  var oldDef   = this.def;
  var oldMag   = this.mag;
  var oldSpd   = this.spd;
  var oldRes   = this.res;

  this._buildStats();

  var gains = {
    hp:  this.maxHp - oldMaxHp,
    atk: this.atk   - oldAtk,
    def: this.def   - oldDef,
    mag: this.mag   - oldMag,
    spd: this.spd   - oldSpd,
    res: this.res   - oldRes
  };

  // HP healed by the gain amount
  this.hp = Math.min(this.maxHp, this.hp + gains.hp);

  return gains;
};

/** EXP rewarded for defeating this unit. */
Character.prototype.expReward = function () {
  return Math.round(20 * this.level);
};

/** Mesh body colour (r,g,b 0-1). */
Character.prototype.meshColor = function () {
  if (this.overrideMeshColor) return this.overrideMeshColor;
  var raceData = RACES[this.race];
  return { r: raceData.mr, g: raceData.mg, b: raceData.mb };
};

// ─── Factory helpers ─────────────────────────────────────────────────────────

/**
 * Create a player character.
 */
function createPlayerCharacter(raceId, classId) {
  return new Character({
    name:     'Hero',
    raceId:   raceId,
    classId:  classId,
    level:    1,
    isPlayer: true
  });
}

/**
 * Create an AI ally.
 */
function createAlly(preset, level) {
  return new Character({
    name:    preset.name,
    raceId:  preset.race,
    classId: preset.classId,
    emoji:   preset.emoji,
    level:   level,
    isAlly:  true
  });
}

/**
 * Create a player party member from a customisation slot.
 * Handles name, race, class, level, exp, and optional body-colour override.
 * @param {object} opts  { name, race, classId, colorId, level, exp, isPlayer, isAlly }
 */
function createPartyMember(opts) {
  var meshColor = null;
  if (opts.colorId && opts.colorId !== 'default') {
    for (var ci = 0; ci < BODY_COLORS.length; ci++) {
      if (BODY_COLORS[ci].id === opts.colorId) {
        meshColor = { r: BODY_COLORS[ci].r, g: BODY_COLORS[ci].g, b: BODY_COLORS[ci].b };
        break;
      }
    }
  }
  return new Character({
    name:              opts.name     || 'Adventurer',
    raceId:            opts.race,
    classId:           opts.classId,
    backgroundId:      opts.backgroundId || null,
    level:             opts.level    || 1,
    exp:               opts.exp      || 0,
    isPlayer:          !!opts.isPlayer,
    isAlly:            !!opts.isAlly,
    overrideMeshColor: opts.overrideMeshColor || meshColor,
    portrait:          opts.portrait  || null
  });
}

/**
 * Create an enemy scaled to the given stage number.
 */
function createEnemy(preset, stage) {
  var level = Math.max(1, stage + Math.floor(Math.random() * 2));
  return new Character({
    name:    preset.name,
    raceId:  preset.race,
    classId: preset.classId,
    emoji:   preset.emoji,
    level:   level,
    isEnemy: true,
    overrideMeshColor: { r: preset.mr, g: preset.mg, b: preset.mb }
  });
}
