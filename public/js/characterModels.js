// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER MODEL COMPOSER
// ═══════════════════════════════════════════════════════════════════════════════
// Loads, composes, and customizes character models from modular parts.
// Supports outfit variations (Peasant/Ranger), hairstyles, skin tones, and colors.

// ─── Outfit Registry ───────────────────────────────────────────────────────────
// Maps outfit IDs to model files and color slots. Each outfit can have a base body
// and optional accessories/pauldrons.

var CHARACTER_OUTFIT_REGISTRY = {
  peasant: {
    name: 'Peasant',
    description: 'Simple civilian clothing',
    baseModel: function(gender) {
      return gender === 'female' ? 'Female_Peasant.gltf' : 'Male_Peasant.gltf';
    },
    colorSlots: {
      skinTone: { default: { r: 0.95, g: 0.82, b: 0.69 } },  // Light flesh tone
      outfitColor: { default: { r: 0.4, g: 0.3, b: 0.2 } }    // Brown cloth
    },
    accessories: []
  },
  ranger: {
    name: 'Ranger',
    description: 'Leather armor with pauldrons',
    baseModel: function(gender) {
      return gender === 'female' ? 'Female_Ranger.gltf' : 'Male_Ranger.gltf';
    },
    colorSlots: {
      skinTone: { default: { r: 0.95, g: 0.82, b: 0.69 } },
      outfitColor: { default: { r: 0.6, g: 0.5, b: 0.35 } },  // Leather tan
      armorColor: { default: { r: 0.3, g: 0.3, b: 0.3 } }     // Dark metal
    },
    accessories: ['pauldrons']  // Additional armor pieces
  }
};

// ─── Hairstyle Registry ────────────────────────────────────────────────────────
// Maps hairstyle IDs to model files. Includes both male and female variants where
// they differ.

var CHARACTER_HAIRSTYLE_REGISTRY = {
  none: {
    model: null,
    female: null,
    male: null,
    attachToHeadBone: false
  },
  long: {
    model: 'Hair_Long.gltf',
    attachToHeadBone: true,  // Pre-rigged to head bone
    colorSlot: 'hairColor'
  },
  buns: {
    model: 'Hair_Buns.gltf',
    attachToHeadBone: true,
    colorSlot: 'hairColor'
  },
  parted: {
    model: 'Hair_SimpleParted.gltf',
    attachToHeadBone: true,
    colorSlot: 'hairColor'
  },
  buzzed: {
    model: 'Hair_Buzzed.gltf',
    attachToHeadBone: true,
    colorSlot: 'hairColor'
  },
  beard: {
    model: 'Hair_Beard.gltf',
    maleOnly: true,
    attachToHeadBone: true,
    colorSlot: 'hairColor'
  }
};

// ─── Weapon Model Registry ────────────────────────────────────────────────────
// Maps class IDs to weapon types. Since we don't have weapon models in assets yet,
// we'll use procedural shapes with weapon-appropriate colors.

var CHARACTER_WEAPON_REGISTRY = {
  warrior: { type: 'sword', color: { r: 0.8, g: 0.8, b: 0.7 }, scale: 1.0 },
  knight: { type: 'sword', color: { r: 0.7, g: 0.7, b: 0.6 }, scale: 1.1 },
  paladin: { type: 'sword', color: { r: 1, g: 0.9, b: 0.2 }, scale: 1.0 },
  berserker: { type: 'axe', color: { r: 0.9, g: 0.7, b: 0.2 }, scale: 1.2 },
  warlord: { type: 'axe', color: { r: 0.6, g: 0.6, b: 0.5 }, scale: 1.3 },
  mage: { type: 'staff', color: { r: 0.7, g: 0.3, b: 1 }, scale: 1.0 },
  sorcerer: { type: 'staff', color: { r: 0.5, g: 0.2, b: 0.8 }, scale: 1.1 },
  sage: { type: 'staff', color: { r: 0.8, g: 0.6, b: 1 }, scale: 1.0 },
  archmage: { type: 'staff', color: { r: 1, g: 0.8, b: 0 }, scale: 1.2 },
  healer: { type: 'staff', color: { r: 0.2, g: 0.8, b: 0.3 }, scale: 0.9 },
  cleric: { type: 'staff', color: { r: 0.9, g: 0.9, b: 0.2 }, scale: 1.0 },
  archbishop: { type: 'staff', color: { r: 1, g: 1, b: 0.8 }, scale: 1.2 },
  oracle: { type: 'staff', color: { r: 0.5, g: 0.8, b: 1 }, scale: 1.0 },
  archer: { type: 'bow', color: { r: 0.7, g: 0.5, b: 0.2 }, scale: 1.0 },
  ranger: { type: 'bow', color: { r: 0.6, g: 0.4, b: 0.1 }, scale: 1.1 },
  rogue: { type: 'bow', color: { r: 0.3, g: 0.3, b: 0.3 }, scale: 0.9 },
  exorcist: { type: 'wand', color: { r: 1, g: 0.2, b: 0.2 }, scale: 0.8 },
  inquisitor: { type: 'wand', color: { r: 0.8, g: 0.1, b: 0.1 }, scale: 0.9 }
};

// ─── Skin Tone Presets ─────────────────────────────────────────────────────────

var SKIN_TONE_PRESETS = {
  pale: { r: 0.98, g: 0.92, b: 0.85 },
  fair: { r: 0.95, g: 0.82, b: 0.69 },      // Default
  olive: { r: 0.90, g: 0.80, b: 0.65 },
  tan: { r: 0.85, g: 0.70, b: 0.55 },
  dark: { r: 0.65, g: 0.45, b: 0.30 }
};

// ─── Outfit Color Presets ──────────────────────────────────────────────────────

var OUTFIT_COLOR_PRESETS = {
  brown: { r: 0.4, g: 0.3, b: 0.2 },
  gray: { r: 0.5, g: 0.5, b: 0.5 },
  green: { r: 0.2, g: 0.5, b: 0.2 },
  red: { r: 0.6, g: 0.2, b: 0.2 },
  blue: { r: 0.2, g: 0.4, b: 0.6 },
  purple: { r: 0.5, g: 0.2, b: 0.5 },
  black: { r: 0.1, g: 0.1, b: 0.1 },
  white: { r: 0.8, g: 0.8, b: 0.8 }
};

// ─── Hair Color Presets ───────────────────────────────────────────────────────

var HAIR_COLOR_PRESETS = {
  black: { r: 0.1, g: 0.08, b: 0.08 },
  dark_brown: { r: 0.3, g: 0.2, b: 0.1 },
  brown: { r: 0.5, g: 0.3, b: 0.15 },
  light_brown: { r: 0.7, g: 0.5, b: 0.3 },
  blonde: { r: 0.9, g: 0.8, b: 0.3 },
  red: { r: 0.8, g: 0.2, b: 0.1 },
  white: { r: 0.95, g: 0.95, b: 0.95 },
  gray: { r: 0.6, g: 0.6, b: 0.6 }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER MODEL COMPOSER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

function CharacterModelComposer(scene) {
  this.scene = scene;
  this.cache = {};  // Model cache by composition key
  this.loadedSkeletons = {};  // Cached skeletons for bone attachment
}

// ─── Main Composition Method ───────────────────────────────────────────────────

CharacterModelComposer.prototype.composeCharacter = function(config) {
  // config = {
  //   gender: 'male'|'female',
  //   classId: 'warrior'|'mage'|...,
  //   outfitId: 'peasant'|'ranger',
  //   hairStyle: 'none'|'long'|'buns'|...,
  //   skinTone: color object or preset name,
  //   outfitColor: color object or preset name,
  //   hairColor: color object or preset name,
  //   scale: 1.0
  // }

  var self = this;
  
  // Normalize color inputs (allow string preset names or color objects)
  var skinColor = this._normalizeColor(config.skinTone) || SKIN_TONE_PRESETS.fair;
  var outfitColor = this._normalizeColor(config.outfitColor) || OUTFIT_COLOR_PRESETS.brown;
  var hairColor = this._normalizeColor(config.hairColor) || HAIR_COLOR_PRESETS.dark_brown;

  // Create composition key for caching
  var cacheKey = [
    config.gender,
    config.outfitId || 'peasant',
    this._colorToHex(skinColor),
    this._colorToHex(outfitColor)
  ].join('_');

  // Check cache first
  if (this.cache[cacheKey]) {
    var cached = this.cache[cacheKey].clone(cacheKey + '_instance_' + Math.random());
    return {
      root: cached,
      skeleton: this.cache[cacheKey].skeleton || null,
      promise: Promise.resolve({ root: cached })
    };
  }

  // Load base outfit model
  var outfit = CHARACTER_OUTFIT_REGISTRY[config.outfitId || 'peasant'];
  if (!outfit) outfit = CHARACTER_OUTFIT_REGISTRY.peasant;

  var modelFile = outfit.baseModel(config.gender);
  var promise = this._loadOutfitModel(modelFile, outfit, skinColor, outfitColor)
    .then(function(root) {
      // Cache the loaded model
      self.cache[cacheKey] = root;

      // Attach hairstyle
      if (config.hairStyle && config.hairStyle !== 'none') {
        return self._attachHairstyle(root, config.hairStyle, config.gender, hairColor);
      }
      return root;
    })
    .then(function(root) {
      // Attach weapon
      if (config.classId) {
        return self._attachWeapon(root, config.classId);
      }
      return root;
    })
    .catch(function(err) {
      console.error('🎨 [MODEL COMPOSER] Error composing character:', err);
      return null;
    });

  return {
    root: null,  // Will be populated after promise resolves
    skeleton: null,
    promise: promise
  };
};

// ─── Outfit Model Loading ──────────────────────────────────────────────────────

CharacterModelComposer.prototype._loadOutfitModel = function(modelFile, outfit, skinColor, outfitColor) {
  var self = this;
  // Models are served from public/models/character/
  var rootUrl = 'models/character/';

  return new Promise(function(resolve, reject) {
    if (!BABYLON.SceneLoader || !BABYLON.SceneLoader.ImportMesh) {
      reject(new Error('BABYLON.SceneLoader not available'));
      return;
    }

    BABYLON.SceneLoader.ImportMesh(
      '',
      rootUrl,
      modelFile,
      self.scene,
      function(meshes) {
        if (!meshes || !meshes.length) {
          reject(new Error('No meshes loaded from ' + modelFile));
          return;
        }

        // Get root node or create one
        var root = new BABYLON.TransformNode('char_' + modelFile, self.scene);
        var skeleton = null;

        // Reparent meshes and apply materials
        meshes.forEach(function(mesh, i) {
          if (mesh.skeleton) { skeleton = mesh.skeleton; }
          mesh.parent = root;

          // Apply outfit materials
          if (mesh.material && mesh.material.name) {
            var matName = mesh.material.name.toLowerCase();
            var color = matName.includes('skin') ? skinColor : outfitColor;
            self._applyMaterial(mesh, color);
          }
        });

        root.skeleton = skeleton;
        resolve(root);
      },
      null,
      function(scene, msg, exception) {
        reject(new Error('Failed to load outfit ' + modelFile + ': ' + msg));
      }
    );
  });
};

// ─── Hairstyle Attachment ─────────────────────────────────────────────────────

CharacterModelComposer.prototype._attachHairstyle = function(characterRoot, hairStyleId, gender, hairColor) {
  var self = this;
  var hairstyle = CHARACTER_HAIRSTYLE_REGISTRY[hairStyleId];
  if (!hairstyle || !hairstyle.model) {
    return Promise.resolve(characterRoot);
  }

  // Skip styles that are gender-specific and don't match
  if (hairstyle.maleOnly && gender !== 'male') {
    return Promise.resolve(characterRoot);
  }

  // TODO: Hairstyles not yet copied to public directory
  // For now, skip hairstyle loading - base models are sufficient
  console.log('🎨 [COMPOSER] Hairstyle loading disabled (files not in public directory) - using base hair');
  return Promise.resolve(characterRoot);

  /* Disabled pending hairstyle asset deployment
  var modelFile = hairstyle.model;
  var rootUrl = 'models/character/hairstyles/';

  return new Promise(function(resolve, reject) {
    BABYLON.SceneLoader.ImportMesh(
      '',
      rootUrl,
      modelFile,
      self.scene,
      function(meshes) {
        if (!meshes || !meshes.length) {
          resolve(characterRoot);
          return;
        }

        var hairRoot = new BABYLON.TransformNode('hair_' + hairStyleId, self.scene);
        hairRoot.parent = characterRoot;

        meshes.forEach(function(mesh) {
          mesh.parent = hairRoot;
          self._applyMaterial(mesh, hairColor);
        });

        // If hairstyle is pre-rigged to head bone, find and attach to it
        if (hairstyle.attachToHeadBone && characterRoot.skeleton) {
          var headBone = characterRoot.skeleton.bones.find(function(b) {
            return b.name.toLowerCase().includes('head');
          });
          if (headBone) {
            hairRoot.attachToBone(headBone, characterRoot);
          }
        }

        resolve(characterRoot);
      },
      null,
      function(scene, msg, exception) {
        console.warn('Failed to load hairstyle:', hairStyleId, msg);
        resolve(characterRoot);  // Continue without hair
      }
    );
  });
  */
};

// ─── Weapon Attachment ────────────────────────────────────────────────────────
// Currently creates procedural weapons. If .gltf weapon models become available,
// this can be extended to load them instead.

CharacterModelComposer.prototype._attachWeapon = function(characterRoot, classId) {
  var weaponInfo = CHARACTER_WEAPON_REGISTRY[classId];
  if (!weaponInfo) {
    return Promise.resolve(characterRoot);
  }

  // Create procedural weapon based on type
  var weapon = this._createProceduralWeapon(weaponInfo.type, weaponInfo.color, weaponInfo.scale);
  if (!weapon) {
    return Promise.resolve(characterRoot);
  }

  weapon.parent = characterRoot;

  // Try to attach to hand bone if skeleton available
  if (characterRoot.skeleton) {
    var rightHandBone = characterRoot.skeleton.bones.find(function(b) {
      var name = b.name.toLowerCase();
      return name.includes('hand') && (name.includes('right') || name.includes('r_'));
    });
    
    if (rightHandBone) {
      weapon.attachToBone(rightHandBone, characterRoot);
      weapon.position = new BABYLON.Vector3(0.1, 0, 0);  // Offset from hand
    }
  }

  return Promise.resolve(characterRoot);
};

// ─── Procedural Weapon Creation ────────────────────────────────────────────────

CharacterModelComposer.prototype._createProceduralWeapon = function(type, color, scale) {
  scale = scale || 1.0;
  var c = new BABYLON.Color3(color.r, color.g, color.b);

  var weapon;

  switch (type) {
    case 'sword':
      // Blade + grip
      var blade = BABYLON.MeshBuilder.CreateBox('blade', { width: 0.3, height: 1.5, depth: 0.05 }, this.scene);
      blade.position.y = 0.7;
      var grip = BABYLON.MeshBuilder.CreateCylinder('grip', { diameter: 0.15, height: 0.4 }, this.scene);
      grip.position.y = -0.1;
      weapon = BABYLON.Mesh.MergeMeshes([blade, grip]);
      break;

    case 'axe':
      // Blade + shaft
      var axeHead = BABYLON.MeshBuilder.CreateBox('axehead', { width: 0.5, height: 0.8, depth: 0.1 }, this.scene);
      axeHead.position.y = 0.8;
      var shaft = BABYLON.MeshBuilder.CreateCylinder('shaft', { diameter: 0.08, height: 1.2 }, this.scene);
      weapon = BABYLON.Mesh.MergeMeshes([axeHead, shaft]);
      break;

    case 'staff':
      // Orb + shaft
      var orb = BABYLON.MeshBuilder.CreateSphere('orb', { diameter: 0.4 }, this.scene);
      orb.position.y = 1.3;
      var shaft2 = BABYLON.MeshBuilder.CreateCylinder('shaft2', { diameter: 0.05, height: 1.3 }, this.scene);
      weapon = BABYLON.Mesh.MergeMeshes([orb, shaft2]);
      break;

    case 'bow':
      // Bow shape with string
      var bowArch = BABYLON.MeshBuilder.CreateTorus('arch', { diameter: 0.6, thickness: 0.05 }, this.scene);
      bowArch.rotation.z = Math.PI / 2;
      weapon = bowArch;
      break;

    case 'wand':
      // Thin stick with glow
      weapon = BABYLON.MeshBuilder.CreateCylinder('wand', { diameter: 0.06, height: 0.8 }, this.scene);
      break;

    default:
      return null;
  }

  if (weapon) {
    weapon.scaling = new BABYLON.Vector3(scale, scale, scale);
    var mat = new BABYLON.StandardMaterial('weaponMat_' + type, this.scene);
    mat.diffuse = c;
    mat.specularColor = new BABYLON.Color3(1, 1, 1);
    mat.specularPower = 64;
    weapon.material = mat;
  }

  return weapon;
};

// ─── Material Application ─────────────────────────────────────────────────────

CharacterModelComposer.prototype._applyMaterial = function(mesh, color) {
  if (!mesh) return;

  var mat = new BABYLON.PBRMaterial('charmat_' + mesh.name, this.scene);
  mat.albedoColor = new BABYLON.Color3(color.r, color.g, color.b);
  mat.metallic = 0.1;
  mat.roughness = 0.7;
  mesh.material = mat;
};

// ─── Color Normalization ──────────────────────────────────────────────────────

CharacterModelComposer.prototype._normalizeColor = function(colorInput) {
  if (!colorInput) return null;

  // If it's a string, look up in presets
  if (typeof colorInput === 'string') {
    return SKIN_TONE_PRESETS[colorInput] ||
           OUTFIT_COLOR_PRESETS[colorInput] ||
           HAIR_COLOR_PRESETS[colorInput] ||
           null;
  }

  // If it's already a color object, return it
  if (typeof colorInput === 'object' && colorInput.r !== undefined) {
    return colorInput;
  }

  return null;
};

// ─── Utility: Color to Hex ────────────────────────────────────────────────────

CharacterModelComposer.prototype._colorToHex = function(color) {
  if (!color) return '000000';
  var r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  var g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  var b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return r + g + b;
};
