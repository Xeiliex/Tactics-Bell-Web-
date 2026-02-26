# Tactics Bell ⚔️🔔

A light tactical turn-based battle game built for the web.

---

## ⚡ Quick Start — Run it locally after downloading

Everything you need is bundled in the repo (no internet required after cloning).

### Option A — Bun *(recommended, fastest)*

```bash
# 1. Install Bun (one-time setup) — https://bun.sh/docs/installation
curl -fsSL https://bun.sh/install | bash   # macOS / Linux
# Windows: powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Clone / download the repo
git clone https://github.com/Xeiliex/Tactics-Bell-Web-
cd Tactics-Bell-Web-

# 3. Start the server
bun server.js

# 4. Open in your browser
#    http://localhost:8080
```

### Option B — Node.js *(no extra installs needed if you already have Node ≥ 18)*

```bash
# 1. Clone / download the repo
git clone https://github.com/Xeiliex/Tactics-Bell-Web-
cd Tactics-Bell-Web-

# 2. Start the server  (no npm install needed — zero dependencies)
node server.js

# 3. Open in your browser
#    http://localhost:8080
```

### Option C — Docker *(no Node or Bun needed)*

```bash
# 1. Clone / download the repo
git clone https://github.com/Xeiliex/Tactics-Bell-Web-
cd Tactics-Bell-Web-

# 2. Build and run
docker build -t tactics-bell .
docker run -p 8080:8080 tactics-bell

# 3. Open in your browser
#    http://localhost:8080
```

> **Works offline?** Yes. Babylon.js, Oimo.js, and anime.js are vendored inside
> `public/vendor/` and served from the local server — no CDN calls at runtime.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime / server | **[Bun](https://bun.sh)** ≥ 1.1 *or* **Node.js** ≥ 18 |
| 3D rendering | **Babylon.js** 7 (vendored in `public/vendor/`) |
| Physics (death FX) | **Oimo.js** 1.0.9 (vendored in `public/vendor/`) |
| UI animations | **anime.js** 3.2.1 (vendored in `public/vendor/`) |
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

## Development (hot-reload)

```bash
bun --watch server.js      # auto-reloads on file changes (Bun)
# -- or --
node server.js             # standard Node, restart manually
```

Change `PORT` via environment variable:

```bash
PORT=3000 bun server.js
PORT=3000 node server.js
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

