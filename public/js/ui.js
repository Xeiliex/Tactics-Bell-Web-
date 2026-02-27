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

// Minimal HTML-attribute escaper — prevents quote break-out when user-typed
// strings are placed inside double-quoted HTML attributes.
function _htmlAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function GameUI(game) {
  this.game = game;
  this._currentScreen = null;
  this._party = [];
  this._memWarnTimer = null;
  this._charPreview   = null;   // CharacterPreviewScene — active during wizard
  this._charPortraits = {};     // memberIdx → portrait data-URL

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
  this._disposePreview();
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

// ─── Character creation wizard ────────────────────────────────────────────────

var WIZARD_STEP_META = [
  { title: 'Choose Your Race',      sub: 'Your heritage shapes your innate abilities.' },
  { title: 'Choose Your Class',     sub: 'Your training defines your role in battle.' },
  { title: 'Choose a Background',   sub: 'Your past grants unique advantages.' },
  { title: 'Name & Appearance',     sub: 'Give your adventurer an identity.' }
];

var WIZARD_MEMBER_META = [
  { label: '⚔ HERO  ·  MEMBER 1 OF 3',  defaultName: 'Hero',   cardTitle: 'Hero'    },
  { label: '🛡 ALLY  ·  MEMBER 2 OF 3',  defaultName: 'Ally I', cardTitle: 'Ally I'  },
  { label: '🗡 ALLY  ·  MEMBER 3 OF 3',  defaultName: 'Ally II', cardTitle: 'Ally II' }
];

GameUI.prototype.showCreateScreen = function () {
  var game = this.game;
  this._disposePreview();
  this._charPortraits = {};

  // Initialise partyConfig if this is a fresh visit
  if (!game.partyConfig) {
    game.partyConfig = [{
      name: 'Hero', race: null, classId: null, backgroundId: null, colorId: 'default'
    }];
    for (var pi = 0; pi < 2 && pi < ALLY_PRESETS.length; pi++) {
      var p = ALLY_PRESETS[pi];
      // Pre-assign a default background ('soldier') so the background wizard
      // step is pre-selected for ally members and the Next button is never
      // permanently disabled — the user can still change it.
      game.partyConfig.push({
        name: p.name, race: p.race, classId: p.classId,
        backgroundId: 'soldier', colorId: 'default'
      });
    }
  }

  // Start (or restart) wizard from member 0, step 0
  this._wizard = { memberIdx: 0, stepIdx: 0 };

  this.showScreen('screen-create');
  this._renderWizardStep();
};

// ─── Wizard rendering ─────────────────────────────────────────────────────────

GameUI.prototype._renderWizardStep = function () {
  var w      = this._wizard;
  var game   = this.game;
  var member = game.partyConfig[w.memberIdx];
  var meta   = WIZARD_STEP_META[w.stepIdx];
  var mmeta  = WIZARD_MEMBER_META[w.memberIdx] || WIZARD_MEMBER_META[0];
  var isLastMember = w.memberIdx === game.partyConfig.length - 1;
  var isLastStep   = w.stepIdx   === WIZARD_STEP_META.length - 1;

  // Member label
  var memberLabel = document.getElementById('wizard-member-label');
  if (memberLabel) memberLabel.textContent = mmeta.label;

  // Step title & subtitle
  var stepTitle = document.getElementById('wizard-step-title');
  if (stepTitle) stepTitle.textContent = meta.title;
  var stepSub = document.getElementById('wizard-step-sub');
  if (stepSub) stepSub.textContent = meta.sub;

  // Progress dots
  var dotsEl = document.getElementById('wizard-step-dots');
  if (dotsEl) {
    dotsEl.innerHTML = '';
    for (var s = 0; s < WIZARD_STEP_META.length; s++) {
      var dot = document.createElement('div');
      dot.className = 'wizard-dot' +
        (s < w.stepIdx ? ' done' : (s === w.stepIdx ? ' active' : ''));
      dotsEl.appendChild(dot);
    }
  }

  // Back button label
  var backBtn = document.getElementById('btn-wizard-back');
  if (backBtn) {
    backBtn.textContent = (w.memberIdx === 0 && w.stepIdx === 0) ? '← Cancel' : '← Back';
  }

  // Next button label & state
  var nextBtn = document.getElementById('btn-wizard-next');
  if (nextBtn) {
    nextBtn.textContent = (isLastMember && isLastStep) ? 'Review Party →' : 'Next →';
    nextBtn.disabled = !this._wizardStepComplete(w.memberIdx, w.stepIdx);
  }

  // Build content
  var content = document.getElementById('wizard-content');
  if (content) {
    content.innerHTML = '';
    if (w.stepIdx === 0)      this._buildWizardRaceStep(content, member);
    else if (w.stepIdx === 1) this._buildWizardClassStep(content, member);
    else if (w.stepIdx === 2) this._buildWizardBackgroundStep(content, member);
    else                      this._buildWizardIdentityStep(content, member, w.memberIdx, mmeta);
  }

  // Show the 3-D preview canvas on class (1) and identity (3) steps;
  // hide it on race (0) and background (2) steps, and always hide it when
  // GRAPHICS_QUALITY is 'low' (CharacterPreviewScene is not initialised in
  // that mode, which would leave a blank dark box visible to the user).
  var previewWrap = document.getElementById('wizard-preview-wrap');
  if (previewWrap) {
    var previewEnabled = (typeof GRAPHICS_QUALITY === 'undefined' || GRAPHICS_QUALITY !== 'low');
    if (previewEnabled && (w.stepIdx === 1 || w.stepIdx === 3)) {
      previewWrap.classList.remove('hidden');
    } else {
      previewWrap.classList.add('hidden');
    }
  }

  anime({ targets: '#wizard-content', opacity: [0, 1], translateY: [12, 0],
    duration: 280, easing: 'easeOutQuart' });
};

GameUI.prototype._wizardStepComplete = function (memberIdx, stepIdx) {
  var m = this.game.partyConfig[memberIdx];
  if (stepIdx === 0) return !!m.race;
  if (stepIdx === 1) return !!m.classId;
  if (stepIdx === 2) return !!m.backgroundId;
  return true; // identity always completable
};

// ─── Wizard navigation ────────────────────────────────────────────────────────

GameUI.prototype.wizardNext = function () {
  var w    = this._wizard;
  var game = this.game;
  if (!this._wizardStepComplete(w.memberIdx, w.stepIdx)) return;

  var isLastMember = w.memberIdx === game.partyConfig.length - 1;
  var isLastStep   = w.stepIdx   === WIZARD_STEP_META.length - 1;

  // Capture portrait on identity step before advancing
  if (w.stepIdx === WIZARD_STEP_META.length - 1 && this._charPreview) {
    var portrait = this._charPreview.capturePortrait();
    if (portrait) {
      this._charPortraits[w.memberIdx] = portrait;
      if (game.partyConfig[w.memberIdx]) {
        game.partyConfig[w.memberIdx].portrait = portrait;
      }
    }
    this._disposePreview();
  }

  if (isLastMember && isLastStep) {
    this.showPartyReviewScreen();
    return;
  }

  if (isLastStep) {
    w.memberIdx++;
    w.stepIdx = 0;
  } else {
    w.stepIdx++;
  }
  this._renderWizardStep();
};

GameUI.prototype.wizardBack = function () {
  var w = this._wizard;
  // Going back from class step (1) to race step (0) — dispose the preview
  if (w.stepIdx === 1) { this._disposePreview(); }

  if (w.stepIdx === 0 && w.memberIdx > 0) {
    w.memberIdx--;
    w.stepIdx = WIZARD_STEP_META.length - 1;
  } else if (w.stepIdx > 0) {
    w.stepIdx--;
  }
  this._renderWizardStep();
};

// ─── Wizard step renderers ────────────────────────────────────────────────────

/** Tear down the character preview Babylon scene and hide the canvas wrap. */
GameUI.prototype._disposePreview = function () {
  if (this._charPreview) {
    this._charPreview.dispose();
    this._charPreview = null;
  }
  var wrap = document.getElementById('wizard-preview-wrap');
  if (wrap) wrap.classList.add('hidden');
};

/**
 * Initialise (or reuse) the CharacterPreviewScene and load the given model.
 * Uses a short setTimeout so Babylon initialises after the canvas is painted.
 */
GameUI.prototype._ensurePreview = function (classId, colorId, raceId) {
  if (typeof GRAPHICS_QUALITY !== 'undefined' && GRAPHICS_QUALITY === 'low') return;
  if (typeof CharacterPreviewScene === 'undefined') return;
  var self = this;
  if (!this._charPreview) {
    this._charPreview = new CharacterPreviewScene();
    var preview = this._charPreview;
    setTimeout(function () {
      if (preview !== self._charPreview) return; // disposed while waiting
      if (preview.init('char-preview-canvas') && classId) {
        preview.loadModel(classId, colorId || 'default', raceId || 'human');
      }
    }, 80);
  } else if (classId) {
    this._charPreview.loadModel(classId, colorId || 'default', raceId || 'human');
  }
};

GameUI.prototype._buildWizardRaceStep = function (container, member) {
  var grid = document.createElement('div');
  grid.className = 'cards-grid';

  Object.values(RACES).forEach(function (race) {
    var card = document.createElement('div');
    card.className = 'card' + (member.race === race.id ? ' selected' : '');

    var bonuses = Object.entries(race.statBonuses)
      .filter(function (e) { return e[1] !== 0; })
      .map(function (e) { return (e[1] > 0 ? '+' : '') + e[1] + ' ' + e[0].toUpperCase(); })
      .join('  ');

    card.innerHTML =
      '<div class="card-emoji">' + race.emoji + '</div>' +
      '<div class="card-name" style="color:' + race.color + '">' + race.name + '</div>' +
      '<div class="card-desc">' + race.description + '</div>' +
      (bonuses ? '<div class="card-bonuses">' + bonuses + '</div>' : '');

    card.addEventListener('click', function () {
      container.querySelectorAll('.card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      member.race = race.id;
      var nb = document.getElementById('btn-wizard-next');
      if (nb) nb.disabled = false;
      anime({ targets: card, scale: [0.95, 1.0], duration: 200, easing: 'easeOutBack' });
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
  anime({ targets: grid.querySelectorAll('.card'), translateY: [16, 0], opacity: [0, 1],
    duration: 340, easing: 'easeOutQuart', delay: anime.stagger(50) });
};

GameUI.prototype._buildWizardClassStep = function (container, member) {
  var self = this;
  var grid = document.createElement('div');
  grid.className = 'cards-grid';

  Object.values(CLASSES).forEach(function (cls) {
    var card = document.createElement('div');
    card.className = 'card' + (member.classId === cls.id ? ' selected' : '');

    // Show the two class skills so the player knows what abilities they get
    var skillsHtml = cls.skills.map(function (s) {
      return '<span class="card-skill-tag">' + s.emoji + ' ' + s.name + '</span>';
    }).join('');

    card.innerHTML =
      '<div class="card-emoji">' + cls.emoji + '</div>' +
      '<div class="card-name" style="color:' + cls.color + '">' + cls.name + '</div>' +
      '<div class="card-desc">' + cls.description + '</div>' +
      '<div class="card-bonuses">Move ' + cls.moveRange + '  ·  Range ' + cls.attackRange + '</div>' +
      (skillsHtml ? '<div class="card-skills">' + skillsHtml + '</div>' : '');

    card.addEventListener('click', function () {
      container.querySelectorAll('.card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      member.classId = cls.id;
      var nb = document.getElementById('btn-wizard-next');
      if (nb) nb.disabled = false;
      anime({ targets: card, scale: [0.95, 1.0], duration: 200, easing: 'easeOutBack' });
      // Update the 3-D preview to show this class
      self._ensurePreview(cls.id, member.colorId, member.race);
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);

  // If a class was already selected (e.g. navigating back), show it in the preview
  if (member.classId) {
    self._ensurePreview(member.classId, member.colorId, member.race);
  }

  anime({ targets: grid.querySelectorAll('.card'), translateY: [16, 0], opacity: [0, 1],
    duration: 340, easing: 'easeOutQuart', delay: anime.stagger(50) });
};

GameUI.prototype._buildWizardBackgroundStep = function (container, member) {
  var grid = document.createElement('div');
  grid.className = 'cards-grid';

  Object.values(BACKGROUNDS).forEach(function (bg) {
    var card = document.createElement('div');
    card.className = 'card' + (member.backgroundId === bg.id ? ' selected' : '');

    var bonuses = Object.entries(bg.statBonuses)
      .filter(function (e) { return e[1] !== 0; })
      .map(function (e) { return (e[1] > 0 ? '+' : '') + e[1] + ' ' + e[0].toUpperCase(); })
      .join('  ');

    // Show what the final HP will be with this background applied (preview stat)
    var hpPreview = '';
    if (member.race && member.classId) {
      var dummy = new Character({
        name: 'Preview', raceId: member.race,
        classId: member.classId, backgroundId: bg.id, level: 1
      });
      hpPreview = '<div class="card-stat-preview">→ HP ' + dummy.maxHp +
        '  ATK ' + dummy.atk + '  SPD ' + dummy.spd + '</div>';
    }

    card.innerHTML =
      '<div class="card-emoji">' + bg.emoji + '</div>' +
      '<div class="card-name" style="color:' + bg.color + '">' + bg.name + '</div>' +
      '<div class="card-desc">' + bg.description + '</div>' +
      '<div class="card-flavor">' + bg.flavor + '</div>' +
      (bonuses ? '<div class="card-bonuses">' + bonuses + '</div>' : '') +
      hpPreview;

    card.addEventListener('click', function () {
      container.querySelectorAll('.card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      member.backgroundId = bg.id;
      var nb = document.getElementById('btn-wizard-next');
      if (nb) nb.disabled = false;
      anime({ targets: card, scale: [0.95, 1.0], duration: 200, easing: 'easeOutBack' });
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
  anime({ targets: grid.querySelectorAll('.card'), translateY: [16, 0], opacity: [0, 1],
    duration: 340, easing: 'easeOutQuart', delay: anime.stagger(50) });
};

GameUI.prototype._buildWizardIdentityStep = function (container, member, memberIdx, mmeta) {
  var self = this;
  var wrap = document.createElement('div');
  wrap.className = 'wizard-identity';

  // Name input
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'char-name-input';
  nameInput.maxLength = 16;
  nameInput.placeholder = mmeta.defaultName + ' name…';
  nameInput.value = member.name || mmeta.defaultName;
  nameInput.addEventListener('input', function () {
    member.name = nameInput.value || mmeta.defaultName;
  });
  wrap.appendChild(nameInput);

  // Colour label
  var colorLabel = document.createElement('div');
  colorLabel.className = 'wizard-color-label';
  colorLabel.textContent = 'Body Colour';
  wrap.appendChild(colorLabel);

  // Colour swatches
  var swatchRow = document.createElement('div');
  swatchRow.className = 'color-swatches';
  var currentColor = member.colorId || 'default';

  BODY_COLORS.forEach(function (color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color.id === currentColor ? ' selected' : '');
    swatch.dataset.color = color.id;
    swatch.title = color.name;
    if (color.hex) swatch.style.backgroundColor = color.hex;

    swatch.addEventListener('click', function () {
      swatchRow.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('selected'); });
      swatch.classList.add('selected');
      member.colorId = color.id;
      anime({ targets: swatch, scale: [0.85, 1.0], duration: 200, easing: 'easeOutBack' });
      // Update the 3-D preview colour in real-time
      if (self._charPreview) {
        self._charPreview.applyColor(color.id, member.race);
      }
    });

    swatchRow.appendChild(swatch);
  });
  wrap.appendChild(swatchRow);

  // Stats preview (race + class + background all applied)
  if (member.race && member.classId) {
    var preview = document.createElement('div');
    preview.className = 'stats-preview';
    var dummy = new Character({
      name: 'Preview', raceId: member.race, classId: member.classId,
      backgroundId: member.backgroundId, level: 1
    });
    var statDefs = [
      { label: 'HP',  val: dummy.maxHp },
      { label: 'ATK', val: dummy.atk   },
      { label: 'DEF', val: dummy.def   },
      { label: 'MAG', val: dummy.mag   },
      { label: 'SPD', val: dummy.spd   },
      { label: 'RES', val: dummy.res   }
    ];
    preview.innerHTML = statDefs.map(function (s) {
      return '<div class="stat-chip">' + s.label + ' <span>' + s.val + '</span></div>';
    }).join('');
    wrap.appendChild(preview);
    anime({ targets: preview.querySelectorAll('.stat-chip'), scale: [0.85, 1], opacity: [0, 1],
      duration: 220, delay: anime.stagger(35), easing: 'easeOutBack' });
  }

  container.appendChild(wrap);

  // Ensure the 3-D preview shows the current class with the current colour
  if (member.classId) {
    self._ensurePreview(member.classId, member.colorId, member.race);
  }

  // Auto-focus the name input after render
  setTimeout(function () { nameInput.focus(); }, 50);
};

// ─── Party review screen ──────────────────────────────────────────────────────

GameUI.prototype.showPartyReviewScreen = function () {
  var game  = this.game;
  var grid  = document.getElementById('review-party-grid');
  if (!grid) return;
  grid.innerHTML = '';

  var memberTitles = WIZARD_MEMBER_META.map(function (m) { return m.cardTitle; });

  game.partyConfig.forEach(function (member, i) {
    if (!member.race || !member.classId) return;

    var dummy = new Character({
      name: member.name || 'Adventurer',
      raceId: member.race, classId: member.classId,
      backgroundId: member.backgroundId, level: 1
    });

    var bg = member.backgroundId && BACKGROUNDS && BACKGROUNDS[member.backgroundId];
    var bgLine = bg
      ? '<div class="review-member-bg">' + bg.emoji + ' ' + bg.name + '</div>'
      : '';

    // Use captured portrait if available, otherwise fall back to class emoji
    var portraitHtml = member.portrait
      ? '<img class="review-portrait" src="' + member.portrait + '" alt="' + _htmlAttr(member.name || 'Adventurer') + '">'
      : '<div class="review-member-emoji">' + CLASSES[member.classId].emoji + '</div>';

    var card = document.createElement('div');
    card.className = 'review-member-card' + (i === 0 ? ' hero-card' : '');
    card.innerHTML =
      '<div class="review-member-role">' + memberTitles[i] + '</div>' +
      portraitHtml +
      '<div class="review-member-name">' + (member.name || 'Adventurer') + '</div>' +
      '<div class="review-member-subtitle">' +
        RACES[member.race].name + ' · ' + CLASSES[member.classId].name +
      '</div>' +
      bgLine +
      '<div class="review-member-stats">' +
        '<div class="stat-chip">HP <span>'  + dummy.maxHp + '</span></div>' +
        '<div class="stat-chip">ATK <span>' + dummy.atk   + '</span></div>' +
        '<div class="stat-chip">DEF <span>' + dummy.def   + '</span></div>' +
        '<div class="stat-chip">MAG <span>' + dummy.mag   + '</span></div>' +
        '<div class="stat-chip">SPD <span>' + dummy.spd   + '</span></div>' +
      '</div>';

    grid.appendChild(card);
  });

  this.showScreen('screen-party-review');
  anime({ targets: '.review-member-card', translateY: [24, 0], opacity: [0, 1],
    duration: 420, easing: 'easeOutQuart', delay: anime.stagger(100) });
};

// ─── Battle screen ────────────────────────────────────────────────────────────

GameUI.prototype.showBattleScreen = function () {
  this._disposePreview();
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
  // Show bloodied indicator next to name when unit is below 50 % HP
  var bloodied = (typeof unit.isBloodied === 'function') && unit.isBloodied();
  document.getElementById('unit-subtitle').textContent =
    RACES[unit.race].name + ' ' + CLASSES[unit.classId].name + ' · Lv.' + unit.level +
    (bloodied ? ' 🩸' : '');
  document.getElementById('hp-text').textContent = unit.hp + ' / ' + unit.maxHp;

  var ratio = unit.hpRatio() * 100;
  var fill  = document.getElementById('hp-bar-fill');
  anime({ targets: fill, width: ratio + '%', duration: 350, easing: 'easeOutQuart' });
  // Colour: green→yellow→red via background-position
  var bgPos = (1 - unit.hpRatio()) * 100;
  fill.style.backgroundPosition = bgPos + '% 0';

  // Status effect badges
  var statusIcons = '';
  if (unit.statusEffects) {
    if (unit.statusEffects.burn  > 0) { statusIcons += ' 🔥×' + unit.statusEffects.burn; }
    if (unit.statusEffects.stun > 0)  { statusIcons += ' 💫'; }
  }

  var statsRow = document.getElementById('unit-stats-row');
  statsRow.innerHTML =
    '<span class="mini-stat">ATK <b>' + unit.atk + '</b></span>' +
    '<span class="mini-stat">DEF <b>' + unit.def + '</b></span>' +
    '<span class="mini-stat">MAG <b>' + unit.mag + '</b></span>' +
    '<span class="mini-stat">SPD <b>' + unit.spd + '</b></span>' +
    (statusIcons ? '<span class="mini-stat status-icons">' + statusIcons + '</span>' : '');
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
  // Use portrait if available, otherwise fall back to emoji
  var iconHtml = unit.portrait
    ? '<img class="party-portrait" src="' + unit.portrait + '" alt="' + _htmlAttr(unit.name) + '">'
    : '<span class="party-card-emoji">' + unit.emoji + '</span>';
  card.innerHTML =
    '<div class="party-card-header">' +
      iconHtml +
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

// ─── Loading overlay ─────────────────────────────────────────────────────────

GameUI.prototype.showLoadingScreen = function (text) {
  var el = document.getElementById('screen-loading');
  if (!el) return;
  var msg = el.querySelector('.loading-message');
  if (msg && text) msg.textContent = text;
  el.classList.remove('hidden');
  el.style.opacity = 1;
};

GameUI.prototype.hideLoadingScreen = function (callback) {
  var el = document.getElementById('screen-loading');
  if (!el || el.classList.contains('hidden')) {
    if (callback) callback();
    return;
  }
  anime({
    targets: el,
    opacity: [1, 0],
    duration: 350,
    easing: 'linear',
    complete: function () {
      el.classList.add('hidden');
      el.style.opacity = '';
      if (callback) callback();
    }
  });
};
