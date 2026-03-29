import { WorkspaceBase } from '../base.js';

export class ProxmoxWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'proxmox',
      name: 'Proxmox VE',
      icon: 'Server',
      status: 'stub',
      description: 'Manage Proxmox virtual machines and LXC containers. Start/stop VMs, create snapshots, view resource usage.',
      type: 'baremetal-server',
    });
  }
}
