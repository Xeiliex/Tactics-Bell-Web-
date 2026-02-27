/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME — main state machine & wiring
// ═══════════════════════════════════════

var game = (function () {

  var g = {
    selectedRace:  null,
    selectedClass: null,
    partyConfig:   null,   // Array of 3 party-member config objects
    stage:         1,
    player:        null,   // Character — the player's hero
    allies:        [],     // Character[] — CPU allies
    enemies:       [],     // Character[] — enemies
    grid:          null,   // Grid
    scene:         null,   // GameScene
    combat:        null,   // Combat
    ui:            null,   // GameUI
    _pendingSave:  null    // Temporary holder for continue-game restore data
  };

  // ─── Local save helpers ──────────────────────────────────────────────────────

  var SAVE_KEY = 'tactics-bell-save';

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
      var data = { stage: g.stage };
      if (g.partyConfig && g.partyConfig.length > 0) {
        data.party = g.partyConfig.map(function (m, i) {
          var unit = i === 0 ? g.player : g.allies[i - 1];
          return {
            name:         m.name,
            race:         m.race,
            classId:      m.classId,
            backgroundId: m.backgroundId || null,
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
      localStorage.setItem(SAVE_KEY, _encodeSave(data));
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
      g.ui.showCreateScreen();
    });

    // Title → Continue
    document.getElementById('btn-continue-game').addEventListener('click', function () {
      var save = loadSave();
      if (!save) return;
      g.stage = save.stage;

      if (save.party && save.party.length > 0) {
        g.partyConfig = save.party.map(function (m) {
          return {
            name:         m.name         || 'Adventurer',
            race:         m.race,
            classId:      m.classId,
            backgroundId: m.backgroundId || null,
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

    document.getElementById('btn-wizard-next').addEventListener('click', function () {
      if (g.ui) g.ui.wizardNext();
    });

    // Party Review → Recreate
    document.getElementById('btn-review-back').addEventListener('click', function () {
      // Restart wizard at step 0, member 0, preserving existing choices
      g.ui.showCreateScreen();
    });

    // Party Review → Battle
    document.getElementById('btn-start-battle').addEventListener('click', function () {
      if (!g.partyConfig || !g.partyConfig[0] || !g.partyConfig[0].race || !g.partyConfig[0].classId) {
        return;
      }
      startBattle(true);
    });

    // Action menu
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
    // Guard: Babylon.js must be available (CDN may be blocked in some environments)
    if (typeof BABYLON === 'undefined') {
      alert('Babylon.js could not be loaded.\nPlease check your internet connection and reload.');
      return;
    }

    // Start (or keep running) the memory monitor while a battle is active.
    // The warning fires if used JS heap exceeds 75 % of the heap size limit.
    if (typeof AssetCache !== 'undefined') {
      AssetCache.startMemoryMonitor(function (info) {
        if (g.ui) g.ui.showMemoryWarning(info);
      });
    }

    // The battle canvas lives inside #screen-battle which starts with
    // display:none.  showScreen() only removes that class after its 200 ms
    // fade-out, so a naive 80 ms setTimeout would let Babylon.js initialise
    // on a 0×0 canvas — producing an invisible viewport.
    // Solution: forcibly reveal the canvas element *now* (before the animated
    // transition) so it has real dimensions when the Engine constructor runs.
    // The loading overlay is drawn on top, hiding the brief visual jump.
    var battleScreenEl = document.getElementById('screen-battle');
    if (battleScreenEl) {
      battleScreenEl.classList.remove('hidden');
      battleScreenEl.classList.add('active');
      battleScreenEl.style.opacity = '0';
    }

    // Now kick off the normal screen transition (fades current screen out,
    // then fades the battle screen in — loading overlay covers the seam).
    g.ui.showBattleScreen();

    // Show loading overlay while the scene initialises
    g.ui.showLoadingScreen('Preparing battle…');

    // Small delay to let the browser flush layout so the canvas reports its
    // real clientWidth/clientHeight before Babylon reads it.
    setTimeout(function () {
      _setupBattle(isNewGame);
    }, 80);
  }

  function _setupBattle(isNewGame) {
    // 1. Tear down any previous scene
    if (g.scene) { g.scene.dispose(); g.scene = null; }

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
      var sp = eSpawns[i] || { row: GRID_SIZE - 1 - i, col: GRID_SIZE - 1 };
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
      onDefeat
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

    // 12. Start
    g.combat.start();

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

  // ─── Victory ─────────────────────────────────────────────────────────────────

  function onVictory(expGained) {
    // gainExp returns the stat-gains object on level-up, or null
    var gains = expGained > 0 ? g.player.gainExp(expGained) : null;

    // Grant surviving allies 75 % of the EXP earned
    g.allies.forEach(function (ally, i) {
      if (expGained > 0 && ally.isAlive()) {
        ally.gainExp(Math.floor(expGained * 0.75));
      }
      // Sync to partyConfig
      if (g.partyConfig && g.partyConfig[i + 1]) {
        g.partyConfig[i + 1].level = ally.level;
        g.partyConfig[i + 1].exp   = ally.exp;
        g.partyConfig[i + 1].hp    = ally.hp;
      }
    });

    // Sync hero to partyConfig
    if (g.partyConfig && g.partyConfig[0]) {
      g.partyConfig[0].level = g.player.level;
      g.partyConfig[0].exp   = g.player.exp;
      g.partyConfig[0].hp    = g.player.hp;
    }

    if (gains) {
      g.ui.showLevelUpScreen(g.player, gains, function () {
        g.ui.showVictoryScreen(g.stage, expGained, onNextStage, onBackToTitle);
      });
    } else {
      g.ui.showVictoryScreen(g.stage, expGained, onNextStage, onBackToTitle);
    }
  }

  function onNextStage() {
    g.stage++;
    saveProgress();
    startBattle(false);
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
    g.stage       = 1;
    g.player      = null;
    g.partyConfig = null;
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

  // ─── Boot on DOMContentLoaded ────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  return g; // expose for debugging

}());
