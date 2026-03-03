/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME SCENE — Babylon.js + Oimo.js
// ═══════════════════════════════════════

var TILE_STEP = 1.15;   // world-space units per grid cell

// ─── Graphics quality setting ─────────────────────────────────────────────────
// 'high' (default): load OBJ models for characters and terrain.
// 'low': skip OBJ loading and use procedural fallback meshes only.
// Initialised from the hardware-tier detection; can be overridden by the user
// via the title-screen toggle (stored in localStorage as 'tactics-bell-gfx').
var GRAPHICS_QUALITY = (function () {
  try {
    var stored = localStorage.getItem('tactics-bell-gfx');
    if (stored === 'low' || stored === 'high') return stored;
  } catch (e) {}
  return (typeof HARDWARE_TIER !== 'undefined' && HARDWARE_TIER === 'low') ? 'low' : 'high';
}());

// ─── Character model configuration ───────────────────────────────────────────
// Maps gender+class IDs to glTF filenames in public/models/character/ (high quality).
// Only two base mesh shapes are available (Peasant and Ranger) per gender.
// Warrior/Healer use the Peasant body; Mage/Archer use the Ranger body.
// The player's gender choice selects the matching male or female variant.
var CHARACTER_MODEL_FILES = {
  male: {
    warrior: 'Male_Peasant.gltf',
    mage:    'Male_Ranger.gltf',
    archer:  'Male_Ranger.gltf',
    healer:  'Male_Peasant.gltf'
  },
  female: {
    warrior: 'Female_Peasant.gltf',
    mage:    'Female_Ranger.gltf',
    archer:  'Female_Ranger.gltf',
    healer:  'Female_Peasant.gltf'
  }
};

// Low-graphics fallback: procedural OBJ models (used when GRAPHICS_QUALITY='low').
// Any class not present keeps its procedural cylinder + sphere appearance.
var CHARACTER_MODEL_FILES_LOW = {
  warrior: 'character-warrior.obj',
  mage:    'character-mage.obj',
  archer:  'character-archer.obj',
  healer:  'character-healer.obj'
};

// Uniform scale applied to every loaded character model.
var CHARACTER_MODEL_SCALE = 1.0;

// ─── Weapon model configuration ──────────────────────────────────────────────
// Maps class IDs to a weapon shape category used to build procedural meshes.
var WEAPON_CLASS_MAP = {
  warrior: 'sword', knight: 'sword', paladin: 'sword',
  berserker: 'axe',  warlord: 'axe',
  mage: 'staff',    sorcerer: 'staff', sage: 'staff', archmage: 'staff',
  oracle: 'staff',  healer: 'staff',   cleric: 'staff', archbishop: 'staff',
  exorcist: 'wand', inquisitor: 'wand',
  archer: 'bow',    ranger: 'bow',     beastmaster: 'bow',
  assassin: 'dagger', shadow: 'dagger'
};

// PBR colours and surface properties per weapon category.
var WEAPON_PBR = {
  sword:  { r: 0.75, g: 0.75, b: 0.80, metallic: 0.70, roughness: 0.30 },
  axe:    { r: 0.40, g: 0.38, b: 0.42, metallic: 0.60, roughness: 0.40 },
  staff:  { r: 0.50, g: 0.30, b: 0.12, metallic: 0.10, roughness: 0.80 },
  bow:    { r: 0.58, g: 0.40, b: 0.14, metallic: 0.10, roughness: 0.75 },
  wand:   { r: 0.55, g: 0.22, b: 0.65, metallic: 0.20, roughness: 0.50 },
  dagger: { r: 0.30, g: 0.30, b: 0.35, metallic: 0.70, roughness: 0.35 }
};

// Weapon mesh offset from the unit's grid-world position.
var WEAPON_OFFSET_X = 0.26;  // right of the body
var WEAPON_OFFSET_Y = 0.40;  // mid-body height

// PBR material properties for character models.
// Albedo colour is applied per-unit from unit.meshColor() at load time.
var CHARACTER_PBR_METALLIC  = 0.35;
var CHARACTER_PBR_ROUGHNESS = 0.60;

// ─── Terrain model configuration ─────────────────────────────────────────────
// Maps game terrain names to OBJ filenames in public/models/terrain/.
// Any terrain not listed here (Lava, Crystal) keeps its procedural appearance.
var TERRAIN_MODEL_FILES = {
  Grass:    'terrain-grass.obj',
  Forest:   'terrain-forest.obj',
  Water:    'terrain-water.obj',
  Mountain: 'terrain-mountain.obj',
  Road:     'terrain-road.obj'
};

// Uniform scale applied to every loaded terrain model.
// Adjust if the models appear too large or too small relative to the grid cells.
var TERRAIN_MODEL_SCALE = 1.0;

// ─── Shared PBR configuration ─────────────────────────────────────────────────
// Single source of truth for terrain PBR properties used by both the procedural
// box fallback path (renderGrid) and the OBJ model loader (_upgradeToModels).
var TERRAIN_PBR_PROPS = {
  Grass:    { metallic: 0.0,  roughness: 0.82 },
  Forest:   { metallic: 0.0,  roughness: 0.95 },
  Water:    { metallic: 0.0,  roughness: 0.06, alpha: 0.85 },
  Mountain: { metallic: 0.08, roughness: 0.92 },
  Road:     { metallic: 0.0,  roughness: 0.65 },
  Lava:         { metallic: 0.0,  roughness: 0.88,
                  emissiveR: 0.8,  emissiveG: 0.12, emissiveB: 0.0, emissiveIntensity: 2.0 },
  Crystal:      { metallic: 0.25, roughness: 0.05, alpha: 0.85,
                  emissiveR: 0.18, emissiveG: 0.06, emissiveB: 0.28, emissiveIntensity: 0.5 },
  'Broken Road': { metallic: 0.05, roughness: 0.92 },
  Ruins:         { metallic: 0.10, roughness: 0.96 }
};

// ─── Map prop configuration ───────────────────────────────────────────────────
// Maps terrain names to arrays of glTF filenames served from public/models/props/.
// Props are placed decoratively at tile edges — not centre — so they never block
// unit movement.  Each terrain entry lists candidate files; one is chosen at
// random (deterministically seeded by tile position).
var PROP_MODELS = {
  Grass:        ['Prop_WoodenFence_Single.gltf', 'Prop_Vine1.gltf'],
  Forest:       ['Prop_Vine1.gltf', 'Prop_Vine2.gltf', 'Prop_Support.gltf'],
  Mountain:     ['Prop_Brick1.gltf', 'Prop_Brick2.gltf', 'Prop_Brick3.gltf', 'Prop_Brick4.gltf'],
  Road:         ['Prop_Crate.gltf',  'Prop_Wagon.gltf',  'Prop_WoodenFence_Single.gltf'],
  Water:        ['Prop_ExteriorBorder_Straight1.gltf', 'Prop_ExteriorBorder_Corner.gltf'],
  Ruins:        ['Wall_UnevenBrick_Straight.gltf', 'Prop_Brick1.gltf', 'Prop_Vine1.gltf'],
  'Broken Road':['Prop_Brick1.gltf', 'Prop_Brick3.gltf', 'Prop_Brick4.gltf']
};

// Probability (0–1) that a given tile spawns a prop.  Kept low to avoid
// visual clutter while still adding flavour.
var PROP_SPAWN_PROB = {
  Grass:         0.15,
  Forest:        0.25,
  Mountain:      0.20,
  Road:          0.18,
  Water:         0.12,
  Ruins:         0.28,
  'Broken Road': 0.22
};

// Uniform scale applied to every loaded prop model.
var PROP_MODEL_SCALE = 1.0;

// PBR material properties applied to each prop model (overrides glTF defaults).
var PROP_PBR_PROPS = {
  metallic:    0.05,
  roughness:   0.85
};

// Noise procedural texture settings for terrain micro-surface variation.
var TERRAIN_NOISE_SIZE       = 128;
var TERRAIN_NOISE_OCTAVES    = 4;
var TERRAIN_NOISE_PERSISTENCE = 0.6;
var TERRAIN_NOISE_AMBIENT    = 0.12;

function GameScene() {
  this.engine    = null;
  this.scene     = null;
  this.camera    = null;
  this._tileMeshes    = [];   // flat list
  this._tileMat       = {};   // key → BABYLON.PBRMaterial
  this._unitNodes     = {};   // unitId → { body, head, glow }
  this._weaponNodes   = {};   // unitId → weapon mesh
  this._hlMeshes      = [];   // highlight overlays
  this._propMeshes    = [];   // environmental prop clones (cleared on new grid)
  this._gridSize      = GRID_SIZE;
  this._frameCount    = 0;    // debug frame counter
  this._fpsEl         = null; // #debug-fps-rate DOM element
  this._frameEl       = null; // #debug-fps-frame DOM element
  this._shadowGenerator = null; // ShadowGenerator for directional light
  this._fxaaPostProcess = null; // FXAA anti-aliasing post-process
  // Weather
  this._weatherPs     = null;  // active weather BABYLON.ParticleSystem
  this._weatherTickFn = null;  // gameLoop callback for animated weather effects
  this._fogActive     = false; // whether Babylon scene fog is currently applied
  this._weatherTime   = 0;    // accumulated time (seconds) for weather animation
}

// ─── Init ────────────────────────────────────────────────────────────────────

GameScene.prototype.init = function (canvasId) {
  var canvas = document.getElementById(canvasId);
  this.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true }, true);
  this.scene  = new BABYLON.Scene(this.engine);
  this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.14, 1);

  // Physics plugin (Oimo.js) — used for death ragdolls
  try {
    var gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    var physicsPlugin = new BABYLON.OimoJSPlugin();
    this.scene.enablePhysics(gravityVector, physicsPlugin);
  } catch (e) {
    console.warn('Oimo physics not available:', e.message);
  }

  // Camera
  var sz = this._gridSize;
  this.camera = new BABYLON.ArcRotateCamera(
    'cam', -Math.PI / 2, Math.PI / 3.5, sz * 1.35,
    BABYLON.Vector3.Zero(), this.scene
  );
  this.camera.lowerBetaLimit  = 0.25;
  this.camera.upperBetaLimit  = Math.PI / 2.1;
  this.camera.lowerRadiusLimit = 6;
  this.camera.upperRadiusLimit = sz * 2.5;
  this.camera.attachControl(canvas, true);

  // Lights
  var dirLight = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, -1), this.scene);
  dirLight.intensity  = 1.1;
  dirLight.diffuse    = new BABYLON.Color3(1, 0.95, 0.8);
  dirLight.specular   = new BABYLON.Color3(0.5, 0.5, 0.4);
  dirLight.position   = new BABYLON.Vector3(10, 20, 10);

  var hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
  hemi.intensity    = 0.5;
  hemi.diffuse      = new BABYLON.Color3(0.5, 0.6, 1.0);
  hemi.groundColor  = new BABYLON.Color3(0.15, 0.08, 0.2);
  hemi.specular     = BABYLON.Color3.Black();

  // Shadow generator — quality scaled by hardware tier
  var shadowMapSize = (typeof HARDWARE_TIER !== 'undefined' && HARDWARE_TIER === 'low') ? 512 : 1024;
  var shadowGen = new BABYLON.ShadowGenerator(shadowMapSize, dirLight);
  shadowGen.useBlurExponentialShadowMap = (typeof HARDWARE_TIER === 'undefined' || HARDWARE_TIER !== 'low');
  shadowGen.blurKernel = 8;
  this._shadowGenerator = shadowGen;

  // FXAA anti-aliasing post-process — smooths jagged edges on high-end hardware.
  // Skipped on low-end / software renderers where the GPU overhead is unwanted.
  if (typeof HARDWARE_TIER === 'undefined' || HARDWARE_TIER !== 'low') {
    this._fxaaPostProcess = new BABYLON.FxaaPostProcess('fxaa', 1.0, this.camera);
  }

  // PBR environment intensity for image-based lighting
  this.scene.environmentIntensity = 0.4;

  // Render loop
  var self = this;
  this._frameCount = 0;
  this._fpsEl      = document.getElementById('debug-fps-rate');
  this._frameEl    = document.getElementById('debug-fps-frame');
  this.engine.runRenderLoop(function () {
    self.scene.render();
    self._frameCount++;
    if (self._fpsEl)   { self._fpsEl.textContent   = 'FPS: '   + self.engine.getFps().toFixed(1); }
    if (self._frameEl) { self._frameEl.textContent = 'Frame: ' + self._frameCount; }
  });
  window.addEventListener('resize', function () { self.engine.resize(); });
};

// ─── World ↔ grid helpers ────────────────────────────────────────────────────

GameScene.prototype.gridToWorld = function (row, col) {
  var offset = ((this._gridSize - 1) * TILE_STEP) / 2;
  return new BABYLON.Vector3(col * TILE_STEP - offset, 0, row * TILE_STEP - offset);
};

// ─── Render grid ─────────────────────────────────────────────────────────────

GameScene.prototype.renderGrid = function (grid) {
  this._gridSize = grid.size;

  // Dispose old tiles
  this._tileMeshes.forEach(function (m) { m.dispose(); });
  this._tileMeshes = [];
  this._tileMat    = {};

  // Dispose old environmental props
  this._propMeshes.forEach(function (m) { if (m) m.dispose(); });
  this._propMeshes = [];

  var self = this;

  for (var r = 0; r < grid.size; r++) {
    for (var c = 0; c < grid.size; c++) {
      var tile    = grid.tiles[r][c];
      var terrain = tile.terrain;
      var pos     = this.gridToWorld(r, c);

      var isHigh = (terrain === TERRAIN.MOUNTAIN);
      var tileH  = isHigh ? 0.5 : 0.14;

      var box = BABYLON.MeshBuilder.CreateBox('tile_' + r + '_' + c, {
        width: TILE_STEP * 0.93, height: tileH, depth: TILE_STEP * 0.93
      }, this.scene);
      box.position = new BABYLON.Vector3(pos.x, isHigh ? tileH / 2 : -tileH / 2, pos.z);

      // Reuse PBR material per terrain type
      var matKey = terrain.name;
      if (!this._tileMat[matKey]) {
        var mat  = new BABYLON.PBRMaterial('mat_' + matKey, this.scene);
        var pbr  = TERRAIN_PBR_PROPS[matKey] || { metallic: 0.0, roughness: 0.82 };
        mat.albedoColor = new BABYLON.Color3(terrain.r, terrain.g, terrain.b);
        mat.metallic    = pbr.metallic;
        mat.roughness   = pbr.roughness;
        if (pbr.alpha     !== undefined) { mat.alpha = pbr.alpha; }
        if (pbr.emissiveR !== undefined) {
          mat.emissiveColor     = new BABYLON.Color3(pbr.emissiveR, pbr.emissiveG, pbr.emissiveB);
          mat.emissiveIntensity = pbr.emissiveIntensity;
        }

        // Subtle surface micro-detail via procedural noise (ambient/AO variation)
        // Skipped on low-end hardware to avoid GPU overhead.
        if (typeof HARDWARE_TIER === 'undefined' || HARDWARE_TIER !== 'low') {
          var noiseTex = new BABYLON.NoiseProceduralTexture('noise_' + matKey, TERRAIN_NOISE_SIZE, this.scene);
          noiseTex.octaves              = TERRAIN_NOISE_OCTAVES;
          noiseTex.persistence          = TERRAIN_NOISE_PERSISTENCE;
          noiseTex.animationSpeedFactor = 0;
          mat.ambientTexture         = noiseTex;
          mat.ambientTextureStrength = TERRAIN_NOISE_AMBIENT;
        }

        this._tileMat[matKey] = mat;
      }
      box.material    = this._tileMat[matKey];
      box.metadata    = { row: r, col: c };
      box.isPickable  = true;
      box.receiveShadows = true;

      tile.mesh = box;
      this._tileMeshes.push(box);
    }
  }

  // Reposition camera
  this.camera.target = BABYLON.Vector3.Zero();
  this.camera.radius = grid.size * 1.35;

  // Asynchronously replace fallback boxes with terrain models when files exist
  this._upgradeToModels(grid);

  // Asynchronously place environmental prop decorations from the medieval-village
  // megakit glTF models (high-quality only — no-op on low-end hardware).
  this._addMapProps(grid);
};

// ─── Terrain model loading ────────────────────────────────────────────────────
// Tries to load an OBJ from public/models/terrain/ for each configured terrain
// type.  On success the procedural box for every matching tile is replaced with
// a scaled clone of the loaded mesh.  On failure (file missing, loader absent)
// the box is silently kept, so the game always remains playable.

GameScene.prototype._upgradeToModels = function (grid) {
  if (typeof GRAPHICS_QUALITY !== 'undefined' && GRAPHICS_QUALITY === 'low') return;
  if (!BABYLON.SceneLoader || typeof BABYLON.SceneLoader.ImportMesh !== 'function') return;

  var self = this;

  Object.keys(TERRAIN_MODEL_FILES).forEach(function (terrainName) {
    var fileName  = TERRAIN_MODEL_FILES[terrainName];
    var cacheKey  = 'models/terrain/' + fileName;

    // Prefer the in-memory blob URL (avoids network round-trip on repeated stage
    // loads).  When the blob URL is available we also supply the '.obj'
    // pluginExtension so that Babylon can identify the file format without an
    // extension in the blob: URL scheme.
    var useBlob      = typeof AssetCache !== 'undefined' && AssetCache.hasCached(cacheKey);
    var rootUrl      = useBlob ? ''                  : 'models/terrain/';
    var srcFile      = useBlob ? AssetCache.getCachedUrl(cacheKey) : fileName;
    var pluginExt    = useBlob ? '.obj'              : null;

    BABYLON.SceneLoader.ImportMesh(
      '',          // import all meshes
      rootUrl,     // root URL — empty when using a blob: URL
      srcFile,     // blob: URL (cached) or OBJ filename (first load)
      self.scene,
      function (meshes) {
        if (!meshes || !meshes.length || !self.scene) return;

        // Merge sub-meshes (e.g. multiple material groups) into one so that
        // the single resulting mesh can be cloned and positioned simply.
        var template = meshes.length === 1
          ? meshes[0]
          : BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
        if (!template) return;

        // Upgrade the template's material from StandardMaterial → PBRMaterial
        if (template.material && template.material.getClassName() === 'StandardMaterial') {
          var stdMat = template.material;
          var pbrMat = new BABYLON.PBRMaterial(stdMat.name + '_pbr', self.scene);
          var pbr    = TERRAIN_PBR_PROPS[terrainName] || { metallic: 0.05, roughness: 0.85 };
          pbrMat.albedoColor = stdMat.diffuseColor.clone();
          pbrMat.metallic    = pbr.metallic;
          pbrMat.roughness   = pbr.roughness;
          if (pbr.alpha     !== undefined) { pbrMat.alpha = pbr.alpha; }
          if (pbr.emissiveR !== undefined) {
            pbrMat.emissiveColor     = new BABYLON.Color3(pbr.emissiveR, pbr.emissiveG, pbr.emissiveB);
            pbrMat.emissiveIntensity = pbr.emissiveIntensity;
          }
          if (typeof HARDWARE_TIER === 'undefined' || HARDWARE_TIER !== 'low') {
            var noiseTex = new BABYLON.NoiseProceduralTexture('modelNoise_' + terrainName, TERRAIN_NOISE_SIZE, self.scene);
            noiseTex.octaves              = TERRAIN_NOISE_OCTAVES;
            noiseTex.persistence          = TERRAIN_NOISE_PERSISTENCE;
            noiseTex.animationSpeedFactor = 0;
            pbrMat.ambientTexture         = noiseTex;
            pbrMat.ambientTextureStrength = TERRAIN_NOISE_AMBIENT;
          }
          template.material = pbrMat;
          stdMat.dispose();
        }

        template.setEnabled(false);
        template.isPickable = false;
        template.scaling = new BABYLON.Vector3(
          TERRAIN_MODEL_SCALE, TERRAIN_MODEL_SCALE, TERRAIN_MODEL_SCALE
        );

        // Replace each matching tile's fallback box with a clone of the model
        for (var r = 0; r < grid.size; r++) {
          for (var c = 0; c < grid.size; c++) {
            var tile = grid.tiles[r][c];
            if (tile.terrain.name !== terrainName) continue;

            var pos  = self.gridToWorld(r, c);
            var clone = template.clone('tilemodel_' + r + '_' + c);
            clone.setEnabled(true);
            clone.position      = new BABYLON.Vector3(pos.x, 0, pos.z);
            clone.isPickable    = true;
            clone.metadata      = { row: r, col: c };
            clone.receiveShadows = true;
            if (self._shadowGenerator) { self._shadowGenerator.addShadowCaster(clone, true); }

            // Dispose old fallback box and update tracking arrays
            if (tile.mesh) {
              var idx = self._tileMeshes.indexOf(tile.mesh);
              if (idx !== -1) self._tileMeshes.splice(idx, 1);
              tile.mesh.dispose();
            }
            tile.mesh = clone;
            self._tileMeshes.push(clone);
          }
        }

        template.dispose();
      },
      null,           // progress callback — not needed
      function () {   // error callback — model file absent, keep fallback boxes
      },
      pluginExt       // force OBJ plugin when loading from a blob: URL
    );
  });
};

// ─── Map prop placement ───────────────────────────────────────────────────────
// Loads medieval-village-megakit glTF models from public/models/props/ and
// places decorative clones at tile edges based on terrain type.  Each unique
// model file is loaded only once; all placements for that file share a single
// template.  On failure (file absent, low-quality mode) the call is a no-op.
//
// Placement is deterministically seeded by tile position so the same map always
// produces the same decoration layout.

// Seeded pseudo-random float [0,1) for tile (r,c) with an index offset.
function _propFrand(r, c, idx) {
  var x = Math.sin(r * 127.1 + c * 311.7 + idx * 74.3) * 43758.5453;
  return x - Math.floor(x);
}

GameScene.prototype._addMapProps = function (grid) {
  if (typeof GRAPHICS_QUALITY !== 'undefined' && GRAPHICS_QUALITY === 'low') return;
  if (!BABYLON.SceneLoader || typeof BABYLON.SceneLoader.ImportMesh !== 'function') return;

  var self = this;

  // Build placement list: one entry per tile that wins the spawn roll.
  var placements = [];          // { file, row, col, rotY, ox, oz }
  var filesToLoad = {};         // fileName → true (deduplicated)

  for (var r = 0; r < grid.size; r++) {
    for (var c = 0; c < grid.size; c++) {
      var tile        = grid.tiles[r][c];
      var terrainName = tile.terrain.name;
      var candidates  = PROP_MODELS[terrainName];
      if (!candidates || !candidates.length) continue;

      var spawnProb = PROP_SPAWN_PROB[terrainName] || 0.15;
      if (_propFrand(r, c, 0) > spawnProb) continue;

      // Pick one candidate file at random.
      var file  = candidates[Math.floor(_propFrand(r, c, 1) * candidates.length)];
      // Random rotation around Y.
      var rotY  = _propFrand(r, c, 2) * Math.PI * 2;
      // Offset toward the tile edge (≈30–45 % of half-tile width).
      var angle = _propFrand(r, c, 3) * Math.PI * 2;
      var dist  = (0.30 + _propFrand(r, c, 4) * 0.15) * TILE_STEP;
      var ox    = Math.cos(angle) * dist;
      var oz    = Math.sin(angle) * dist;

      placements.push({ file: file, row: r, col: c, rotY: rotY, ox: ox, oz: oz });
      filesToLoad[file] = true;
    }
  }

  if (!placements.length) return;

  // Load each unique file once, then clone for every matching placement.
  Object.keys(filesToLoad).forEach(function (fileName) {
    BABYLON.SceneLoader.ImportMesh(
      '',
      'models/props/',
      fileName,
      self.scene,
      function (meshes) {
        if (!meshes || !meshes.length || !self.scene) return;

        var geoMeshes = meshes.filter(function (m) {
          return m.getTotalVertices && m.getTotalVertices() > 0;
        });
        if (!geoMeshes.length) return;

        var template = geoMeshes.length === 1
          ? geoMeshes[0]
          : BABYLON.Mesh.MergeMeshes(geoMeshes, true, true, undefined, false, true);
        if (!template) return;

        template.setEnabled(false);
        template.isPickable = false;
        template.scaling.setAll(PROP_MODEL_SCALE);

        placements.forEach(function (p) {
          if (p.file !== fileName) return;

          var pos   = self.gridToWorld(p.row, p.col);
          var clone = template.clone('prop_' + p.row + '_' + p.col);
          clone.setEnabled(true);
          clone.isPickable    = false;
          clone.receiveShadows = true;
          clone.position      = new BABYLON.Vector3(pos.x + p.ox, 0, pos.z + p.oz);
          clone.rotation.y    = p.rotY;

          if (self._shadowGenerator) {
            self._shadowGenerator.addShadowCaster(clone, true);
          }
          self._propMeshes.push(clone);
        });

        template.dispose();
      },
      null,
      function () {} // error: file absent — skip silently, game remains playable
    );
  });
};



/**
 * Spawn procedural fallback meshes for all units, then asynchronously replace
 * them with class-specific OBJ models when the files are available.
 * @param {Character[]} units
 */
GameScene.prototype.renderUnits = function (units) {
  var self = this;
  units.forEach(function (u) { self.spawnUnit(u); });
  self._upgradeUnitsToModels(units);
};

// ─── Character model loading ──────────────────────────────────────────────────
// Loads glTF character models (high quality) or OBJ fallbacks (low quality).
// For glTF models the full mesh hierarchy is preserved so the skeleton remains
// accessible for procedural idle bone animations.
// On success the procedural cylinder + sphere are hidden.  On failure the
// procedural shapes remain, so the game is always playable.

GameScene.prototype._upgradeUnitsToModels = function (units) {
  if (typeof GRAPHICS_QUALITY !== 'undefined' && GRAPHICS_QUALITY === 'low') return;
  if (!BABYLON.SceneLoader || typeof BABYLON.SceneLoader.ImportMesh !== 'function') return;

  var self = this;

  // Group units by (classId + '_' + gender) so each unique model file is
  // loaded only once regardless of how many units share it.
  var buckets = {};
  units.forEach(function (unit) {
    var gender = unit.gender || 'male';
    var key    = unit.classId + '_' + gender;
    if (!buckets[key]) { buckets[key] = { classId: unit.classId, gender: gender, units: [] }; }
    buckets[key].units.push(unit);
  });

  Object.keys(buckets).forEach(function (bucketKey) {
    var bucket  = buckets[bucketKey];
    var classId = bucket.classId;
    var gender  = bucket.gender;

    // Pick the model file: glTF for high quality (always the case here),
    // OBJ for low quality (already guarded above).
    var genderMap = CHARACTER_MODEL_FILES[gender] || CHARACTER_MODEL_FILES.male;
    var fileName  = genderMap[classId];
    if (!fileName) return;

    var isGltf = fileName.indexOf('.gltf') !== -1 || fileName.indexOf('.glb') !== -1;

    // glTF models must always load from the server because their external .bin
    // and texture files cannot be served from a single blob: URL.
    // OBJ models use the blob cache when available to avoid repeat network hits.
    var useBlob   = !isGltf && typeof AssetCache !== 'undefined' && AssetCache.hasCached('models/character/' + fileName);
    var rootUrl   = useBlob ? ''                    : 'models/character/';
    var srcFile   = useBlob ? AssetCache.getCachedUrl('models/character/' + fileName) : fileName;
    var pluginExt = useBlob ? '.obj'                : null;

    BABYLON.SceneLoader.ImportMesh(
      '',          // import all meshes
      rootUrl,
      srcFile,
      self.scene,
      function (meshes) {
        if (!meshes || !meshes.length || !self.scene) return;

        // Filter to geometry meshes only (glTF also returns TransformNodes).
        var geoMeshes = meshes.filter(function (m) {
          return m.getTotalVertices && m.getTotalVertices() > 0;
        });
        if (!geoMeshes.length) return;

        if (isGltf) {
          // ── glTF path: keep hierarchy intact to preserve skeleton ──────────
          // Disable all geometry meshes; we will clone them per unit.
          geoMeshes.forEach(function (m) {
            m.setEnabled(false);
            m.isPickable = false;
          });

          // Find the skeleton linked to the loaded geometry.
          var loadedSkeleton = null;
          for (var mi = 0; mi < geoMeshes.length; mi++) {
            if (geoMeshes[mi].skeleton) {
              loadedSkeleton = geoMeshes[mi].skeleton;
              break;
            }
          }

          bucket.units.forEach(function (unit) {
            var node = self._unitNodes[unit.id];
            if (!node) return;

            var pos = self.gridToWorld(unit.gridRow, unit.gridCol);

            // Clone the skeleton for this unit so its bone animations are independent.
            var unitSkeleton = loadedSkeleton
              ? loadedSkeleton.clone('skel_' + unit.id)
              : null;

            // Parent node for all cloned geometry meshes of this unit.
            var unitRoot = new BABYLON.TransformNode('charroot_' + unit.id, self.scene);
            unitRoot.position = new BABYLON.Vector3(pos.x, 0, pos.z);
            unitRoot.scaling  = new BABYLON.Vector3(
              CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE
            );

            geoMeshes.forEach(function (m, mi) {
              var clone = m.clone('charpart_' + unit.id + '_' + mi);
              if (!clone) return;
              clone.setEnabled(true);
              clone.isPickable    = false;
              clone.receiveShadows = true;
              clone.parent         = unitRoot;
              if (unitSkeleton) { clone.skeleton = unitSkeleton; }
              if (self._shadowGenerator) { self._shadowGenerator.addShadowCaster(clone, true); }
            });

            // Hide the procedural fallback meshes.
            node.body.setEnabled(false);
            node.head.setEnabled(false);

            // Store the root node for movement/animation; also keep a direct
            // reference to the first child mesh for hit-flash and physics.
            node.model       = unitRoot;
            node.modelParts  = unitRoot.getChildMeshes ? unitRoot.getChildMeshes(false) : [];

            // Start idle animation: Y-bob on the root + bone breathing cycle.
            self._startIdleAnim(unit.id, unitRoot, unitSkeleton);
          });

          // Dispose the loading-only template meshes.
          geoMeshes.forEach(function (m) { try { m.dispose(); } catch (e) {} });

        } else {
          // ── OBJ path: merge into a single flat mesh (no skeleton) ──────────
          var template = geoMeshes.length === 1
            ? geoMeshes[0]
            : BABYLON.Mesh.MergeMeshes(geoMeshes, true, true, undefined, false, true);
          if (!template) return;

          template.setEnabled(false);
          template.isPickable = false;
          template.scaling = new BABYLON.Vector3(
            CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE
          );

          bucket.units.forEach(function (unit) {
            var node = self._unitNodes[unit.id];
            if (!node) return;

            var pos   = self.gridToWorld(unit.gridRow, unit.gridCol);
            var clone = template.clone('charmodel_' + unit.id);
            clone.setEnabled(true);
            clone.position   = new BABYLON.Vector3(pos.x, 0, pos.z);
            clone.isPickable = false;
            clone.receiveShadows = true;

            // OBJ path: override material with unit race/custom colour.
            var c = unit.meshColor();
            var pbrMat = new BABYLON.PBRMaterial('charpbr_' + unit.id, self.scene);
            pbrMat.albedoColor   = new BABYLON.Color3(c.r, c.g, c.b);
            pbrMat.metallic      = CHARACTER_PBR_METALLIC;
            pbrMat.roughness     = CHARACTER_PBR_ROUGHNESS;
            pbrMat.emissiveColor = BABYLON.Color3.Black();
            clone.material = pbrMat;

            if (self._shadowGenerator) { self._shadowGenerator.addShadowCaster(clone, true); }

            node.body.setEnabled(false);
            node.head.setEnabled(false);

            node.model      = clone;
            node.modelParts = [clone];

            self._startIdleAnim(unit.id, clone, null);
          });

          template.dispose();
        }
      },
      null,           // progress callback — not needed
      function () {   // error callback — model file absent, keep procedural fallback
      },
      pluginExt
    );
  });
};

// ─── Character idle animation ─────────────────────────────────────────────────
// Plays a looping idle cycle on the character model.  The root mesh/TransformNode
// gets a gentle Y-position breathing bob.  When a Babylon skeleton is supplied
// the spine and upper-arm bones also receive subtle idle oscillations, giving the
// model life without a pre-authored animation clip.
//
// All animations are staggered by a hash of unitId so units don't bob in sync.

GameScene.prototype._startIdleAnim = function (unitId, mesh, skeleton) {
  if (!this.scene || !mesh) return;

  // Stable per-unit speed offset so units breathe at slightly different rates.
  var hash = 0;
  for (var i = 0; i < unitId.length; i++) { hash = (hash * 31 + unitId.charCodeAt(i)) & 0xfffff; }
  var speed = 0.35 + (hash % 100) / 500;   // 0.35 – 0.55

  var ease = new BABYLON.SineEase();
  ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

  // ── Root mesh: gentle Y-position rise-and-fall (breathing bob) ──────────────
  var idleAnim = new BABYLON.Animation(
    'idle_' + unitId, 'position.y', 60,
    BABYLON.Animation.ANIMATIONTYPE_FLOAT,
    BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
  );
  idleAnim.setEasingFunction(ease);
  idleAnim.setKeys([
    { frame: 0,  value: 0.00 },
    { frame: 30, value: 0.04 },
    { frame: 60, value: 0.00 }
  ]);
  mesh.animations = (mesh.animations || []).concat([idleAnim]);
  this.scene.beginAnimation(mesh, 0, 60, true, speed);

  // ── Skeleton bones: breathing and arm-sway ──────────────────────────────────
  // These run only when a live skeleton is available (glTF path).
  if (!skeleton) { return; }
  var scene = this.scene;

  var boneAnims = [
    // Chest breathing: spine_02 pitches slightly forward and back.
    { name: 'spine_02',   prop: 'rotation.x', amp:  0.04,  speedMul: 1.0  },
    // Shoulder sway: clavicle bones rise and fall in sync with breathing.
    { name: 'clavicle_l', prop: 'rotation.z', amp: -0.06,  speedMul: 1.0  },
    { name: 'clavicle_r', prop: 'rotation.z', amp:  0.06,  speedMul: 1.0  },
    // Arm idle sway: upper arms drift very slightly forward and back,
    // breaking the static T-pose silhouette.
    { name: 'upperarm_l', prop: 'rotation.x', amp:  0.10,  speedMul: 0.7  },
    { name: 'upperarm_r', prop: 'rotation.x', amp:  0.10,  speedMul: 0.7  }
  ];

  boneAnims.forEach(function (cfg) {
    var idx = skeleton.getBoneIndexByName(cfg.name);
    if (idx < 0) { return; }
    var bone = skeleton.bones[idx];

    var bAnim = new BABYLON.Animation(
      'idleBone_' + cfg.name + '_' + unitId,
      cfg.prop, 60,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
    );
    var bEase = new BABYLON.SineEase();
    bEase.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    bAnim.setEasingFunction(bEase);
    bAnim.setKeys([
      { frame: 0,  value: 0         },
      { frame: 30, value: cfg.amp   },
      { frame: 60, value: 0         }
    ]);
    bone.animations = (bone.animations || []).concat([bAnim]);
    scene.beginAnimation(bone, 0, 60, true, speed * cfg.speedMul);
  });
};


GameScene.prototype.spawnUnit = function (unit) {
  var pos  = this.gridToWorld(unit.gridRow, unit.gridCol);
  var c    = unit.meshColor();
  var bodyColor = new BABYLON.Color3(c.r, c.g, c.b);

  // Body (cylinder)
  var body = BABYLON.MeshBuilder.CreateCylinder('body_' + unit.id, {
    height: 0.6, diameter: 0.45, tessellation: 16
  }, this.scene);
  body.position = new BABYLON.Vector3(pos.x, 0.3, pos.z);
  var bMat = new BABYLON.PBRMaterial('bmat_' + unit.id, this.scene);
  bMat.albedoColor  = bodyColor;
  bMat.metallic     = 0.45;
  bMat.roughness    = 0.55;
  bMat.emissiveColor = BABYLON.Color3.Black();
  body.material = bMat;
  body.isPickable    = false;
  body.receiveShadows = true;
  if (this._shadowGenerator) { this._shadowGenerator.addShadowCaster(body); }

  // Head (sphere)
  var head = BABYLON.MeshBuilder.CreateSphere('head_' + unit.id, {
    diameter: 0.28, segments: 12
  }, this.scene);
  head.position = new BABYLON.Vector3(pos.x, 0.73, pos.z);
  var hMat = new BABYLON.PBRMaterial('hmat_' + unit.id, this.scene);
  hMat.albedoColor  = new BABYLON.Color3(1.0, 0.86, 0.70);
  hMat.metallic     = 0.0;
  hMat.roughness    = 0.7;
  head.material = hMat;
  head.isPickable    = false;
  head.receiveShadows = true;
  if (this._shadowGenerator) { this._shadowGenerator.addShadowCaster(head); }

  // Selection glow ring
  var glow = BABYLON.MeshBuilder.CreateTorus('glow_' + unit.id, {
    diameter: 0.65, thickness: 0.07, tessellation: 18
  }, this.scene);
  glow.position = new BABYLON.Vector3(pos.x, 0.03, pos.z);
  var gMat = new BABYLON.StandardMaterial('gmat_' + unit.id, this.scene);
  gMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.1);
  gMat.alpha = 0;
  glow.material = gMat;
  glow.isPickable = false;

  this._unitNodes[unit.id] = { body: body, head: head, glow: glow };
  this._spawnWeapon(unit);
};

// ─── Weapon mesh ─────────────────────────────────────────────────────────────
// Creates a lightweight procedural weapon shape for each unit and stores it in
// _weaponNodes[unitId].  The mesh is positioned to the right of the unit body
// and follows it during moves.

GameScene.prototype._spawnWeapon = function (unit) {
  var pos        = this.gridToWorld(unit.gridRow, unit.gridCol);
  var weaponType = WEAPON_CLASS_MAP[unit.classId] || 'sword';
  var wpbr       = WEAPON_PBR[weaponType] || WEAPON_PBR.sword;
  var scene      = this.scene;
  var mesh;

  if (weaponType === 'sword') {
    mesh = BABYLON.MeshBuilder.CreateBox('wpn_' + unit.id,
      { width: 0.06, height: 0.44, depth: 0.02 }, scene);
  } else if (weaponType === 'axe') {
    mesh = BABYLON.MeshBuilder.CreateBox('wpn_' + unit.id,
      { width: 0.20, height: 0.30, depth: 0.03 }, scene);
  } else if (weaponType === 'staff') {
    mesh = BABYLON.MeshBuilder.CreateCylinder('wpn_' + unit.id,
      { height: 0.60, diameter: 0.055, tessellation: 8 }, scene);
  } else if (weaponType === 'bow') {
    mesh = BABYLON.MeshBuilder.CreateTorus('wpn_' + unit.id,
      { diameter: 0.32, thickness: 0.035, tessellation: 16 }, scene);
    mesh.scaling.z = 0.35; // flatten to bow profile
  } else if (weaponType === 'wand') {
    mesh = BABYLON.MeshBuilder.CreateCylinder('wpn_' + unit.id,
      { height: 0.36, diameter: 0.045, tessellation: 8 }, scene);
  } else { // dagger
    mesh = BABYLON.MeshBuilder.CreateBox('wpn_' + unit.id,
      { width: 0.05, height: 0.26, depth: 0.02 }, scene);
  }

  mesh.position   = new BABYLON.Vector3(pos.x + WEAPON_OFFSET_X, WEAPON_OFFSET_Y, pos.z);
  mesh.isPickable = false;

  var mat = new BABYLON.PBRMaterial('wpnmat_' + unit.id, scene);
  mat.albedoColor = new BABYLON.Color3(wpbr.r, wpbr.g, wpbr.b);
  mat.metallic    = wpbr.metallic;
  mat.roughness   = wpbr.roughness;
  mesh.material   = mat;

  if (this._shadowGenerator) { this._shadowGenerator.addShadowCaster(mesh); }

  this._weaponNodes[unit.id] = mesh;
};

GameScene.prototype.setUnitGlow = function (unit, visible) {
  var node = this._unitNodes[unit.id];
  if (!node) return;
  node.glow.material.alpha = visible ? 0.9 : 0;
  if (visible) {
    if (!node.glow._spinObs) {
      var engine = this.scene.getEngine();
      node.glow._spinObs = this.scene.onBeforeRenderObservable.add(function () {
        node.glow.rotation.y += 1.8 * (engine.getDeltaTime() / 1000);
      });
    }
  } else {
    if (node.glow._spinObs) {
      this.scene.onBeforeRenderObservable.remove(node.glow._spinObs);
      node.glow._spinObs = null;
    }
  }
};

// Teleport unit mesh to grid position (no animation)
GameScene.prototype.snapUnit = function (unit) {
  var node = this._unitNodes[unit.id];
  if (!node) return;
  var pos = this.gridToWorld(unit.gridRow, unit.gridCol);
  if (node.model) {
    node.model.position.x = pos.x;
    node.model.position.z = pos.z;
  } else {
    node.body.position.x = pos.x;
    node.body.position.z = pos.z;
    node.head.position.x = pos.x;
    node.head.position.z = pos.z;
  }
  node.glow.position.x = pos.x;
  node.glow.position.z = pos.z;
  var weapon = this._weaponNodes[unit.id];
  if (weapon) {
    weapon.position.x = pos.x + WEAPON_OFFSET_X;
    weapon.position.z = pos.z;
  }
};

// Animate unit to new grid position, call onDone when finished
GameScene.prototype.moveUnit = function (unit, onDone) {
  var node = this._unitNodes[unit.id];
  if (!node) { if (onDone) onDone(); return; }

  var pos    = this.gridToWorld(unit.gridRow, unit.gridCol);
  var frames = 20;
  var scene  = this.scene;
  var ease   = new BABYLON.CubicEase();
  ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

  var animGlow = new BABYLON.Animation(
    'moveGlow_' + unit.id, 'position', 60,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  animGlow.setKeys([
    { frame: 0,      value: node.glow.position.clone() },
    { frame: frames, value: new BABYLON.Vector3(pos.x, 0.03, pos.z) }
  ]);
  animGlow.setEasingFunction(ease);
  node.glow.animations = [animGlow];
  scene.beginAnimation(node.glow, 0, frames, false, 1);

  if (node.model) {
    // Animate the OBJ model mesh instead of the procedural body + head.
    var animModel = new BABYLON.Animation(
      'moveModel_' + unit.id, 'position', 60,
      BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animModel.setKeys([
      { frame: 0,      value: node.model.position.clone() },
      { frame: frames, value: new BABYLON.Vector3(pos.x, 0, pos.z) }
    ]);
    animModel.setEasingFunction(ease);
    // Animate weapon alongside model
    var weapon = this._weaponNodes[unit.id];
    if (weapon) {
      var animWpnM = new BABYLON.Animation(
        'moveWpn_' + unit.id, 'position', 60,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      animWpnM.setKeys([
        { frame: 0,      value: weapon.position.clone() },
        { frame: frames, value: new BABYLON.Vector3(pos.x + WEAPON_OFFSET_X, weapon.position.y, pos.z) }
      ]);
      animWpnM.setEasingFunction(ease);
      weapon.animations = [animWpnM];
      scene.beginAnimation(weapon, 0, frames, false, 1);
    }
    node.model.animations = [animModel];
    scene.beginAnimation(node.model, 0, frames, false, 1, function () {
      if (onDone) onDone();
    });
    return;
  }

  var animBody = new BABYLON.Animation(
    'moveBody_' + unit.id, 'position', 60,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  animBody.setKeys([
    { frame: 0,      value: node.body.position.clone() },
    { frame: frames, value: new BABYLON.Vector3(pos.x, 0.3, pos.z) }
  ]);

  var animHead = new BABYLON.Animation(
    'moveHead_' + unit.id, 'position', 60,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  animHead.setKeys([
    { frame: 0,      value: node.head.position.clone() },
    { frame: frames, value: new BABYLON.Vector3(pos.x, 0.73, pos.z) }
  ]);

  [animBody, animHead].forEach(function (a) { a.setEasingFunction(ease); });

  // Animate weapon alongside body
  var weapon = this._weaponNodes[unit.id];
  if (weapon) {
    var animWpnB = new BABYLON.Animation(
      'moveWpn_' + unit.id, 'position', 60,
      BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animWpnB.setKeys([
      { frame: 0,      value: weapon.position.clone() },
      { frame: frames, value: new BABYLON.Vector3(pos.x + WEAPON_OFFSET_X, weapon.position.y, pos.z) }
    ]);
    animWpnB.setEasingFunction(ease);
    weapon.animations = [animWpnB];
    scene.beginAnimation(weapon, 0, frames, false, 1);
  }

  node.body.animations = [animBody];
  node.head.animations = [animHead];

  scene.beginAnimation(node.body, 0, frames, false, 1, function () {
    if (onDone) onDone();
  });
  scene.beginAnimation(node.head, 0, frames, false, 1);
};

// Hit flash + particle burst
// skillId (optional 4th arg) selects an elemental particle palette.
GameScene.prototype.playHitEffect = function (unit, skillType, onDone, skillId) {
  var node = this._unitNodes[unit.id];
  if (!node) { if (onDone) onDone(); return; }

  // Use the OBJ model material when available, otherwise the procedural body.
  var targetMesh = node.model || node.body;
  var origDiff = targetMesh.material.albedoColor
    ? targetMesh.material.albedoColor.clone() : new BABYLON.Color3(1, 1, 1);
  var origEmit = targetMesh.material.emissiveColor
    ? targetMesh.material.emissiveColor.clone() : BABYLON.Color3.Black();

  if (targetMesh.material.albedoColor)   { targetMesh.material.albedoColor  = new BABYLON.Color3(1, 1, 1); }
  if (targetMesh.material.emissiveColor) { targetMesh.material.emissiveColor = new BABYLON.Color3(0.9, 0.2, 0.2); }

  // Elemental particle burst
  this._spawnHitParticles(unit, skillType, skillId);

  // Shake animation: run on the root model or body (TransformNode.rotation works too).
  this._playHitShake(node.model || node.body, unit.id);

  setTimeout(function () {
    if (mat.albedoColor)  { mat.albedoColor   = origDiff; }
    if (mat.emissiveColor){ mat.emissiveColor  = origEmit; }
    if (onDone) onDone();
  }, 350);
};

GameScene.prototype._spawnHitParticles = function (unit, skillType, skillId) {
  var pos   = this.gridToWorld(unit.gridRow, unit.gridCol);
  var scene = this.scene;
  var isLow = (typeof HARDWARE_TIER !== 'undefined' && HARDWARE_TIER === 'low');

  // Determine particle count; some big spells get more particles.
  var baseCount = isLow ? 16 : 40;
  var bigSpell  = skillId === 'fireball' || skillId === 'meteor' ||
                  skillId === 'arcaneburst' || skillId === 'titanslash';
  if (bigSpell) { baseCount = isLow ? 28 : 70; }

  var ps = new BABYLON.ParticleSystem('hit_' + unit.id + '_' + Date.now(), baseCount, scene);
  ps.emitter    = new BABYLON.Vector3(pos.x, 0.5, pos.z);
  ps.minEmitBox = new BABYLON.Vector3(-0.15, 0,   -0.15);
  ps.maxEmitBox = new BABYLON.Vector3( 0.15, 0.2,  0.15);

  // ── Per-skill elemental colour palette ──────────────────────────────────────
  if (skillId === 'fireball' || skillId === 'purge') {
    // Fire: orange → yellow
    ps.color1 = new BABYLON.Color4(1.0, 0.35, 0.0, 1);
    ps.color2 = new BABYLON.Color4(1.0, 0.80, 0.1, 0.5);
    ps.minSize = 0.08; ps.maxSize = 0.30;
  } else if (skillId === 'icelance') {
    // Ice: cyan → white
    ps.color1 = new BABYLON.Color4(0.30, 0.70, 1.0, 1);
    ps.color2 = new BABYLON.Color4(0.80, 0.95, 1.0, 0.5);
    ps.minSize = 0.04; ps.maxSize = 0.18;
  } else if (skillId === 'thunder' || skillId === 'smite' ||
             skillId === 'holyjudgment' || skillId === 'divinestrike') {
    // Lightning: bright yellow
    ps.color1     = new BABYLON.Color4(1.0, 1.0, 0.2, 1);
    ps.color2     = new BABYLON.Color4(1.0, 1.0, 0.9, 0.6);
    ps.minSize    = 0.04; ps.maxSize = 0.16;
    ps.direction1 = new BABYLON.Vector3(-2, 4, -2);
    ps.direction2 = new BABYLON.Vector3( 2, 8,  2);
  } else if (skillId === 'meteor' || skillId === 'titanslash' || skillId === 'battleroar') {
    // Meteor / power strike: deep orange + brown smoke
    ps.color1 = new BABYLON.Color4(0.90, 0.40, 0.10, 1);
    ps.color2 = new BABYLON.Color4(0.55, 0.30, 0.10, 0.5);
    ps.minSize = 0.10; ps.maxSize = 0.38;
  } else if (skillId === 'arcaneburst' || skillId === 'arcaneblast' ||
             skillId === 'timewarp'    || skillId === 'fatecast') {
    // Arcane: deep purple → lavender
    ps.color1 = new BABYLON.Color4(0.50, 0.10, 1.0, 1);
    ps.color2 = new BABYLON.Color4(0.70, 0.40, 1.0, 0.4);
    ps.minSize = 0.06; ps.maxSize = 0.26;
  } else if (skillId === 'holylight' || skillId === 'greatheal' ||
             skillId === 'divinegrace' || skillId === 'prophecy' ||
             skillId === 'holyblade'  || skillId === 'sacredshield') {
    // Holy heal: gold → white
    ps.color1 = new BABYLON.Color4(1.0, 0.95, 0.40, 1);
    ps.color2 = new BABYLON.Color4(1.0, 1.0,  0.90, 0.4);
    ps.minSize = 0.06; ps.maxSize = 0.22;
  } else if (skillId === 'shadowstrike' || skillId === 'deathmark' ||
             skillId === 'doublecut'    || skillId === 'phantomstep') {
    // Shadow: dark violet
    ps.color1 = new BABYLON.Color4(0.30, 0.0, 0.50, 1);
    ps.color2 = new BABYLON.Color4(0.10, 0.0, 0.20, 0.4);
    ps.minSize = 0.05; ps.maxSize = 0.20;
  } else if (skillType === 'magic') {
    // Generic magic: purple
    ps.color1 = new BABYLON.Color4(0.5, 0.1, 1.0, 1);
    ps.color2 = new BABYLON.Color4(1.0, 0.5, 1.0, 0.4);
  } else if (skillType === 'heal') {
    // Generic heal: green
    ps.color1 = new BABYLON.Color4(0.2, 1.0, 0.4, 1);
    ps.color2 = new BABYLON.Color4(0.6, 1.0, 0.6, 0.4);
  } else {
    // Physical: orange-gold
    ps.color1 = new BABYLON.Color4(1.0, 0.6, 0.0, 1);
    ps.color2 = new BABYLON.Color4(1.0, 1.0, 0.0, 0.4);
  }

  if (!ps.minSize)    { ps.minSize  = 0.05; }
  if (!ps.maxSize)    { ps.maxSize  = 0.22; }
  if (!ps.direction1) { ps.direction1 = new BABYLON.Vector3(-1.5, 3, -1.5); }
  if (!ps.direction2) { ps.direction2 = new BABYLON.Vector3( 1.5, 5,  1.5); }
  ps.minLifeTime  = 0.2;
  ps.maxLifeTime  = 0.55;
  ps.emitRate     = 120;
  ps.minEmitPower = 1;
  ps.maxEmitPower = 3;
  ps.updateSpeed  = 0.02;

  ps.start();
  setTimeout(function () { ps.stop(); },    250);
  setTimeout(function () { ps.dispose(); }, 1200);
};

// ─── Attack animation ─────────────────────────────────────────────────────────
// Plays a weapon-swing (melee) or projectile-arc (ranged/magic) on the attacker
// then triggers the hit flash + elemental particles on the target.
// Replaces the old scene.playHitEffect() call in combat.js so the full sequence
// (swing → projectile → impact) is co-ordinated here.

GameScene.prototype.playAttackAnimation = function (attacker, target, skillType, skillId, onDone) {
  var self   = this;
  var weapon = this._weaponNodes[attacker.id];

  // ── Weapon animation ──────────────────────────────────────────────────────
  if (weapon && this.scene) {
    var isMagicCast = (skillType === 'magic' || skillType === 'heal');
    if (isMagicCast) {
      // Casting: quick scale pulse on the staff/wand
      var castAnim = new BABYLON.Animation(
        'cast_' + attacker.id, 'scaling.y', 60,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      castAnim.setKeys([
        { frame: 0,  value: 1.0 },
        { frame: 6,  value: 1.35 },
        { frame: 12, value: 1.0 }
      ]);
      weapon.animations = [castAnim];
      this.scene.beginAnimation(weapon, 0, 12, false, 2.0);
    } else {
      // Melee/ranged: swing rotation around local Z axis
      var swingAnim = new BABYLON.Animation(
        'swing_' + attacker.id, 'rotation.z', 60,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      var startZ = weapon.rotation.z;
      swingAnim.setKeys([
        { frame: 0,  value: startZ },
        { frame: 7,  value: startZ - Math.PI * 0.65 },
        { frame: 14, value: startZ }
      ]);
      weapon.animations = [swingAnim];
      this.scene.beginAnimation(weapon, 0, 14, false, 2.0);
    }
  }

  // ── Impact delivery ───────────────────────────────────────────────────────
  var isMelee = (attacker.attackRange <= 1);
  if (isMelee) {
    // Brief delay so the swing lands before the flash
    setTimeout(function () {
      self.playHitEffect(target, skillType, onDone, skillId);
    }, 200);
  } else {
    // Ranged / magic: arc a projectile to the target then trigger impact
    this._launchProjectile(attacker, target, skillType, skillId, onDone);
  }
};

// Spawns a glowing sphere that arcs from the attacker to the target, then
// calls playHitEffect when it arrives.
GameScene.prototype._launchProjectile = function (attacker, target, skillType, skillId, onDone) {
  var self  = this;
  var scene = this.scene;
  if (!scene) { this.playHitEffect(target, skillType, onDone, skillId); return; }

  var startPos = this.gridToWorld(attacker.gridRow, attacker.gridCol);
  var endPos   = this.gridToWorld(target.gridRow,   target.gridCol);
  startPos.y = 0.55;
  endPos.y   = 0.55;

  // Pick projectile emissive colour by skill (else-if ensures first match wins)
  var pr, pg, pb;
  if      (skillId   === 'fireball')                      { pr = 1.0;  pg = 0.35; pb = 0.0; }
  else if (skillId   === 'icelance')                      { pr = 0.30; pg = 0.70; pb = 1.0; }
  else if (skillId   === 'thunder' || skillId === 'smite'){ pr = 1.0;  pg = 1.0;  pb = 0.2; }
  else if (skillId   === 'meteor')                        { pr = 0.90; pg = 0.40; pb = 0.1; }
  else if (skillType === 'magic')                         { pr = 0.55; pg = 0.15; pb = 1.0; }
  else if (skillType === 'heal')                          { pr = 0.20; pg = 1.0;  pb = 0.4; }
  else                                                    { pr = 1.0;  pg = 0.85; pb = 0.0; }

  var proj = BABYLON.MeshBuilder.CreateSphere(
    'proj_' + attacker.id + '_' + Date.now(), { diameter: 0.14, segments: 6 }, scene
  );
  proj.position  = startPos.clone();
  proj.isPickable = false;

  var pMat = new BABYLON.StandardMaterial('projmat_' + attacker.id, scene);
  pMat.emissiveColor   = new BABYLON.Color3(pr, pg, pb);
  pMat.disableLighting = true;
  proj.material = pMat;

  // Animate along a gentle arc (mid-point raised)
  var frames  = 18;
  var midPos  = new BABYLON.Vector3(
    (startPos.x + endPos.x) / 2,
    Math.max(startPos.y, endPos.y) + 0.55,
    (startPos.z + endPos.z) / 2
  );
  var animProj = new BABYLON.Animation(
    'proj_' + attacker.id, 'position', 60,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  animProj.setKeys([
    { frame: 0,          value: startPos.clone() },
    { frame: frames / 2, value: midPos },
    { frame: frames,     value: endPos.clone() }
  ]);
  proj.animations = [animProj];

  scene.beginAnimation(proj, 0, frames, false, 2.0, function () {
    proj.dispose();
    self.playHitEffect(target, skillType, onDone, skillId);
  });
};

// Oimo physics ragdoll death
GameScene.prototype.removeUnit = function (unit) {
  var node = this._unitNodes[unit.id];
  if (!node) return;

  // For glTF models node.model is a TransformNode — PhysicsImpostor needs a
  // Mesh, so fall back to the first child mesh when available.
  var physMesh;
  if (node.model) {
    if (node.modelParts && node.modelParts.length) {
      physMesh = node.modelParts[0];
    } else if (typeof node.model.getChildMeshes === 'function') {
      var kids = node.model.getChildMeshes(false);
      physMesh = kids.length ? kids[0] : node.model;
    } else {
      physMesh = node.model;
    }
  } else {
    physMesh = node.body;
  }
  var impostorType = node.model
    ? BABYLON.PhysicsImpostor.BoxImpostor
    : BABYLON.PhysicsImpostor.CylinderImpostor;

  try {
    physMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
      physMesh, impostorType,
      { mass: 1, restitution: 0.3, friction: 0.6 }, this.scene
    );
    physMesh.physicsImpostor.applyImpulse(
      new BABYLON.Vector3(
        (Math.random() - 0.5) * 3,
        2.5 + Math.random(),
        (Math.random() - 0.5) * 3
      ),
      physMesh.getAbsolutePosition()
    );
  } catch (e) {
    // Physics not enabled; just fade out
  }

  var model  = node.model;
  var body   = node.body;
  var head   = node.head;
  var glow   = node.glow;
  var weapon = this._weaponNodes[unit.id];
  if (glow && glow._spinObs) {
    this.scene.onBeforeRenderObservable.remove(glow._spinObs);
    glow._spinObs = null;
  }
  setTimeout(function () {
    if (model)  model.dispose();
    if (body)   body.dispose();
    if (head)   head.dispose();
    if (glow)   glow.dispose();
    if (weapon) weapon.dispose();
  }, 1600);
  delete this._unitNodes[unit.id];
  delete this._weaponNodes[unit.id];
};

// ─── Tile highlights ─────────────────────────────────────────────────────────

GameScene.prototype.highlightTiles = function (tiles, type) {
  this.clearHighlights();
  var self  = this;
  var palettes = {
    move:     { r: 0.15, g: 0.45, b: 1.0,  a: 0.55 },
    attack:   { r: 1.0,  g: 0.15, b: 0.15, a: 0.55 },
    heal:     { r: 0.1,  g: 1.0,  b: 0.35, a: 0.55 },
    selected: { r: 1.0,  g: 0.85, b: 0.0,  a: 0.65 }
  };
  var p = palettes[type] || palettes.move;

  tiles.forEach(function (tile) {
    if (!tile || !tile.mesh) return;
    var ov = BABYLON.MeshBuilder.CreateBox('hl_' + tile.row + '_' + tile.col, {
      width: TILE_STEP * 0.88, height: 0.06, depth: TILE_STEP * 0.88
    }, self.scene);
    ov.position = new BABYLON.Vector3(
      tile.mesh.position.x,
      tile.mesh.position.y + (tile.terrain === TERRAIN.MOUNTAIN ? 0.32 : 0.13),
      tile.mesh.position.z
    );
    var mat = new BABYLON.StandardMaterial('hlmat_' + tile.row + '_' + tile.col, self.scene);
    mat.diffuseColor  = new BABYLON.Color3(p.r, p.g, p.b);
    mat.emissiveColor = new BABYLON.Color3(p.r * 0.6, p.g * 0.6, p.b * 0.6);
    mat.alpha         = p.a;
    ov.material    = mat;
    ov.isPickable  = true;
    ov.metadata    = tile.mesh.metadata;
    self._hlMeshes.push(ov);
  });
};

GameScene.prototype.clearHighlights = function () {
  this._hlMeshes.forEach(function (m) { m.dispose(); });
  this._hlMeshes = [];
};

// ─── Pointer / click handler ─────────────────────────────────────────────────

GameScene.prototype.setClickHandler = function (callback) {
  this.scene.onPointerDown = function (evt, pick) {
    if (pick.hit && pick.pickedMesh && pick.pickedMesh.metadata) {
      var meta = pick.pickedMesh.metadata;
      if (meta.row !== undefined && meta.col !== undefined) {
        callback(meta.row, meta.col);
      }
    }
  };
};

// ─── Cleanup (dispose scene on screen change) ────────────────────────────────

GameScene.prototype.dispose = function () {
  this._stopWeather();
  this.clearHighlights();
  if (this._fxaaPostProcess) {
    this._fxaaPostProcess.dispose();
    this._fxaaPostProcess = null;
  }
  if (this.engine) {
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
    this.engine = null;
    this.scene  = null;
  }
  if (this._fpsEl) {
    this._fpsEl.textContent = 'FPS: --';
    this._fpsEl = null;
  }
  if (this._frameEl) {
    this._frameEl.textContent = 'Frame: 0';
    this._frameEl = null;
  }
  this._frameCount = 0;
};

// ─── Weather effects ─────────────────────────────────────────────────────────
//
// setWeather(weatherId) starts the matching visual effect:
//   • rain  — falling blue-tinted streaks (ParticleSystem)
//   • snow  — drifting white flakes with a gentle sway (ParticleSystem + gameLoop tick)
//   • wind  — horizontal streaks that gust over time (ParticleSystem + gameLoop tick)
//   • fog   — exponential scene fog that slowly pulses in density (gameLoop tick)
//   • clear — removes any active effect
//
// _stopWeather() tears everything down cleanly and is called automatically by
// dispose() so no manual cleanup is needed on screen transitions.

GameScene.prototype.setWeather = function (weatherId) {
  this._stopWeather();
  if (!weatherId || weatherId === 'clear') return;

  var scene = this.scene;
  if (!scene) return;
  var self  = this;
  var isLow = (typeof HARDWARE_TIER !== 'undefined' && HARDWARE_TIER === 'low');

  if (weatherId === 'rain') {
    var count = isLow ? 200 : 500;
    var ps = new BABYLON.ParticleSystem('weather_rain', count, scene);
    ps.emitter    = new BABYLON.Vector3(0, 8, 0);
    ps.minEmitBox = new BABYLON.Vector3(-8, 0, -8);
    ps.maxEmitBox = new BABYLON.Vector3( 8, 0,  8);
    ps.color1     = new BABYLON.Color4(0.5, 0.7, 1.0, 0.7);
    ps.color2     = new BABYLON.Color4(0.4, 0.6, 0.9, 0.4);
    ps.minSize    = 0.03;  ps.maxSize    = 0.06;
    ps.minLifeTime = 0.5;  ps.maxLifeTime = 0.9;
    ps.emitRate   = count * 2;
    ps.direction1 = new BABYLON.Vector3(-0.5, -8, -0.5);
    ps.direction2 = new BABYLON.Vector3( 0.5, -8,  0.5);
    ps.minEmitPower = 4;   ps.maxEmitPower = 7;
    ps.updateSpeed  = 0.02;
    ps.start();
    this._weatherPs = ps;

  } else if (weatherId === 'snow') {
    var count = isLow ? 150 : 350;
    var ps = new BABYLON.ParticleSystem('weather_snow', count, scene);
    ps.emitter    = new BABYLON.Vector3(0, 8, 0);
    ps.minEmitBox = new BABYLON.Vector3(-8, 0, -8);
    ps.maxEmitBox = new BABYLON.Vector3( 8, 0,  8);
    ps.color1     = new BABYLON.Color4(1.0, 1.0, 1.0, 0.9);
    ps.color2     = new BABYLON.Color4(0.85, 0.9, 1.0, 0.5);
    ps.minSize    = 0.05;  ps.maxSize    = 0.14;
    ps.minLifeTime = 1.5;  ps.maxLifeTime = 3.0;
    ps.emitRate   = 80;
    ps.direction1 = new BABYLON.Vector3(-0.3, -1, -0.3);
    ps.direction2 = new BABYLON.Vector3( 0.3, -1,  0.3);
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.2;
    ps.updateSpeed  = 0.02;
    ps.start();
    this._weatherPs = ps;
    // Slowly sway snow sideways so it feels like real drifting flakes.
    this._weatherTickFn = function (dt) {
      if (!self._weatherPs) return;
      self._weatherTime += dt;
      var sway = Math.sin(self._weatherTime * 0.4) * 0.4;
      self._weatherPs.direction1 = new BABYLON.Vector3(-0.3 + sway, -1, -0.3);
      self._weatherPs.direction2 = new BABYLON.Vector3( 0.3 + sway, -1,  0.3);
    };
    if (typeof gameLoop !== 'undefined') gameLoop.register(this._weatherTickFn);

  } else if (weatherId === 'wind') {
    var count = isLow ? 100 : 250;
    var ps = new BABYLON.ParticleSystem('weather_wind', count, scene);
    ps.emitter    = new BABYLON.Vector3(-8, 1.5, 0);
    ps.minEmitBox = new BABYLON.Vector3(0, -1, -8);
    ps.maxEmitBox = new BABYLON.Vector3(0,  2,  8);
    ps.color1     = new BABYLON.Color4(0.85, 0.9, 1.0, 0.5);
    ps.color2     = new BABYLON.Color4(1.0,  1.0, 1.0, 0.1);
    ps.minSize    = 0.02;  ps.maxSize    = 0.05;
    ps.minLifeTime = 0.4;  ps.maxLifeTime = 0.9;
    ps.emitRate   = 200;
    ps.direction1 = new BABYLON.Vector3(6, 0.1, -0.2);
    ps.direction2 = new BABYLON.Vector3(9, 0.3,  0.2);
    ps.minEmitPower = 5;   ps.maxEmitPower = 9;
    ps.updateSpeed  = 0.02;
    ps.start();
    this._weatherPs = ps;
    // Simulate gusts: periodically ramp power up and down.
    this._weatherTickFn = function (dt) {
      if (!self._weatherPs) return;
      self._weatherTime += dt;
      var gust = 1.0 + 0.5 * Math.sin(self._weatherTime * 1.2);
      self._weatherPs.minEmitPower = 5 * gust;
      self._weatherPs.maxEmitPower = 9 * gust;
    };
    if (typeof gameLoop !== 'undefined') gameLoop.register(this._weatherTickFn);

  } else if (weatherId === 'fog') {
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.07;
    scene.fogColor   = new BABYLON.Color3(0.6, 0.65, 0.75);
    this._fogActive  = true;
    // Slowly pulse fog density to give a living, rolling-mist appearance.
    this._weatherTickFn = function (dt) {
      if (!self._fogActive || !self.scene) return;
      self._weatherTime += dt;
      self.scene.fogDensity = 0.06 + 0.02 * Math.sin(self._weatherTime * 0.5);
    };
    if (typeof gameLoop !== 'undefined') gameLoop.register(this._weatherTickFn);
  }
};

GameScene.prototype._stopWeather = function () {
  if (this._weatherTickFn) {
    if (typeof gameLoop !== 'undefined') gameLoop.unregister(this._weatherTickFn);
    this._weatherTickFn = null;
  }
  if (this._weatherPs) {
    this._weatherPs.stop();
    this._weatherPs.dispose();
    this._weatherPs = null;
  }
  if (this._fogActive && this.scene) {
    this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
    this._fogActive = false;
  }
  this._weatherTime = 0;
};

// ─── Character creator preview scene ─────────────────────────────────────────
// A lightweight Babylon.js scene rendered onto a small canvas inside the
// character-creation wizard.  Shows the selected class OBJ model spinning in
// place; the colour updates in real-time as the player picks body colours.
// Created lazily when a class is first selected; disposed when the wizard exits.

function CharacterPreviewScene() {
  this.engine          = null;
  this.scene           = null;
  this._camera         = null;
  this._model          = null;
  this._fallback       = null;
  this._rotObs         = null;
  this._pendingClassId = null;
}

/** Initialise Babylon on the given canvas.  Returns true on success. */
CharacterPreviewScene.prototype.init = function (canvasId) {
  if (typeof BABYLON === 'undefined') return false;
  var canvas = document.getElementById(canvasId);
  if (!canvas) return false;
  try {
    this.engine = new BABYLON.Engine(canvas, true, {}, true);
    this.scene  = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.08, 0.10, 0.22, 1);

    this._camera = new BABYLON.ArcRotateCamera(
      'prevCam', -Math.PI / 2, Math.PI / 3.2, 2.8,
      new BABYLON.Vector3(0, 0.4, 0), this.scene
    );
    this._camera.attachControl(canvas, true);

    var dir  = new BABYLON.DirectionalLight('pDir', new BABYLON.Vector3(-1, -2, -1), this.scene);
    dir.intensity = 1.2;
    dir.diffuse   = new BABYLON.Color3(1, 0.95, 0.8);
    var hemi = new BABYLON.HemisphericLight('pHemi', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemi.intensity   = 0.55;
    hemi.diffuse     = new BABYLON.Color3(0.5, 0.6, 1.0);
    hemi.groundColor = new BABYLON.Color3(0.15, 0.08, 0.2);

    var cam  = this._camera;
    this._rotObs = this.scene.onBeforeRenderObservable.add(function () {
      cam.alpha += 0.015;
    });

    var self = this;
    this.engine.runRenderLoop(function () { if (self.scene) self.scene.render(); });
    return true;
  } catch (e) {
    return false;
  }
};

/** Load (or reload) the glTF/OBJ model for classId with the given colour and gender. */
CharacterPreviewScene.prototype.loadModel = function (classId, colorId, raceId, gender) {
  if (!this.scene) return;
  var self = this;
  this._pendingClassId = classId;

  if (this._model)    { this._model.dispose();    this._model    = null; }
  if (this._fallback) { this._fallback.dispose(); this._fallback = null; }

  var col = _resolvePreviewColor(colorId, raceId);

  // Procedural fallback shown immediately while the model loads (or if unavailable)
  var fb    = BABYLON.MeshBuilder.CreateCylinder('pfb', {
    height: 0.8, diameter: 0.5, tessellation: 12
  }, this.scene);
  fb.position = BABYLON.Vector3.Zero();
  var fbMat = new BABYLON.PBRMaterial('pfbmat', this.scene);
  fbMat.albedoColor = new BABYLON.Color3(col.r, col.g, col.b);
  fbMat.metallic    = 0.35;
  fbMat.roughness   = 0.60;
  fb.material = fbMat;
  this._fallback = fb;

  var genderKey = (gender === 'female') ? 'female' : 'male';
  var genderMap = CHARACTER_MODEL_FILES[genderKey] || CHARACTER_MODEL_FILES.male;
  var fileName  = genderMap[classId];
  if (!fileName || !BABYLON.SceneLoader) return;

  var isGltf    = fileName.indexOf('.gltf') !== -1 || fileName.indexOf('.glb') !== -1;
  // glTF must always load directly from the server (external .bin + textures)
  var useBlob   = !isGltf && typeof AssetCache !== 'undefined' && AssetCache.hasCached('models/character/' + fileName);
  var rootUrl   = useBlob ? ''                    : 'models/character/';
  var srcFile   = useBlob ? AssetCache.getCachedUrl('models/character/' + fileName) : fileName;
  var pluginExt = useBlob ? '.obj'                : null;

  BABYLON.SceneLoader.ImportMesh('', rootUrl, srcFile, self.scene,
    function (meshes) {
      if (!meshes || !meshes.length || !self.scene) return;
      // Discard if the class was changed while loading
      if (self._pendingClassId !== classId) {
        meshes.forEach(function (m) { m.dispose(); });
        return;
      }
      if (self._fallback) { self._fallback.dispose(); self._fallback = null; }

      // For glTF, use the first root mesh with geometry; for OBJ, merge sub-meshes.
      var model;
      if (isGltf) {
        // glTF imports as a hierarchy; find the first real mesh
        model = meshes[0];
        for (var mi = 0; mi < meshes.length; mi++) {
          if (meshes[mi].getTotalVertices && meshes[mi].getTotalVertices() > 0) {
            model = meshes[mi]; break;
          }
        }
      } else {
        model = meshes.length === 1
          ? meshes[0]
          : BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
      }
      if (!model) return;

      model.position = BABYLON.Vector3.Zero();
      model.scaling  = new BABYLON.Vector3(
        CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE
      );

      // glTF models keep their texture materials; OBJ models get solid PBR colour.
      if (!isGltf) {
        var mat = new BABYLON.PBRMaterial('prevpbr_' + classId, self.scene);
        mat.albedoColor = new BABYLON.Color3(col.r, col.g, col.b);
        mat.metallic    = CHARACTER_PBR_METALLIC;
        mat.roughness   = CHARACTER_PBR_ROUGHNESS;
        model.material  = mat;
      }

      // Apply idle bone animations to the preview skeleton so it doesn't
      // display as a static T-pose.
      if (isGltf && model.skeleton) {
        _applyPreviewIdleAnim(model.skeleton, self.scene);
      }

      self._model = model;
    },
    null,
    function () { /* model absent — keep procedural fallback */ },
    pluginExt
  );
};

/** Update the model/fallback colour without reloading the mesh. */
CharacterPreviewScene.prototype.applyColor = function (colorId, raceId) {
  var col  = _resolvePreviewColor(colorId, raceId);
  var mesh = this._model || this._fallback;
  if (mesh && mesh.material) {
    mesh.material.albedoColor = new BABYLON.Color3(col.r, col.g, col.b);
  }
};

/** Capture the current frame as a PNG data-URL (used as character portrait). */
CharacterPreviewScene.prototype.capturePortrait = function () {
  if (!this.engine) return null;
  try {
    if (this.scene) this.scene.render();
    return this.engine.getRenderingCanvas().toDataURL('image/png');
  } catch (e) { return null; }
};

/** Tear down the preview scene and free all GPU resources. */
CharacterPreviewScene.prototype.dispose = function () {
  if (this.scene && this._rotObs) {
    this.scene.onBeforeRenderObservable.remove(this._rotObs);
    this._rotObs = null;
  }
  if (this._camera) {
    try { this._camera.detachControl(); } catch (e) {}
    this._camera = null;
  }
  if (this.engine) {
    this.engine.stopRenderLoop();
    if (this.scene) this.scene.dispose();
    this.engine.dispose();
    this.engine = null;
    this.scene  = null;
  }
  this._model          = null;
  this._fallback       = null;
  this._pendingClassId = null;
};

/**
 * Apply looping idle bone animations to a skeleton in the preview scene.
 * This breaks the static T-pose by adding gentle spine breathing and arm sway.
 */
function _applyPreviewIdleAnim(skeleton, scene) {
  if (!skeleton || !scene) { return; }
  var ease = new BABYLON.SineEase();
  ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

  var boneAnims = [
    { name: 'spine_02',   prop: 'rotation.x', amp:  0.04, speed: 0.45 },
    { name: 'clavicle_l', prop: 'rotation.z', amp: -0.06, speed: 0.45 },
    { name: 'clavicle_r', prop: 'rotation.z', amp:  0.06, speed: 0.45 },
    { name: 'upperarm_l', prop: 'rotation.x', amp:  0.10, speed: 0.32 },
    { name: 'upperarm_r', prop: 'rotation.x', amp:  0.10, speed: 0.32 }
  ];

  boneAnims.forEach(function (cfg) {
    var idx = skeleton.getBoneIndexByName(cfg.name);
    if (idx < 0) { return; }
    var bone = skeleton.bones[idx];
    var anim = new BABYLON.Animation(
      'prevIdle_' + cfg.name, cfg.prop, 60,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setEasingFunction(ease);
    anim.setKeys([
      { frame: 0,  value: 0        },
      { frame: 30, value: cfg.amp  },
      { frame: 60, value: 0        }
    ]);
    bone.animations = (bone.animations || []).concat([anim]);
    scene.beginAnimation(bone, 0, 60, true, cfg.speed);
  });
}

/** Resolve a display colour from colorId (BODY_COLORS) then raceId (RACES). */
function _resolvePreviewColor(colorId, raceId) {
  if (colorId && colorId !== 'default') {
    for (var i = 0; i < BODY_COLORS.length; i++) {
      var bc = BODY_COLORS[i];
      if (bc.id === colorId && bc.r !== null) {
        return { r: bc.r, g: bc.g, b: bc.b };
      }
    }
  }
  if (raceId && RACES[raceId]) {
    var rc = RACES[raceId];
    return { r: rc.mr, g: rc.mg, b: rc.mb };
  }
  return { r: 0.80, g: 0.70, b: 0.50 };
}
