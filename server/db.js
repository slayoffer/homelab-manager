import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import config from './config.js';

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema migrations — append-only, never modify existing entries
const MIGRATIONS = [
  // Migration 1: Initial schema
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applied_commits (
    module_name TEXT PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applied_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_name TEXT NOT NULL,
    migration_file TEXT NOT NULL,
    database_name TEXT,
    type TEXT,
    applied_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'success',
    output TEXT,
    duration_ms INTEGER,
    UNIQUE(module_name, migration_file)
  );

  CREATE TABLE IF NOT EXISTS sql_preferences (
    module_name TEXT NOT NULL,
    migration_id TEXT NOT NULL,
    selected INTEGER DEFAULT 0,
    PRIMARY KEY (module_name, migration_id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    action TEXT NOT NULL,
    entity TEXT,
    details TEXT,
    result TEXT DEFAULT 'success'
  );

  CREATE TABLE IF NOT EXISTS config_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_path TEXT NOT NULL,
    content TEXT NOT NULL,
    saved_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    is_regex INTEGER DEFAULT 0,
    notify INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS docker_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    container TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    exit_code INTEGER
  );

  CREATE TABLE IF NOT EXISTS backup_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    restored_at TEXT
  );`,

  // Migration 2: Authentication
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );`,

  // Migration 3: AI Assistant
  `CREATE TABLE IF NOT EXISTS ai_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);`,

  // Migration 4: Add workspace_id to AI tables for multi-workspace support
  `ALTER TABLE ai_sessions ADD COLUMN workspace_id TEXT DEFAULT 'openclaw-ai';
  CREATE INDEX IF NOT EXISTS idx_ai_sessions_workspace ON ai_sessions(workspace_id);`,

  // Migration 5: AI workspace settings (system prompt)
  `CREATE TABLE IF NOT EXISTS ai_workspace_settings (
    workspace_id TEXT PRIMARY KEY,
    system_prompt TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );`,

  // Migration 6: Workspace ordering
  `CREATE TABLE IF NOT EXISTS workspace_order (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ordering TEXT DEFAULT '[]'
  );`,
];

function runMigrations() {
  // Create schema_version if it doesn't exist
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))');

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v || 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      // Split by semicolons and execute each statement
      const statements = MIGRATIONS[i].split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        db.exec(stmt);
      }
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    })();
    console.log(`[db] Applied migration ${i + 1}`);
  }
}

const DEFAULT_ALERT_PATTERNS = [
  { pattern: 'ERROR|FATAL', isRegex: 1, notify: 1, enabled: 1 },
  { pattern: 'segfault', isRegex: 0, notify: 1, enabled: 1 },
  { pattern: 'OOM', isRegex: 0, notify: 1, enabled: 1 },
  { pattern: 'crash', isRegex: 0, notify: 0, enabled: 1 },
];

function migrateFromStateJson() {
  const statePath = config.statePath;
  if (!fs.existsSync(statePath)) {
    // No state.json — seed defaults if DB is fresh
    const alertCount = db.prepare('SELECT COUNT(*) as c FROM alert_patterns').get().c;
    if (alertCount === 0) {
      seedDefaults();
    }
    return;
  }

  // Check if already migrated
  const commitCount = db.prepare('SELECT COUNT(*) as c FROM applied_commits').get().c;
  if (commitCount > 0) return;

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    db.transaction(() => {
      // Migrate lastAppliedCommits
      const commits = state.wow?.lastAppliedCommits || {};
      const insertCommit = db.prepare('INSERT OR IGNORE INTO applied_commits (module_name, commit_hash) VALUES (?, ?)');
      for (const [module, hash] of Object.entries(commits)) {
        insertCommit.run(module, hash);
      }

      // Migrate sqlPreferences
      const prefs = state.wow?.sqlPreferences || {};
      const insertPref = db.prepare('INSERT OR IGNORE INTO sql_preferences (module_name, migration_id, selected) VALUES (?, ?, ?)');
      for (const [module, modulePrefs] of Object.entries(prefs)) {
        for (const [id, selected] of Object.entries(modulePrefs)) {
          insertPref.run(module, id, selected ? 1 : 0);
        }
      }

      // Seed default alert patterns
      seedDefaults();
    })();

    // Rename old file
    fs.renameSync(statePath, statePath + '.migrated');
    console.log('[db] Migrated state.json to SQLite');
  } catch (err) {
    console.error('[db] Failed to migrate state.json:', err.message);
  }
}

function seedDefaults() {
  const insert = db.prepare('INSERT INTO alert_patterns (pattern, is_regex, notify, enabled) VALUES (?, ?, ?, ?)');
  for (const p of DEFAULT_ALERT_PATTERNS) {
    insert.run(p.pattern, p.isRegex, p.notify, p.enabled);
  }
}

// Audit helper — call from any module
export function audit(action, entity, details, result = 'success') {
  try {
    db.prepare('INSERT INTO audit_log (action, entity, details, result) VALUES (?, ?, ?, ?)')
      .run(action, entity, typeof details === 'string' ? details : JSON.stringify(details), result);
  } catch {
    // Don't let audit failures break operations
  }
}

// Initialize
runMigrations();
migrateFromStateJson();

export default db;
