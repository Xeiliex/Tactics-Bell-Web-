# Terrain 3D Models

This directory holds the OBJ terrain tile models from the
**Modular Terrain Collections** pack (CC-BY 3.0):

> https://opengameart.org/sites/default/files/modular_terrain_collections.zip

## Setup

1. Download and unzip `modular_terrain_collections.zip` from the link above.
2. Pick one representative OBJ tile from the pack for each terrain type and copy
   it into this directory with the filename listed below.  The `.mtl` material
   file that accompanies the OBJ (usually the same base name) should also be
   copied alongside it.

| Game terrain | Expected filename          | Suggested source in the zip         |
|-------------|---------------------------|-------------------------------------|
| Grass       | `terrain-grass.obj`       | `Hilly/` — any flat grassy tile     |
| Forest      | `terrain-forest.obj`      | `Hilly/` — a tile with trees        |
| Water       | `terrain-water.obj`       | `Beach/` — a water or shoreline tile|
| Mountain    | `terrain-mountain.obj`    | `Cliff/` — a rocky cliff tile       |
| Road        | `terrain-road.obj`        | `Hilly/` — a dirt path / road tile  |

> **Lava** and **Crystal** tiles have no equivalent in the pack and will continue
> to use their procedural coloured geometry.

## Scale

The loader sets `TERRAIN_MODEL_SCALE = 1.0` in `public/js/scene.js`.  If the
loaded tiles appear too large or too small, adjust that constant to match the
actual units used in the OBJ files.  A value of `1.0` assumes each model tile
is roughly 1 unit wide; the game grid cell is ~1.15 units wide.

## Fallback

If any model file is absent the tile simply keeps its original coloured box
appearance — the rest of the game is unaffected.
