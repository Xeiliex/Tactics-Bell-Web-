/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME SCENE — Babylon.js + Oimo.js
// ═══════════════════════════════════════

var TILE_STEP = 1.15;   // world-space units per grid cell

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
  Lava:     { metallic: 0.0,  roughness: 0.88,
              emissiveR: 0.8,  emissiveG: 0.12, emissiveB: 0.0, emissiveIntensity: 2.0 },
  Crystal:  { metallic: 0.25, roughness: 0.05, alpha: 0.85,
              emissiveR: 0.18, emissiveG: 0.06, emissiveB: 0.28, emissiveIntensity: 0.5 }
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
  this._hlMeshes      = [];   // highlight overlays
  this._gridSize      = GRID_SIZE;
  this._frameCount    = 0;    // debug frame counter
  this._fpsEl         = null; // #debug-fps-rate DOM element
  this._frameEl       = null; // #debug-fps-frame DOM element
  this._shadowGenerator = null; // ShadowGenerator for directional light
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
};

// ─── Terrain model loading ────────────────────────────────────────────────────
// Tries to load an OBJ from public/models/terrain/ for each configured terrain
// type.  On success the procedural box for every matching tile is replaced with
// a scaled clone of the loaded mesh.  On failure (file missing, loader absent)
// the box is silently kept, so the game always remains playable.

GameScene.prototype._upgradeToModels = function (grid) {
  if (!BABYLON.SceneLoader || typeof BABYLON.SceneLoader.ImportMesh !== 'function') return;

  var self = this;

  Object.keys(TERRAIN_MODEL_FILES).forEach(function (terrainName) {
    var fileName = TERRAIN_MODEL_FILES[terrainName];

    BABYLON.SceneLoader.ImportMesh(
      '',                      // import all meshes
      'models/terrain/',       // root URL (relative to index.html)
      fileName,                // OBJ filename
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
      }
    );
  });
};

// ─── Unit meshes ─────────────────────────────────────────────────────────────

GameScene.prototype.spawnUnit = function (unit) {
  var pos  = this.gridToWorld(unit.gridRow, unit.gridCol);
  var c    = unit.meshColor();
  var bodyColor = new BABYLON.Color3(c.r, c.g, c.b);

  // Body (cylinder)
  var body = BABYLON.MeshBuilder.CreateCylinder('body_' + unit.id, {
    height: 0.6, diameter: 0.45, tessellation: 8
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
    diameter: 0.28, segments: 6
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
  glow.rotation.x = Math.PI / 2;
  var gMat = new BABYLON.StandardMaterial('gmat_' + unit.id, this.scene);
  gMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.1);
  gMat.alpha = 0;
  glow.material = gMat;
  glow.isPickable = false;

  this._unitNodes[unit.id] = { body: body, head: head, glow: glow };
};

GameScene.prototype.setUnitGlow = function (unit, visible) {
  var node = this._unitNodes[unit.id];
  if (!node) return;
  node.glow.material.alpha = visible ? 0.9 : 0;
};

// Teleport unit mesh to grid position (no animation)
GameScene.prototype.snapUnit = function (unit) {
  var node = this._unitNodes[unit.id];
  if (!node) return;
  var pos = this.gridToWorld(unit.gridRow, unit.gridCol);
  node.body.position.x = pos.x;
  node.body.position.z = pos.z;
  node.head.position.x = pos.x;
  node.head.position.z = pos.z;
  node.glow.position.x = pos.x;
  node.glow.position.z = pos.z;
};

// Animate unit to new grid position, call onDone when finished
GameScene.prototype.moveUnit = function (unit, onDone) {
  var node = this._unitNodes[unit.id];
  if (!node) { if (onDone) onDone(); return; }

  var pos    = this.gridToWorld(unit.gridRow, unit.gridCol);
  var frames = 20;
  var scene  = this.scene;

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

  var animGlow = new BABYLON.Animation(
    'moveGlow_' + unit.id, 'position', 60,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  animGlow.setKeys([
    { frame: 0,      value: node.glow.position.clone() },
    { frame: frames, value: new BABYLON.Vector3(pos.x, 0.03, pos.z) }
  ]);

  var ease = new BABYLON.CubicEaseInOut();
  [animBody, animHead, animGlow].forEach(function (a) { a.setEasingFunction(ease); });

  node.body.animations = [animBody];
  node.head.animations = [animHead];
  node.glow.animations = [animGlow];

  var anim = scene.beginAnimation(node.body, 0, frames, false, 1, function () {
    if (onDone) onDone();
  });
  scene.beginAnimation(node.head, 0, frames, false, 1);
  scene.beginAnimation(node.glow, 0, frames, false, 1);
};

// Hit flash + particle burst
GameScene.prototype.playHitEffect = function (unit, skillType, onDone) {
  var node = this._unitNodes[unit.id];
  if (!node) { if (onDone) onDone(); return; }

  var origDiff = node.body.material.albedoColor.clone();
  var origEmit = node.body.material.emissiveColor.clone();

  node.body.material.albedoColor  = new BABYLON.Color3(1, 1, 1);
  node.body.material.emissiveColor = new BABYLON.Color3(0.9, 0.2, 0.2);

  // Particle burst
  this._spawnHitParticles(unit, skillType);

  var mat = node.body.material;
  setTimeout(function () {
    mat.albedoColor   = origDiff;
    mat.emissiveColor = origEmit;
    if (onDone) onDone();
  }, 350);
};

GameScene.prototype._spawnHitParticles = function (unit, skillType) {
  var pos   = this.gridToWorld(unit.gridRow, unit.gridCol);
  var scene = this.scene;

  var particleCount = (typeof HARDWARE_TIER !== 'undefined' && HARDWARE_TIER === 'low') ? 16 : 40;
  var ps = new BABYLON.ParticleSystem('hit_' + unit.id + '_' + Date.now(), particleCount, scene);
  ps.emitter    = new BABYLON.Vector3(pos.x, 0.5, pos.z);
  ps.minEmitBox = new BABYLON.Vector3(-0.15, 0, -0.15);
  ps.maxEmitBox = new BABYLON.Vector3(0.15, 0.2, 0.15);

  if (skillType === 'magic') {
    ps.color1 = new BABYLON.Color4(0.5, 0.1, 1.0, 1);
    ps.color2 = new BABYLON.Color4(1.0, 0.5, 1.0, 0.4);
  } else if (skillType === 'heal') {
    ps.color1 = new BABYLON.Color4(0.2, 1.0, 0.4, 1);
    ps.color2 = new BABYLON.Color4(0.6, 1.0, 0.6, 0.4);
  } else {
    ps.color1 = new BABYLON.Color4(1.0, 0.6, 0.0, 1);
    ps.color2 = new BABYLON.Color4(1.0, 1.0, 0.0, 0.4);
  }
  ps.minSize      = 0.05;
  ps.maxSize      = 0.22;
  ps.minLifeTime  = 0.2;
  ps.maxLifeTime  = 0.55;
  ps.emitRate     = 120;
  ps.direction1   = new BABYLON.Vector3(-1.5, 3, -1.5);
  ps.direction2   = new BABYLON.Vector3(1.5, 5, 1.5);
  ps.minEmitPower = 1;
  ps.maxEmitPower = 3;
  ps.updateSpeed  = 0.02;

  ps.start();
  setTimeout(function () { ps.stop(); }, 250);
  setTimeout(function () { ps.dispose(); }, 1200);
};

// Oimo physics ragdoll death
GameScene.prototype.removeUnit = function (unit) {
  var node = this._unitNodes[unit.id];
  if (!node) return;

  // Try to add physics impulse if available
  try {
    node.body.physicsImpostor = new BABYLON.PhysicsImpostor(
      node.body, BABYLON.PhysicsImpostor.CylinderImpostor,
      { mass: 1, restitution: 0.3, friction: 0.6 }, this.scene
    );
    node.body.physicsImpostor.applyImpulse(
      new BABYLON.Vector3(
        (Math.random() - 0.5) * 3,
        2.5 + Math.random(),
        (Math.random() - 0.5) * 3
      ),
      node.body.getAbsolutePosition()
    );
  } catch (e) {
    // Physics not enabled; just fade out
  }

  var body = node.body;
  var head = node.head;
  var glow = node.glow;
  setTimeout(function () {
    if (body) body.dispose();
    if (head) head.dispose();
    if (glow) glow.dispose();
  }, 1600);
  delete this._unitNodes[unit.id];
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
  this.clearHighlights();
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
