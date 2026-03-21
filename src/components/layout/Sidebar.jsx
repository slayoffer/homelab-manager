import { Sword, Container, Server, Globe, MonitorCog, Home } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';

const iconMap = {
  Sword,
  Container,
  Server,
  Globe,
  MonitorCog,
};

export function Sidebar({ workspaces, activeId, onSelect }) {
  return (
    <div className="w-64 min-h-screen border-r border-border bg-[#0c1222] flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Homelab</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Server Manager</p>
      </div>

      <nav className="flex-1 p-2">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workspaces
        </p>
        {workspaces.map((ws) => {
          const Icon = iconMap[ws.icon] || Server;
          const isActive = ws.id === activeId;

          return (
            <button
              key={ws.id}
              onClick={() => onSelect(ws.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5 ${
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{ws.name}</span>
              {ws.status === 'stub' && (
                <StatusBadge status="stub" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Homelab Manager v1.0
        </p>
      </div>
    </div>
  );
}
