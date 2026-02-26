# Terrain 3D Models

This directory contains handcrafted OBJ terrain tile models for Tactics Bell.
Each terrain type has a distinctive geometric shape that replaces the procedural
coloured-box fallback at runtime.

| Game terrain | OBJ file               | MTL file               | Shape                          |
|--------------|------------------------|------------------------|--------------------------------|
| Grass        | `terrain-grass.obj`    | `terrain-grass.mtl`    | Flat slab 1.0×0.14×1.0         |
| Forest       | `terrain-forest.obj`   | `terrain-forest.mtl`   | Flat slab + 4 corner tree pyramids |
| Water        | `terrain-water.obj`    | `terrain-water.mtl`    | Thin flat slab 1.0×0.04×1.0    |
| Mountain     | `terrain-mountain.obj` | `terrain-mountain.mtl` | Square pyramid 1.0×0.6 tall    |
| Road         | `terrain-road.obj`     | `terrain-road.mtl`     | Flat slab + raised kerb strips |

> **Lava** and **Crystal** tiles have no OBJ equivalent and continue to use
> their procedural coloured geometry.

## Coordinate convention

All models use a Y-up right-hand coordinate system:
- Tile footprint: **−0.5 to +0.5 in X and Z** (fits a ~1.07 unit game cell)
- Base at **Y = 0**; geometry extends upward in +Y

## Scale

The loader sets `TERRAIN_MODEL_SCALE = 1.0` in `public/js/scene.js`.  Each
model tile is 1 unit wide, matching the assumption.  Adjust that constant if
you replace models with different-sized art.

## Fallback

If any model file is absent the tile simply keeps its original coloured box
appearance — the rest of the game is unaffected.
