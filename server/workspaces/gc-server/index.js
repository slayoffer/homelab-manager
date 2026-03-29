import { Router } from 'express';
import { WorkspaceBase } from '../base.js';
import { sshExec } from '../../lib/ssh.js';
import config from '../../config.js';
import { listDirectory, readFile, createDirectory, createFile, renameItem, deleteItem, getDiskStats } from './filesystem.js';

export class GcServerWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'gc-server',
      name: 'GC Server',
      icon: 'HardDrive',
      status: 'active',
      description: 'GeekyConsole virtual server — file management and monitoring',
      type: 'virtual-server',
    });
  }

  async getStatus() {
    try {
      const uptime = sshExec(config.gcServer, 'uptime -p', { timeout: 10000 });
      return { status: 'online', uptime: uptime.trim() };
    } catch {
      return { status: 'offline' };
    }
  }

  getRoutes() {
    const router = super.getRoutes();

    // Filesystem API
    router.get('/fs/list', (req, res) => {
      try {
        const dirPath = req.query.path || '/';
        res.json(listDirectory(dirPath));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/fs/read', (req, res) => {
      try {
        if (!req.query.path) return res.status(400).json({ error: 'path required' });
        res.json(readFile(req.query.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/fs/mkdir', (req, res) => {
      try {
        if (!req.body.path) return res.status(400).json({ error: 'path required' });
        res.json(createDirectory(req.body.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/fs/create', (req, res) => {
      try {
        if (!req.body.path) return res.status(400).json({ error: 'path required' });
        res.json(createFile(req.body.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/fs/rename', (req, res) => {
      try {
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });
        res.json(renameItem(oldPath, newPath));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/fs/delete', (req, res) => {
      try {
        if (!req.body.path) return res.status(400).json({ error: 'path required' });
        if (!req.body.confirm) return res.status(400).json({ error: 'confirm: true required' });
        res.json(deleteItem(req.body.path));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.get('/fs/stats', (req, res) => {
      try {
        res.json(getDiskStats());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }
}
