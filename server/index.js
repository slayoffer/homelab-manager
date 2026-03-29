import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import db from './db.js'; // Initialize database on startup
import { registerAuthRoutes, requireAuth, authenticateWebSocket, authEnabled } from './auth.js';
import { WowWorkspace } from './workspaces/wow/index.js';
import { DockerServicesWorkspace } from './workspaces/docker-services/index.js';
import { ProxmoxWorkspace } from './workspaces/proxmox/index.js';
import { TraefikWorkspace } from './workspaces/traefik/index.js';
import { ServersWorkspace } from './workspaces/servers/index.js';
import { OpenClawWorkspace, SynthiqWorkspace, aiStreams } from './workspaces/ai-assistant/index.js';
import { GcServerWorkspace } from './workspaces/gc-server/index.js';
import { dockerComposeAction, containerLogs, containerLogsAll } from './workspaces/wow/docker.js';
import { backupDirectory, backupDatabase, backupVolumes } from './workspaces/wow/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

app.use('/api/workspaces/openclaw-ai/chat', express.json({ limit: '10mb' }));
app.use('/api/workspaces/synthiq-ai/chat', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));

// Auth routes (public — no middleware)
registerAuthRoutes(app);

// Workspaces — active first, stubs at the bottom
const workspaces = [
  new WowWorkspace(),
  new OpenClawWorkspace(),
  new SynthiqWorkspace(),
  new GcServerWorkspace(),
  new DockerServicesWorkspace(),
  new ProxmoxWorkspace(),
  new TraefikWorkspace(),
  new ServersWorkspace(),
];

// Protect workspace routes with auth (skipped if auth not configured)
app.use('/api/workspaces', requireAuth);

// Register workspace routes
for (const ws of workspaces) {
  app.use(`/api/workspaces/${ws.id}`, ws.getRoutes());
}

// List all workspaces (respecting custom order)
app.get('/api/workspaces', (req, res) => {
  const all = workspaces.map(w => w.getMeta());
  const row = db.prepare('SELECT ordering FROM workspace_order WHERE id = 1').get();
  if (row?.ordering) {
    try {
      const order = JSON.parse(row.ordering);
      all.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    } catch { /* use default order */ }
  }
  res.json(all);
});

// Save workspace order
app.post('/api/workspaces/order', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  db.prepare('INSERT INTO workspace_order (id, ordering) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET ordering = excluded.ordering')
    .run(JSON.stringify(order));
  res.json({ success: true });
});

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// WebSocket for streaming operations
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Authenticate WebSocket connections
  if (!authenticateWebSocket(req)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.on('close', () => {
    if (ws._logProcs) {
      for (const proc of ws._logProcs.values()) proc.kill();
      ws._logProcs = null;
    }
    // Clean up AI stream subscriptions for this connection
    for (const [key, conn] of aiStreams) {
      if (conn === ws) aiStreams.delete(key);
    }
  });

  ws.on('message', (msg) => {
    try {
      const { type, action, container, tail, follow, requestId } = JSON.parse(msg);
      if (type === 'docker') {
        dockerComposeAction(action, ws);
      } else if (type === 'logs') {
        if (ws._logProcs) {
          for (const proc of ws._logProcs.values()) proc.kill();
          ws._logProcs = null;
        }
        if (action === 'stop') return;
        if (container === 'all') {
          ws._logProcs = containerLogsAll({ tail: tail || 100, follow }, ws);
        } else {
          const proc = containerLogs(container, { tail: tail || 100, follow }, ws);
          ws._logProcs = new Map([[container, proc]]);
        }
      } else if (type === 'backup') {
        switch (action) {
          case 'directory': backupDirectory(ws); break;
          case 'database': backupDatabase(ws); break;
          case 'volumes': backupVolumes(ws); break;
          case 'all':
            backupDirectory(ws);
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', data: `Unknown backup action: ${action}` }));
        }
      } else if (type === 'ai') {
        if (action === 'subscribe' && requestId) {
          aiStreams.set(requestId, ws);
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', data: err.message }));
    }
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Homelab Manager running on http://0.0.0.0:${config.port}`);
  console.log(`Auth: ${authEnabled ? 'GitHub OAuth enabled' : 'disabled (no GITHUB_OAUTH_CLIENT_ID)'}`);
  console.log(`Workspaces: ${workspaces.map(w => `${w.name} (${w.status})`).join(', ')}`);
});
