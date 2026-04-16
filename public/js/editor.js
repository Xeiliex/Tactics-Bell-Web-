// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO EDITOR
// ═══════════════════════════════════════════════════════════════════════════════
// Grid-based scenario builder with terrain painting, unit placement, and config.

function ScenarioEditor() {
  this.scene = null;
  this.engine = null;
  this.camera = null;
  this.grid = null;
  
  this._scenario = null;        // Current scenario being edited
  this._selectedTile = null;    // Currently selected grid tile
  this._selectedUnit = null;    // Currently selected unit
  this._selectedProp = null;    // Currently selected prop
  this._paintMode = 'none';     // none | terrain | units | props
  this._currentTerrain = 'grass'; // Active terrain type when painting
  this._currentTeam = 1;        // Team for new units
  this._currentClass = 'warrior'; // Class for new units
  this._currentGender = 'male'; // Gender for new units
  this._currentProp = 'barrel';  // Current prop type for placement
  
  // Phase 2 Systems
  this._objectiveManager = new ObjectiveManager();
  this._propManager = new PropManager();
  this._aiManager = new AIManager();
  this._campaignManager = new CampaignManager();
  
  // UI references
  this._terrainBrushEl = null;
  this._unitConfigEl = null;
  this._panelStatusEl = null;
}

/** Initialize the 3D scene and editor. */
ScenarioEditor.prototype.init = function(canvasId) {
  if (typeof BABYLON === 'undefined') return false;
  
  var canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error('❌ [EDITOR] Canvas not found:', canvasId);
    return false;
  }
  
  console.log('🎮 [EDITOR] Canvas found, size:', canvas.width, 'x', canvas.height);
  
  this.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true }, true);
  this.scene = new BABYLON.Scene(this.engine);
  this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.14, 1);
  
  console.log('✅ [EDITOR] Engine and scene created');
  
  // Camera
  this.camera = new BABYLON.ArcRotateCamera(
    'editorCam', -Math.PI / 2, Math.PI / 2.8, GRID_SIZE * 1.8,
    new BABYLON.Vector3(0, 0, 0), this.scene
  );
  this.camera.lowerBetaLimit = 0.2;
  this.camera.upperBetaLimit = Math.PI / 2.1;
  this.camera.lowerRadiusLimit = 8;
  this.camera.upperRadiusLimit = GRID_SIZE * 3;
  this.camera.attachControl(canvas, true);
  
  console.log('✅ [EDITOR] Camera created and attached');
  
  // Lights
  var dirLight = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.5, -1, -0.5), this.scene);
  dirLight.intensity = 1.2;
  dirLight.diffuse = new BABYLON.Color3(1, 1, 1);
  dirLight.position = new BABYLON.Vector3(15, 20, 15);
  dirLight.shadowMinZ = 0;
  dirLight.shadowMaxZ = 50;
  
  var hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
  hemi.intensity = 0.6;
  hemi.diffuse = new BABYLON.Color3(0.7, 0.7, 1.0);
  hemi.groundColor = new BABYLON.Color3(0.2, 0.2, 0.2);
  
  // Render loop
  var self = this;
  this.engine.runRenderLoop(function() {
    if (self.scene) self.scene.render();
  });
  
  window.addEventListener('resize', function() { self.engine.resize(); });
  
  // Create new blank scenario
  this._scenario = this._createBlankScenario();
  
  // Set up click picking for grid interaction
  this._setupGridInteraction();
  
  return true;
};

/** Create a blank scenario with a default grid. */
ScenarioEditor.prototype._createBlankScenario = function() {
  return {
    width: GRID_SIZE,
    height: GRID_SIZE,
    name: 'New Scenario',
    terrain: this._initTerrainGrid(),
    units: [],
    objectives: [],
    props: [],
    aiConfigs: {},
    campaign: null
  };
};

/** Initialize a blank terrain grid (all grass). */
ScenarioEditor.prototype._initTerrainGrid = function() {
  var terrain = [];
  for (var r = 0; r < GRID_SIZE; r++) {
    terrain[r] = [];
    for (var c = 0; c < GRID_SIZE; c++) {
      terrain[r][c] = 'grass';
    }
  }
  return terrain;
};

/** Render the scenario grid and units. */
ScenarioEditor.prototype.render = function() {
  if (!this.scene) return;
  
  console.log('📐 [EDITOR] Starting render...');
  
  // Clear old geometry (keep camera and lights)
  var meshesToRemove = this.scene.meshes.filter(function(m) {
    return m.name !== 'camera' && !m.name.includes('Light');
  });
  
  console.log('🗑️ [EDITOR] Removing', meshesToRemove.length, 'old meshes');
  
  meshesToRemove.forEach(function(m) {
    try { m.dispose(); } catch (e) {}
  });
  
  // Create grid
  this._renderTerrainGrid();
  this._renderUnits();
  this._renderProps();
  
  console.log('✅ [EDITOR] Render complete, total meshes:', this.scene.meshes.length);
};

/** Render terrain tiles. */
ScenarioEditor.prototype._renderTerrainGrid = function() {
  if (!this._scenario) return;
  
  var self = this;
  var terrain = this._scenario.terrain;
  var tileSize = 1;
  var centerOffset = GRID_SIZE / 2;
  
  console.log('🎨 [EDITOR] Rendering terrain grid:', terrain.length, 'x', terrain[0].length);
  
  for (var r = 0; r < terrain.length; r++) {
    for (var c = 0; c < terrain[r].length; c++) {
      var terrainType = terrain[r][c];
      
      // Create plane tile (1x1 unit)
      var tile = BABYLON.MeshBuilder.CreateGround(
        'tile_' + r + '_' + c,
        { width: tileSize, height: tileSize, subdivisions: 2 },
        self.scene
      );
      
      // Position in grid
      var worldPos = self._gridToWorld(r, c);
      tile.position = new BABYLON.Vector3(worldPos.x, 0, worldPos.z);
      
      // Create material with terrain color
      var color = self._getTerrainColor(terrainType);
      var mat = new BABYLON.StandardMaterial('tileMat_' + r + '_' + c, self.scene);
      mat.diffuse = color;
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      mat.wireframe = false;
      tile.material = mat;
      
      // Enable picking
      tile.isPickable = true;
      tile.metadata = { 
        row: r, 
        col: c, 
        terrainType: terrainType,
        type: 'terrain'
      };
      
      if (r === 0 && c === 0) {
        console.log('✅ [EDITOR] First tile created with metadata:', tile.metadata, 'pickable:', tile.isPickable);
      }
    }
  }
  
  // Draw grid lines
  this._renderGridLines();
};

/** Get terrain color. */
ScenarioEditor.prototype._getTerrainColor = function(terrainType) {
  switch(terrainType) {
    case 'grass': return new BABYLON.Color3(0.3, 0.7, 0.3);
    case 'water': return new BABYLON.Color3(0.2, 0.4, 0.9);
    case 'mountain': return new BABYLON.Color3(0.6, 0.5, 0.4);
    case 'forest': return new BABYLON.Color3(0.15, 0.45, 0.15);
    case 'lava': return new BABYLON.Color3(1, 0.4, 0.1);
    default: return new BABYLON.Color3(0.5, 0.5, 0.5);
  }
};

/** Render grid lines for visual reference. */
ScenarioEditor.prototype._renderGridLines = function() {
  var self = this;
  var size = GRID_SIZE;
  var centerOffset = size / 2;
  
  console.log('📏 [EDITOR] Creating grid lines for', size, 'x', size, 'grid');
  
  var lineCount = 0;
  var gridMat = this._getGridMaterial('#666666');
  
  // Draw horizontal and vertical lines
  for (var i = 0; i <= size; i++) {
    // Horizontal line
    var hStart = new BABYLON.Vector3(-centerOffset, 0.02, -centerOffset + i);
    var hEnd = new BABYLON.Vector3(size - centerOffset, 0.02, -centerOffset + i);
    var hLine = BABYLON.MeshBuilder.CreateTube('gridH_' + i, {
      path: [hStart, hEnd],
      radius: 0.08,
      updatable: false
    }, this.scene);
    hLine.material = gridMat;
    lineCount++;
    
    // Vertical line
    var vStart = new BABYLON.Vector3(-centerOffset + i, 0.02, -centerOffset);
    var vEnd = new BABYLON.Vector3(-centerOffset + i, 0.02, size - centerOffset);
    var vLine = BABYLON.MeshBuilder.CreateTube('gridV_' + i, {
      path: [vStart, vEnd],
      radius: 0.08,
      updatable: false
    }, this.scene);
    vLine.material = gridMat;
    lineCount++;
  }
  
  console.log('✅ [EDITOR] Grid lines created:', lineCount);
};

/** Get grid line material. */
ScenarioEditor.prototype._getGridMaterial = function(hexColor) {
  var mat = new BABYLON.StandardMaterial('gridMat_' + Math.random(), this.scene);
  var rgb = parseInt(hexColor.slice(1), 16);
  mat.emissiveColor = new BABYLON.Color3(
    ((rgb >> 16) & 255) / 255,
    ((rgb >> 8) & 255) / 255,
    (rgb & 255) / 255
  );
  return mat;
};

/** Create a single terrain tile mesh. */
ScenarioEditor.prototype._createTerrainTile = function(row, col, terrainType, size) {
  // This method is now handled by _renderTerrainGrid
  // Kept for backwards compatibility
};

/** Render unit stand-ins on the grid. */
ScenarioEditor.prototype._renderUnits = function() {
  if (!this._scenario || !this._scenario.units) return;
  
  var self = this;
  this._scenario.units.forEach(function(unit, idx) {
    var pos = self._gridToWorld(unit.gridRow, unit.gridCol);
    
    // Create a cylinder with team color
    var cylinder = BABYLON.MeshBuilder.CreateCylinder('unit_' + idx, {
      height: 0.8, diameter: 0.5, tessellation: 12
    }, self.scene);
    cylinder.position = new BABYLON.Vector3(pos.x, 0.4, pos.z);
    
    // Team color
    var teamColor;
    switch(unit.team) {
      case 1: teamColor = new BABYLON.Color3(0.2, 0.8, 0.2); break; // Green
      case 2: teamColor = new BABYLON.Color3(1, 0.2, 0.2); break;   // Red
      default: teamColor = new BABYLON.Color3(0.2, 0.2, 0.8);       // Blue
    }
    
    var mat = new BABYLON.StandardMaterial('unitMat_' + idx, self.scene);
    mat.diffuse = teamColor;
    mat.specularColor = new BABYLON.Color3(1, 1, 1);
    cylinder.material = mat;
    cylinder.metadata = { unitIdx: idx, unitId: unit.id };
    cylinder.isPickable = true;
  });
};

/** Render prop stand-ins on the grid. */
ScenarioEditor.prototype._renderProps = function() {
  if (!this._scenario || !this._scenario.props) return;
  
  var self = this;
  this._scenario.props.forEach(function(prop, idx) {
    var pos = self._gridToWorld(prop.gridRow, prop.gridCol);
    
    // Create a simple cube for props
    var box = BABYLON.MeshBuilder.CreateBox('prop_' + idx, {
      size: 0.6, height: 0.8
    }, self.scene);
    box.position = new BABYLON.Vector3(pos.x, 0.4, pos.z);
    
    // Prop color (brownish)
    var mat = new BABYLON.StandardMaterial('propMat_' + idx, self.scene);
    mat.diffuse = new BABYLON.Color3(0.6, 0.45, 0.27);
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    box.material = mat;
    box.metadata = { propIdx: idx, propId: prop.id };
    box.isPickable = true;
  });
};

/** Convert grid coordinates to world coordinates. */
ScenarioEditor.prototype._gridToWorld = function(row, col) {
  var centerOffset = GRID_SIZE / 2;
  return {
    x: col - centerOffset + 0.5,
    z: row - centerOffset + 0.5
  };
};

/** Set up mouse picking for grid and unit interaction. */
ScenarioEditor.prototype._setupGridInteraction = function() {
  var self = this;
  
  console.log('🖱️ [EDITOR] Setting up click/pointer interaction');
  
  this.scene.onPointerObservable.add(function(pointerInfo) {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
    
    console.log('🖱️ [EDITOR] Pointer down at:', self.scene.pointerX, self.scene.pointerY);
    
    var pickResult = self.scene.pick(
      self.scene.pointerX,
      self.scene.pointerY,
      function(mesh) { return mesh.isPickable; }
    );
    
    console.log('🎯 [EDITOR] Pick result:', pickResult ? (pickResult.hit ? 'HIT' : 'MISS') : 'NULL');
    
    if (!pickResult || !pickResult.hit) {
      console.log('⚠️ [EDITOR] No hit detected');
      return;
    }
    
    var mesh = pickResult.pickedMesh;
    console.log('🎯 [EDITOR] Hit mesh:', mesh ? mesh.name : 'NULL', 'metadata:', mesh ? mesh.metadata : 'NULL');
    
    if (!mesh || !mesh.metadata) {
      console.log('⚠️ [EDITOR] No mesh or metadata');
      return;
    }
    
    if (mesh.metadata.type === 'terrain') {
      // Terrain tile clicked
      console.log('✅ [EDITOR] Terrain tile clicked at row:', mesh.metadata.row, 'col:', mesh.metadata.col);
      self._onTerrainTileClick(mesh.metadata.row, mesh.metadata.col);
    } else if (mesh.metadata.type === 'unit') {
      // Unit clicked
      self._onUnitClick(mesh.metadata.unitIdx);
    } else if (mesh.metadata.type === 'prop') {
      // Prop clicked
      self._onPropClick(mesh.metadata.propIdx);
    }
  });
};

/** Handle terrain tile click. */
ScenarioEditor.prototype._onTerrainTileClick = function(row, col) {
  console.log('📍 [EDITOR] Terrain clicked:', row, col);
  this._selectedTile = { row: row, col: col };
  this._selectedUnit = null;
  this._selectedProp = null;
  
  if (this._paintMode === 'terrain') {
    // Paint terrain
    this._scenario.terrain[row][col] = this._currentTerrain;
    console.log('🎨 [EDITOR] Painted', this._currentTerrain, 'at', row, col);
    this.render();
  } else if (this._paintMode === 'units') {
    // Place unit
    this._placeUnitAt(row, col);
  } else if (this._paintMode === 'props') {
    // Place prop
    this._placePropAt(row, col);
  }
};

/** Handle unit click. */
ScenarioEditor.prototype._onUnitClick = function(unitIdx) {
  console.log('👤 [EDITOR] Unit clicked:', unitIdx);
  this._selectedUnit = this._scenario.units[unitIdx];
  this._selectedTile = null;
  this._selectedProp = null;
  this._updateUnitConfigPanel();
};

/** Place a new prop at grid position. */
ScenarioEditor.prototype._placePropAt = function(row, col) {
  var prop = this._propManager.addProp(row, col, this._currentProp);
  this._scenario.props.push(prop);
  console.log('✅ [EDITOR] Placed prop:', PROP_TYPES[this._currentProp].name);
  this.render();
};

/** Handle prop click. */
ScenarioEditor.prototype._onPropClick = function(propIdx) {
  console.log('📦 [EDITOR] Prop clicked:', propIdx);
  this._selectedProp = this._scenario.props[propIdx];
  this._selectedTile = null;
  this._selectedUnit = null;
  this._updatePropConfigPanel();
};

/** Place a new unit at grid position. */
ScenarioEditor.prototype._placeUnitAt = function(row, col) {
  var unit = {
    id: 'unit_' + Date.now(),
    gridRow: row,
    gridCol: col,
    classId: this._currentClass,
    gender: this._currentGender,
    team: this._currentTeam,
    race: 'human',
    backgroundId: 'soldier',
    colorId: 'default'
  };
  
  this._scenario.units.push(unit);
  console.log('✅ [EDITOR] Placed unit:', unit);
  this.render();
};

/** Update the unit configuration panel with selected unit info. */
ScenarioEditor.prototype._updateUnitConfigPanel = function() {
  if (!this._selectedUnit || !this._unitConfigEl) return;
  
  var unit = this._selectedUnit;
  
  // Build HTML for unit config
  var html = '<h4>Unit Configuration</h4>' +
    '<p>ID: ' + unit.id + '</p>' +
    '<label>Class: <select id="editor-unit-class">' +
      '<option value="warrior" ' + (unit.classId === 'warrior' ? 'selected' : '') + '>Warrior</option>' +
      '<option value="mage" ' + (unit.classId === 'mage' ? 'selected' : '') + '>Mage</option>' +
      '<option value="archer" ' + (unit.classId === 'archer' ? 'selected' : '') + '>Archer</option>' +
      '<option value="healer" ' + (unit.classId === 'healer' ? 'selected' : '') + '>Healer</option>' +
    '</select></label>' +
    '<label>Gender: <select id="editor-unit-gender">' +
      '<option value="male" ' + (unit.gender === 'male' ? 'selected' : '') + '>Male</option>' +
      '<option value="female" ' + (unit.gender === 'female' ? 'selected' : '') + '>Female</option>' +
    '</select></label>' +
    '<label>Team: <select id="editor-unit-team">' +
      '<option value="1" ' + (unit.team === 1 ? 'selected' : '') + '>Team 1 (Player)</option>' +
      '<option value="2" ' + (unit.team === 2 ? 'selected' : '') + '>Team 2 (Enemy)</option>' +
      '<option value="3" ' + (unit.team === 3 ? 'selected' : '') + '>Team 3</option>' +
    '</select></label>' +
    '<button id="editor-delete-unit">🗑️ Delete Unit</button>';
  
  this._unitConfigEl.innerHTML = html;
  
  // Attach event handlers
  var self = this;
  
  document.getElementById('editor-unit-class').addEventListener('change', function(e) {
    unit.classId = e.target.value;
    self.render();
  });
  
  document.getElementById('editor-unit-gender').addEventListener('change', function(e) {
    unit.gender = e.target.value;
    self.render();
  });
  
  document.getElementById('editor-unit-team').addEventListener('change', function(e) {
    unit.team = parseInt(e.target.value);
    self.render();
  });
  
  document.getElementById('editor-delete-unit').addEventListener('click', function() {
    var idx = self._scenario.units.indexOf(unit);
    if (idx > -1) {
      self._scenario.units.splice(idx, 1);
      console.log('🗑️ [EDITOR] Deleted unit');
      self._selectedUnit = null;
      self.render();
      self._unitConfigEl.innerHTML = '';
    }
  });
};

/** Update the prop configuration panel with selected prop info. */
ScenarioEditor.prototype._updatePropConfigPanel = function() {
  if (!this._selectedProp) return;
  // Will be implemented in editorManager
};

/** Set the paint mode. */
ScenarioEditor.prototype.setPaintMode = function(mode) {
  this._paintMode = mode;
  console.log('🎨 [EDITOR] Paint mode:', mode);
};

/** Set the current terrain type for painting. */
ScenarioEditor.prototype.setTerrainType = function(terrainType) {
  this._currentTerrain = terrainType;
  console.log('🎨 [EDITOR] Terrain type:', terrainType);
};

/** Set the current unit class for placement. */
ScenarioEditor.prototype.setUnitClass = function(classId) {
  this._currentClass = classId;
  console.log('👤 [EDITOR] Unit class:', classId);
};

/** Set the current unit team for placement. */
ScenarioEditor.prototype.setUnitTeam = function(teamId) {
  this._currentTeam = parseInt(teamId);
  console.log('👤 [EDITOR] Unit team:', teamId);
};

/** Set the current prop type for placement. */
ScenarioEditor.prototype.setPropType = function(propTypeId) {
  this._currentProp = propTypeId;
  console.log('📦 [EDITOR] Prop type:', propTypeId);
};

/** Save scenario to localStorage. */
ScenarioEditor.prototype.saveScenario = function(name) {
  if (!this._scenario) return;
  
  this._scenario.name = name || 'Scenario_' + Date.now();
  this._scenario.objectives = this._objectiveManager.toJSON();
  this._scenario.props = this._propManager.toJSON();
  this._scenario.aiConfigs = this._aiManager.toJSON();
  this._scenario.campaign = this._campaignManager.getCampaign()
    ? this._campaignManager.getCampaign().toJSON()
    : null;
  
  var json = JSON.stringify(this._scenario);
  localStorage.setItem('scenario_' + this._scenario.name, json);
  
  console.log('💾 [EDITOR] Saved scenario:', this._scenario.name);
  return this._scenario.name;
};

/** Load scenario from localStorage. */
ScenarioEditor.prototype.loadScenario = function(name) {
  var json = localStorage.getItem('scenario_' + name);
  if (!json) {
    console.error('❌ [EDITOR] Scenario not found:', name);
    return null;
  }
  
  this._scenario = JSON.parse(json);
  
  // Load Phase 2 data
  this._objectiveManager.fromJSON(this._scenario.objectives || []);
  this._propManager.fromJSON(this._scenario.props || []);
  this._aiManager.fromJSON(this._scenario.aiConfigs || {});
  if (this._scenario.campaign) {
    this._campaignManager.loadCampaign(CampaignSequence.fromJSON(this._scenario.campaign));
  } else {
    this._campaignManager.currentCampaign = null;
  }
  
  console.log('📂 [EDITOR] Loaded scenario:', name);
  this.render();
  return this._scenario;
};

/** Get scenario as JSON. */
ScenarioEditor.prototype.getScenarioJSON = function() {
  if (!this._scenario) return '{}';
  this._scenario.objectives = this._objectiveManager.toJSON();
  this._scenario.props = this._propManager.toJSON();
  this._scenario.aiConfigs = this._aiManager.toJSON();
  this._scenario.campaign = this._campaignManager.getCampaign()
    ? this._campaignManager.getCampaign().toJSON()
    : null;
  return JSON.stringify(this._scenario, null, 2);
};

/** Start playing the current scenario. */
ScenarioEditor.prototype.playScenario = function() {
  if (!this._scenario) {
    console.error('❌ [EDITOR] No scenario to play');
    return;
  }
  
  console.log('▶️ [EDITOR] Starting scenario playback...');
  // This will be handled by the game controller
  return this._scenario;
};
