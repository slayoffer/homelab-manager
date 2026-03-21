import { Router } from 'express';
import { WorkspaceBase } from '../base.js';
import { getAllRepos, getRepoStatus, fetchRepo, pullRepo, cloneModule, removeModule } from './git.js';
import { scanMigrations, applySqlFile, saveSqlPreferences, markMigrationsApplied } from './sql.js';
import { getContainerStatus, dockerComposeAction } from './docker.js';
import { listBackups, backupDirectory, backupDatabase, backupVolumes, restoreDatabase, restoreDirectory, pruneBackups } from './backup.js';

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
          const result = applySqlFile(m.absolutePath, m.database);
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

    // Info
    router.get('/info', (req, res) => {
      res.json(this.getMeta());
    });

    return router;
  }
}
