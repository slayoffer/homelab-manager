import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useApi } from '@/hooks/useApi';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Database, ChevronDown, ChevronRight, Play, Square, Loader2, CheckCircle2, XCircle, Info, CircleDot } from 'lucide-react';

const DB_CONTAINER = 'ac-database';

export function SqlMigrations() {
  const { get, post } = useApi();
  const [modules, setModules] = useState([]);
  const [selected, setSelected] = useState({});
  const [openModules, setOpenModules] = useState({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState(null);
  const [dbStatus, setDbStatus] = useState(null); // 'running' | 'exited' | 'not_found' | null
  const [dbAction, setDbAction] = useState(null); // 'starting' | 'stopping' | null

  const refreshDbStatus = useCallback(async () => {
    const containers = await get('/workspaces/wow/containers');
    if (Array.isArray(containers)) {
      const db = containers.find(c => c.name === DB_CONTAINER);
      setDbStatus(db?.status || 'not_found');
    }
  }, [get]);

  const loadMigrations = useCallback(async () => {
    setLoading(true);
    const data = await get('/workspaces/wow/migrations');
    if (Array.isArray(data)) {
      setModules(data);
      const sel = {};
      for (const mod of data) {
        for (const m of mod.migrations) {
          sel[m.id] = m.selected;
        }
      }
      setSelected(sel);
    }
    setLoading(false);
  }, [get]);

  useEffect(() => {
    loadMigrations();
    refreshDbStatus();
  }, [loadMigrations, refreshDbStatus]);

  const handleDbAction = async (action) => {
    setDbAction(action === 'start' ? 'starting' : 'stopping');
    await post(`/workspaces/wow/containers/${DB_CONTAINER}/${action}`);
    // Brief delay for container state to settle
    setTimeout(async () => {
      await refreshDbStatus();
      setDbAction(null);
    }, 1500);
  };

  const toggleMigration = (id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllForModule = (moduleName, migrations, value) => {
    const updates = {};
    for (const m of migrations) {
      updates[m.id] = value;
    }
    setSelected(prev => ({ ...prev, ...updates }));
  };

  const savePreferences = async (moduleName) => {
    const prefs = {};
    for (const mod of modules) {
      if (mod.module === moduleName) {
        for (const m of mod.migrations) {
          if (m.type === 'optional') {
            prefs[m.id] = selected[m.id] || false;
          }
        }
      }
    }
    await post('/workspaces/wow/migrations/preferences', { module: moduleName, preferences: prefs });
  };

  const applySelected = async () => {
    const migrations = [];
    for (const mod of modules) {
      for (const m of mod.migrations) {
        if (selected[m.id]) {
          migrations.push({
            id: m.id,
            absolutePath: m.absolutePath,
            database: m.database,
            module: m.module,
          });
        }
      }
    }

    if (!migrations.length) return;

    setApplying(true);
    // Save preferences before applying
    const moduleNames = [...new Set(migrations.map(m => m.module))];
    for (const name of moduleNames) {
      await savePreferences(name);
    }

    const res = await post('/workspaces/wow/migrations/apply', { migrations });
    setResults(res);
    setApplying(false);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const totalCount = modules.reduce((acc, m) => acc + m.migrations.length, 0);
  const dbRunning = dbStatus === 'running';

  const dbColors = {
    world: 'text-emerald-400',
    characters: 'text-blue-400',
    auth: 'text-amber-400',
    playerbots: 'text-purple-400',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            SQL Migrations
            <Badge variant="outline" className="ml-2">
              {selectedCount}/{totalCount}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* DB status indicator + control */}
            <div className="flex items-center gap-1.5 mr-1">
              <CircleDot className={`h-3.5 w-3.5 ${dbRunning ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className="text-xs text-muted-foreground">DB</span>
            </div>
            {dbRunning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDbAction('stop')}
                disabled={!!dbAction}
                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
              >
                {dbAction === 'stopping' ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Square className="h-3 w-3 mr-1.5" />}
                Stop DB
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDbAction('start')}
                disabled={!!dbAction || dbStatus === null}
                className="text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
              >
                {dbAction === 'starting' ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Play className="h-3 w-3 mr-1.5" />}
                Start DB
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={loadMigrations} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={applySelected}
              disabled={applying || !selectedCount || !dbRunning}
              className="bg-primary text-primary-foreground"
            >
              {applying ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Play className="h-3 w-3 mr-1.5" />}
              Apply Selected ({selectedCount})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!dbRunning && dbStatus && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-400">
            Database container is not running. Start it before applying migrations.
          </div>
        )}

        {results && (
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-sm font-medium mb-2">Results:</p>
            {Array.isArray(results) && results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {r.success ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-400" />
                )}
                <span className="truncate">{r.id}</span>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setResults(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {modules.map((mod) => {
          const isOpen = openModules[mod.module] !== false;
          const modSelected = mod.migrations.filter(m => selected[m.id]).length;
          const optionalCount = mod.migrations.filter(m => m.type === 'optional').length;
          const newCount = mod.migrations.filter(m => m.isNew).length;

          return (
            <Collapsible
              key={mod.module}
              open={isOpen}
              onOpenChange={(open) => setOpenModules(prev => ({ ...prev, [mod.module]: open }))}
            >
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/30 transition-colors">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium text-sm">{mod.module}</span>
                  <Badge variant="outline" className="text-xs">
                    {modSelected}/{mod.migrations.length}
                  </Badge>
                  {optionalCount > 0 && <StatusBadge status="optional" label={`${optionalCount} optional`} />}
                  {newCount > 0 && <StatusBadge status="new" label={`${newCount} new`} />}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-6 space-y-1 mt-1">
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => selectAllForModule(mod.module, mod.migrations, true)}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => selectAllForModule(mod.module, mod.migrations, false)}
                    >
                      Deselect All
                    </Button>
                  </div>

                  <TooltipProvider>
                    {mod.migrations.map((m) => (
                      <div key={m.id} className="space-y-0.5">
                        <label
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent/20 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selected[m.id] || false}
                            onCheckedChange={() => toggleMigration(m.id)}
                          />
                          <span className={`text-xs font-mono ${dbColors[m.database] || ''}`}>
                            [{m.database}]
                          </span>
                          <span className="truncate flex-1 text-xs">{m.file}</span>
                          {m.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm">
                                <p className="text-xs whitespace-pre-wrap">{m.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {m.type === 'optional' && <StatusBadge status="optional" />}
                          {m.isNew && <StatusBadge status="new" />}
                        </label>
                        {m.description && m.type === 'optional' && (
                          <p className="text-[11px] text-muted-foreground/60 ml-8 pr-2 leading-relaxed">
                            {m.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </TooltipProvider>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {modules.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No migrations found. Check if modules are installed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
