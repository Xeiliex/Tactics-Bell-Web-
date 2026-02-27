# Character 3D Models

This directory contains handcrafted OBJ character models for Tactics Bell.
Each class has a distinctive geometric shape that replaces the procedural
cylinder + sphere fallback at runtime.

| Game class | OBJ file                  | MTL file                  | Shape                              |
|------------|---------------------------|---------------------------|------------------------------------|
| Warrior    | `character-warrior.obj`   | `character-warrior.mtl`   | Wide armoured body + boxy helmet   |
| Mage       | `character-mage.obj`      | `character-mage.mtl`      | Narrow robe + head + pointed hat   |
| Archer     | `character-archer.obj`    | `character-archer.mtl`    | Slim body + head + bow stave       |
| Healer     | `character-healer.obj`    | `character-healer.mtl`    | Medium body + head + tall staff    |

> The MTL diffuse colours are placeholder values only. At runtime the loader
> overrides each unit's albedo with the unit's **race colour** (`meshColor()`)
> so that race differences remain visible regardless of class.

## Coordinate convention

All models use a Y-up right-hand coordinate system:
- Character footprint: centred at X = 0, Z = 0
- Base at **Y = 0** (stands on the terrain surface)
- Geometry extends upward in +Y (tallest feature — mage hat — reaches Y ≈ 1.02)

## Scale

The loader sets `CHARACTER_MODEL_SCALE = 1.0` in `public/js/scene.js`. Adjust
that constant if you replace models with differently-sized art.

## Fallback

If any model file is absent or fails to load the unit keeps its original
procedural cylinder + sphere appearance — the rest of the game is unaffected.
