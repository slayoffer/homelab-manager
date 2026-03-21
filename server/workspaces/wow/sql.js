import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import config from '../../config.js';
import { loadState, updateState } from '../../state.js';

function findSqlFiles(basePath, subPath) {
  const fullPath = path.join(basePath, subPath);
  if (!fs.existsSync(fullPath)) return [];

  const results = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      const entryRel = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath, entryRel);
      } else if (entry.name.endsWith('.sql') && entry.name !== '.gitkeep') {
        results.push(entryRel);
      }
    }
  }
  walk(fullPath, '');
  return results;
}

function categorizeFile(filePath) {
  const parts = filePath.toLowerCase();
  let database = 'world';
  if (parts.includes('/characters/') || parts.includes('characters')) database = 'characters';
  else if (parts.includes('/auth/') || parts.includes('auth')) database = 'auth';
  else if (parts.includes('/playerbots/') || parts.includes('playerbots')) database = 'playerbots';

  let type = 'base';
  if (parts.includes('optional')) type = 'optional';
  else if (parts.includes('updates/')) type = 'updates';
  else if (parts.includes('create/')) type = 'create';

  return { database, type };
}

export function scanMigrations() {
  const state = loadState();
  const modulesDir = path.join(config.wow.basePath, 'modules');
  const modules = [];

  if (!fs.existsSync(modulesDir)) return modules;

  for (const modName of fs.readdirSync(modulesDir)) {
    const modPath = path.join(modulesDir, modName);
    if (!fs.statSync(modPath).isDirectory() || !fs.existsSync(path.join(modPath, '.git'))) continue;

    const migrations = [];

    // Scan data/sql/
    for (const sqlFile of findSqlFiles(modPath, 'data/sql')) {
      const { database, type } = categorizeFile(sqlFile);
      const fullPath = path.join(modPath, 'data/sql', sqlFile);
      const stat = fs.statSync(fullPath);

      migrations.push({
        id: `${modName}:data/sql/${sqlFile}`,
        module: modName,
        file: sqlFile,
        fullPath: `data/sql/${sqlFile}`,
        absolutePath: fullPath,
        database,
        type,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    // Scan optional/sql/
    for (const sqlFile of findSqlFiles(modPath, 'optional/sql')) {
      const { database } = categorizeFile(sqlFile);
      const fullPath = path.join(modPath, 'optional/sql', sqlFile);
      const stat = fs.statSync(fullPath);

      migrations.push({
        id: `${modName}:optional/sql/${sqlFile}`,
        module: modName,
        file: sqlFile,
        fullPath: `optional/sql/${sqlFile}`,
        absolutePath: fullPath,
        database,
        type: 'optional',
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    // Check which are new (after last applied commit)
    const lastCommit = state.wow?.lastAppliedCommits?.[modName];
    if (lastCommit) {
      try {
        const newFiles = execSync(
          `git diff --name-only ${lastCommit}..HEAD -- '*.sql'`,
          { cwd: modPath, encoding: 'utf-8', timeout: 10000 }
        ).trim().split('\n').filter(Boolean);

        for (const m of migrations) {
          m.isNew = newFiles.some(f => m.fullPath.includes(f) || f.includes(m.file));
        }
      } catch {
        // if git diff fails, mark all as potentially new
        for (const m of migrations) m.isNew = true;
      }
    } else {
      for (const m of migrations) m.isNew = true;
    }

    // Load saved preferences for optional migrations
    const prefs = state.wow?.sqlPreferences?.[modName] || {};
    for (const m of migrations) {
      if (m.type === 'optional') {
        m.selected = prefs[m.id] ?? false;
      } else {
        m.selected = true;
      }
    }

    modules.push({ module: modName, migrations });
  }

  return modules;
}

export function applySqlFile(absolutePath, database) {
  const dbName = config.wow.databases[database] || database;
  const container = config.wow.dbContainer;
  const user = config.wow.dbUser;
  const pass = config.wow.dbPassword;

  try {
    const output = execSync(
      `docker exec -i ${container} mysql -u"${user}" -p"${pass}" "${dbName}" < "${absolutePath}"`,
      { encoding: 'utf-8', timeout: 60000, shell: '/bin/bash' }
    );
    return { success: true, output: output.trim() };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

export function saveSqlPreferences(moduleName, preferences) {
  updateState(state => {
    if (!state.wow.sqlPreferences) state.wow.sqlPreferences = {};
    state.wow.sqlPreferences[moduleName] = preferences;
  });
}

export function markMigrationsApplied(moduleName) {
  const modPath = path.join(config.wow.basePath, 'modules', moduleName);
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: modPath, encoding: 'utf-8' }).trim();
    updateState(state => {
      if (!state.wow.lastAppliedCommits) state.wow.lastAppliedCommits = {};
      state.wow.lastAppliedCommits[moduleName] = commit;
    });
  } catch { /* ignore */ }
}
