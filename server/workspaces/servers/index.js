import { WorkspaceBase } from '../base.js';

export class ServersWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'servers',
      name: 'Servers',
      icon: 'MonitorCog',
      status: 'stub',
      description: 'Server inventory and monitoring. SSH connectivity status, CPU/RAM/disk usage, and basic management.',
    });
  }
}
