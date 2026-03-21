import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Sword, Container, Server, Globe, MonitorCog, Wrench } from 'lucide-react';

const iconMap = { Sword, Container, Server, Globe, MonitorCog };

const plannedFeatures = {
  'docker-services': [
    'List all docker-compose stacks',
    'Container status overview',
    'Start/stop/restart services',
    'View container logs',
    'Resource usage per container',
  ],
  proxmox: [
    'VM and LXC container list',
    'Start/stop/snapshot VMs',
    'Resource monitoring (CPU, RAM, disk)',
    'Console access',
    'Backup management',
  ],
  traefik: [
    'Active routes and entrypoints',
    'TLS certificate status',
    'Middleware configuration',
    'Access logs viewer',
    'Dynamic configuration editor',
  ],
  servers: [
    'Server inventory',
    'SSH connectivity checks',
    'CPU/RAM/disk monitoring',
    'Uptime tracking',
    'Quick SSH terminal',
  ],
};

export function WorkspaceStub({ workspace }) {
  const Icon = iconMap[workspace.icon] || Server;
  const features = plannedFeatures[workspace.id] || [];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">{workspace.name}</h2>
          <StatusBadge status="stub" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            About this workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{workspace.description}</p>

          {features.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">Planned features:</p>
              <ul className="space-y-1.5">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                    {feature}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
