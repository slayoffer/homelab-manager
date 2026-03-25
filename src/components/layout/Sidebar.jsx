import { Sword, Container, Server, Globe, MonitorCog, Home, LogOut, BrainCircuit } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const iconMap = {
  Sword,
  Container,
  Server,
  Globe,
  MonitorCog,
  BrainCircuit,
};

export function Sidebar({ workspaces, activeId, onSelect, user }) {
  const { authEnabled, logout } = useAuth();

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

      <div className="p-3 border-t border-border">
        {user ? (
          <div className="flex items-center gap-2.5">
            <img
              src={user.avatar_url}
              alt={user.username}
              className="h-7 w-7 rounded-full shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.display_name || user.username}</p>
              <p className="text-[10px] text-muted-foreground truncate">@{user.username}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={logout}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {authEnabled ? 'Not signed in' : 'Homelab Manager v1.0'}
          </p>
        )}
      </div>
    </div>
  );
}
