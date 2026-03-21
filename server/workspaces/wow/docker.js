import { execSync, spawn } from 'child_process';
import config from '../../config.js';

export function getContainerStatus() {
  const containers = config.wow.containers;
  const results = [];

  for (const name of containers) {
    try {
      const output = execSync(
        `docker inspect --format='{{.State.Status}}|{{.State.StartedAt}}|{{.State.Health.Status}}' ${name} 2>/dev/null`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      const [status, startedAt, health] = output.split('|');
      results.push({ name, status, startedAt, health: health || 'none' });
    } catch {
      results.push({ name, status: 'not_found', startedAt: null, health: 'none' });
    }
  }

  return results;
}

export function dockerComposeAction(action, ws) {
  const composePath = config.wow.composePath;
  let args;

  switch (action) {
    case 'start':
      args = ['compose', 'up', '-d'];
      break;
    case 'stop':
      args = ['compose', 'down'];
      break;
    case 'rebuild':
      args = ['compose', 'up', '-d', '--build'];
      break;
    case 'build':
      args = ['compose', 'build'];
      break;
    default:
      if (ws) ws.send(JSON.stringify({ type: 'error', data: `Unknown action: ${action}` }));
      return;
  }

  const proc = spawn('docker', args, { cwd: composePath, shell: true });

  if (ws) {
    ws.send(JSON.stringify({ type: 'docker:start', action }));

    proc.stdout.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'docker:stdout', data: data.toString() }));
    });

    proc.stderr.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'docker:stderr', data: data.toString() }));
    });

    proc.on('close', (code) => {
      ws.send(JSON.stringify({ type: 'docker:done', code }));
    });

    proc.on('error', (err) => {
      ws.send(JSON.stringify({ type: 'docker:error', data: err.message }));
    });
  }

  return proc;
}
