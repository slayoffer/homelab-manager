# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Full-stack web app for managing a self-hosted AzerothCore WotLK server and other homelab services. React 19 + Vite + shadcn/ui frontend, Express.js + WebSocket backend, deployed as a Docker container on `slayo` server (192.168.1.99).

**Live at**: `http://192.168.1.99:3456` (or `http://slayo:3456`)

## Architecture

Workspace-based modular system. Each workspace manages a different part of the homelab. WoW is fully implemented; others are stubs.

```
homelab-manager/
├── server/                          # Express.js backend (ES modules)
│   ├── index.js                     # HTTP + WebSocket server, route registration
│   ├── config.js                    # Env-based config (paths, DB creds, ports)
│   ├── state.js                     # JSON file persistence (preferences, commits)
│   └── workspaces/
│       ├── base.js                  # WorkspaceBase class (id, name, icon, status, getRoutes)
│       ├── wow/
│       │   ├── index.js             # WowWorkspace: all API routes
│       │   ├── git.js               # discoverModules, fetchRepo, pullRepo, cloneModule, removeModule
│       │   ├── sql.js               # scanMigrations, applySqlFile, saveSqlPreferences
│       │   ├── docker.js            # getContainerStatus, dockerComposeAction (WebSocket streaming)
│       │   └── backup.js            # listBackups, backupDirectory/Database/Volumes, restore, prune
│       ├── docker-services/index.js # Stub
│       ├── proxmox/index.js         # Stub
│       ├── traefik/index.js         # Stub
│       └── servers/index.js         # Stub
├── src/                             # React frontend
│   ├── App.jsx                      # Sidebar + workspace router
│   ├── index.css                    # Tailwind + dark WoW theme (oklch colors, gold accents)
│   ├── components/
│   │   ├── layout/Sidebar.jsx       # Workspace nav with icons, Coming Soon badges
│   │   ├── shared/
│   │   │   ├── StatusBadge.jsx      # Color-coded status badges (running/stopped/new/optional/stub)
│   │   │   └── TerminalOutput.jsx   # Streaming log viewer with copy/clear
│   │   ├── wow/
│   │   │   ├── WowDashboard.jsx     # Main view: tabs (Status|Updates|Migrations|Modules|Backups)
│   │   │   ├── ModuleCard.jsx       # Per-repo card: branch, commit, pull button, update info
│   │   │   ├── SqlMigrations.jsx    # Migration scanner with checkboxes, persistent prefs, apply
│   │   │   └── BackupRestore.jsx    # Backup list, create/restore/prune buttons
│   │   ├── stubs/WorkspaceStub.jsx  # Placeholder for unimplemented workspaces
│   │   └── ui/                      # shadcn/ui primitives (do not edit manually)
│   └── hooks/
│       ├── useApi.js                # HTTP client: get/post/del with loading state
│       └── useWebSocket.js          # WS client: docker + backup streaming
├── Dockerfile                       # Multi-stage: node:20-slim, git + docker.io installed
├── docker-compose.yml               # Deployment config with volume mounts
└── data/state.json                  # Persistent state (created at runtime)
```

## Tech Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, shadcn/ui, Lucide icons
- **Backend**: Express 5 (ES modules), ws (WebSocket), child_process for git/docker/mysql
- **Container**: node:20-slim with git, docker.io, openssh-client, bash
- **UI theme**: Always-dark, oklch colors, gold primary (#f59e0b), slate background

## API Reference

All routes prefixed with `/api/workspaces/wow/`.

### Status & Repos
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/status` | - | `{ status, containers[], repos[] }` |
| GET | `/containers` | - | `[{ name, status, startedAt, health }]` |
| GET | `/repos` | - | `[{ id, name, path, branch, commit, commitMessage, remote }]` |
| POST | `/repos/fetch` | - | `[{ id, name, behind, ahead, newCommits[] }]` |
| POST | `/repos/pull` | - | `[{ id, name, success, output }]` |
| POST | `/repos/:repoId/pull` | - | `{ id, name, success, output }` |

### SQL Migrations
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/migrations` | - | `[{ module, migrations[] }]` — each migration has id, file, database, type, isNew, selected |
| POST | `/migrations/apply` | `{ migrations: [{ id, absolutePath, database, module }] }` | `[{ id, success, output/error }]` |
| POST | `/migrations/preferences` | `{ module, preferences }` | `{ success }` |

### Docker
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/docker/:action` | action: start/stop/rebuild/build | `{ success, output, code }` |

### Modules
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/modules/install` | `{ gitUrl, name }` | `{ success, path/error }` |
| DELETE | `/modules/:name` | - | `{ success }` |

### Backups
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/backups` | - | `[{ name, path, type, database, size, sizeHuman, modified, age }]` |
| POST | `/backups/restore` | `{ file, type }` | `{ success, error? }` |
| POST | `/backups/prune` | - | `{ deleted[], count }` |

### WebSocket (`/ws`)
Send JSON messages:
- `{ type: "docker", action: "start|stop|rebuild|build" }` — streams docker compose output
- `{ type: "backup", action: "directory|database|volumes|all" }` — streams backup progress

Response message types: `docker:start`, `docker:stdout`, `docker:stderr`, `docker:done`, `docker:error`, `backup:start`, `backup:stdout`, `backup:stderr`, `backup:done`, `backup:error`

### Global
| Method | Path | Response |
|--------|------|----------|
| GET | `/api/workspaces` | `[{ id, name, icon, status, description }]` |

## Deployment

Deployed on `slayo` at `/home/slayo/docker/homelab-manager/`.

```yaml
volumes:
  - /home/slayo/docker:/homelab/docker:ro     # All docker configs (read-only)
  - /var/run/docker.sock:/var/run/docker.sock  # Docker control
  - /home/slayo/docker/wow/azerothcore-wotlk:/wow  # WoW server (rw)
  - ./data:/data                               # State persistence
  - /opt/backups/wow:/backups                  # Backup storage
```

Environment variables: `WOW_PATH=/wow`, `WOW_COMPOSE_PATH=/wow`, `STATE_PATH=/data/state.json`, `BACKUP_DIR=/backups`, `PORT=3456`

### Deploy workflow
```bash
# From local machine:
npm run build
rsync -avz --exclude node_modules --exclude dist --exclude .git --exclude data . slayo:/home/slayo/docker/homelab-manager/
ssh slayo "cd /home/slayo/docker/homelab-manager && docker compose up -d --build"
```

## Development

```bash
npm install
npm run dev          # Vite dev server (port 5173, proxies /api to 3456)
npm run dev:server   # Express backend (port 3456)
npm run dev:all      # Both frontend + backend via concurrently
npm run build        # Production build (Vite)
npm run lint         # ESLint
```

Path alias: `@/` → `./src/` (configured in vite.config.js + jsconfig.json)

No test framework is configured.

## WoW Server Context

The WoW server is AzerothCore WotLK at `/home/slayo/docker/wow/azerothcore-wotlk/` with:
- **Core repo**: github.com/liyunfan1223/azerothcore-wotlk (branch: Playerbot)
- **Modules** (auto-discovered from `modules/` dir):
  - mod-ah-bot (azerothcore/mod-ah-bot)
  - mod-individual-progression (ZhengPeiRu21/mod-individual-progression) — has 19 optional SQL migrations
  - mod-ollama-chat (DustinHendrickson/mod-ollama-chat)
  - mod-playerbots (liyunfan1223/mod-playerbots)
- **Containers**: ac-database (MySQL 8.4), ac-worldserver, ac-authserver
- **Databases**: acore_world, acore_characters, acore_auth, acore_playerbots
- **DB creds**: root / password (local only, not exposed)
- **Backups**: /opt/backups/wow/ (~1.8GB, dir/db/volume types)

## Adding a New Workspace

1. Create `server/workspaces/<name>/index.js` extending `WorkspaceBase`
2. Import and instantiate in `server/index.js` (it auto-registers routes at `/api/workspaces/<id>/`)
3. Create frontend component at `src/components/<name>/Dashboard.jsx`
4. Add to workspace router in `src/App.jsx`
5. Remove from stubs list in `WorkspaceStub.jsx`

## Conventions

- Express 5 syntax: use `/{*path}` not `*` for catch-all routes
- shadcn/ui components in `src/components/ui/` — install with `npx shadcn@latest add <component>` (style: base-nova, JSX not TSX)
- State persisted in `/data/state.json` (JSON file, not a database)
- All git/docker/mysql operations run via child_process (execSync or spawn)
- `git config --global --add safe.directory '*'` set in Dockerfile for mounted volumes
- WebSocket used for long-running ops (docker build, backups); REST for quick queries
