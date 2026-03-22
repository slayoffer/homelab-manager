import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import config from '../../config.js';
import db, { audit } from '../../db.js';

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

function extractSqlComment(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Extract /* ... */ block comment at the start of the file
    const match = content.match(/^\s*\/\*\s*([\s\S]*?)\s*\*\//);
    if (match) return match[1].trim();
    // Try -- line comments at the start
    const lines = content.split('\n');
    const commentLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) {
        commentLines.push(trimmed.slice(2).trim());
      } else if (trimmed === '' && commentLines.length === 0) {
        continue;
      } else {
        break;
      }
    }
    return commentLines.join(' ').trim() || null;
  } catch {
    return null;
  }
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
        description: extractSqlComment(fullPath),
      });
    }

    // Check which are new (after last applied commit)
    const lastCommit = db.prepare('SELECT commit_hash FROM applied_commits WHERE module_name = ?').get(modName)?.commit_hash;
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
        for (const m of migrations) m.isNew = true;
      }
    } else {
      for (const m of migrations) m.isNew = true;
    }

    // Load saved preferences for optional migrations
    const prefRows = db.prepare('SELECT migration_id, selected FROM sql_preferences WHERE module_name = ?').all(modName);
    const prefs = {};
    for (const row of prefRows) prefs[row.migration_id] = !!row.selected;

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

export function applySqlFile(absolutePath, database, migrationId, moduleName) {
  const dbName = config.wow.databases[database] || database;
  const container = config.wow.dbContainer;
  const user = config.wow.dbUser;
  const pass = config.wow.dbPassword;

  const start = performance.now();
  try {
    const output = execSync(
      `docker exec -i ${container} mysql -u"${user}" -p"${pass}" "${dbName}" < "${absolutePath}"`,
      { encoding: 'utf-8', timeout: 60000, shell: '/bin/bash' }
    );
    const duration = Math.round(performance.now() - start);

    // Record in applied_migrations
    if (migrationId && moduleName) {
      db.prepare(
        'INSERT OR REPLACE INTO applied_migrations (module_name, migration_file, database_name, type, status, output, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(moduleName, migrationId, database, null, 'success', output.trim().slice(0, 5000), duration);
    }

    audit('migration.apply', migrationId, { module: moduleName, database, duration_ms: duration }, 'success');
    return { success: true, output: output.trim() };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    const error = err.stderr || err.message;

    if (migrationId && moduleName) {
      db.prepare(
        'INSERT OR REPLACE INTO applied_migrations (module_name, migration_file, database_name, type, status, output, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(moduleName, migrationId, database, null, 'failed', error.slice(0, 5000), duration);
    }

    audit('migration.apply', migrationId, { module: moduleName, database, error: error.slice(0, 500) }, 'failed');
    return { success: false, error };
  }
}

export function saveSqlPreferences(moduleName, preferences) {
  const upsert = db.prepare('INSERT OR REPLACE INTO sql_preferences (module_name, migration_id, selected) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const [id, selected] of Object.entries(preferences)) {
      upsert.run(moduleName, id, selected ? 1 : 0);
    }
  })();
}

export function markMigrationsApplied(moduleName) {
  const modPath = path.join(config.wow.basePath, 'modules', moduleName);
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: modPath, encoding: 'utf-8' }).trim();
    db.prepare('INSERT OR REPLACE INTO applied_commits (module_name, commit_hash) VALUES (?, ?)').run(moduleName, commit);
  } catch { /* ignore */ }
}
