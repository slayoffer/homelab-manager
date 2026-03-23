---
name: homelab
description: Deploy homelab-manager to slayo server, scaffold new workspaces, and add shadcn/ui components. Use when deploying, adding a workspace, adding UI components, or running homelab operations.
---

# Homelab Manager Operations

Project-specific skill for the homelab-manager app. Covers deployment, workspace scaffolding, and UI component management.

## Quick Reference

| Command | What it does |
|---------|-------------|
| `/homelab deploy` | Build, sync, and restart on slayo |
| `/homelab add-workspace <name>` | Scaffold full-stack workspace |
| `/homelab add-ui <component>` | Install shadcn/ui component |

## Deploy

Deploys the app to slayo server (192.168.1.99). Three sequential steps — each must succeed before the next.

### Steps

1. **Build frontend**
   ```bash
   npm run build
   ```

2. **Sync to server**
   ```bash
   rsync -avz --exclude node_modules --exclude dist --exclude .git --exclude data . slayo:/home/slayo/docker/homelab-manager/
   ```
   The excludes are critical — `node_modules` is 200MB+ and `data/` contains runtime state.

3. **Rebuild container**
   ```bash
   ssh slayo "cd /home/slayo/docker/homelab-manager && docker compose up -d --build"
   ```
   Uses multi-stage Dockerfile: builds frontend inside container, installs only prod deps.

### Verification

After deploy, confirm the container started:
```bash
ssh slayo "docker ps --filter name=homelab-manager --format '{{.Status}}'"
```

App is live at `http://slayo:3456`.

### Infrastructure Notes

The container mounts the host's Docker socket but uses its own `docker` binary (`docker.io` apt package). This binary does **not** include the `docker compose` plugin. The host's compose plugin must be mounted as a volume in `compose.yml`:

```yaml
volumes:
  - /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro
```

Without this, all docker compose operations (Quick Start, Stop Server, Rebuild) will fail with `unknown shorthand flag: 'd' in -d`.

## Add Workspace

Scaffolds a new workspace across backend and frontend. A workspace is a self-contained section of the app (like WoW Server, Docker Services, etc.).

### Arguments

- `name` — workspace ID in kebab-case (e.g., `network-monitor`)
- Derive: PascalCase class name (`NetworkMonitorWorkspace`), display name (`Network Monitor`), Lucide icon

### Steps

**1. Create backend** — `server/workspaces/<name>/index.js`

```javascript
import { Router } from 'express';
import { WorkspaceBase } from '../base.js';

export class <PascalName>Workspace extends WorkspaceBase {
  constructor() {
    super({
      id: '<name>',
      name: '<Display Name>',
      icon: '<LucideIcon>',
      status: 'active',
      description: '<description>',
    });
  }

  async getStatus() {
    return { status: this.status };
  }

  getRoutes() {
    const router = Router();

    router.get('/status', async (req, res) => {
      try {
        res.json(await this.getStatus());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }
}
```

**2. Register in `server/index.js`**

- Add import: `import { <PascalName>Workspace } from './workspaces/<name>/index.js';`
- Add to workspaces array: `new <PascalName>Workspace(),`

**3. Create frontend** — `src/components/<name>/<PascalName>Dashboard.jsx`

Minimal dashboard with header and status. Follow the pattern from WowDashboard: icon + title header, useApi hook for data fetching, Card-based layout.

**4. Add to frontend router** — `src/App.jsx`

- Add import: `import { <PascalName>Dashboard } from '@/components/<name>/<PascalName>Dashboard';`
- Add conditional before the stub fallback:
  ```jsx
  if (activeWorkspace.id === '<name>') {
    return <<PascalName>Dashboard />;
  }
  ```

**5. Remove stub** — `src/components/stubs/WorkspaceStub.jsx`

- Remove `<name>` key from `plannedFeatures` object
- Remove icon from `iconMap` if it was only used by this workspace

### Existing Stubs

These workspace IDs already have stub entries and backend classes (status: 'stub'):
- `docker-services` — DockerServicesWorkspace, icon: Container
- `proxmox` — ProxmoxWorkspace, icon: Server
- `traefik` — TraefikWorkspace, icon: Globe
- `servers` — ServersWorkspace, icon: MonitorCog

When implementing one of these, the backend class and registration already exist — just update `status: 'stub'` to `status: 'active'`, add routes, create the frontend dashboard, and update the router.

## Add UI Component

Installs a shadcn/ui component with project-specific configuration.

```bash
npx shadcn@latest add <component>
```

The project has `components.json` configured: style `base-nova`, JSX (not TSX), path alias `@/`.

Components are installed to `src/components/ui/`. Do not edit these files manually — they are managed by shadcn.

### Already Installed

alert, badge, button, card, checkbox, collapsible, input, progress, scroll-area, select, separator, table, tabs, tooltip

## Conventions

- Express 5 syntax: use `/{*path}` not `*` for catch-all routes
- ES modules throughout (`import`/`export`, `"type": "module"` in package.json)
- Backend runs shell commands via `child_process` (execSync for quick ops, spawn for streaming)
- WebSocket (`/ws`) for long-running operations (docker, backups)
- REST for quick queries
- Dark theme only, oklch colors, gold primary (#f59e0b)
- Path alias: `@/` maps to `./src/`

## Examples

- "deploy to slayo" — runs full deploy workflow
- "add a proxmox workspace" — scaffolds proxmox from stub to active workspace
- "add shadcn dialog component" — installs dialog to src/components/ui/
- "redeploy" — same as deploy
- "scaffold network monitor workspace" — creates new workspace from scratch

## Post-Workflow

**ALWAYS run `/reflect` after completing this skill's workflow** to capture learnings and propose skill improvements.
