// ═══════════════════════════════════════════════════════════════════════════════
// OBJECTIVES SYSTEM (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════
// Manages scenario objective definitions: win/lose conditions, turn limits, etc.
// Note: Objective type constants defined in editorConstants.js

var OBJECTIVE_CONDITIONS = {
  WIN: 'win',
  LOSE: 'lose',
  OPTIONAL: 'optional'
};

function ObjectiveManager() {
  this.objectives = [];
}

/** Add a new objective to the scenario. */
ObjectiveManager.prototype.addObjective = function(typeId, condition, params) {
  var objType = null;
  
  // Find the objective type from OBJECTIVE_TYPES
  for (var key in OBJECTIVE_TYPES) {
    if (OBJECTIVE_TYPES[key].id === typeId) {
      objType = OBJECTIVE_TYPES[key];
      break;
    }
  }
  
  if (!objType) {
    console.error('❌ [Objectives] Unknown objective type:', typeId);
    return null;
  }
  
  var objective = {
    id: 'obj_' + Date.now(),
    typeId: typeId,
    type: objType,
    condition: condition || OBJECTIVE_CONDITIONS.WIN,
    params: params || {},
    description: objType.description,
    completed: false
  };
  
  this.objectives.push(objective);
  console.log('✅ [Objectives] Added:', objective.type.name);
  return objective;
};

/** Delete an objective. */
ObjectiveManager.prototype.deleteObjective = function(objectiveId) {
  var idx = this.objectives.findIndex(function(o) { return o.id === objectiveId; });
  if (idx > -1) {
    var removed = this.objectives.splice(idx, 1)[0];
    console.log('🗑️ [Objectives] Deleted:', removed.type.name);
    return true;
  }
  return false;
};

/** Update objective parameters. */
ObjectiveManager.prototype.updateObjective = function(objectiveId, params) {
  var obj = this.objectives.find(function(o) { return o.id === objectiveId; });
  if (!obj) return false;
  
  Object.assign(obj.params, params);
  console.log('✏️ [Objectives] Updated:', obj.type.name);
  return true;
};

/** Get objectives as JSON. */
ObjectiveManager.prototype.toJSON = function() {
  return this.objectives.map(function(obj) {
    return {
      id: obj.id,
      typeId: obj.typeId,
      condition: obj.condition,
      params: obj.params
    };
  });
};

/** Load objectives from JSON. */
ObjectiveManager.prototype.fromJSON = function(data) {
  this.objectives = [];
  if (!Array.isArray(data)) return;
  
  var self = this;
  data.forEach(function(objData) {
    if (OBJECTIVE_TYPES[objData.typeId]) {
      var objective = {
        id: objData.id,
        typeId: objData.typeId,
        type: OBJECTIVE_TYPES[objData.typeId],
        condition: objData.condition,
        params: objData.params || {},
        description: OBJECTIVE_TYPES[objData.typeId].description,
        completed: false
      };
      self.objectives.push(objective);
    }
  });
};

/** Check if objectives are valid (e.g., referenced units exist in scenario). */
ObjectiveManager.prototype.validate = function(scenario) {
  var errors = [];
  
  this.objectives.forEach(function(obj) {
    if (obj.typeId === 'defeat_boss' && obj.params.targetUnitId) {
      var unit = scenario.units.find(function(u) { return u.id === obj.params.targetUnitId; });
      if (!unit) {
        errors.push('Objective "' + obj.type.name + '" references deleted unit');
      }
    }
    if (obj.typeId === 'protect_unit' && obj.params.targetUnitId) {
      var unit = scenario.units.find(function(u) { return u.id === obj.params.targetUnitId; });
      if (!unit) {
        errors.push('Objective "' + obj.type.name + '" references deleted unit');
      }
    }
  });
  
  return errors;
};
