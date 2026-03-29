import { WorkspaceBase } from '../base.js';

export class TraefikWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'traefik',
      name: 'Traefik',
      icon: 'Globe',
      status: 'stub',
      description: 'View and manage Traefik reverse proxy routes, TLS certificates, and middleware configuration.',
      type: 'reverse-proxy',
    });
  }
}
