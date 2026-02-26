# Tactics Bell ⚔️🔔

A light tactical turn-based battle game built for the web.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime / server | **[Bun](https://bun.sh)** ≥ 1.1 |
| 3D rendering | **Babylon.js** (CDN) |
| Physics (death FX) | **Oimo.js** via Babylon plugin (CDN) |
| UI animations | **anime.js** 3.2 (CDN) |
| Deployment | GCP Cloud Run / Azure Container Apps (Docker) |

## Features

- Procedurally generated battle stages (terrain clusters: grass, forest, water, mountain, lava, crystal)
- 4 playable **races** — Human, Elf, Dwarf, Beastkin — each with unique stat bonuses
- 4 **classes** — Warrior, Mage, Archer, Healer — with 2 skills each
- Turn-based tactical combat on a 10 × 10 grid
- BFS movement range & line-of-range targeting
- EXP and levelling system (scales with stage difficulty)
- Enemy AI that moves toward the nearest ally and attacks
- Oimo.js ragdoll physics on unit defeat
- anime.js animated UI: damage numbers, HP bars, level-up, screen transitions

## Development

```bash
# Requires Bun ≥ 1.1  https://bun.sh/docs/installation
bun install      # no runtime dependencies — just creates bun.lockb
bun run dev      # hot-reload server on http://localhost:8080
```

## Production

```bash
bun run start    # production server on $PORT (default 8080)
```

## Cloud Deployment

### GCP Cloud Run (recommended)
```bash
gcloud run deploy tactics-bell \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### GCP App Engine Flex
```bash
gcloud app deploy app.yaml
```

### Azure Container Apps
```bash
az containerapp up \
  --name tactics-bell \
  --source . \
  --ingress external --target-port 8080
```

### Docker (local / any platform)
```bash
docker build -t tactics-bell .
docker run -p 8080:8080 tactics-bell
```

