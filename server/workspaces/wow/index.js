import { Router } from 'express';
import { WorkspaceBase } from '../base.js';
import { getAllRepos, getRepoStatus, fetchRepo, pullRepo, cloneModule, removeModule } from './git.js';
import { scanMigrations, applySqlFile, saveSqlPreferences, markMigrationsApplied } from './sql.js';
import { getContainerStatus, dockerComposeAction, containerStats, restartContainer, getContainerLogs } from './docker.js';
import { listBackups, backupDirectory, backupDatabase, backupVolumes, restoreDatabase, restoreDirectory, pruneBackups } from './backup.js';
import { listDatabases, listTables, describeTable, queryTable, updateRow } from './database.js';
import { listConfigFiles, readConfig, diffConfig, saveConfig, mergeNewSettings, getConfigHistory, rollbackConfig } from './configs.js';
import db from '../../db.js';

export class WowWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'wow',
      name: 'WoW Server',
      icon: 'Sword',
      status: 'active',
      description: 'AzerothCore WotLK server management',
    });
  }

  async getStatus() {
    const containers = getContainerStatus();
    const repos = getAllRepos().map(r => ({
      ...r,
      ...getRepoStatus(r.path),
    }));

    return {
      status: this.status,
      containers,
      repos,
    };
  }

  getRoutes() {
    const router = Router();

    // Status
    router.get('/status', async (req, res) => {
      try {
        res.json(await this.getStatus());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Container status only
    router.get('/containers', (req, res) => {
      try {
        res.json(getContainerStatus());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Container stats (CPU/memory)
    router.get('/containers/stats', (req, res) => {
      try {
        res.json(containerStats());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Container logs (non-streaming, last N lines)
    router.get('/containers/:name/logs', (req, res) => {
      try {
        const tail = req.query.tail || 200;
        res.json(getContainerLogs(req.params.name, tail));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // Restart individual container
    router.post('/containers/:name/restart', (req, res) => {
      try {
        res.json(restartContainer(req.params.name));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // List repos
    router.get('/repos', (req, res) => {
      try {
        const repos = getAllRepos().map(r => ({
          ...r,
          ...getRepoStatus(r.path),
        }));
        res.json(repos);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Check for updates (fetch all)
    router.post('/repos/fetch', (req, res) => {
      try {
        const repos = getAllRepos();
        const results = repos.map(r => ({
          id: r.id,
          name: r.name,
          ...fetchRepo(r.path),
        }));
        res.json(results);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Pull all repos
    router.post('/repos/pull', (req, res) => {
      try {
        const repos = getAllRepos();
        const results = repos.map(r => ({
          id: r.id,
          name: r.name,
          ...pullRepo(r.path),
        }));
        res.json(results);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Pull single repo
    router.post('/repos/:repoId/pull', (req, res) => {
      try {
        const repos = getAllRepos();
        const repo = repos.find(r => r.id === req.params.repoId);
        if (!repo) return res.status(404).json({ error: 'Repo not found' });
        res.json({ id: repo.id, name: repo.name, ...pullRepo(repo.path) });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // SQL Migrations
    router.get('/migrations', (req, res) => {
      try {
        res.json(scanMigrations());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Apply selected migrations
    router.post('/migrations/apply', (req, res) => {
      try {
        const { migrations } = req.body; // [{id, absolutePath, database, module}]
        const results = [];
        for (const m of migrations) {
          const result = applySqlFile(m.absolutePath, m.database, m.id, m.module);
          results.push({ id: m.id, ...result });
          if (result.success) {
            markMigrationsApplied(m.module);
          }
        }
        res.json(results);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Save SQL preferences
    router.post('/migrations/preferences', (req, res) => {
      try {
        const { module: moduleName, preferences } = req.body;
        saveSqlPreferences(moduleName, preferences);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Docker actions (non-streaming, for simple start/stop)
    router.post('/docker/:action', (req, res) => {
      try {
        const proc = dockerComposeAction(req.params.action, null);
        if (!proc) return res.status(400).json({ error: 'Unknown action' });

        let output = '';
        proc.stdout.on('data', d => output += d);
        proc.stderr.on('data', d => output += d);
        proc.on('close', code => {
          res.json({ success: code === 0, output, code });
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Module management
    router.post('/modules/install', (req, res) => {
      try {
        const { gitUrl, name } = req.body;
        if (!gitUrl || !name) return res.status(400).json({ error: 'gitUrl and name required' });
        res.json(cloneModule(gitUrl, name));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.delete('/modules/:name', (req, res) => {
      try {
        res.json(removeModule(req.params.name));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Backups
    router.get('/backups', (req, res) => {
      try {
        res.json(listBackups());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/backups/restore', (req, res) => {
      try {
        const { file, type } = req.body;
        if (!file) return res.status(400).json({ error: 'file required' });

        let result;
        if (type === 'directory') {
          result = restoreDirectory(file);
        } else {
          result = restoreDatabase(file);
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/backups/prune', (req, res) => {
      try {
        res.json(pruneBackups());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Database Explorer
    router.get('/database', (req, res) => {
      try {
        res.json(listDatabases());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/database/:db/tables', (req, res) => {
      try {
        res.json(listTables(req.params.db));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/database/:db/:table/schema', (req, res) => {
      try {
        res.json(describeTable(req.params.db, req.params.table));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/database/:db/:table/rows', (req, res) => {
      try {
        res.json(queryTable(req.params.db, req.params.table, req.query));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/database/:db/:table/update', (req, res) => {
      try {
        const { primaryKey, updates } = req.body;
        if (!primaryKey || !updates) {
          return res.status(400).json({ error: 'primaryKey and updates required' });
        }
        res.json(updateRow(req.params.db, req.params.table, primaryKey, updates));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // Config Editor
    router.get('/configs', (req, res) => {
      try {
        res.json(listConfigFiles());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/configs/read', (req, res) => {
      try {
        if (!req.query.path) return res.status(400).json({ error: 'path required' });
        res.json(readConfig(req.query.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/configs/diff', (req, res) => {
      try {
        if (!req.query.path) return res.status(400).json({ error: 'path required' });
        res.json(diffConfig(req.query.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/configs/save', (req, res) => {
      try {
        const { path: configPath, content } = req.body;
        if (!configPath || content === undefined) {
          return res.status(400).json({ error: 'path and content required' });
        }
        res.json(saveConfig(configPath, content));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/configs/merge', (req, res) => {
      try {
        const { path: configPath } = req.body;
        if (!configPath) return res.status(400).json({ error: 'path required' });
        res.json(mergeNewSettings(configPath));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/configs/history', (req, res) => {
      try {
        if (!req.query.path) return res.status(400).json({ error: 'path required' });
        res.json(getConfigHistory(req.query.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/configs/rollback', (req, res) => {
      try {
        const { snapshotId } = req.body;
        if (!snapshotId) return res.status(400).json({ error: 'snapshotId required' });
        res.json(rollbackConfig(snapshotId));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // Alert Patterns
    router.get('/alert-patterns', (req, res) => {
      try {
        res.json(db.prepare('SELECT * FROM alert_patterns ORDER BY created_at').all());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/alert-patterns', (req, res) => {
      try {
        const { pattern, isRegex, notify } = req.body;
        if (!pattern) return res.status(400).json({ error: 'pattern required' });
        const result = db.prepare('INSERT INTO alert_patterns (pattern, is_regex, notify) VALUES (?, ?, ?)').run(pattern, isRegex ? 1 : 0, notify ? 1 : 0);
        res.json({ id: result.lastInsertRowid, success: true });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.delete('/alert-patterns/:id', (req, res) => {
      try {
        db.prepare('DELETE FROM alert_patterns WHERE id = ?').run(req.params.id);
        res.json({ success: true });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.patch('/alert-patterns/:id', (req, res) => {
      try {
        const { enabled, notify } = req.body;
        if (enabled !== undefined) {
          db.prepare('UPDATE alert_patterns SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, req.params.id);
        }
        if (notify !== undefined) {
          db.prepare('UPDATE alert_patterns SET notify = ? WHERE id = ?').run(notify ? 1 : 0, req.params.id);
        }
        res.json({ success: true });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // Audit Log
    router.get('/audit-log', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const action = req.query.action;
        if (action) {
          res.json(db.prepare('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY timestamp DESC LIMIT ?').all(`${action}%`, limit));
        } else {
          res.json(db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit));
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Docker Operation History
    router.get('/docker/history', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        res.json(db.prepare('SELECT * FROM docker_operations ORDER BY started_at DESC LIMIT ?').all(limit));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Info
    router.get('/info', (req, res) => {
      res.json(this.getMeta());
    });

    return router;
  }
}
