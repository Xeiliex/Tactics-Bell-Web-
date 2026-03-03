/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  COMBAT SYSTEM
// ═══════════════════════════════════════

var COMBAT_STATE = {
  IDLE:          'IDLE',
  PLAYER_SELECT: 'PLAYER_SELECT',
  PLAYER_MOVE:   'PLAYER_MOVE',
  PLAYER_ACTION: 'PLAYER_ACTION',
  PLAYER_TARGET: 'PLAYER_TARGET',
  EXECUTING:     'EXECUTING',
  ALLY_TURN:     'ALLY_TURN',
  ENEMY_TURN:    'ENEMY_TURN',
  REMOTE_TURN:   'REMOTE_TURN',   // waiting for opponent action in multiplayer
  DONE:          'DONE'
};

/**
 * Combat manages turn order, state machine, and resolves actions.
 *
 * @param {Grid}       grid
 * @param {Character[]} units   – all units in battle (players + allies + enemies)
 * @param {GameScene}  scene
 * @param {GameUI}     ui
 * @param {Function}   onVictory(expGained)
 * @param {Function}   onDefeat()
 * @param {object}     [weather] – WEATHER_TYPES entry; defaults to WEATHER_TYPES.clear
 */
function Combat(grid, units, scene, ui, onVictory, onDefeat, weather) {
  this.grid      = grid;
  this.units     = units;
  this.scene     = scene;
  this.ui        = ui;
  this.onVictory = onVictory;
  this.onDefeat  = onDefeat;
  this.weather   = weather || (typeof WEATHER_TYPES !== 'undefined' ? WEATHER_TYPES.clear : { spdMod: 0, hitMod: 0 });

  this.state           = COMBAT_STATE.IDLE;
  this.turnOrder       = [];
  this.currentIdx      = 0;
  this.turnNumber      = 1;
  this.selectedUnit    = null;
  this.movableTiles    = [];
  this.targetableTiles = [];
  this.pendingSkill    = null;   // skill being used (null = basic attack)
  this.onNewRound      = null;   // optional fn(turnNumber) called at the start of each new round

  // ── Multiplayer fields ────────────────────────────────────────────────────
  // Set localPlayerIndices to a Set of unit indices controlled by this client.
  // When null the combat system runs in single-player mode (AI for all non-player units).
  this.localPlayerIndices = null;
  // Callback fired whenever this client takes an action, so game.js can relay it
  // to the opponent.  Signature: fn(actionObject).
  this.onActionTaken = null;
}

// ─── Weather helper ───────────────────────────────────────────────────────────

// Returns effective move range for a unit after applying the weather spdMod.
// Always at least 1 so a unit can still escape its starting tile.
Combat.prototype._effectiveMoveRange = function (unit) {
  return Math.max(1, unit.moveRange + this.weather.spdMod);
};

// ─── Turn order ──────────────────────────────────────────────────────────────

Combat.prototype.buildTurnOrder = function () {
  var alive = this.units.filter(function (u) { return u.isAlive(); });
  alive.sort(function (a, b) { return b.spd - a.spd; });
  this.turnOrder = alive;
  this.currentIdx = 0;
};

Combat.prototype.currentUnit = function () {
  return this.turnOrder[this.currentIdx] || null;
};

// ─── Start ───────────────────────────────────────────────────────────────────

Combat.prototype.start = function () {
  this.buildTurnOrder();
  this.state = COMBAT_STATE.PLAYER_SELECT;
  this.ui.updateTurnOrder(this.turnOrder, this.currentUnit());
  this.advanceToCurrentUnit();
};

Combat.prototype.advanceToCurrentUnit = function () {
  var unit = this.currentUnit();
  if (!unit) { this.endRound(); return; }

  // Tick status effects (burn damage, stun expiry).  Show each message briefly.
  var self = this;
  var statusMsgs = unit.startTurn();
  statusMsgs.forEach(function (msg) { self.ui.showMessage(msg); });

  // Burn might have killed the unit — check before proceeding.
  if (!unit.isAlive()) {
    self.ui.updateUnitPanel(unit);
    if (self.checkEndConditions()) return;
    setTimeout(function () { self.nextUnit(); }, 600);
    return;
  }

  // ── Multiplayer: route by local/remote ownership ──────────────────────────
  if (this.localPlayerIndices !== null) {
    var unitIdx = this.units.indexOf(unit);
    if (this.localPlayerIndices.has(unitIdx)) {
      // This unit belongs to the local player — use normal player-turn flow.
      this.state = COMBAT_STATE.PLAYER_SELECT;
      this.ui.setPhaseDisplay('Your Turn');
      this.ui.showUnitPanel(unit);
      if (unit.hasActed) {
        this.ui.showMessage(unit.name + ' is Stunned — turn skipped! 💫');
        setTimeout(function () { self.nextUnit(); }, 800);
      } else {
        this.ui.showMessage(unit.name + '\'s turn. Select a unit to act.');
        this.scene.setUnitGlow(unit, true);
      }
    } else {
      // This unit belongs to the remote player — wait for a network action.
      this.state = COMBAT_STATE.REMOTE_TURN;
      this.ui.setPhaseDisplay('Opponent\'s Turn');
      this.ui.showUnitPanel(unit);
      if (unit.hasActed) {
        // Stunned remote unit: auto-skip (same as stun skip locally).
        setTimeout(function () { self.nextUnit(); }, 800);
      } else {
        this.ui.showMessage('Waiting for opponent…');
      }
    }
    return;
  }

  // ── Single-player: original routing ──────────────────────────────────────
  if (unit.isEnemy) {
    this.state = COMBAT_STATE.ENEMY_TURN;
    this.ui.setPhaseDisplay('Enemy Turn');
    setTimeout(function () { self.runEnemyTurn(unit); }, 700);
  } else if (unit.isAlly) {
    this.state = COMBAT_STATE.ALLY_TURN;
    this.ui.setPhaseDisplay('Ally Turn');
    this.ui.showMessage(unit.name + '\'s turn.');
    this.ui.showUnitPanel(unit);
    // Stun skips AI action entirely
    if (unit.hasActed) {
      setTimeout(function () { self.nextUnit(); }, 600);
    } else {
      setTimeout(function () { self.runAllyTurn(unit); }, 700);
    }
  } else {
    this.state = COMBAT_STATE.PLAYER_SELECT;
    this.ui.setPhaseDisplay('Your Turn');
    this.ui.showUnitPanel(unit);
    if (unit.hasActed) {
      // Stunned player: skip turn automatically
      this.ui.showMessage(unit.name + ' is Stunned — turn skipped! 💫');
      setTimeout(function () { self.nextUnit(); }, 800);
    } else {
      this.ui.showMessage(unit.name + '\'s turn. Select a unit to act.');
      this.scene.setUnitGlow(unit, true);
    }
  }
};

// ─── End of round / next unit ────────────────────────────────────────────────

Combat.prototype.nextUnit = function () {
  if (this.selectedUnit) {
    this.scene.setUnitGlow(this.selectedUnit, false);
    this.selectedUnit = null;
  }
  this.scene.clearHighlights();
  this.ui.hideActionMenu();
  this.ui.hideSkillMenu();

  this.currentIdx++;
  if (this.currentIdx >= this.turnOrder.length) {
    this.endRound();
  } else {
    this.ui.updateTurnOrder(this.turnOrder, this.currentUnit());
    this.advanceToCurrentUnit();
  }
};

Combat.prototype.endRound = function () {
  this.turnNumber++;
  this.ui.setTurnNumber(this.turnNumber);
  // Notify listeners (e.g. story battle events) that a new round has started
  if (this.onNewRound) { this.onNewRound(this.turnNumber); }
  // Rebuild turn order (units may have died)
  this.buildTurnOrder();
  this.ui.updateTurnOrder(this.turnOrder, this.currentUnit());
  this.advanceToCurrentUnit();
};

// ─── Victory / defeat checks ─────────────────────────────────────────────────

Combat.prototype.checkEndConditions = function () {
  var enemies  = this.units.filter(function (u) { return u.isEnemy && u.isAlive(); });
  var players  = this.units.filter(function (u) { return !u.isEnemy && u.isAlive(); });
  var heroAlive = this.units.some(function (u) { return u.isPlayer && u.isAlive(); });

  if (enemies.length === 0) {
    this.state = COMBAT_STATE.DONE;
    var expGained = this.units
      .filter(function (u) { return u.isEnemy && !u.isAlive(); })
      .reduce(function (sum, u) { return sum + u.expReward(); }, 0);
    var self = this;
    setTimeout(function () { self.onVictory(expGained); }, 800);
    return true;
  }

  if (!heroAlive) {
    this.state = COMBAT_STATE.DONE;
    var self = this;
    setTimeout(function () { self.onDefeat(); }, 800);
    return true;
  }
  return false;
};

// ─── PLAYER INPUT ────────────────────────────────────────────────────────────

/**
 * Called by the scene's click handler.
 */
Combat.prototype.handleTileClick = function (row, col) {
  if (this.state === COMBAT_STATE.EXECUTING || this.state === COMBAT_STATE.DONE) return;
  if (this.state === COMBAT_STATE.ENEMY_TURN)  return;
  if (this.state === COMBAT_STATE.ALLY_TURN)   return;
  if (this.state === COMBAT_STATE.REMOTE_TURN) return;

  var clickedUnit = this.unitAt(row, col);

  if (this.state === COMBAT_STATE.PLAYER_SELECT) {
    // Select own unit
    var cur = this.currentUnit();
    if (clickedUnit && !clickedUnit.isEnemy && clickedUnit === cur) {
      this.selectUnit(cur);
    } else if (clickedUnit) {
      this.ui.showUnitPanel(clickedUnit);
    }
    return;
  }

  if (this.state === COMBAT_STATE.PLAYER_MOVE) {
    // Click on highlighted tile → move there; click self → cancel
    var cur = this.currentUnit();
    if (clickedUnit === cur) {
      // Clicked self → go straight to action menu (skip move)
      this.state = COMBAT_STATE.PLAYER_ACTION;
      this.scene.clearHighlights();
      this.ui.showActionMenu(cur);
      return;
    }
    var inRange = this.movableTiles.some(function (t) { return t.row === row && t.col === col; });
    if (inRange && !clickedUnit) {
      this.doMove(cur, row, col);
    } else {
      // Cancel back to select
      this.cancelSelect();
    }
    return;
  }

  if (this.state === COMBAT_STATE.PLAYER_TARGET) {
    var inRange = this.targetableTiles.some(function (t) { return t.row === row && t.col === col; });
    if (!inRange) return;

    var cur  = this.currentUnit();
    var skill = this.pendingSkill;

    if (skill && skill.targetsAllies) {
      // Heal target must be allied unit
      if (clickedUnit && !clickedUnit.isEnemy) {
        this.doAttack(cur, clickedUnit, skill);
      }
    } else {
      if (clickedUnit && clickedUnit.isEnemy) {
        this.doAttack(cur, clickedUnit, skill);
      }
    }
    return;
  }
};

// ─── Actions ─────────────────────────────────────────────────────────────────

Combat.prototype.selectUnit = function (unit) {
  if (this.selectedUnit) this.scene.setUnitGlow(this.selectedUnit, false);
  this.selectedUnit = unit;
  this.scene.setUnitGlow(unit, true);
  this.ui.showUnitPanel(unit);

  if (!unit.hasMoved) {
    this.state = COMBAT_STATE.PLAYER_MOVE;
    this.movableTiles = this.grid.reachableTiles(unit.gridRow, unit.gridCol, this._effectiveMoveRange(unit));
    // Filter out tiles occupied by other units
    var self = this;
    this.movableTiles = this.movableTiles.filter(function (t) {
      return !self.unitAt(t.row, t.col);
    });
    this.scene.highlightTiles(this.movableTiles, 'move');
    // Also highlight the unit's own tile as selected
    this.scene.highlightTiles([this.grid.getTile(unit.gridRow, unit.gridCol)].concat(this.movableTiles), 'move');
    this.ui.showMessage('Choose where to move ' + unit.name + '.');
  } else {
    // Already moved — go straight to action
    this.state = COMBAT_STATE.PLAYER_ACTION;
    this.ui.showActionMenu(unit);
  }
};

Combat.prototype.cancelSelect = function () {
  var cur = this.currentUnit();
  this.scene.setUnitGlow(cur, false);
  this.scene.clearHighlights();
  this.selectedUnit = null;
  this.movableTiles = [];
  this.state = COMBAT_STATE.PLAYER_SELECT;
  this.ui.showMessage('Select a unit to act.');
};

Combat.prototype.doMove = function (unit, row, col) {
  var self   = this;
  var oldTile = this.grid.getTile(unit.gridRow, unit.gridCol);
  var newTile = this.grid.getTile(row, col);

  oldTile.unit  = null;
  unit.gridRow  = row;
  unit.gridCol  = col;
  newTile.unit  = unit;
  unit.hasMoved = true;

  // Notify multiplayer listener so the action can be sent to the opponent.
  if (this.onActionTaken) {
    this.onActionTaken({ kind: 'move', unitIdx: this.units.indexOf(unit), row: row, col: col });
  }

  this.scene.clearHighlights();
  this.state = COMBAT_STATE.EXECUTING;

  this.scene.moveUnit(unit, function () {
    self.state = COMBAT_STATE.PLAYER_ACTION;
    self.ui.showActionMenu(unit);
    self.ui.showMessage(unit.name + ' moved. Choose an action.');
  });
};

// Called by UI button: attack with basic attack or chosen skill
Combat.prototype.beginTargeting = function (skill) {
  var unit = this.currentUnit();
  if (!unit) return;
  this.pendingSkill = skill || null;

  var range = skill ? skill.range : unit.attackRange;
  var targetsAllies = skill && skill.targetsAllies;

  var rawTiles = this.grid.tilesInRange(unit.gridRow, unit.gridCol, range);

  // Only keep tiles with valid targets
  var self = this;
  this.targetableTiles = rawTiles.filter(function (t) {
    var u = self.unitAt(t.row, t.col);
    if (!u || !u.isAlive()) return false;
    return targetsAllies ? !u.isEnemy : u.isEnemy;
  });

  if (this.targetableTiles.length === 0) {
    this.ui.showMessage('No valid targets in range!');
    return;
  }

  this.state = COMBAT_STATE.PLAYER_TARGET;
  this.scene.clearHighlights();
  var hlType = targetsAllies ? 'heal' : 'attack';
  this.scene.highlightTiles(this.targetableTiles, hlType);
  this.ui.hideActionMenu();
  this.ui.showMessage(targetsAllies
    ? 'Choose an ally to heal.'
    : 'Choose a target to attack.');
};

Combat.prototype.doWait = function () {
  var unit = this.currentUnit();
  if (unit) {
    unit.hasActed = true;
    this.ui.showMessage(unit.name + ' waits.');
    if (this.onActionTaken) {
      this.onActionTaken({ kind: 'wait', unitIdx: this.units.indexOf(unit) });
    }
  }
  this.nextUnit();
};

Combat.prototype.doAttack = function (attacker, target, skill, preCalcResult) {
  var self  = this;
  this.state = COMBAT_STATE.EXECUTING;
  this.scene.clearHighlights();
  this.ui.hideActionMenu();
  this.ui.hideSkillMenu();

  // Use a pre-calculated result when supplied (multiplayer: opponent's damage is
  // authoritative so both clients show the same numbers).  Otherwise calculate locally.
  var result    = preCalcResult || this.calcDamage(attacker, target, skill);
  var skillType = skill ? skill.type : 'physical';
  var skillId   = skill ? skill.id   : '';

  // Notify multiplayer listener (only when we are the attacker, i.e. no preCalcResult).
  if (this.onActionTaken && !preCalcResult) {
    this.onActionTaken({
      kind:        'attack',
      unitIdx:     this.units.indexOf(attacker),
      targetIdx:   this.units.indexOf(target),
      skillId:     skill ? skill.id : null,
      result:      result,
    });
  }

  this.scene.playAttackAnimation(attacker, target, skillType, skillId, function () {
    if (skillType === 'heal') {
      var healed = target.healHp(result.damage);
      self.ui.showFloatingNumber(target, '+' + healed, '#69FF47');
      self.ui.showMessage(attacker.name + ' healed ' + target.name + ' for ' + healed + ' HP!');
    } else if (result.miss) {
      self.ui.showFloatingNumber(target, 'MISS', '#aaaaaa');
      self.ui.showMessage(attacker.name + ' used ' + (skill ? skill.name : 'Attack') +
        ' — MISSED! (rolled ' + result.roll + ')');
    } else {
      var dealt = target.takeDamage(result.damage);
      var critLabel = result.crit ? ' ✦CRITICAL✦' : '';
      var color = result.crit ? '#FFD700' : (skillType === 'magic' ? '#BB86FC' : '#FF6B9D');
      self.ui.showFloatingNumber(target, (result.crit ? '★' : '-') + dealt, color);
      self.ui.showMessage(attacker.name + ' used ' + (skill ? skill.name : 'Attack') +
        critLabel + ' → ' + target.name + ' took ' + dealt + ' damage!' +
        ' (d20: ' + result.roll + ')');

      // ── Status effects ──────────────────────────────────────────────────
      // Fireball applies Burn (2 HP/turn for 3 turns)
      if (skill && skill.id === 'fireball' && !result.miss && target.isAlive()) {
        target.applyStatus('burn', 3);
        self.ui.showMessage(target.name + ' is Burning! 🔥');
      }
      // Shield Bash applies Stun (skip next action)
      if (skill && skill.id === 'bash' && !result.miss && target.isAlive()) {
        target.applyStatus('stun', 1);
        self.ui.showMessage(target.name + ' is Stunned! 💫');
      }
    }

    self.ui.updateUnitPanel(target);

    if (!target.isAlive()) {
      self.scene.removeUnit(target);
      var tile = self.grid.getTile(target.gridRow, target.gridCol);
      if (tile) tile.unit = null;
      self.ui.showMessage(target.name + ' was defeated!');
    }

    attacker.hasActed = true;

    if (self.checkEndConditions()) return;
    self.nextUnit();
  });
};

// ─── Damage formula ── D&D-inspired d20 hit/miss system ─────────────────────
//
// Each physical or magic attack rolls a virtual d20:
//   • Natural 20  → critical hit  (1.5× damage, minimum 1)
//   • Natural  1  → critical miss (0 damage)
//   • Otherwise   → hit if  d20 + ATK/MAG modifier ≥ Defense Class (DC)
//                   DC = 10 + floor(DEF/RES / 2)
//
// Heal skills bypass the hit roll and always restore HP.
//
// Returns { damage, roll, crit, miss } so callers can show flavour text.

Combat.prototype.calcDamage = function (attacker, target, skill) {
  var skillPower = skill ? skill.power : 1.0;
  var skillType  = skill ? skill.type  : 'physical';

  if (skillType === 'heal') {
    return { damage: Math.round(attacker.mag * skillPower), roll: 0, crit: false, miss: false };
  }

  var offensive = (skillType === 'magic') ? attacker.mag : attacker.atk;
  var defensive = (skillType === 'magic') ? target.res   : target.def;

  // Terrain defence bonus on target's tile
  var tile = this.grid.getTile(target.gridRow, target.gridCol);
  if (tile) {
    defensive += (skillType === 'magic') ? tile.terrain.resBonus : tile.terrain.defBonus;
  }

  // d20 roll (1–20) modified by weather visibility penalty
  var roll      = Math.floor(Math.random() * 20) + 1;
  var atkBonus  = Math.floor(offensive / 2);   // reused in both dc check and miss check
  var dc        = 10 + Math.floor(defensive / 2);   // Defense Class

  var crit = (roll === 20);
  // d20 roll (1–20) modified by weather visibility penalty.
  // Natural 1  → always a critical miss regardless of weather or bonuses.
  // Natural 20 → always a critical hit  regardless of weather or penalties
  //              (crit=true short-circuits the entire miss expression).
  // All other rolls: miss if roll + atkBonus + weather.hitMod < dc.
  var miss = (roll === 1) || (!crit && (roll + atkBonus + this.weather.hitMod < dc));

  if (miss && !crit) {
    return { damage: 0, roll: roll, crit: false, miss: true };
  }

  var raw = offensive * skillPower - defensive * 0.5;
  raw = Math.max(1, Math.round(raw + (Math.random() * 3 - 1)));

  if (crit) { raw = Math.ceil(raw * 1.5); }

  return { damage: raw, roll: roll, crit: crit, miss: false };
};

// ─── AI (ally turns) ─────────────────────────────────────────────────────────

Combat.prototype.runAllyTurn = function (ally) {
  var self = this;
  if (!ally.isAlive()) { this.nextUnit(); return; }

  // Find nearest enemy
  var enemies = this.units.filter(function (u) { return u.isEnemy && u.isAlive(); });
  if (enemies.length === 0) { this.nextUnit(); return; }

  var nearest = enemies.reduce(function (best, u) {
    var d  = Math.abs(u.gridRow - ally.gridRow)    + Math.abs(u.gridCol - ally.gridCol);
    var bd = Math.abs(best.gridRow - ally.gridRow) + Math.abs(best.gridCol - ally.gridCol);
    return d < bd ? u : best;
  });

  var distToNearest = Math.abs(nearest.gridRow - ally.gridRow) + Math.abs(nearest.gridCol - ally.gridCol);

  // Already in attack range → attack
  if (distToNearest <= ally.attackRange) {
    var skill = ally.skills[Math.floor(Math.random() * ally.skills.length)];
    if (skill && skill.targetsAllies) skill = ally.skills.find(function (s) { return !s.targetsAllies; }) || null;
    setTimeout(function () {
      self.doEnemyAttack(ally, nearest, skill);
    }, 600);
    return;
  }

  // Move toward nearest enemy
  var moveTiles = this.grid.reachableTiles(ally.gridRow, ally.gridCol, this._effectiveMoveRange(ally));
  var selfRef   = this;
  moveTiles = moveTiles.filter(function (t) { return !selfRef.unitAt(t.row, t.col); });

  if (moveTiles.length > 0) {
    var best = moveTiles.reduce(function (b, t) {
      var td = Math.abs(t.row - nearest.gridRow) + Math.abs(t.col - nearest.gridCol);
      var bd = Math.abs(b.row - nearest.gridRow) + Math.abs(b.col - nearest.gridCol);
      return td < bd ? t : b;
    });

    var oldTile = this.grid.getTile(ally.gridRow, ally.gridCol);
    oldTile.unit  = null;
    ally.gridRow  = best.row;
    ally.gridCol  = best.col;
    best.unit     = ally;
    ally.hasMoved = true;

    this.scene.moveUnit(ally, function () {
      var newDist = Math.abs(nearest.gridRow - ally.gridRow) + Math.abs(nearest.gridCol - ally.gridCol);
      if (newDist <= ally.attackRange) {
        var skill = ally.skills[Math.floor(Math.random() * ally.skills.length)];
        if (skill && skill.targetsAllies) skill = ally.skills.find(function (s) { return !s.targetsAllies; }) || null;
        setTimeout(function () {
          self.doEnemyAttack(ally, nearest, skill);
        }, 400);
      } else {
        self.nextUnit();
      }
    });
  } else {
    this.nextUnit();
  }
};

// ─── AI (enemy turns) ────────────────────────────────────────────────────────

Combat.prototype.runEnemyTurn = function (enemy) {
  var self = this;
  if (!enemy.isAlive()) { this.nextUnit(); return; }

  // Find nearest ally/player
  var friends = this.units.filter(function (u) { return !u.isEnemy && u.isAlive(); });
  if (friends.length === 0) { this.nextUnit(); return; }

  var nearest = friends.reduce(function (best, u) {
    var d = Math.abs(u.gridRow - enemy.gridRow) + Math.abs(u.gridCol - enemy.gridCol);
    var bd = Math.abs(best.gridRow - enemy.gridRow) + Math.abs(best.gridCol - enemy.gridCol);
    return d < bd ? u : best;
  });

  var distToNearest = Math.abs(nearest.gridRow - enemy.gridRow) + Math.abs(nearest.gridCol - enemy.gridCol);

  // Check if already in attack range
  if (distToNearest <= enemy.attackRange) {
    // Attack
    var skill = enemy.skills[Math.floor(Math.random() * enemy.skills.length)];
    if (skill && skill.targetsAllies) skill = enemy.skills.find(function(s){ return !s.targetsAllies; }) || null;
    setTimeout(function () {
      self.doEnemyAttack(enemy, nearest, skill);
    }, 600);
    return;
  }

  // Move toward nearest player unit
  var moveTiles = this.grid.reachableTiles(enemy.gridRow, enemy.gridCol, this._effectiveMoveRange(enemy));
  var selfRef   = this;
  moveTiles = moveTiles.filter(function (t) { return !selfRef.unitAt(t.row, t.col); });

  if (moveTiles.length > 0) {
    // Pick the tile closest to the target
    var best = moveTiles.reduce(function (b, t) {
      var td = Math.abs(t.row - nearest.gridRow) + Math.abs(t.col - nearest.gridCol);
      var bd = Math.abs(b.row - nearest.gridRow) + Math.abs(b.col - nearest.gridCol);
      return td < bd ? t : b;
    });

    var oldTile = this.grid.getTile(enemy.gridRow, enemy.gridCol);
    oldTile.unit    = null;
    enemy.gridRow   = best.row;
    enemy.gridCol   = best.col;
    best.unit       = enemy;
    enemy.hasMoved  = true;

    this.scene.moveUnit(enemy, function () {
      // After moving, check if now in range
      var newDist = Math.abs(nearest.gridRow - enemy.gridRow) + Math.abs(nearest.gridCol - enemy.gridCol);
      if (newDist <= enemy.attackRange) {
        var skill = enemy.skills[Math.floor(Math.random() * enemy.skills.length)];
        if (skill && skill.targetsAllies) skill = enemy.skills.find(function(s){ return !s.targetsAllies; }) || null;
        setTimeout(function () {
          self.doEnemyAttack(enemy, nearest, skill);
        }, 400);
      } else {
        self.nextUnit();
      }
    });
  } else {
    this.nextUnit();
  }
};

Combat.prototype.doEnemyAttack = function (attacker, target, skill) {
  var self      = this;
  var result    = this.calcDamage(attacker, target, skill);
  var skillType = skill ? skill.type : 'physical';
  var skillId   = skill ? skill.id   : '';

  this.scene.playAttackAnimation(attacker, target, skillType, skillId, function () {
    if (result.miss) {
      self.ui.showFloatingNumber(target, 'MISS', '#aaaaaa');
      self.ui.showMessage(attacker.name + ' attacked ' + target.name + ' — MISSED! (rolled ' + result.roll + ')');
    } else {
      var dealt = target.takeDamage(result.damage);
      var critLabel = result.crit ? ' ✦CRIT✦ ' : '';
      self.ui.showFloatingNumber(target, (result.crit ? '★' : '-') + dealt,
        result.crit ? '#FFD700' : '#ff4444');
      self.ui.showMessage(attacker.name + critLabel + ' attacked ' + target.name +
        ' for ' + dealt + ' damage! (d20: ' + result.roll + ')');

      // Enemies can also apply Burn via fireball
      if (skill && skill.id === 'fireball' && !result.miss && target.isAlive()) {
        target.applyStatus('burn', 3);
      }
    }

    self.ui.updateUnitPanel(target);

    if (!target.isAlive()) {
      self.scene.removeUnit(target);
      var tile = self.grid.getTile(target.gridRow, target.gridCol);
      if (tile) tile.unit = null;
    }

    if (self.checkEndConditions()) return;
    self.nextUnit();
  });
};

// ─── Utility ─────────────────────────────────────────────────────────────────

Combat.prototype.unitAt = function (row, col) {
  return this.units.find(function (u) {
    return u.isAlive() && u.gridRow === row && u.gridCol === col;
  }) || null;
};

// ─── Multiplayer helpers ──────────────────────────────────────────────────────

/**
 * Apply an action that was received from the remote opponent.
 * Only executed while state === REMOTE_TURN.
 *
 * Supported action kinds:
 *   { kind:'move',   unitIdx, row, col }
 *   { kind:'attack', unitIdx, targetIdx, skillId, result }
 *   { kind:'wait',   unitIdx }
 *
 * @param {object} action
 */
Combat.prototype.receiveRemoteAction = function (action) {
  if (this.state !== COMBAT_STATE.REMOTE_TURN) return;

  var self   = this;
  var unit   = this.units[action.unitIdx];
  if (!unit || !unit.isAlive()) { this.nextUnit(); return; }

  if (action.kind === 'move') {
    var oldTile = this.grid.getTile(unit.gridRow, unit.gridCol);
    var newTile = this.grid.getTile(action.row, action.col);
    if (!newTile) { this.nextUnit(); return; }
    oldTile.unit  = null;
    unit.gridRow  = action.row;
    unit.gridCol  = action.col;
    newTile.unit  = unit;
    unit.hasMoved = true;
    this.scene.clearHighlights();
    this.state = COMBAT_STATE.EXECUTING;
    this.scene.moveUnit(unit, function () {
      // After the move animation, wait for the follow-up attack/wait action.
      self.state = COMBAT_STATE.REMOTE_TURN;
    });

  } else if (action.kind === 'attack') {
    var target = this.units[action.targetIdx];
    if (!target || !target.isAlive()) { this.nextUnit(); return; }
    var skill = this._findSkillById(unit, action.skillId);
    this.doAttack(unit, target, skill, action.result);

  } else if (action.kind === 'wait') {
    unit.hasActed = true;
    this.ui.showMessage(unit.name + ' waits.');
    this.nextUnit();
  }
};

/** Look up a skill on a unit by its id string.  Returns null if not found. */
Combat.prototype._findSkillById = function (unit, skillId) {
  if (!skillId || !unit.skills) return null;
  for (var i = 0; i < unit.skills.length; i++) {
    if (unit.skills[i].id === skillId) return unit.skills[i];
  }
  return null;
};
