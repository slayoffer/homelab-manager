import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import {
  Activity, RefreshCw, Loader2, Database, Settings2,
  Container, Save, GitBranch, Trash2, RotateCcw,
} from 'lucide-react';

const ACTION_ICONS = {
  'migration.apply': Database,
  'config.save': Save,
  'config.merge': Save,
  'config.rollback': RotateCcw,
  'db.update': Database,
  'docker.restart': RotateCcw,
  'docker.compose': Container,
  'module.install': GitBranch,
  'module.remove': Trash2,
};

const ACTION_COLORS = {
  success: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
};

const ACTION_TYPES = ['all', 'migration', 'config', 'db', 'docker', 'module', 'backup'];

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp + 'Z'); // SQLite stores UTC without Z
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AuditLog() {
  const { get } = useApi();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const params = filter !== 'all' ? `?action=${filter}&limit=100` : '?limit=100';
    const data = await get(`/workspaces/wow/audit-log${params}`);
    if (Array.isArray(data)) setEntries(data);
    setLoading(false);
  }, [get, filter]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Activity Log</span>
          <Badge variant="outline" className="text-xs">{entries.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={loadEntries} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      <Card>
        <ScrollArea className="max-h-[calc(100vh-450px)] min-h-[300px]">
          <CardContent className="p-0">
            {entries.length === 0 && !loading && (
              <div className="text-center text-muted-foreground text-sm py-8">
                No activity recorded yet
              </div>
            )}
            {entries.map(entry => {
              const Icon = ACTION_ICONS[entry.action] || Activity;
              const resultColor = ACTION_COLORS[entry.result] || ACTION_COLORS.success;
              let details = '';
              try { details = entry.details ? JSON.parse(entry.details) : ''; } catch { details = entry.details; }

              return (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-accent/10">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{entry.action}</span>
                      <Badge className={`${resultColor} text-[10px] px-1 h-4`}>{entry.result}</Badge>
                    </div>
                    {entry.entity && (
                      <p className="text-xs text-muted-foreground font-mono truncate">{entry.entity}</p>
                    )}
                    {details && typeof details === 'object' && details.error && (
                      <p className="text-xs text-red-400 truncate">{details.error}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(entry.timestamp)}</span>
                </div>
              );
            })}
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
