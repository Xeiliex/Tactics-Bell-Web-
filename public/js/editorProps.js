// ═══════════════════════════════════════════════════════════════════════════════
// PROPS & DECORATION SYSTEM (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════
// Manage props, obstacles, and decoration objects on the battlefield.
// Note: Prop type constants defined in editorConstants.js

function PropManager() {
  this.props = [];
}

/** Add a prop to the battlefield. */
PropManager.prototype.addProp = function(gridRow, gridCol, propTypeId) {
  var propType = null;
  
  // Find the prop type from PROP_TYPES
  for (var key in PROP_TYPES) {
    if (PROP_TYPES[key].id === propTypeId) {
      propType = PROP_TYPES[key];
      break;
    }
  }
  
  if (!propType) {
    console.error('❌ [Props] Unknown prop type:', propTypeId);
    return null;
  }
  
  var prop = {
    id: 'prop_' + Date.now(),
    typeId: propTypeId,
    type: propType,
    gridRow: gridRow,
    gridCol: gridCol,
    rotation: 0
  };
  
  this.props.push(prop);
  console.log('✅ [Props] Added', propType.name, 'at', gridRow, gridCol);
  return prop;
};

/** Delete a prop. */
PropManager.prototype.deleteProp = function(propId) {
  var idx = this.props.findIndex(function(p) { return p.id === propId; });
  if (idx > -1) {
    var removed = this.props.splice(idx, 1)[0];
    console.log('🗑️ [Props] Deleted:', removed.type.name);
    return true;
  }
  return false;
};

/** Move a prop to a new location. */
PropManager.prototype.moveProp = function(propId, newRow, newCol) {
  var prop = this.props.find(function(p) { return p.id === propId; });
  if (!prop) return false;
  
  prop.gridRow = newRow;
  prop.gridCol = newCol;
  console.log('↔️ [Props] Moved', prop.type.name, 'to', newRow, newCol);
  return true;
};

/** Get all blocking props (obstacles). */
PropManager.prototype.getBlockingProps = function() {
  return this.props.filter(function(p) { return p.type.blocking; });
};

/** Check if a grid square is blocked by a prop. */
PropManager.prototype.isBlocked = function(gridRow, gridCol) {
  return this.props.some(function(p) {
    return p.gridRow === gridRow && p.gridCol === gridCol && p.type.blocking;
  });
};

/** Get prop at specific location. */
PropManager.prototype.getPropAt = function(gridRow, gridCol) {
  return this.props.find(function(p) {
    return p.gridRow === gridRow && p.gridCol === gridCol;
  });
};

/** Serialize props to JSON. */
PropManager.prototype.toJSON = function() {
  return this.props.map(function(prop) {
    return {
      id: prop.id,
      typeId: prop.typeId,
      gridRow: prop.gridRow,
      gridCol: prop.gridCol,
      rotation: prop.rotation
    };
  });
};

/** Load props from JSON. */
PropManager.prototype.fromJSON = function(data) {
  this.props = [];
  if (!Array.isArray(data)) return;
  
  var self = this;
  data.forEach(function(propData) {
    var propType = null;
    // Find the prop type from PROP_TYPES
    for (var key in PROP_TYPES) {
      if (PROP_TYPES[key].id === propData.typeId) {
        propType = PROP_TYPES[key];
        break;
      }
    }
    
    if (propType) {
      var prop = {
        id: propData.id,
        typeId: propData.typeId,
        type: propType,
        gridRow: propData.gridRow,
        gridCol: propData.gridCol,
        rotation: propData.rotation || 0
      };
      self.props.push(prop);
    }
  });
};
