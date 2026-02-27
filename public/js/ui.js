/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  UI — screen management & anime.js
// ═══════════════════════════════════════

// Graceful no-op fallback when anime.js CDN cannot be reached.
// Immediately applies final values and fires complete() so transitions work.
if (typeof anime === 'undefined') {
  window.anime = function (opts) {
    if (opts) {
      var targets = [];
      if (opts.targets) {
        targets = typeof opts.targets === 'string'
          ? Array.from(document.querySelectorAll(opts.targets))
          : [].concat(opts.targets);
      }
      targets.forEach(function (el) {
        if (!el || !el.style) return;
        if (opts.opacity !== undefined) {
          var op = [].concat(opts.opacity);
          el.style.opacity = op[op.length - 1];
        }
        if (opts.width !== undefined) {
          var w = [].concat(opts.width);
          el.style.width = (typeof w[w.length - 1] === 'number') ? w[w.length - 1] + 'px' : w[w.length - 1];
        }
        if (opts.translateX !== undefined || opts.translateY !== undefined || opts.scale !== undefined) {
          el.style.transform = '';
        }
      });
      if (typeof opts.complete === 'function') setTimeout(opts.complete, 0);
    }
    return { pause: function () {} };
  };
  window.anime.stagger = function () { return 0; };
}

function GameUI(game) {
  this.game = game;
  this._currentScreen = null;
  this._party = [];
  this._memWarnTimer = null;

  // Allow the user to manually dismiss the memory warning
  var self = this;
  var closeBtn = document.getElementById('memory-warning-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () { self.hideMemoryWarning(); });
  }
}

// ─── Screen switching ─────────────────────────────────────────────────────────

GameUI.prototype.showScreen = function (id) {
  var screens = document.querySelectorAll('.screen');
  var self    = this;

  // Fade out current
  if (this._currentScreen) {
    anime({ targets: this._currentScreen, opacity: [1, 0], duration: 200, easing: 'linear',
      complete: function () {
        self._currentScreen.classList.add('hidden');
        self._currentScreen.classList.remove('active');
        self._showScreenIn(id);
      }
    });
  } else {
    this._showScreenIn(id);
  }
};

GameUI.prototype._showScreenIn = function (id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('active');
  el.style.opacity = 0;
  this._currentScreen = el;
  anime({ targets: el, opacity: [0, 1], duration: 320, easing: 'easeOutQuad' });
};

// ─── Title screen ─────────────────────────────────────────────────────────────

GameUI.prototype.showTitleScreen = function () {
  this.showScreen('screen-title');
  // Animate bell and title on load
  anime({
    targets: '.title-bell',
    translateY: [-30, 0], opacity: [0, 1],
    duration: 700, easing: 'easeOutBounce', delay: 200
  });
  anime({
    targets: '.game-title',
    translateY: [-20, 0], opacity: [0, 1],
    duration: 600, easing: 'easeOutQuart', delay: 400
  });
  anime({
    targets: '.tagline',
    opacity: [0, 1], duration: 500, delay: 700
  });
  anime({
    targets: '#btn-new-game',
    scale: [0.8, 1], opacity: [0, 1],
    duration: 500, easing: 'easeOutBack', delay: 900
  });
};

// ─── Character creation screen ────────────────────────────────────────────────

GameUI.prototype.showCreateScreen = function () {
  this.showScreen('screen-create');
  this._buildRaceCards();
  this._buildClassCards();
  this._updateStatsPreview();

  anime({
    targets: '.card',
    translateY: [20, 0], opacity: [0, 1],
    duration: 400, easing: 'easeOutQuart',
    delay: anime.stagger(60, { start: 200 })
  });
};

GameUI.prototype._buildRaceCards = function () {
  var container = document.getElementById('race-cards');
  container.innerHTML = '';
  var game = this.game;

  Object.values(RACES).forEach(function (race) {
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.race = race.id;

    var bonuses = Object.entries(race.statBonuses)
      .filter(function (e) { return e[1] !== 0; })
      .map(function (e) { return (e[1] > 0 ? '+' : '') + e[1] + ' ' + e[0].toUpperCase(); })
      .join('  ');

    card.innerHTML =
      '<div class="card-emoji">' + race.emoji + '</div>' +
      '<div class="card-name" style="color:' + race.color + '">' + race.name + '</div>' +
      '<div class="card-desc">'  + race.description + '</div>' +
      (bonuses ? '<div class="card-bonuses">' + bonuses + '</div>' : '');

    card.addEventListener('click', function () {
      document.querySelectorAll('#race-cards .card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      game.selectedRace = race.id;
      game.ui._updateStatsPreview();
      anime({ targets: card, scale: [0.95, 1.0], duration: 200, easing: 'easeOutBack' });
    });

    container.appendChild(card);
  });
};

GameUI.prototype._buildClassCards = function () {
  var container = document.getElementById('class-cards');
  container.innerHTML = '';
  var game = this.game;

  Object.values(CLASSES).forEach(function (cls) {
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.cls = cls.id;

    card.innerHTML =
      '<div class="card-emoji">' + cls.emoji + '</div>' +
      '<div class="card-name" style="color:' + cls.color + '">' + cls.name + '</div>' +
      '<div class="card-desc">'  + cls.description + '</div>' +
      '<div class="card-bonuses">Move ' + cls.moveRange + '  Range ' + cls.attackRange + '</div>';

    card.addEventListener('click', function () {
      document.querySelectorAll('#class-cards .card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      game.selectedClass = cls.id;
      game.ui._updateStatsPreview();
      anime({ targets: card, scale: [0.95, 1.0], duration: 200, easing: 'easeOutBack' });
    });

    container.appendChild(card);
  });
};

GameUI.prototype._updateStatsPreview = function () {
  var preview = document.getElementById('stats-preview');
  var startBtn = document.getElementById('btn-start-battle');
  var game    = this.game;

  if (!game.selectedRace || !game.selectedClass) {
    preview.innerHTML = '<div class="stats-placeholder">← Select a race and class to preview stats</div>';
    startBtn.disabled = true;
    return;
  }

  var dummy = new Character({ name: 'Preview', raceId: game.selectedRace, classId: game.selectedClass, level: 1 });
  var stats = [
    { label: 'HP',  val: dummy.maxHp },
    { label: 'ATK', val: dummy.atk   },
    { label: 'DEF', val: dummy.def   },
    { label: 'MAG', val: dummy.mag   },
    { label: 'SPD', val: dummy.spd   },
    { label: 'RES', val: dummy.res   }
  ];

  preview.innerHTML = stats.map(function (s) {
    return '<div class="stat-chip">' + s.label + ' <span>' + s.val + '</span></div>';
  }).join('');

  startBtn.disabled = false;
  anime({ targets: '.stat-chip', scale: [0.85, 1], opacity: [0, 1], duration: 250,
    delay: anime.stagger(40), easing: 'easeOutBack' });
};

// ─── Battle screen ────────────────────────────────────────────────────────────

GameUI.prototype.showBattleScreen = function () {
  this.showScreen('screen-battle');
};

GameUI.prototype.setStageNumber = function (n) {
  document.getElementById('stage-number').textContent = n;
};

GameUI.prototype.setTurnNumber = function (n) {
  document.getElementById('turn-number').textContent = n;
};

GameUI.prototype.setPhaseDisplay = function (text) {
  var el = document.getElementById('phase-display');
  el.textContent = text;
  anime({ targets: el, scale: [1.15, 1.0], opacity: [0.6, 1.0], duration: 350, easing: 'easeOutQuart' });
};

GameUI.prototype.showMessage = function (text) {
  var el = document.getElementById('message-text');
  el.textContent = text;
  anime({ targets: '#message-log', opacity: [0.6, 1.0], duration: 200 });
};

// Turn order icons
GameUI.prototype.updateTurnOrder = function (order, current) {
  var bar = document.getElementById('turn-order-icons');
  bar.innerHTML = '';
  var max = Math.min(order.length, 7);
  for (var i = 0; i < max; i++) {
    var u   = order[i];
    var div = document.createElement('div');
    div.className = 'turn-icon' + (u === current ? ' current' : '') + (u.isEnemy ? ' enemy' : '');
    div.title     = u.name;
    div.textContent = u.emoji;
    bar.appendChild(div);
  }
};

// ─── Unit panel ───────────────────────────────────────────────────────────────

GameUI.prototype.showUnitPanel = function (unit) {
  var panel = document.getElementById('unit-panel');
  panel.classList.remove('hidden');
  this._fillUnitPanel(unit);
  anime({ targets: panel, translateX: [-20, 0], opacity: [0.6, 1], duration: 250, easing: 'easeOutQuart' });
};

GameUI.prototype.updateUnitPanel = function (unit) {
  // Silently update if the panel is already showing this unit
  this._fillUnitPanel(unit);
  this.updatePartyMember(unit);
};

GameUI.prototype._fillUnitPanel = function (unit) {
  document.getElementById('unit-icon').textContent    = unit.emoji;
  document.getElementById('unit-name').textContent    = unit.name;
  document.getElementById('unit-subtitle').textContent =
    RACES[unit.race].name + ' ' + CLASSES[unit.classId].name + ' · Lv.' + unit.level;
  document.getElementById('hp-text').textContent = unit.hp + ' / ' + unit.maxHp;

  var ratio = unit.hpRatio() * 100;
  var fill  = document.getElementById('hp-bar-fill');
  anime({ targets: fill, width: ratio + '%', duration: 350, easing: 'easeOutQuart' });
  // Colour: green→yellow→red via background-position
  var bgPos = (1 - unit.hpRatio()) * 100;
  fill.style.backgroundPosition = bgPos + '% 0';

  var statsRow = document.getElementById('unit-stats-row');
  statsRow.innerHTML =
    '<span class="mini-stat">ATK <b>' + unit.atk + '</b></span>' +
    '<span class="mini-stat">DEF <b>' + unit.def + '</b></span>' +
    '<span class="mini-stat">MAG <b>' + unit.mag + '</b></span>' +
    '<span class="mini-stat">SPD <b>' + unit.spd + '</b></span>';
};

// ─── Action / skill menus ─────────────────────────────────────────────────────

GameUI.prototype.showActionMenu = function (unit) {
  var menu = document.getElementById('action-menu');
  menu.classList.remove('hidden');
  anime({ targets: '#action-menu .action-btn', translateX: [30, 0], opacity: [0, 1],
    duration: 250, delay: anime.stagger(50), easing: 'easeOutQuart' });
};

GameUI.prototype.hideActionMenu = function () {
  document.getElementById('action-menu').classList.add('hidden');
};

GameUI.prototype.showSkillMenu = function (unit, onSkillSelect) {
  this.hideActionMenu();
  var menu = document.getElementById('skill-menu');
  var list = document.getElementById('skill-list');
  list.innerHTML = '';

  var game = this.game;
  unit.skills.forEach(function (skill) {
    var btn = document.createElement('button');
    btn.className   = 'action-btn skill-btn';
    btn.textContent = skill.emoji + ' ' + skill.name;
    btn.title       = skill.desc;
    btn.addEventListener('click', function () {
      game.ui.hideSkillMenu();
      onSkillSelect(skill);
    });
    list.appendChild(btn);
  });

  menu.classList.remove('hidden');
  anime({ targets: '#skill-list .action-btn', translateX: [30, 0], opacity: [0, 1],
    duration: 250, delay: anime.stagger(50), easing: 'easeOutQuart' });
};

GameUI.prototype.hideSkillMenu = function () {
  document.getElementById('skill-menu').classList.add('hidden');
};

// ─── Floating damage numbers ─────────────────────────────────────────────────

GameUI.prototype.showFloatingNumber = function (unit, text, color) {
  // Project 3D position to screen using Babylon scene
  var scene = this.game.scene;
  if (!scene || !scene.scene) return;

  var nodes = scene._unitNodes[unit.id];
  if (!nodes) {
    // Unit mesh removed; show at center
    this._floatAt(window.innerWidth / 2, window.innerHeight / 2, text, color);
    return;
  }

  var worldPos = nodes.body.getAbsolutePosition();
  var screenPos = BABYLON.Vector3.Project(
    worldPos,
    BABYLON.Matrix.Identity(),
    scene.scene.getTransformMatrix(),
    scene.scene.activeCamera.viewport.toGlobal(scene.engine.getRenderWidth(), scene.engine.getRenderHeight())
  );
  this._floatAt(screenPos.x, screenPos.y - 40, text, color);
};

GameUI.prototype._floatAt = function (x, y, text, color) {
  var el = document.createElement('div');
  el.className   = 'dmg-float';
  el.textContent = text;
  el.style.color = color || '#fff';
  el.style.left  = x + 'px';
  el.style.top   = y + 'px';
  document.body.appendChild(el);

  anime({
    targets: el,
    translateY: [-10, -60],
    opacity: [1, 0],
    duration: 900,
    easing: 'easeOutQuart',
    complete: function () { el.remove(); }
  });
};

// ─── Party panel ─────────────────────────────────────────────────────────────

GameUI.prototype.renderPartyPanel = function (members) {
  this._party = members;
  var panel = document.getElementById('party-panel');
  if (!panel) return;
  panel.innerHTML = '';
  var self = this;
  members.forEach(function (unit) {
    panel.appendChild(self._buildPartyCard(unit));
  });
  anime({ targets: '.party-card', scale: [0.85, 1], opacity: [0, 1],
    duration: 350, delay: anime.stagger(60), easing: 'easeOutBack' });
};

GameUI.prototype._buildPartyCard = function (unit) {
  var card = document.createElement('div');
  card.id = 'party-card-' + unit.id;
  card.className = 'party-card' + (unit.isPlayer ? ' party-card-player' : '');
  var ratio = unit.hpRatio() * 100;
  var bgPos  = (1 - unit.hpRatio()) * 100;
  card.innerHTML =
    '<div class="party-card-header">' +
      '<span class="party-card-emoji">' + unit.emoji + '</span>' +
      '<span class="party-card-name">' + unit.name + '</span>' +
    '</div>' +
    '<div class="party-card-sub">' +
      RACES[unit.race].name + ' ' + CLASSES[unit.classId].name + ' · Lv.' + unit.level +
    '</div>' +
    '<div class="hp-bar-wrap">' +
      '<div class="hp-bar-fill" id="party-hp-fill-' + unit.id + '" ' +
        'style="width:' + ratio + '%;background-position:' + bgPos + '% 0"></div>' +
    '</div>' +
    '<div class="party-card-hp" id="party-hp-text-' + unit.id + '">' +
      unit.hp + ' / ' + unit.maxHp +
    '</div>';
  return card;
};

GameUI.prototype.updatePartyMember = function (unit) {
  if (!unit.isPlayer && !unit.isAlly) return;
  var fill = document.getElementById('party-hp-fill-' + unit.id);
  var text = document.getElementById('party-hp-text-' + unit.id);
  var card = document.getElementById('party-card-' + unit.id);
  if (!fill || !text || !card) return;
  var ratio = unit.hpRatio() * 100;
  var bgPos  = (1 - unit.hpRatio()) * 100;
  anime({ targets: fill, width: ratio + '%', duration: 350, easing: 'easeOutQuart' });
  fill.style.backgroundPosition = bgPos + '% 0';
  text.textContent = unit.hp + ' / ' + unit.maxHp;
  if (unit.isAlive()) {
    card.classList.remove('party-card-dead');
  } else {
    card.classList.add('party-card-dead');
  }
};

// ─── Level-up screen ─────────────────────────────────────────────────────────

GameUI.prototype.showLevelUpScreen = function (unit, gains, onContinue) {
  document.getElementById('levelup-level').textContent = unit.name + ' is now Level ' + unit.level + '!';

  var container = document.getElementById('levelup-stats');
  container.innerHTML = '';
  var statNames = { hp: 'Max HP', atk: 'ATK', def: 'DEF', mag: 'MAG', spd: 'SPD', res: 'RES' };
  Object.entries(gains).forEach(function (entry) {
    if (entry[1] <= 0) return;
    var div = document.createElement('div');
    div.className   = 'lvl-stat';
    div.innerHTML   = statNames[entry[0]] + ' <span class="stat-up">+' + entry[1] + '</span>';
    container.appendChild(div);
  });

  this.showScreen('screen-levelup');
  anime({ targets: '.levelup-title', scale: [0.7, 1], opacity: [0, 1], duration: 600, easing: 'easeOutElastic(1, 0.6)' });
  anime({ targets: '.lvl-stat', translateX: [-20, 0], opacity: [0, 1], duration: 300,
    delay: anime.stagger(60, { start: 400 }) });

  document.getElementById('btn-continue-levelup').onclick = function () {
    if (onContinue) onContinue();
  };
};

// ─── Victory / defeat screens ─────────────────────────────────────────────────

GameUI.prototype.showVictoryScreen = function (stage, expGained, onNext, onMenu) {
  document.getElementById('victory-details').innerHTML =
    'Stage ' + stage + ' cleared!<br>' +
    '✨ EXP gained: <b style="color:var(--gold)">' + expGained + '</b>';

  this.showScreen('screen-victory');
  anime({ targets: '.result-icon', rotate: [-15, 15], loop: true, direction: 'alternate', duration: 800 });
  anime({ targets: '.victory-title', scale: [0.8, 1], opacity: [0, 1], duration: 600, easing: 'easeOutBack' });

  document.getElementById('btn-next-stage').onclick  = onNext || null;
  document.getElementById('btn-title-victory').onclick = onMenu || null;
};

GameUI.prototype.showDefeatScreen = function (onRetry, onMenu) {
  this.showScreen('screen-defeat');
  anime({ targets: '.defeat-title', scale: [1.2, 1], opacity: [0, 1], duration: 500 });

  document.getElementById('btn-retry').onclick       = onRetry || null;
  document.getElementById('btn-title-defeat').onclick = onMenu  || null;
};

// ─── Memory-usage warning toast ───────────────────────────────────────────────

// How long (ms) the memory warning stays visible before auto-dismissing.
var MEMORY_WARNING_AUTO_DISMISS_MS = 8000;

/**
 * Show (or refresh) the memory-warning toast.
 * @param {{ used: number, total: number, ratio: number }} info
 */
GameUI.prototype.showMemoryWarning = function (info) {
  var el = document.getElementById('memory-warning');
  if (!el) return;

  var pct = Math.round(info.ratio * 100);
  var usedMB  = Math.round(info.used  / (1024 * 1024));
  var totalMB = Math.round(info.total / (1024 * 1024));

  document.getElementById('memory-warning-text').textContent =
    '⚠ High memory usage: ' + pct + '% (' + usedMB + ' / ' + totalMB + ' MB). ' +
    'Performance may be affected.';

  el.classList.remove('hidden');
  el.style.opacity = 0;
  anime({ targets: el, opacity: [0, 1], duration: 350, easing: 'easeOutQuart' });

  // Auto-dismiss after the configured delay
  var self = this;
  clearTimeout(this._memWarnTimer);
  this._memWarnTimer = setTimeout(function () { self.hideMemoryWarning(); }, MEMORY_WARNING_AUTO_DISMISS_MS);
};

/** Dismiss the memory-warning toast. */
GameUI.prototype.hideMemoryWarning = function () {
  var el = document.getElementById('memory-warning');
  if (!el) return;
  var self = this;
  anime({
    targets: el, opacity: [1, 0], duration: 300, easing: 'easeInQuart',
    complete: function () { el.classList.add('hidden'); }
  });
  clearTimeout(self._memWarnTimer);
};
