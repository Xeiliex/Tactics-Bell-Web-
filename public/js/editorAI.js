// ═══════════════════════════════════════════════════════════════════════════════
// AI CONFIGURATION SYSTEM (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════
// Configure enemy unit AI behaviors (patrol, defend, aggressive, etc.)
// Note: AI behavior and difficulty constants defined in editorConstants.js

function AIManager() {
  this.behaviors = {}; // Map of unitId -> AIConfig
}

/** Assign AI behavior to a unit. */
AIManager.prototype.assignBehavior = function(unitId, behaviorId, params) {
  var behaviorDef = null;
  
  // Find the behavior from AI_BEHAVIORS
  for (var key in AI_BEHAVIORS) {
    if (AI_BEHAVIORS[key].id === behaviorId) {
      behaviorDef = AI_BEHAVIORS[key];
      break;
    }
  }
  
  if (!behaviorDef) {
    console.error('❌ [AI] Unknown behavior:', behaviorId);
    return null;
  }
  
  var difficultyDef = null;
  for (var key in AI_DIFFICULTIES) {
    if (AI_DIFFICULTIES[key].id === 'normal') {
      difficultyDef = AI_DIFFICULTIES[key];
      break;
    }
  }
  
  var config = {
    unitId: unitId,
    behaviorId: behaviorId,
    behavior: behaviorDef,
    params: Object.assign({}, behaviorDef.params, params || {}),
    difficulty: difficultyDef,
    enabled: true
  };
  
  this.behaviors[unitId] = config;
  console.log('🤖 [AI] Assigned', behaviorDef.name, 'to unit', unitId);
  return config;
};

/** Update AI behavior params. */
AIManager.prototype.updateBehavior = function(unitId, behaviorId, params) {
  var behaviorDef = null;
  
  // Find the behavior from AI_BEHAVIORS
  for (var key in AI_BEHAVIORS) {
    if (AI_BEHAVIORS[key].id === behaviorId) {
      behaviorDef = AI_BEHAVIORS[key];
      break;
    }
  }
  
  if (!behaviorDef) {
    console.error('❌ [AI] Unknown behavior:', behaviorId);
    return false;
  }
  
  var config = this.behaviors[unitId];
  if (!config) {
    return this.assignBehavior(unitId, behaviorId, params);
  }
  
  config.behaviorId = behaviorId;
  config.behavior = behaviorDef;
  config.params = Object.assign({}, behaviorDef.params, params || {});
  
  console.log('✏️ [AI] Updated', config.behavior.name, 'for unit', unitId);
  return true;
};

/** Set AI difficulty level. */
AIManager.prototype.setDifficulty = function(unitId, difficultyId) {
  var difficultyDef = null;
  
  // Find the difficulty from AI_DIFFICULTIES
  for (var key in AI_DIFFICULTIES) {
    if (AI_DIFFICULTIES[key].id === difficultyId) {
      difficultyDef = AI_DIFFICULTIES[key];
      break;
    }
  }
  
  if (!difficultyDef) {
    console.error('❌ [AI] Unknown difficulty:', difficultyId);
    return false;
  }
  
  var config = this.behaviors[unitId];
  if (!config) {
    this.assignBehavior(unitId, 'aggressive', {});
    config = this.behaviors[unitId];
  }
  
  config.difficulty = difficultyDef;
  console.log('⚔️ [AI] Set difficulty to', difficultyId, 'for unit', unitId);
  return true;
};

/** Get behavior for a unit. */
AIManager.prototype.getBehavior = function(unitId) {
  return this.behaviors[unitId] || null;
};

/** Remove AI from a unit. */
AIManager.prototype.removeBehavior = function(unitId) {
  if (this.behaviors[unitId]) {
    delete this.behaviors[unitId];
    console.log('🚫 [AI] Removed AI from unit', unitId);
    return true;
  }
  return false;
};

/** Serialize AI configs to JSON. */
AIManager.prototype.toJSON = function() {
  var result = {};
  Object.keys(this.behaviors).forEach(function(unitId) {
    var config = this.behaviors[unitId];
    result[unitId] = {
      unitId: unitId,
      behaviorId: config.behaviorId,
      params: config.params,
      difficultyId: config.difficulty.id,
      enabled: config.enabled
    };
  }, this);
  return result;
};

/** Load AI configs from JSON. */
AIManager.prototype.fromJSON = function(data) {
  this.behaviors = {};
  if (!data || typeof data !== 'object') return;
  
  var self = this;
  Object.keys(data).forEach(function(unitId) {
    var cfgData = data[unitId];
    
    // Find the behavior
    var behaviorDef = null;
    for (var key in AI_BEHAVIORS) {
      if (AI_BEHAVIORS[key].id === cfgData.behaviorId) {
        behaviorDef = AI_BEHAVIORS[key];
        break;
      }
    }
    
    if (behaviorDef) {
      self.updateBehavior(unitId, cfgData.behaviorId, cfgData.params);
      if (cfgData.difficultyId) {
        self.setDifficulty(unitId, cfgData.difficultyId);
      }
    }
  });
};

/** Check if unit has AI configured. */
AIManager.prototype.hasAI = function(unitId) {
  return !!this.behaviors[unitId];
};
