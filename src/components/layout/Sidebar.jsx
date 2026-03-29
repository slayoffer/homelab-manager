import { useState, useRef } from 'react';
import { Sword, Container, Server, Globe, MonitorCog, Home, LogOut, Shell, Sparkles, GripVertical, HardDrive } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const iconMap = {
  Sword,
  Container,
  Server,
  Globe,
  MonitorCog,
  Shell,
  Sparkles,
  Claw: Shell,
  HardDrive,
};

export function Sidebar({ workspaces, activeId, onSelect, onReorder, user }) {
  const { authEnabled, logout } = useAuth();
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const dragRef = useRef(null);

  const handleDragStart = (e, id) => {
    setDragId(id);
    dragRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== overId) setOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = dragRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = workspaces.map(w => w.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    onReorder?.(ids);
    setDragId(null);
    setOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };

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
          const isDragging = dragId === ws.id;
          const isOver = overId === ws.id && dragId !== ws.id;

          return (
            <div
              key={ws.id}
              draggable
              onDragStart={(e) => handleDragStart(e, ws.id)}
              onDragOver={(e) => handleDragOver(e, ws.id)}
              onDrop={(e) => handleDrop(e, ws.id)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-1 mb-0.5 rounded-lg transition-all
                ${isDragging ? 'opacity-40' : ''}
                ${isOver ? 'border-t-2 border-primary/50' : 'border-t-2 border-transparent'}
              `}
            >
              <div className="cursor-grab active:cursor-grabbing px-0.5 py-2.5 text-muted-foreground/30 hover:text-muted-foreground/60">
                <GripVertical className="h-3 w-3" />
              </div>
              <button
                onClick={() => onSelect(ws.id)}
                className={`flex-1 flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="block truncate">{ws.name}</span>
                  {ws.type && (
                    <span className="block text-[10px] text-muted-foreground/40 leading-tight">{ws.type}</span>
                  )}
                </div>
                {ws.status === 'stub' && (
                  <StatusBadge status="stub" />
                )}
              </button>
            </div>
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
            {authEnabled ? 'Not signed in' : `Homelab Manager ${__APP_VERSION__}`}
          </p>
        )}
      </div>
    </div>
  );
}
