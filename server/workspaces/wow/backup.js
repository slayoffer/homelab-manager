import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import config from '../../config.js';

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const DAYS = 14;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getBasename() {
  return path.basename(config.wow.basePath);
}

export function listBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('wow-') && !f.startsWith('.'))
    .map(name => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);

      let type = 'unknown';
      if (name.includes('-volume-db-')) type = 'volume-db';
      else if (name.includes('-volume-client-')) type = 'volume-client';
      else if (name.includes('-backup-') && name.endsWith('.tar.gz')) type = 'directory';
      else if (name.endsWith('.sql.gz') || name.endsWith('.sql')) type = 'database';

      let database = null;
      if (type === 'database') {
        const match = name.match(/^wow-([^-]+)-\d+/);
        if (match) database = match[1];
      }

      return {
        name,
        path: fullPath,
        type,
        database,
        size: stat.size,
        sizeHuman: formatSize(stat.size),
        modified: stat.mtime.toISOString(),
        age: Math.floor((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)),
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));

  return files;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function backupDirectory(ws) {
  ensureBackupDir();
  const basename = getBasename();
  const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const filename = `wow-${basename}-backup-${date}.tar.gz`;
  const wowPath = config.wow.basePath;

  const cmd = `tar -czf "${BACKUP_DIR}/${filename}" --exclude='.git' -C "${path.dirname(wowPath)}" "${basename}"`;
  return runWithStream(cmd, ws, `Directory backup: ${filename}`);
}

export function backupDatabase(ws) {
  ensureBackupDir();
  const container = config.wow.dbContainer;
  const user = config.wow.dbUser;
  const pass = config.wow.dbPassword;

  const commands = [];
  for (const [key, dbName] of Object.entries(config.wow.databases)) {
    const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 10);
    const filename = `wow-${dbName}-${date}.sql.gz`;
    commands.push({
      label: `Dumping ${dbName}...`,
      cmd: `docker exec ${container} mysqldump -u"${user}" -p"${pass}" --add-drop-table --databases "${dbName}" | gzip > "${BACKUP_DIR}/${filename}"`,
    });
  }

  return runSequentialWithStream(commands, ws, 'Database backup');
}

export function backupVolumes(ws) {
  ensureBackupDir();
  const basename = getBasename();
  const composePath = config.wow.composePath;
  const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

  // Get volume names from docker compose
  let projectName;
  try {
    projectName = execSync('docker compose config --format json', {
      cwd: composePath, encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(projectName);
    projectName = parsed.name || path.basename(composePath);
  } catch {
    projectName = path.basename(composePath).replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  const dbVolume = `${projectName}_ac-database`;
  const clientVolume = `${projectName}_ac-client-data`;

  const commands = [
    {
      label: 'Backing up database volume...',
      cmd: `docker run --rm -v "${dbVolume}:/source" -v "${BACKUP_DIR}:/backup" ubuntu tar -czf "/backup/wow-volume-db-${basename}-${date}.tar.gz" -C /source .`,
    },
    {
      label: 'Backing up client data volume...',
      cmd: `docker run --rm -v "${clientVolume}:/source" -v "${BACKUP_DIR}:/backup" ubuntu tar -czf "/backup/wow-volume-client-${basename}-${date}.tar.gz" -C /source .`,
    },
  ];

  return runSequentialWithStream(commands, ws, 'Volume backup');
}

export function restoreDatabase(backupFile) {
  const container = config.wow.dbContainer;
  const user = config.wow.dbUser;
  const pass = config.wow.dbPassword;
  const fullPath = path.join(BACKUP_DIR, backupFile);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `Backup file not found: ${backupFile}` };
  }

  // Ensure db container is running
  try {
    const status = execSync(`docker inspect --format='{{.State.Status}}' ${container}`, { encoding: 'utf-8' }).trim();
    if (status !== 'running') {
      return { success: false, error: 'Database container is not running. Start the server first.' };
    }
  } catch {
    return { success: false, error: 'Database container not found.' };
  }

  try {
    let cmd;
    if (backupFile.endsWith('.sql.gz')) {
      cmd = `gunzip < "${fullPath}" | docker exec -i ${container} mysql -u"${user}" -p"${pass}"`;
    } else if (backupFile.endsWith('.sql')) {
      cmd = `docker exec -i ${container} mysql -u"${user}" -p"${pass}" < "${fullPath}"`;
    } else {
      return { success: false, error: 'Unsupported file format. Expected .sql or .sql.gz' };
    }

    execSync(cmd, { encoding: 'utf-8', timeout: 300000, shell: '/bin/bash' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

export function restoreDirectory(backupFile) {
  const fullPath = path.join(BACKUP_DIR, backupFile);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `Backup file not found: ${backupFile}` };
  }

  try {
    execSync(`tar -xzf "${fullPath}" -C "${path.dirname(config.wow.basePath)}"`, {
      encoding: 'utf-8', timeout: 300000,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

export function pruneBackups() {
  ensureBackupDir();
  const files = listBackups();
  const now = Date.now();
  const cutoff = DAYS * 24 * 60 * 60 * 1000;

  // Group by type
  const byType = {};
  for (const f of files) {
    if (!byType[f.type]) byType[f.type] = [];
    byType[f.type].push(f);
  }

  const deleted = [];
  for (const [type, typeFiles] of Object.entries(byType)) {
    // Sort by date descending (newest first)
    typeFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    // Keep at least the newest one
    for (let i = 1; i < typeFiles.length; i++) {
      const age = now - new Date(typeFiles[i].modified).getTime();
      if (age > cutoff) {
        try {
          fs.unlinkSync(typeFiles[i].path);
          deleted.push(typeFiles[i].name);
        } catch { /* skip */ }
      }
    }
  }

  return { deleted, count: deleted.length };
}

function runWithStream(cmd, ws, label) {
  if (ws) {
    ws.send(JSON.stringify({ type: 'backup:start', label }));
  }

  const proc = spawn('bash', ['-c', cmd]);

  if (ws) {
    proc.stdout.on('data', d => ws.send(JSON.stringify({ type: 'backup:stdout', data: d.toString() })));
    proc.stderr.on('data', d => ws.send(JSON.stringify({ type: 'backup:stderr', data: d.toString() })));
    proc.on('close', code => ws.send(JSON.stringify({ type: 'backup:done', code, label })));
    proc.on('error', err => ws.send(JSON.stringify({ type: 'backup:error', data: err.message })));
  }

  return proc;
}

function runSequentialWithStream(commands, ws, groupLabel) {
  if (ws) {
    ws.send(JSON.stringify({ type: 'backup:start', label: groupLabel }));
  }

  let idx = 0;
  const next = () => {
    if (idx >= commands.length) {
      if (ws) ws.send(JSON.stringify({ type: 'backup:done', code: 0, label: groupLabel }));
      return;
    }

    const { label, cmd } = commands[idx];
    if (ws) ws.send(JSON.stringify({ type: 'backup:stdout', data: `\n${label}\n` }));

    const proc = spawn('bash', ['-c', cmd]);
    proc.stdout.on('data', d => { if (ws) ws.send(JSON.stringify({ type: 'backup:stdout', data: d.toString() })); });
    proc.stderr.on('data', d => { if (ws) ws.send(JSON.stringify({ type: 'backup:stderr', data: d.toString() })); });
    proc.on('close', code => {
      if (code !== 0) {
        if (ws) ws.send(JSON.stringify({ type: 'backup:error', data: `${label} failed with code ${code}` }));
      }
      idx++;
      next();
    });
    proc.on('error', err => {
      if (ws) ws.send(JSON.stringify({ type: 'backup:error', data: err.message }));
      idx++;
      next();
    });
  };

  next();
}
