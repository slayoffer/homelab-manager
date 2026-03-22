import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EnhancedLogViewer } from './EnhancedLogViewer';
import { useApi } from '@/hooks/useApi';
import { useLogAlerts } from '@/hooks/useLogAlerts';
import {
  ScrollText, Play, Square, Loader2, Bell, BellOff,
  ChevronDown, ChevronRight, Plus, Trash2, Regex,
} from 'lucide-react';

const CONTAINERS = [
  { value: 'all', label: 'All Containers' },
  { value: 'ac-database', label: 'ac-database' },
  { value: 'ac-worldserver', label: 'ac-worldserver' },
  { value: 'ac-authserver', label: 'ac-authserver' },
];

const TAIL_OPTIONS = [100, 500, 1000, 5000];

export function ContainerLogs({
  containerLogs, followingContainer, sendLogs, stopLogs, clearContainerLogs,
  initialContainer, onAlertCountChange,
}) {
  const { get } = useApi();
  const {
    patterns, alertCount, checkEntry,
    addPattern, removePattern, togglePattern,
    resetAlertCount, requestNotificationPermission,
  } = useLogAlerts();

  const [container, setContainer] = useState(initialContainer || 'all');
  const [tail, setTail] = useState(100);
  const [staticEntries, setStaticEntries] = useState([]);
  const [loadingStatic, setLoadingStatic] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newPatternRegex, setNewPatternRegex] = useState(false);
  const [newPatternNotify, setNewPatternNotify] = useState(false);

  useEffect(() => {
    if (initialContainer && initialContainer !== container) {
      setContainer(initialContainer);
    }
  }, [initialContainer]);

  // Report alert count to parent
  useEffect(() => {
    onAlertCountChange?.(alertCount);
  }, [alertCount, onAlertCountChange]);

  const loadStaticLogs = async (containerName, tailLines) => {
    if (!containerName || containerName === 'all') return;
    setLoadingStatic(true);
    const data = await get(`/workspaces/wow/containers/${containerName}/logs?tail=${tailLines}`);
    if (data && !data.error && data.logs) {
      let counter = 0;
      const entries = data.logs.split('\n').filter(l => l.trim()).map(line => {
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s/);
        const timestamp = tsMatch ? new Date(tsMatch[1]).getTime() : Date.now();
        const text = tsMatch ? line.slice(tsMatch[0].length) : line;
        let level = 'info';
        if (/\b(ERROR|FATAL|CRIT(ICAL)?)\b/i.test(text)) level = 'error';
        else if (/\b(WARN(ING)?)\b/i.test(text)) level = 'warn';
        else if (/\b(DEBUG|TRACE)\b/i.test(text)) level = 'debug';
        return { id: ++counter, container: containerName, raw: line, timestamp, text, level };
      });
      setStaticEntries(entries);
    } else {
      setStaticEntries([]);
    }
    setLoadingStatic(false);
  };

  const handleContainerChange = (value) => {
    setContainer(value);
    if (followingContainer) stopLogs();
    setStaticEntries([]);
  };

  const handleLoadLogs = () => {
    if (!container || container === 'all') return;
    if (followingContainer) stopLogs();
    loadStaticLogs(container, tail);
  };

  const handleFollow = () => {
    if (!container) return;
    setStaticEntries([]);
    resetAlertCount();
    sendLogs(container, { tail, follow: true });
  };

  const handleStop = () => {
    stopLogs();
  };

  const handleAddPattern = () => {
    if (!newPattern.trim()) return;
    addPattern(newPattern.trim(), newPatternRegex, newPatternNotify);
    setNewPattern('');
    setNewPatternRegex(false);
    setNewPatternNotify(false);
  };

  const isFollowing = !!followingContainer;
  const displayEntries = isFollowing ? containerLogs : staticEntries;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={container} onValueChange={handleContainerChange}>
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Select container..." />
          </SelectTrigger>
          <SelectContent>
            {CONTAINERS.map(c => (
              <SelectItem key={c.value} value={c.value}>
                <span className="font-mono text-sm">{c.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(tail)} onValueChange={(v) => setTail(parseInt(v))}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAIL_OPTIONS.map(n => (
              <SelectItem key={n} value={String(n)}>{n} lines</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {container !== 'all' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadLogs}
            disabled={!container || loadingStatic || isFollowing}
          >
            {loadingStatic ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <ScrollText className="h-3.5 w-3.5 mr-1.5" />
            )}
            Load Logs
          </Button>
        )}

        {isFollowing ? (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            <Square className="h-3.5 w-3.5 mr-1.5" />
            Stop Following
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleFollow}
            disabled={!container}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Follow Live
          </Button>
        )}

        {isFollowing && (
          <Badge className="bg-emerald-500/20 text-emerald-400 animate-pulse">
            Live: {followingContainer === 'all' ? 'All' : followingContainer}
          </Badge>
        )}
      </div>

      {/* Alert Config */}
      <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          {alertsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Bell className="h-3.5 w-3.5" />
          Alert Patterns
          {alertCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1.5">
              {alertCount}
            </Badge>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="rounded-lg border border-border p-3 space-y-3">
            {/* Existing patterns */}
            <div className="space-y-1.5">
              {patterns.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={p.enabled}
                    onCheckedChange={() => togglePattern(p.id)}
                  />
                  <span className={`font-mono flex-1 ${!p.enabled ? 'text-muted-foreground line-through' : ''}`}>
                    {p.pattern}
                  </span>
                  {p.isRegex && <Badge variant="outline" className="text-[10px] px-1 h-4">regex</Badge>}
                  {p.notify ? (
                    <Bell className="h-3 w-3 text-primary" />
                  ) : (
                    <BellOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removePattern(p.id)}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add new pattern */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="New pattern..."
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPattern()}
                className="h-7 text-xs flex-1"
              />
              <Button
                variant={newPatternRegex ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setNewPatternRegex(!newPatternRegex)}
                title="Regex"
              >
                <Regex className="h-3 w-3" />
              </Button>
              <Button
                variant={newPatternNotify ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setNewPatternNotify(!newPatternNotify)}
                title="Browser notification"
              >
                <Bell className="h-3 w-3" />
              </Button>
              <Button size="sm" className="h-7" onClick={handleAddPattern} disabled={!newPattern.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Notification permission */}
            {'Notification' in window && Notification.permission !== 'granted' && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={requestNotificationPermission}
              >
                <Bell className="h-3 w-3 mr-1.5" />
                Enable Browser Notifications
              </Button>
            )}

            {alertCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={resetAlertCount}>
                Clear {alertCount} alerts
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Log Output */}
      {displayEntries.length > 0 && (
        <EnhancedLogViewer
          entries={displayEntries}
          onClear={isFollowing ? clearContainerLogs : () => setStaticEntries([])}
          alertChecker={checkEntry}
        />
      )}

      {!container && displayEntries.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <ScrollText className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">
              Select a container to view its logs
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
