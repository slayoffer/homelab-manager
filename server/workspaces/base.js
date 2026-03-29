import { Router } from 'express';

export class WorkspaceBase {
  constructor({ id, name, icon, status = 'stub', description = '', type }) {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.status = status;
    this.description = description;
    this.type = type;
  }

  async getStatus() {
    return { status: this.status, message: 'Coming soon' };
  }

  getRoutes() {
    const router = Router();
    router.get('/status', async (req, res) => {
      try {
        const status = await this.getStatus();
        res.json(status);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    router.get('/info', (req, res) => {
      res.json({
        id: this.id,
        name: this.name,
        icon: this.icon,
        status: this.status,
        description: this.description,
        type: this.type,
      });
    });
    return router;
  }

  getMeta() {
    return {
      id: this.id,
      name: this.name,
      icon: this.icon,
      status: this.status,
      description: this.description,
      type: this.type,
    };
  }
}
