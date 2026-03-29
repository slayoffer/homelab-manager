import { WorkspaceBase } from '../base.js';

export class DockerServicesWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'docker-services',
      name: 'Docker Services',
      icon: 'Container',
      status: 'stub',
      description: 'Manage all docker-compose stacks on the server. View container status, start/stop services, check logs.',
      type: 'docker-server',
    });
  }
}
