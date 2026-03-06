/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME — main state machine & wiring
// ═══════════════════════════════════════

var game = (function () {

  var g = {
    selectedRace:       null,
    selectedClass:      null,
    partyConfig:        null,   // Array of 3 party-member config objects
    stage:              1,
    gold:               0,      // Player's gold (used for reclassing)
    player:             null,   // Character — the player's hero
    allies:             [],     // Character[] — CPU allies
    enemies:            [],     // Character[] — enemies
    grid:               null,   // Grid
    scene:              null,   // GameScene
    combat:             null,   // Combat
    ui:                 null,   // GameUI
    weather:            null,   // current WEATHER_TYPES entry
    story:              null,   // StoryManager — set when story mode is active
    _pendingSave:       null,   // Temporary holder for continue-game restore data
    multiplayerActive:  false,  // true while a multiplayer battle is running
    multiplayerIdx:     -1,     // 0 = host, 1 = guest
  };

  // ─── Local save helpers ──────────────────────────────────────────────────────

  var SAVE_KEY = 'tactics-bell-save';

  // Fraction of hero EXP granted to surviving allies after a battle.
  var ALLY_EXP_SHARE = 0.75;

  // Gold awarded per stage cleared (scales with stage number).
  function _goldRewardForStage(stage) {
    return 10 + stage * 5;
  }

  /**
   * Compute a simple djb2-style checksum for lightweight tamper detection.
   * Note: this deters casual editing via DevTools but is not a cryptographic
   * guarantee — a determined user could recalculate the checksum from the
   * visible source code.
   * @param {string} str
   * @returns {number}
   */
  function _computeChecksum(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * Encode save data as a Base64 blob with an embedded checksum so the stored
   * value is not plain, human-readable JSON and casual tampering is detectable.
   * @param {object} data
   * @returns {string}
   */
  function _encodeSave(data) {
    var json     = JSON.stringify(data);
    var checksum = _computeChecksum(json);
    var payload  = JSON.stringify({ d: json, c: checksum });
    var bytes    = new TextEncoder().encode(payload);
    return btoa(String.fromCharCode.apply(null, bytes));
  }

  /**
   * Decode a save blob produced by _encodeSave.  Returns null if the value
   * cannot be decoded or the checksum does not match (i.e. tampered).
   * @param {string} raw
   * @returns {object|null}
   */
  function _decodeSave(raw) {
    try {
      var bytes   = Uint8Array.from(atob(raw), function (c) { return c.charCodeAt(0); });
      var payload = JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || typeof payload.d !== 'string' || typeof payload.c !== 'number') return null;
      if (_computeChecksum(payload.d) !== payload.c) return null;
      return JSON.parse(payload.d);
    } catch (e) {
      return null;
    }
  }

  function saveProgress() {
    if (!g.player) return;
    try {
      var data = { stage: g.stage, gold: g.gold || 0 };
      if (g.partyConfig && g.partyConfig.length > 0) {
        data.party = g.partyConfig.map(function (m, i) {
          var unit = i === 0 ? g.player : g.allies[i - 1];
          return {
            name:         m.name,
            race:         m.race,
            classId:      unit ? unit.classId : m.classId,
            backgroundId: m.backgroundId || null,
            gender:       m.gender       || 'male',
            hairStyle:    m.hairStyle    || 'none',
            hairColor:    m.hairColor    || 'dark',
            colorId:      m.colorId      || 'default',
            level:        unit ? unit.level : (m.level || 1),
            exp:          unit ? unit.exp   : (m.exp   || 0),
            hp:           unit ? unit.hp    : (m.hp    || 0)
          };
        });
      } else {
        data.race    = g.player.race;
        data.classId = g.player.classId;
        data.level   = g.player.level;
        data.exp     = g.player.exp;
        data.hp      = g.player.hp;
      }
      var encoded = _encodeSave(data);
      localStorage.setItem(SAVE_KEY, encoded);
      // Also persist to the cloud when the player is signed in (fire-and-forget).
      if (typeof auth !== 'undefined' && auth.getUser()) {
        auth.saveToCloud(encoded);
      }
    } catch (e) {
      // localStorage not available in this environment
    }
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      return raw ? _decodeSave(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
  }

  function _updateContinueButton() {
    var btn = document.getElementById('btn-continue-game');
    if (!btn) return;
    if (loadSave() !== null) {
      var wasHidden = btn.classList.contains('hidden');
      btn.classList.remove('hidden');
      if (wasHidden) {
        anime({ targets: btn, scale: [0.8, 1], opacity: [0, 1], duration: 500, easing: 'easeOutBack', delay: 200 });
      }
    } else {
      btn.classList.add('hidden');
    }
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  function init() {
    g.ui = new GameUI(g);
    g.ui.showTitleScreen();
    _updateContinueButton();

    // Graphics quality toggle (title screen)
    (function () {
      var btn = document.getElementById('btn-gfx-toggle');
      if (!btn) return;
      function updateBtn() {
        var isHigh = (typeof GRAPHICS_QUALITY === 'undefined' || GRAPHICS_QUALITY !== 'low');
        btn.textContent  = isHigh ? '🖥 High Graphics' : '⚙ Low Graphics';
        btn.className    = 'btn-gfx-toggle ' + (isHigh ? 'gfx-high' : 'gfx-low');
        btn.title        = isHigh
          ? 'Using high-quality 3-D models — click to switch to low graphics'
          : 'Using low-quality procedural shapes — click to switch to high graphics';
      }
      btn.addEventListener('click', function () {
        GRAPHICS_QUALITY = (GRAPHICS_QUALITY === 'low') ? 'high' : 'low';
        try { localStorage.setItem('tactics-bell-gfx', GRAPHICS_QUALITY); } catch (e) {}
        updateBtn();
      });
      updateBtn();
    }());

    // Fullscreen toggle
    (function () {
      var btn = document.getElementById('btn-fullscreen');
      if (!btn) return;

      function updateIcon() {
        var inFs = !!document.fullscreenElement;
        // ⛶ = enter fullscreen, ✕-like symbol for exit
        btn.innerHTML  = inFs ? '&#x2716;&#xFE0E;' : '&#x26F6;';
        btn.title      = inFs ? 'Exit Fullscreen' : 'Enter Fullscreen';
      }

      btn.addEventListener('click', function () {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function (err) {
            console.warn('Fullscreen request failed:', err.message);
          });
        } else {
          document.exitFullscreen();
        }
      });

      document.addEventListener('fullscreenchange', updateIcon);
      updateIcon();
    }());

    // Title → Create
    document.getElementById('btn-new-game').addEventListener('click', function () {
      clearSave();
      g.stage       = 1;
      g.player      = null;
      g.partyConfig = null;
      g.story       = null;
      g.ui.showPartyChoiceScreen();
    });

    // Title → Story Mode
    document.getElementById('btn-story-mode').addEventListener('click', function () {
      g.stage       = 1;
      g.player      = null;
      g.partyConfig = null;
      g.story       = new StoryManager(g);
      g.ui.showCreateScreen();
    });

    // Title → Quick Match
    document.getElementById('btn-quick-match').addEventListener('click', function () {
      clearSave();
      g.stage  = 1;
      g.player = null;
      _startQuickMatch();
    });

    // Title → Multiplayer
    document.getElementById('btn-multiplayer').addEventListener('click', function () {
      g.ui.showScreen('screen-lobby');
      _initLobbyUI();
    });

    // Title → Continue
    document.getElementById('btn-continue-game').addEventListener('click', function () {
      var save = loadSave();
      if (!save) return;
      g.stage = save.stage;
      g.gold  = save.gold || 0;

      if (save.party && save.party.length > 0) {
        g.partyConfig = save.party.map(function (m) {
          return {
            name:         m.name         || 'Adventurer',
            race:         m.race,
            classId:      m.classId,
            backgroundId: m.backgroundId || null,
            gender:       m.gender       || 'male',
            hairStyle:    m.hairStyle    || 'none',
            hairColor:    m.hairColor    || 'dark',
            colorId:      m.colorId      || 'default',
            level:        m.level        || 1,
            exp:          m.exp          || 0,
            hp:           m.hp           || 0
          };
        });
      } else if (save.race) {
        // Legacy single-hero save: synthesise a partyConfig
        var legacyParty = [
          { name: 'Hero', race: save.race, classId: save.classId, backgroundId: null, colorId: 'default', level: save.level || 1, exp: save.exp || 0, hp: save.hp || 0 }
        ];
        for (var lp = 0; lp < 2 && lp < ALLY_PRESETS.length; lp++) {
          legacyParty.push({ name: ALLY_PRESETS[lp].name, race: ALLY_PRESETS[lp].race, classId: ALLY_PRESETS[lp].classId, backgroundId: null, colorId: 'default', level: save.level || 1, exp: 0, hp: 0 });
        }
        g.partyConfig = legacyParty;
      } else {
        return;
      }

      g._pendingSave = save;
      startBattle(false);
    });

    // Wizard navigation
    document.getElementById('btn-wizard-back').addEventListener('click', function () {
      var w = g.ui && g.ui._wizard;
      if (!w || (w.memberIdx === 0 && w.stepIdx === 0)) {
        // Cancel — return to title
        g.partyConfig = null;
        g.ui.showTitleScreen();
        _updateContinueButton();
      } else {
        g.ui.wizardBack();
      }
    });

    // Party Choice → Quick Start
    document.getElementById('btn-prefill-party').addEventListener('click', function () {
      _startQuickMatch(true); // true = show review screen instead of starting battle
    });

    // Party Choice → Back to Title
    document.getElementById('btn-party-choice-back').addEventListener('click', function () {
      if (g.ui) g.ui.showTitleScreen();
    });

    document.getElementById('btn-wizard-next').addEventListener('click', function () {
      if (g.ui) g.ui.wizardNext();
    });

    // Party Review → Recreate
    document.getElementById('btn-review-back').addEventListener('click', function () {
      // Restart wizard at step 0, member 0, preserving existing choices
      if (g.story) {
        g.ui.showCreateScreen();
      } else {
        // For non-story mode, go back to the party choice screen
        g.ui.showPartyChoiceScreen();
      }
    });

    // Party Review → Battle
    document.getElementById('btn-start-battle').addEventListener('click', function () {
      if (!g.partyConfig || !g.partyConfig[0] || !g.partyConfig[0].race || !g.partyConfig[0].classId) {
        return;
      }
      // The confirmation dialog was removed; proceed directly to battle.
      // g.ui.showBattleConfirmScreen(g.stage, g.story);
      startBattle(true);
    });

    document.getElementById('btn-attack').addEventListener('click', function () {
      if (g.combat) g.combat.beginTargeting(null);
    });
    document.getElementById('btn-skill').addEventListener('click', function () {
      if (!g.combat) return;
      var unit = g.combat.currentUnit();
      if (!unit) return;
      g.ui.showSkillMenu(unit, function (skill) {
        g.combat.beginTargeting(skill);
      });
    });
    document.getElementById('btn-wait').addEventListener('click', function () {
      if (g.combat) g.combat.doWait();
    });
    document.getElementById('btn-cancel-action').addEventListener('click', function () {
      if (!g.combat) return;
      g.combat.state = COMBAT_STATE.PLAYER_SELECT;
      g.ui.hideActionMenu();
      g.ui.showMessage('Action cancelled. Select a unit.');
      g.scene.clearHighlights();
    });
    document.getElementById('btn-cancel-skill').addEventListener('click', function () {
      if (!g.combat) return;
      g.ui.hideSkillMenu();
      var unit = g.combat.currentUnit();
      if (unit) g.ui.showActionMenu(unit);
    });
  }

  // ─── Start / restart battle ──────────────────────────────────────────────────

  function startBattle(isNewGame) {
    // Start (or keep running) the memory monitor while a battle is active.
    // The warning fires if used JS heap exceeds 75 % of the heap size limit.
    if (typeof AssetCache !== 'undefined') {
      AssetCache.startMemoryMonitor(function (info) {
        if (g.ui) g.ui.showMemoryWarning(info);
      });
    }

    // Show the loading screen first, then show the battle screen (which contains
    // the canvas). The loading screen will cover the transition.
    // The actual Babylon.js scene setup happens in the callback, ensuring the
    // canvas element is visible and has its final dimensions.
    g.ui.showLoadingScreen('Preparing battle…', function () {
      g.ui.showBattleScreen();
      _setupBattle(isNewGame);
    });
  }

  function _setupBattle(isNewGame) {
    // 1. Tear down any previous scene
    if (g.scene) { g.scene.dispose(); g.scene = null; }

    // 1b. Pick a random weather for this stage and start the game loop.
    g.weather = selectRandomWeather();
    if (typeof gameLoop !== 'undefined') {
      gameLoop.stop();   // clear any leftover callbacks from the previous battle
      gameLoop.start();
    }

    // 2. Create/preserve player character
    if (isNewGame) {
      // Use partyConfig hero slot (index 0) if available
      var heroSlot = g.partyConfig && g.partyConfig[0];
      if (heroSlot && heroSlot.race && heroSlot.classId) {
        g.player = createPartyMember({
          name:         heroSlot.name || 'Hero',
          race:         heroSlot.race,
          classId:      heroSlot.classId,
          backgroundId: heroSlot.backgroundId || null,
          gender:       heroSlot.gender || 'male',
          hairStyle:    heroSlot.hairStyle || 'none',
          hairColor:    heroSlot.hairColor || 'dark',
          colorId:      heroSlot.colorId,
          portrait:     heroSlot.portrait     || null,
          level:        1,
          exp:          0,
          isPlayer:     true
        });
      } else {
        g.player = createPlayerCharacter(g.selectedRace, g.selectedClass);
      }
    } else if (g._pendingSave) {
      // Restore from localStorage save
      var save = g._pendingSave;
      g._pendingSave = null;
      var hero = g.partyConfig && g.partyConfig[0];
      if (hero && hero.race) {
        g.player = createPartyMember({
          name:         hero.name || 'Hero',
          race:         hero.race,
          classId:      hero.classId,
          backgroundId: hero.backgroundId || null,
          gender:       hero.gender || 'male',
          hairStyle:    hero.hairStyle || 'none',
          hairColor:    hero.hairColor || 'dark',
          colorId:      hero.colorId,
          portrait:     hero.portrait     || null,
          level:        hero.level || 1,
          exp:          hero.exp   || 0,
          isPlayer:     true
        });
        var savedHp = hero.hp || g.player.maxHp;
        g.player.hp = Math.min(g.player.maxHp, savedHp + Math.floor(g.player.maxHp * 0.5));
      } else {
        // Legacy save format
        g.player = new Character({
          name:     'Hero',
          raceId:   save.race,
          classId:  save.classId,
          level:    save.level,
          exp:      save.exp,
          isPlayer: true
        });
        g.player.hp = Math.min(g.player.maxHp, save.hp + Math.floor(g.player.maxHp * 0.5));
      }
    } else if (g.player) {
      // Stage transition: restore HP for the new stage (partial heal — 50 % of max)
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + Math.floor(g.player.maxHp * 0.5));
      g.player.startTurn();
      // Sync player's current stats back to partyConfig
      if (g.partyConfig && g.partyConfig[0]) {
        g.partyConfig[0].level = g.player.level;
        g.partyConfig[0].exp   = g.player.exp;
        g.partyConfig[0].hp    = g.player.hp;
      }
    } else {
      g.player = createPlayerCharacter(g.selectedRace, g.selectedClass);
    }

    // 3. Generate stage
    g.grid = generateStage(g.stage);

    // 4. Create allies from partyConfig (slots 1 and 2), falling back to AI presets
    g.allies = [];
    if (g.partyConfig && g.partyConfig.length > 1) {
      for (var a = 1; a < g.partyConfig.length; a++) {
        var m = g.partyConfig[a];
        if (m && m.race && m.classId) {
          var allyLevel = isNewGame ? g.player.level : (m.level || g.player.level);
          var allyChar  = createPartyMember({
            name:         m.name,
            race:         m.race,
            classId:      m.classId,
            backgroundId: m.backgroundId || null,
            gender:       m.gender || 'male',
            hairStyle:    m.hairStyle || 'none',
            hairColor:    m.hairColor || 'dark',
            colorId:      m.colorId,
            portrait:     m.portrait     || null,
            level:        allyLevel,
            exp:          isNewGame ? 0 : (m.exp || 0),
            isAlly:       true
          });
          if (!isNewGame) {
            var aHp = m.hp || allyChar.maxHp;
            allyChar.hp = Math.min(allyChar.maxHp, aHp + Math.floor(allyChar.maxHp * 0.5));
          }
          g.allies.push(allyChar);
        }
      }
    }
    // Pad with AI presets if partyConfig did not fill all ally slots
    var aiIdx = 0;
    while (g.allies.length < 2 && aiIdx < ALLY_PRESETS.length) {
      g.allies.push(createAlly(ALLY_PRESETS[aiIdx], g.player.level));
      aiIdx++;
    }

    // 5. Create enemies from stage-specific composition (scales with stage)
    var enemyTeam  = _getEnemyTeamForStage(g.stage);
    var numEnemies = Math.min(enemyTeam.length, 2 + Math.floor(g.stage / 2));
    g.enemies = [];
    for (var e = 0; e < numEnemies; e++) {
      g.enemies.push(createEnemy(enemyTeam[e % enemyTeam.length], g.stage));
    }

    // 6. Place all units on grid
    var allUnits = [g.player].concat(g.allies).concat(g.enemies);

    var pSpawns = g.grid.playerSpawns.slice();
    var eSpawns = g.grid.enemySpawns.slice();

    [g.player].concat(g.allies).forEach(function (u, i) {
      var sp = pSpawns[i] || { row: i, col: 0 };
      u.gridRow = sp.row;
      u.gridCol = sp.col;
      g.grid.tiles[sp.row][sp.col].unit = u;
    });

    g.enemies.forEach(function (u, i) {
      var sp = eSpawns[i] || { row: g.grid.size - 1 - i, col: g.grid.size - 1 };
      u.gridRow = sp.row;
      u.gridCol = sp.col;
      g.grid.tiles[sp.row][sp.col].unit = u;
    });

    // 7. Init Babylon scene
    g.scene = new GameScene();
    g.scene.init('renderCanvas');
    // Force the Babylon engine to re-read the canvas dimensions now that the
    // battle screen is fully visible (guards against the 0×0 init edge-case).
    if (g.scene.engine) { g.scene.engine.resize(); }
    g.scene.renderGrid(g.grid);
    g.scene.renderUnits(allUnits);
    // Apply weather visuals (particles / fog) to the scene.
    g.scene.setWeather(g.weather.id);

    // 8. Set up click handler
    g.scene.setClickHandler(function (row, col) {
      if (g.combat) g.combat.handleTileClick(row, col);
    });

    // 9. Init combat
    g.combat = new Combat(
      g.grid,
      allUnits,
      g.scene,
      g.ui,
      onVictory,
      onDefeat,
      g.weather
    );

    // 10. Update HUD
    g.ui.setStageNumber(g.stage);
    g.ui.setTurnNumber(1);
    g.ui.showMessage('Battle start! Select a unit to act.');
    g.ui.renderPartyPanel([g.player].concat(g.allies));

    // 11. Show hardware tier badge briefly
    var hwBadge = document.getElementById('hw-tier-badge');
    if (hwBadge && typeof HARDWARE_TIER !== 'undefined') {
      hwBadge.textContent = HARDWARE_TIER === 'high' ? '🖥 GPU: High Quality' : '⚙ CPU: Low Quality';
      hwBadge.style.opacity = '1';
      setTimeout(function () { hwBadge.style.opacity = '0'; }, 3000);
    }

    // 11b. Show weather badge persistently for the whole battle.
    var weatherBadge = document.getElementById('weather-badge');
    if (weatherBadge && g.weather) {
      weatherBadge.textContent = g.weather.emoji + ' ' + g.weather.name;
      weatherBadge.title = g.weather.description;
      weatherBadge.className = 'weather-' + g.weather.id;
    }

    // 12. Start
    g.combat.start();

    // 12b. Attach story battle-event hook (fired at the start of each new round)
    if (g.story) {
      g.combat.onNewRound = function (turnNum) {
        var liveEnemies = g.enemies.filter(function (e) { return e.isAlive(); });
        var lines = g.story.checkBattleEvents(turnNum, liveEnemies);
        if (lines) { g.ui.showBattleEventDialog(lines, null); }
      };
    }

    // 13. Dismiss loading overlay now that the battle is ready
    g.ui.hideLoadingScreen();
  }

  // ─── Select enemy team for a given stage ────────────────────────────────────

  function _getEnemyTeamForStage(stage) {
    for (var i = 0; i < STAGE_ENEMY_CONFIGS.length; i++) {
      var cfg = STAGE_ENEMY_CONFIGS[i];
      if (stage >= cfg.minStage && (cfg.maxStage === null || stage <= cfg.maxStage)) {
        return cfg.team;
      }
    }
    return ENEMY_PRESETS;
  }

  // ─── Shared EXP helper ───────────────────────────────────────────────────────

  /**
   * Grant expGained to the player and a share to surviving allies.
   * Syncs all results back to partyConfig.
   * Returns the level-up stat gains for the hero (or null if no level-up).
   * @param {number} expGained
   * @returns {object|null}
   */
  function distributeExp(expGained) {
    var gains = expGained > 0 ? g.player.gainExp(expGained) : null;

    g.allies.forEach(function (ally, i) {
      if (expGained > 0 && ally.isAlive()) {
        ally.gainExp(Math.floor(expGained * ALLY_EXP_SHARE));
      }
      if (g.partyConfig && g.partyConfig[i + 1]) {
        g.partyConfig[i + 1].level = ally.level;
        g.partyConfig[i + 1].exp   = ally.exp;
        g.partyConfig[i + 1].hp    = ally.hp;
      }
    });

    if (g.partyConfig && g.partyConfig[0]) {
      g.partyConfig[0].level = g.player.level;
      g.partyConfig[0].exp   = g.player.exp;
      g.partyConfig[0].hp    = g.player.hp;
    }

    return gains;
  }

  // ─── Promotion helpers ───────────────────────────────────────────────────────

  /**
   * Build a queue of units that need to choose a class promotion.
   * A unit qualifies when it has just reached the promotion-level threshold
   * while still in a class below the maximum tier.
   */
  function _buildPromotionQueue() {
    var units = [g.player].concat(g.allies);
    var queue = [];
    units.forEach(function (unit) {
      if (!unit || !unit.isAlive()) return;
      var choices = unit.getPromotionChoices();
      if (choices.length > 0) { queue.push({ unit: unit, choices: choices }); }
    });
    return queue;
  }

  /**
   * Walk through a promotion queue, showing the promotion screen for each
   * entry, then call onDone when all are resolved.
   */
  function _processPromotionQueue(queue, onDone) {
    if (!queue || queue.length === 0) { onDone(); return; }
    var entry = queue.shift();
    g.ui.showPromotionScreen(entry.unit, entry.choices, function (chosenClassId) {
      entry.unit.reclass(chosenClassId);
      // Keep partyConfig in sync
      var units = [g.player].concat(g.allies);
      var idx = units.indexOf(entry.unit);
      if (idx >= 0 && g.partyConfig && g.partyConfig[idx]) {
        g.partyConfig[idx].classId = chosenClassId;
      }
      _processPromotionQueue(queue, onDone);
    });
  }

  // ─── Victory ─────────────────────────────────────────────────────────────────

  function onVictory(expGained) {
    // In story mode the StoryManager handles EXP, level-up, and cutscenes
    if (g.story) {
      g.story.onBattleVictory(expGained);
      return;
    }

    // Award gold for clearing the stage
    var goldEarned = _goldRewardForStage(g.stage);
    g.gold += goldEarned;

    var gains = distributeExp(expGained);

    // After EXP and possible level-ups, check whether any unit qualifies for
    // a class promotion (hit level 10 or 25 while in an appropriate tier class).
    var promotionQueue = _buildPromotionQueue();

    var showVictory = function () {
      g.ui.showVictoryScreen(g.stage, expGained, goldEarned, onNextStage, onManageParty, onBackToTitle);
    };

    var afterPromotions = function () {
      showVictory();
    };

    var doPromotions = function () {
      _processPromotionQueue(promotionQueue, afterPromotions);
    };

    if (gains) {
      g.ui.showLevelUpScreen(g.player, gains, doPromotions);
    } else {
      doPromotions();
    }
  }

  function onNextStage() {
    g.stage++;
    saveProgress();
    startBattle(false);
  }

  /**
   * Called from the victory screen "Manage Party" button.
   * Shows the reclass UI then returns to the victory summary.
   */
  function onManageParty() {
    var units = [g.player].concat(g.allies);
    g.ui.showReclassScreen(units, g.gold, function (unitIdx, newClassId) {
      // Deduct gold and apply reclass
      g.gold -= RECLASS_COST;
      if (g.gold < 0) g.gold = 0;
      units[unitIdx].reclass(newClassId);
      if (g.partyConfig && g.partyConfig[unitIdx]) {
        g.partyConfig[unitIdx].classId = newClassId;
      }
    }, function () {
      // After closing reclass, return to the victory screen without re-showing gold/exp
      g.ui.showVictoryScreen(g.stage, null, null, onNextStage, onManageParty, onBackToTitle);
    });
  }

  // ─── Defeat ──────────────────────────────────────────────────────────────────

  function onDefeat() {
    g.ui.showDefeatScreen(onRetry, onBackToTitle);
  }

  function onRetry() {
    // Keep player level/EXP but reset HP and start the same stage again
    g.player.restoreHp();
    startBattle(false);
  }

  // ─── Main menu ────────────────────────────────────────────────────────────────

  function onBackToTitle() {
    if (g.scene) { g.scene.dispose(); g.scene = null; }
    if (typeof gameLoop !== 'undefined') gameLoop.stop();
    g.stage             = 1;
    g.gold              = 0;
    g.player            = null;
    g.partyConfig       = null;
    g.weather           = null;
    g.story             = null;
    g.multiplayerActive = false;
    g.multiplayerIdx    = -1;
    if (typeof Multiplayer !== 'undefined') Multiplayer.disconnect();
    // Stop the memory monitor when the player leaves the battle
    if (typeof AssetCache !== 'undefined') AssetCache.stopMemoryMonitor();
    if (g.ui) g.ui.hideMemoryWarning();
    g.ui.showTitleScreen();
    _updateContinueButton();
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // Returns a randomly selected WEATHER_TYPES entry.
  // Extracted so stage-specific weather probabilities can be added here later.
  function selectRandomWeather() {
    var keys = Object.keys(WEATHER_TYPES);
    return WEATHER_TYPES[keys[Math.floor(Math.random() * keys.length)]];
  }

  // ─── Quick Match ─────────────────────────────────────────────────────────────

  /**
   * Assign a random predefined hero party from QUICK_MATCH_HERO_PARTIES and
   * either start a battle or show the review screen.
   * @param {boolean} [showReview] If true, show the party review screen instead of starting a battle.
   */
  function _startQuickMatch(showReview) {
    var pool  = QUICK_MATCH_HERO_PARTIES;
    var party = pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : null;

    if (party && party.members && party.members.length >= 3) {
      g.partyConfig = party.members.map(function (m, i) {
        return {
          name:         m.name         || (i === 0 ? 'Hero' : 'Ally'),
          race:         m.race         || 'human',
          classId:      m.classId      || 'warrior',
          backgroundId: m.backgroundId || null,
          portrait:     m.portrait     || null,
          colorId:      m.colorId      || 'default',
          level: 1, exp: 0,
          hp: 0   // placeholder — Character constructor sets hp = maxHp on creation
        };
      });
      // First member is the player hero
      g.partyConfig[0].isPlayer = true;
    } else {
      // Fallback: use a minimal preset party
      g.partyConfig = [
        { name: 'Hero',    race: 'human',    classId: 'warrior', backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 },
        { name: 'Ally I',  race: 'elf',      classId: 'mage',    backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 },
        { name: 'Ally II', race: 'beastkin', classId: 'archer',  backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 }
      ];
      g.partyConfig[0].isPlayer = true;
    }

    if (showReview) {
      g.ui.showPartyReviewScreen();
    } else {
      startBattle(true);
    }
  }

  // ─── Multiplayer ─────────────────────────────────────────────────────────────

  /**
   * Build a random Quick-Match party config (3 members, same format as partyConfig).
   * @returns {Array}
   */
  function _buildQuickParty() {
    var pool  = typeof QUICK_MATCH_HERO_PARTIES !== 'undefined' ? QUICK_MATCH_HERO_PARTIES : [];
    var party = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (party && party.members && party.members.length >= 3) {
      return party.members.map(function (m, i) {
        return {
          name:         m.name         || (i === 0 ? 'Hero' : 'Ally ' + i),
          race:         m.race         || 'human',
          classId:      m.classId      || 'warrior',
          backgroundId: m.backgroundId || null,
          colorId:      m.colorId      || 'default',
          level: 1, exp: 0, hp: 0
        };
      });
    }
    return [
      { name: 'Hero',    race: 'human',    classId: 'warrior', backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 },
      { name: 'Ally I',  race: 'elf',      classId: 'mage',    backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 },
      { name: 'Ally II', race: 'beastkin', classId: 'archer',  backgroundId: null, colorId: 'default', level: 1, exp: 0, hp: 0 }
    ];
  }

  /**
   * Serialize a Grid to a plain object for transmission.
   * @param {Grid} grid
   * @returns {object}
   */
  function _serializeGrid(grid) {
    var tiles = [];
    for (var r = 0; r < grid.size; r++) {
      tiles[r] = [];
      for (var c = 0; c < grid.size; c++) {
        tiles[r][c] = grid.tiles[r][c].terrain.name;
      }
    }
    return {
      size:          grid.size,
      tiles:         tiles,
      playerSpawns:  grid.playerSpawns,
      enemySpawns:   grid.enemySpawns,
    };
  }

  /**
   * Reconstruct a Grid from a serialized object.
   * @param {object} data - produced by _serializeGrid()
   * @returns {Grid}
   */
  function _deserializeGrid(data) {
    var grid = new Grid(data.size);
    grid.tiles = [];
    for (var r = 0; r < data.size; r++) {
      grid.tiles[r] = [];
      for (var c = 0; c < data.size; c++) {
        var terrainName = data.tiles[r][c];
        var terrain = TERRAIN[terrainName.toUpperCase()] || TERRAIN.GRASS;
        grid.tiles[r][c] = new Tile(r, c, terrain);
      }
    }
    grid.playerSpawns = data.playerSpawns;
    grid.enemySpawns  = data.enemySpawns;
    return grid;
  }

  /**
   * Wire up the Multiplayer lobby UI buttons and callbacks.
   * Called whenever the lobby screen is shown.
   */
  function _initLobbyUI() {
    var statusEl   = document.getElementById('lobby-status');
    var errorEl    = document.getElementById('lobby-error');
    var panelConn  = document.getElementById('lobby-panel-connect');
    var panelWait  = document.getElementById('lobby-panel-waiting');
    var panelMatch = document.getElementById('lobby-panel-matched');
    var codeInput  = document.getElementById('mp-code-input');
    var codeDisp   = document.getElementById('lobby-code-display');
    var hintEl     = document.getElementById('lobby-matched-hint');

    function showPanel(which) {
      panelConn.classList.add('hidden');
      panelWait.classList.add('hidden');
      panelMatch.classList.add('hidden');
      which.classList.remove('hidden');
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }

    function clearError() {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }

    // Reset to connect panel
    showPanel(panelConn);
    clearError();
    if (statusEl) statusEl.textContent = 'Challenge a friend to a tactical battle!';

    // ── Event callbacks ──────────────────────────────────────────────────────

    Multiplayer.onRoomCreated = function (code) {
      codeDisp.textContent = code;
      showPanel(panelWait);
      if (statusEl) statusEl.textContent = 'Waiting for opponent…';
    };

    Multiplayer.onRoomJoined = function () {
      showPanel(panelWait);
      if (statusEl) statusEl.textContent = 'Joined! Waiting for host to start…';
    };

    Multiplayer.onOpponentJoined = function () {
      // Host: opponent joined → auto-start game
      showPanel(panelMatch);
      if (statusEl) statusEl.textContent = 'Opponent connected!';
      if (hintEl)   hintEl.textContent   = 'Setting up battle…';
      // Give the UI a moment to render, then start
      setTimeout(_hostStartMultiplayer, 600);
    };

    Multiplayer.onGameStart = function (data) {
      // Guest: receive game data from host and start battle
      _guestStartMultiplayer(data);
    };

    Multiplayer.onOpponentLeft = function () {
      if (g.multiplayerActive) {
        g.multiplayerActive = false;
        alert('Your opponent disconnected. Returning to title.');
        onBackToTitle();
      } else {
        showPanel(panelConn);
        showError('Opponent disconnected.');
      }
    };

    Multiplayer.onError = function (msg) {
      showError(msg || 'An error occurred.');
    };

    // ── Button handlers ──────────────────────────────────────────────────────

    var btnCreate = document.getElementById('btn-mp-create');
    var btnJoin   = document.getElementById('btn-mp-join');
    var btnBack   = document.getElementById('btn-lobby-back');

    btnCreate.onclick = function () {
      clearError();
      Multiplayer.connect(function (err) {
        if (err) { showError('Could not connect to server.'); return; }
        Multiplayer.createRoom();
      });
    };

    btnJoin.onclick = function () {
      clearError();
      var code = (codeInput.value || '').trim().toUpperCase();
      if (code.length !== 4) { showError('Enter a 4-character room code.'); return; }
      Multiplayer.connect(function (err) {
        if (err) { showError('Could not connect to server.'); return; }
        Multiplayer.joinRoom(code);
      });
    };

    codeInput.oninput = function () {
      codeInput.value = codeInput.value.toUpperCase();
    };

    btnBack.onclick = function () {
      Multiplayer.disconnect();
      g.ui.showScreen('screen-title');
    };
  }

  /**
   * Host: build both parties, generate grid, and broadcast game_start.
   */
  function _hostStartMultiplayer() {
    var hostParty  = _buildQuickParty();
    var guestParty = _buildQuickParty();
    var rawGrid    = generateStage(1);   // stage 1 for multiplayer
    var gridData   = _serializeGrid(rawGrid);
    var weatherKey = (function () {
      var keys = Object.keys(WEATHER_TYPES);
      return keys[Math.floor(Math.random() * keys.length)];
    }());

    Multiplayer.sendGameStart({
      hostParty:  hostParty,
      guestParty: guestParty,
      gridData:   gridData,
      weatherKey: weatherKey,
    });

    _launchMultiplayerBattle(hostParty, guestParty, rawGrid, weatherKey, 0);
  }

  /**
   * Guest: receive game_start data from host and launch battle.
   * @param {object} data
   */
  function _guestStartMultiplayer(data) {
    var rawGrid = _deserializeGrid(data.gridData);
    _launchMultiplayerBattle(data.hostParty, data.guestParty, rawGrid, data.weatherKey, 1);
  }

  /**
   * Common entry point for both host and guest.
   * @param {Array}  hostParty   3-member party config for the host
   * @param {Array}  guestParty  3-member party config for the guest
   * @param {Grid}   grid        Pre-generated/deserialized grid
   * @param {string} weatherKey  Key into WEATHER_TYPES
   * @param {number} playerIdx   0 = host, 1 = guest
   */
  function _launchMultiplayerBattle(hostParty, guestParty, grid, weatherKey, playerIdx) {
    if (typeof BABYLON === 'undefined') {
      alert('Babylon.js could not be loaded. Please reload.');
      return;
    }

    g.multiplayerActive = true;
    g.multiplayerIdx    = playerIdx;
    g.stage             = 1;
    g.weather           = WEATHER_TYPES[weatherKey] || WEATHER_TYPES.clear;

    // ── Tear down previous scene ──────────────────────────────────────────
    if (g.scene) { g.scene.dispose(); g.scene = null; }
    if (typeof gameLoop !== 'undefined') { gameLoop.stop(); gameLoop.start(); }

    // ── Show battle screen ────────────────────────────────────────────────
    var battleScreenEl = document.getElementById('screen-battle');
    if (battleScreenEl) {
      battleScreenEl.classList.remove('hidden');
      battleScreenEl.classList.add('active');
      battleScreenEl.style.opacity = '0';
    }
    g.ui.showBattleScreen();
    g.ui.showLoadingScreen('Preparing multiplayer battle…');

    setTimeout(function () {
      _setupMultiplayerBattle(hostParty, guestParty, grid, playerIdx);
    }, 80);
  }

  /**
   * Build units, place them, init scene + combat for a multiplayer match.
   */
  function _setupMultiplayerBattle(hostParty, guestParty, grid, playerIdx) {
    g.grid = grid;

    var localParty  = playerIdx === 0 ? hostParty  : guestParty;
    var remoteParty = playerIdx === 0 ? guestParty : hostParty;

    // ── Create local units (player-controlled) ────────────────────────────
    var localUnits = localParty.map(function (m, i) {
      return createPartyMember({
        name:     m.name     || (i === 0 ? 'Hero' : 'Ally ' + i),
        race:     m.race     || 'human',
        classId:  m.classId  || 'warrior',
        colorId:  m.colorId  || 'default',
        gender:   m.gender   || 'male',
        level:    1,
        exp:      0,
        isPlayer: i === 0,
        isAlly:   i > 0,
      });
    });

    // ── Create remote units (opponent-controlled, appear as enemies) ──────
    var remoteUnits = remoteParty.map(function (m) {
      return createPartyMember({
        name:     m.name    || 'Foe',
        race:     m.race    || 'human',
        classId:  m.classId || 'warrior',
        colorId:  m.colorId || 'default',
        gender:   m.gender  || 'male',
        level:    1,
        exp:      0,
        isEnemy:  true,
      });
    });

    // ── Unit ordering: host units first (0-2), guest units last (3-5) ─────
    // The "local player indices" are the same set on both clients; what
    // differs is only the isPlayer/isEnemy flags.
    var hostUnits  = playerIdx === 0 ? localUnits  : remoteUnits;
    var guestUnits = playerIdx === 0 ? remoteUnits : localUnits;
    var allUnits   = hostUnits.concat(guestUnits);

    // Unit slots: indices 0-2 = host team, 3-5 = guest team (constant on both clients).
    var MP_HOST_INDICES  = [0, 1, 2];
    var MP_GUEST_INDICES = [3, 4, 5];
    var localIndices = new Set(playerIdx === 0 ? MP_HOST_INDICES : MP_GUEST_INDICES);

    // Set player/ally references for HUD
    g.player  = allUnits[localIndices.values().next().value];
    g.allies  = Array.from(localIndices).slice(1).map(function (i) { return allUnits[i]; });
    g.enemies = allUnits.filter(function (u) { return u.isEnemy; });

    // ── Place units on grid ───────────────────────────────────────────────
    var pSpawns = grid.playerSpawns.slice();
    var eSpawns = grid.enemySpawns.slice();

    hostUnits.forEach(function (u, i) {
      var sp = pSpawns[i] || { row: i, col: 0 };
      u.gridRow = sp.row; u.gridCol = sp.col;
      grid.tiles[sp.row][sp.col].unit = u;
    });
    guestUnits.forEach(function (u, i) {
      var sp = eSpawns[i] || { row: grid.size - 1 - i, col: grid.size - 1 };
      u.gridRow = sp.row; u.gridCol = sp.col;
      grid.tiles[sp.row][sp.col].unit = u;
    });

    // ── Init scene ────────────────────────────────────────────────────────
    g.scene = new GameScene();
    g.scene.init('renderCanvas');
    if (g.scene.engine) g.scene.engine.resize();
    g.scene.renderGrid(g.grid);
    g.scene.renderUnits(allUnits);
    g.scene.setWeather(g.weather.id);
    g.scene.setClickHandler(function (row, col) {
      if (g.combat) g.combat.handleTileClick(row, col);
    });

    // ── Init combat ───────────────────────────────────────────────────────
    g.combat = new Combat(
      g.grid,
      allUnits,
      g.scene,
      g.ui,
      function () { _onMpVictory(); },
      function () { _onMpDefeat(); },
      g.weather
    );
    g.combat.localPlayerIndices = localIndices;

    // When the local player takes an action, relay it to the opponent.
    g.combat.onActionTaken = function (action) {
      Multiplayer.sendAction(action);
    };

    // When an action arrives from the opponent, apply it.
    Multiplayer.onAction = function (action) {
      if (g.combat) g.combat.receiveRemoteAction(action);
    };

    // ── HUD ───────────────────────────────────────────────────────────────
    g.ui.setStageNumber(1);
    g.ui.setTurnNumber(1);
    g.ui.showMessage('Multiplayer battle start! Select a unit to act.');
    g.ui.renderPartyPanel(localUnits);

    var weatherBadge = document.getElementById('weather-badge');
    if (weatherBadge && g.weather) {
      weatherBadge.textContent = g.weather.emoji + ' ' + g.weather.name;
      weatherBadge.title = g.weather.description;
      weatherBadge.className = 'weather-' + g.weather.id;
    }

    g.combat.start();
    g.ui.hideLoadingScreen();
  }

  function _onMpVictory() {
    g.multiplayerActive = false;
    Multiplayer.sendAction({ kind: 'game_over', result: 'defeat' });
    g.ui.showMessage('You won! 🎉');
    setTimeout(function () { onBackToTitle(); }, 2500);
  }

  function _onMpDefeat() {
    g.multiplayerActive = false;
    Multiplayer.sendAction({ kind: 'game_over', result: 'victory' });
    g.ui.showMessage('You were defeated. Better luck next time!');
    setTimeout(function () { onBackToTitle(); }, 2500);
  }

  // ─── Boot on DOMContentLoaded ────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose functions needed by StoryManager and auth module
  g.startBattle          = startBattle;
  g.onBackToTitle        = onBackToTitle;
  g.saveProgress         = saveProgress;
  g.distributeExp        = distributeExp;
  g.updateContinueButton = _updateContinueButton;

  return g; // expose for debugging

}());
