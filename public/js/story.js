/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  STORY MODE — chapter data & manager
// ═══════════════════════════════════════
//
// STORY_CHAPTERS defines the narrative of the game.
// Each chapter has:
//   opening     — cutscene lines shown BEFORE the battle
//   closing     — cutscene lines shown AFTER the battle
//   stageId     — which stage enemy config to use (mirrors STAGE_ENEMY_CONFIGS minStage)
//   battleEvents— in-battle dialog triggers fired during combat
//
// A battleEvent trigger can be:
//   { type: 'turn',           turn:      <round number> }
//   { type: 'enemy_low_hp',  threshold: <0-1 fraction> }
//
// StoryManager drives the flow:
//   chapter opening → battle → (optional level-up) → chapter closing → next chapter

var STORY_CHAPTERS = [
  {
    id: 1,
    title: 'Chapter 1: Shadows on the Road',
    stageId: 1,
    opening: [
      { speaker: 'Narrator', text: 'A shadow has fallen over the Bellwood Road. Merchants report missing caravans and bandit sightings along the only path to the capital.' },
      { speaker: 'Hero',     text: 'Our village is cut off. We have to clear the road — every last one of them.' },
      { speaker: 'Ally',     text: 'Stay tight and watch your flanks. Bandits like to attack from cover.' }
    ],
    closing: [
      { speaker: 'Hero',     text: 'The road is clear. That should buy the merchants safe passage.' },
      { speaker: 'Ally',     text: 'I found a cult symbol on one of them. These aren\'t ordinary bandits.' },
      { speaker: 'Narrator', text: 'With the road reclaimed, the party presses deeper into the wilderness — and into danger.' }
    ],
    battleEvents: [
      {
        trigger: { type: 'turn', turn: 3 },
        lines: [
          { speaker: 'Bandit', text: '(whistles sharply) Bring the others! Don\'t let them through!' }
        ]
      }
    ]
  },
  {
    id: 2,
    title: 'Chapter 2: The Goblin Warren',
    stageId: 3,
    opening: [
      { speaker: 'Narrator', text: 'Beyond the road lies the edge of the Greenwood Forest. Goblins, emboldened by the cult\'s promises, have claimed the crossing.' },
      { speaker: 'Hero',     text: 'Goblins with wolves. They\'ve got the high ground too.' },
      { speaker: 'Ally',     text: 'Split their formation first. Goblins panic when their pack breaks.' }
    ],
    closing: [
      { speaker: 'Hero',     text: 'The crossing is ours. Good work holding the line.' },
      { speaker: 'Ally',     text: 'The goblins mentioned a "Great Dark" rising in the east. What are they following?' },
      { speaker: 'Narrator', text: 'Deeper in the forest, a darker force stirs. The cult\'s reach is longer than anyone feared.' }
    ],
    battleEvents: [
      {
        trigger: { type: 'enemy_low_hp', threshold: 0.4 },
        lines: [
          { speaker: 'Goblin', text: 'Fall back! Fall back to the trees! They\'re too strong!' }
        ]
      }
    ]
  },
  {
    id: 3,
    title: 'Chapter 3: Mercenaries at the Gate',
    stageId: 5,
    opening: [
      { speaker: 'Narrator', text: 'The city of Bellmarch stands ahead — but its gate is held by an unknown mercenary company bearing no banner.' },
      { speaker: 'Hero',     text: 'Someone paid them to keep us out. We\'ll have to fight our way through.' },
      { speaker: 'Ally',     text: 'There\'s a Dark Priest among them. Focus them down early — their heals will drag this out.' }
    ],
    closing: [
      { speaker: 'Hero',     text: 'The gate is open. But who hired these mercenaries?' },
      { speaker: 'Ally',     text: 'I found a scroll on the priest. It\'s a cult summons — signed with the Tactics Bell sigil.' },
      { speaker: 'Narrator', text: 'The cult is already inside Bellmarch. The ancient Bell — symbol of peace — has become their target.' }
    ],
    battleEvents: [
      {
        trigger: { type: 'turn', turn: 2 },
        lines: [
          { speaker: 'Dark Knight', text: 'The cult told us you\'d come. We were paid double to make sure you never reach the Bell.' }
        ]
      }
    ]
  },
  {
    id: 4,
    title: 'Chapter 4: The Final Bell',
    stageId: 7,
    opening: [
      { speaker: 'Narrator', text: 'Inside Bellmarch, the Dark Cult prepares a ritual at the ancient Tactics Bell. If the ritual completes, the Bell\'s power will be twisted toward shadow forever.' },
      { speaker: 'Hero',     text: 'We end this today. No retreat, no surrender.' },
      { speaker: 'Ally',     text: 'For everyone who lost someone to these shadows — ring that Bell for them.' }
    ],
    closing: [
      { speaker: 'Hero',     text: 'It\'s over. The cult is broken.' },
      { speaker: 'Ally',     text: 'The Bell is safe. I can hear it... it\'s ringing on its own.' },
      { speaker: 'Narrator', text: 'The Tactics Bell rings out across Bellmarch — a sound not heard in years. Peace returns, carried on the wind. The heroes\' legend has only just begun. 🔔' }
    ],
    battleEvents: [
      {
        trigger: { type: 'enemy_low_hp', threshold: 0.25 },
        lines: [
          { speaker: 'Necromancer', text: 'Impossible! The ritual... the Bell is rejecting us! How are you still standing?!' }
        ]
      }
    ]
  }
];

// ═══════════════════════════════════════
//  STORY MANAGER
// ═══════════════════════════════════════

/**
 * Manages story-mode progression.
 * @param {object} game  – the global `game` object (exposed by game.js)
 */
function StoryManager(game) {
  this.game              = game;
  this._chapterIdx       = 0;
  this._battleEventsUsed = {};  // keyed by "<chapterIdx>_<eventIdx>"
}

/** Begin the story (or resume from a saved chapter index). */
StoryManager.prototype.startStory = function (chapterIdx) {
  this._chapterIdx       = chapterIdx || 0;
  this._battleEventsUsed = {};
  this._playOpeningCutscene();
};

StoryManager.prototype._currentChapter = function () {
  return STORY_CHAPTERS[this._chapterIdx] || null;
};

StoryManager.prototype._playOpeningCutscene = function () {
  var chapter = this._currentChapter();
  if (!chapter) { return; }
  var self = this;
  this.game.ui.playCutscene(chapter.title, chapter.opening, function () {
    // isNewGame=true only for the very first chapter; later chapters carry over levels
    self.game.startBattle(self._chapterIdx === 0);
  });
};

/**
 * Called instead of the regular onVictory when story mode is active.
 * Grants EXP, shows level-up if needed, plays closing cutscene,
 * then either advances to the next chapter or ends the story.
 * @param {number} expGained
 */
StoryManager.prototype.onBattleVictory = function (expGained) {
  var self    = this;
  var game    = this.game;
  var chapter = this._currentChapter();

  // ── Grant EXP (via shared helper on the game object) ─────────────────────
  var gains = game.distributeExp(expGained);

  // ── Level-up → closing cutscene → next chapter ────────────────────────────
  var doLevelUp = function (callback) {
    if (gains) {
      game.ui.showLevelUpScreen(game.player, gains, callback);
    } else {
      callback();
    }
  };

  var doClosingCutscene = function (callback) {
    if (chapter && chapter.closing && chapter.closing.length > 0) {
      game.ui.playCutscene('', chapter.closing, callback);
    } else {
      callback();
    }
  };

  doLevelUp(function () {
    doClosingCutscene(function () {
      self._chapterIdx++;
      var nextChapter = STORY_CHAPTERS[self._chapterIdx];

      if (nextChapter) {
        // Advance stage and play the next opening cutscene
        game.stage++;
        self._battleEventsUsed = {};
        game.ui.playCutscene(nextChapter.title, nextChapter.opening, function () {
          game.startBattle(false);
        });
      } else {
        // Story complete — show a final victory screen then return to title
        game.ui.showVictoryScreen(game.stage, expGained, function () {
          game.story = null;
          game.onBackToTitle();
        }, function () {
          game.story = null;
          game.onBackToTitle();
        });
      }
    });
  });
};

/**
 * Called at the start of each new combat round.
 * Returns an array of dialog lines if a battle event fires, otherwise null.
 *
 * @param {number}      turnNumber  – current round number
 * @param {Character[]} enemies     – live enemy units
 * @returns {Array|null}
 */
StoryManager.prototype.checkBattleEvents = function (turnNumber, enemies) {
  var chapter = this._currentChapter();
  if (!chapter || !chapter.battleEvents) { return null; }

  for (var i = 0; i < chapter.battleEvents.length; i++) {
    var ev  = chapter.battleEvents[i];
    var key = this._chapterIdx + '_' + i;
    if (this._battleEventsUsed[key]) { continue; }

    var triggered = false;
    if (ev.trigger.type === 'turn' && turnNumber === ev.trigger.turn) {
      triggered = true;
    } else if (ev.trigger.type === 'enemy_low_hp') {
      var threshold = ev.trigger.threshold || 0.3;
      triggered = enemies.some(function (u) {
        return u.isAlive() && u.hpRatio() <= threshold;
      });
    }

    if (triggered) {
      this._battleEventsUsed[key] = true;
      return ev.lines;
    }
  }
  return null;
};
