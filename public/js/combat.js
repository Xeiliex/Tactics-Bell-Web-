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
  ENEMY_TURN:    'ENEMY_TURN',
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
 */
function Combat(grid, units, scene, ui, onVictory, onDefeat) {
  this.grid      = grid;
  this.units     = units;
  this.scene     = scene;
  this.ui        = ui;
  this.onVictory = onVictory;
  this.onDefeat  = onDefeat;

  this.state           = COMBAT_STATE.IDLE;
  this.turnOrder       = [];
  this.currentIdx      = 0;
  this.turnNumber      = 1;
  this.selectedUnit    = null;
  this.movableTiles    = [];
  this.targetableTiles = [];
  this.pendingSkill    = null;   // skill being used (null = basic attack)
}

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
  unit.startTurn();

  if (unit.isEnemy) {
    this.state = COMBAT_STATE.ENEMY_TURN;
    this.ui.setPhaseDisplay('Enemy Turn');
    var self = this;
    setTimeout(function () { self.runEnemyTurn(unit); }, 700);
  } else {
    this.state = COMBAT_STATE.PLAYER_SELECT;
    this.ui.setPhaseDisplay('Your Turn');
    this.ui.showMessage(unit.name + '\'s turn. Select a unit to act.');
    this.scene.setUnitGlow(unit, true);
    this.ui.showUnitPanel(unit);
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
    this.advanceToCurrentUnit();
  }
};

Combat.prototype.endRound = function () {
  this.turnNumber++;
  this.ui.setTurnNumber(this.turnNumber);
  // Rebuild turn order (units may have died)
  this.buildTurnOrder();
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
    this.movableTiles = this.grid.reachableTiles(unit.gridRow, unit.gridCol, unit.moveRange);
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
  }
  this.nextUnit();
};

Combat.prototype.doAttack = function (attacker, target, skill) {
  var self  = this;
  this.state = COMBAT_STATE.EXECUTING;
  this.scene.clearHighlights();
  this.ui.hideActionMenu();
  this.ui.hideSkillMenu();

  var dmg = this.calcDamage(attacker, target, skill);
  var skillType = skill ? skill.type : 'physical';

  this.scene.playHitEffect(target, skillType, function () {
    if (skillType === 'heal') {
      var healed = target.healHp(dmg);
      self.ui.showFloatingNumber(target, '+' + healed, '#69FF47');
      self.ui.showMessage(attacker.name + ' healed ' + target.name + ' for ' + healed + ' HP!');
    } else {
      var dealt = target.takeDamage(dmg);
      self.ui.showFloatingNumber(target, '-' + dealt, skillType === 'magic' ? '#BB86FC' : '#FF6B9D');
      self.ui.showMessage(attacker.name + ' used ' + (skill ? skill.name : 'Attack') +
        ' → ' + target.name + ' took ' + dealt + ' damage!');
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

// ─── Damage formula ──────────────────────────────────────────────────────────

Combat.prototype.calcDamage = function (attacker, target, skill) {
  var skillPower = skill ? skill.power : 1.0;
  var skillType  = skill ? skill.type  : 'physical';

  if (skillType === 'heal') {
    return Math.round(attacker.mag * skillPower);
  }

  var offensive = (skillType === 'magic') ? attacker.mag : attacker.atk;
  var defensive = (skillType === 'magic') ? target.res   : target.def;

  // Terrain defence bonus on target's tile
  var tile = this.grid.getTile(target.gridRow, target.gridCol);
  if (tile) {
    defensive += (skillType === 'magic') ? tile.terrain.resBonus : tile.terrain.defBonus;
  }

  var raw = offensive * skillPower - defensive * 0.5;
  return Math.max(1, Math.round(raw + (Math.random() * 3 - 1))); // ±1 RNG variance
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
  var moveTiles = this.grid.reachableTiles(enemy.gridRow, enemy.gridCol, enemy.moveRange);
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
  var self = this;
  var dmg  = this.calcDamage(attacker, target, skill);
  var skillType = skill ? skill.type : 'physical';

  this.scene.playHitEffect(target, skillType, function () {
    var dealt = target.takeDamage(dmg);
    self.ui.showFloatingNumber(target, '-' + dealt, '#ff4444');
    self.ui.showMessage(attacker.name + ' attacked ' + target.name + ' for ' + dealt + ' damage!');
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
