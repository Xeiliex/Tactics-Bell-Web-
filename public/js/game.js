/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME — main state machine & wiring
// ═══════════════════════════════════════

var game = (function () {

  var g = {
    selectedRace:  null,
    selectedClass: null,
    stage:         1,
    player:        null,   // Character — the player's hero
    allies:        [],     // Character[] — CPU allies
    enemies:       [],     // Character[] — enemies
    grid:          null,   // Grid
    scene:         null,   // GameScene
    combat:        null,   // Combat
    ui:            null    // GameUI
  };

  // ─── Boot ───────────────────────────────────────────────────────────────────

  function init() {
    g.ui = new GameUI(g);
    g.ui.showTitleScreen();

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
      g.stage = 1;
      g.player = null;
      g.selectedRace  = null;
      g.selectedClass = null;
      g.ui.showCreateScreen();
    });

    // Create → Battle
    document.getElementById('btn-start-battle').addEventListener('click', function () {
      if (!g.selectedRace || !g.selectedClass) return;
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

    // Show battle screen first so canvas exists in DOM
    g.ui.showBattleScreen();

    // Small delay to let the DOM update before initialising Babylon
    setTimeout(function () {
      _setupBattle(isNewGame);
    }, 80);
  }

  function _setupBattle(isNewGame) {
    // 1. Tear down any previous scene
    if (g.scene) { g.scene.dispose(); g.scene = null; }

    // 2. Create/preserve player character
    if (isNewGame || !g.player) {
      g.player = createPlayerCharacter(g.selectedRace, g.selectedClass);
    } else {
      // Restore HP for the new stage (partial heal — 50 % of max)
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + Math.floor(g.player.maxHp * 0.5));
      g.player.startTurn();
    }

    // 3. Generate stage
    g.grid = generateStage(g.stage);

    // 4. Create allies
    var numAllies = Math.min(3, ALLY_PRESETS.length);
    g.allies = [];
    for (var a = 0; a < numAllies; a++) {
      var ally = createAlly(ALLY_PRESETS[a], g.player.level);
      g.allies.push(ally);
    }

    // 5. Create enemies (scales with stage)
    var numEnemies = Math.min(3 + Math.floor(g.stage / 2), ENEMY_PRESETS.length);
    g.enemies = [];
    var shuffled = shuffleArray(ENEMY_PRESETS.slice());
    for (var e = 0; e < numEnemies; e++) {
      g.enemies.push(createEnemy(shuffled[e % shuffled.length], g.stage));
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
    g.scene.renderGrid(g.grid);
    allUnits.forEach(function (u) { g.scene.spawnUnit(u); });

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
  }

  // ─── Victory ─────────────────────────────────────────────────────────────────

  function onVictory(expGained) {
    // gainExp returns the stat-gains object on level-up, or null
    var gains = expGained > 0 ? g.player.gainExp(expGained) : null;

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
    g.stage  = 1;
    g.player = null;
    // Stop the memory monitor when the player leaves the battle
    if (typeof AssetCache !== 'undefined') AssetCache.stopMemoryMonitor();
    if (g.ui) g.ui.hideMemoryWarning();
    g.ui.showTitleScreen();
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
