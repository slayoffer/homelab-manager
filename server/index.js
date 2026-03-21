import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { WowWorkspace } from './workspaces/wow/index.js';
import { DockerServicesWorkspace } from './workspaces/docker-services/index.js';
import { ProxmoxWorkspace } from './workspaces/proxmox/index.js';
import { TraefikWorkspace } from './workspaces/traefik/index.js';
import { ServersWorkspace } from './workspaces/servers/index.js';
import { dockerComposeAction } from './workspaces/wow/docker.js';
import { backupDirectory, backupDatabase, backupVolumes } from './workspaces/wow/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

app.use(express.json());

// Workspaces
const workspaces = [
  new WowWorkspace(),
  new DockerServicesWorkspace(),
  new ProxmoxWorkspace(),
  new TraefikWorkspace(),
  new ServersWorkspace(),
];

// Register workspace routes
for (const ws of workspaces) {
  app.use(`/api/workspaces/${ws.id}`, ws.getRoutes());
}

// List all workspaces
app.get('/api/workspaces', (req, res) => {
  res.json(workspaces.map(w => w.getMeta()));
});

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// WebSocket for streaming docker operations
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const { type, action } = JSON.parse(msg);
      if (type === 'docker') {
        dockerComposeAction(action, ws);
      } else if (type === 'backup') {
        switch (action) {
          case 'directory': backupDirectory(ws); break;
          case 'database': backupDatabase(ws); break;
          case 'volumes': backupVolumes(ws); break;
          case 'all':
            backupDirectory(ws);
            // TODO: chain sequentially after dir completes
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', data: `Unknown backup action: ${action}` }));
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', data: err.message }));
    }
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Homelab Manager running on http://0.0.0.0:${config.port}`);
  console.log(`Workspaces: ${workspaces.map(w => `${w.name} (${w.status})`).join(', ')}`);
});
