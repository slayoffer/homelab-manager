import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, MessageSquare } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function SessionList({ sessions, activeId, onSelect, onCreate, onDelete }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <Button size="sm" className="w-full h-8 text-xs" onClick={onCreate}>
          <Plus className="h-3 w-3 mr-1.5" />
          New Chat
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors group ${
                activeId === session.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent/20 text-muted-foreground'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{session.title || 'New conversation'}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground/60">
                  <span>{formatDate(session.updated_at)}</span>
                  {session.messageCount > 0 && <span>{session.messageCount} msgs</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-center text-[11px] text-muted-foreground/40 py-6">
              No conversations yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
