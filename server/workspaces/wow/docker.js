import { execSync, spawn } from 'child_process';
import config from '../../config.js';
import db, { audit } from '../../db.js';

export function getContainerStatus() {
  const containers = config.wow.containers;
  const results = [];

  for (const name of containers) {
    try {
      const output = execSync(
        `docker inspect --format='{{.State.Status}}|{{.State.StartedAt}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ${name} 2>/dev/null`,
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
      args = ['compose', 'up', '-d', '--remove-orphans'];
      break;
    case 'stop':
      args = ['compose', 'down'];
      break;
    case 'rebuild':
      args = ['compose', 'up', '-d', '--build', '--force-recreate', '--remove-orphans'];
      break;
    case 'restart':
      args = ['compose', 'restart'];
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

function validateContainer(name) {
  if (!config.wow.containers.includes(name)) {
    throw new Error(`Unknown container: "${name}"`);
  }
}

export function containerLogs(containerName, options, ws) {
  validateContainer(containerName);
  const tail = Math.min(Math.max(parseInt(options.tail) || 100, 10), 10000);

  const args = ['logs', '--timestamps', '--tail', String(tail)];
  if (options.follow) args.push('--follow');
  args.push(containerName);

  const proc = spawn('docker', args, { shell: true });

  if (ws) {
    ws.send(JSON.stringify({ type: 'logs:start', container: containerName }));

    proc.stdout.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'logs:stdout', container: containerName, data: data.toString() }));
    });

    proc.stderr.on('data', (data) => {
      // docker logs sends all output to stderr for some containers
      ws.send(JSON.stringify({ type: 'logs:stdout', container: containerName, data: data.toString() }));
    });

    proc.on('close', (code) => {
      ws.send(JSON.stringify({ type: 'logs:done', container: containerName, code }));
    });

    proc.on('error', (err) => {
      ws.send(JSON.stringify({ type: 'logs:error', container: containerName, data: err.message }));
    });
  }

  return proc;
}

export function containerLogsAll(options, ws) {
  const procs = new Map();
  for (const name of config.wow.containers) {
    const proc = containerLogs(name, options, ws);
    procs.set(name, proc);
  }
  return procs;
}

export function getContainerLogs(containerName, tail = 200) {
  validateContainer(containerName);
  const lines = Math.min(Math.max(parseInt(tail) || 200, 10), 10000);
  try {
    const output = execSync(
      `docker logs --timestamps --tail ${lines} ${containerName} 2>&1`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    return { success: true, logs: output };
  } catch (err) {
    return { success: false, error: err.message, logs: err.stdout || '' };
  }
}

export function containerStats() {
  try {
    const output = execSync(
      `docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' ${config.wow.containers.join(' ')} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    return output.split('\n').filter(Boolean).map(line => {
      const [name, cpu, memUsage, memPercent] = line.split('|');
      return { name, cpu, memUsage, memPercent };
    });
  } catch {
    return [];
  }
}

export function restartContainer(containerName) {
  validateContainer(containerName);
  db.prepare('INSERT INTO docker_operations (action, container) VALUES (?, ?)').run('restart', containerName);
  try {
    const output = execSync(
      `docker restart ${containerName}`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    audit('docker.restart', containerName, { output: output.trim() });
    return { success: true, output: output.trim() };
  } catch (err) {
    audit('docker.restart', containerName, { error: err.message }, 'failed');
    return { success: false, error: err.message };
  }
}

export function startContainer(containerName) {
  validateContainer(containerName);
  db.prepare('INSERT INTO docker_operations (action, container) VALUES (?, ?)').run('start', containerName);
  try {
    const output = execSync(
      `docker start ${containerName}`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    audit('docker.start', containerName, { output: output.trim() });
    return { success: true, output: output.trim() };
  } catch (err) {
    audit('docker.start', containerName, { error: err.message }, 'failed');
    return { success: false, error: err.message };
  }
}

export function stopContainer(containerName) {
  validateContainer(containerName);
  db.prepare('INSERT INTO docker_operations (action, container) VALUES (?, ?)').run('stop', containerName);
  try {
    const output = execSync(
      `docker stop ${containerName}`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    audit('docker.stop', containerName, { output: output.trim() });
    return { success: true, output: output.trim() };
  } catch (err) {
    audit('docker.stop', containerName, { error: err.message }, 'failed');
    return { success: false, error: err.message };
  }
}
