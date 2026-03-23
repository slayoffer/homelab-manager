import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TerminalOutput } from '@/components/shared/TerminalOutput';
import { ModuleCard } from './ModuleCard';
import { SqlMigrations } from './SqlMigrations';
import { BackupRestore } from './BackupRestore';
import { DatabaseExplorer } from './DatabaseExplorer';
import { ContainerLogs } from './ContainerLogs';
import { ConfigEditor } from './ConfigEditor';
import { AuditLog } from './AuditLog';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Sword, Play, Square, Hammer, RefreshCw, Download,
  Loader2, GitBranch, Plus, Trash2, Archive, Settings2, Activity,
  ScrollText, RotateCcw, MonitorCheck, GitPullRequest, Puzzle,
  TableProperties, Database, AlertTriangle, X,
} from 'lucide-react';

function parseCpuPercent(str) {
  if (!str) return 0;
  return parseFloat(str.replace('%', '')) || 0;
}

function parseMemPercent(str) {
  if (!str) return 0;
  return parseFloat(str.replace('%', '')) || 0;
}

export function WowDashboard() {
  const { get, post, del } = useApi();
  const {
    logs, running, sendAction, sendBackup, clearLogs,
    containerLogs, followingContainer, sendLogs, stopLogs, clearContainerLogs,
  } = useWebSocket();
  const [containers, setContainers] = useState([]);
  const [stats, setStats] = useState({});
  const [repos, setRepos] = useState([]);
  const [updates, setUpdates] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pullingAll, setPullingAll] = useState(false);
  const [pullingRepo, setPullingRepo] = useState({});
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [newModuleUrl, setNewModuleUrl] = useState('');
  const [newModuleName, setNewModuleName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [restarting, setRestarting] = useState({});
  const [activeTab, setActiveTab] = useState('status');
  const [logsContainer, setLogsContainer] = useState('');
  const [logAlertCount, setLogAlertCount] = useState(0);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    const data = await get('/workspaces/wow/status');
    if (data && !data.error) {
      setContainers(data.containers || []);
      setRepos(data.repos || []);
    }
    setLoadingStatus(false);
  }, [get]);

  const refreshStats = useCallback(async () => {
    const data = await get('/workspaces/wow/containers/stats');
    if (Array.isArray(data)) {
      const map = {};
      for (const s of data) map[s.name] = s;
      setStats(map);
    }
  }, [get]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => { refreshStats(); }, [refreshStats]);

  const checkUpdates = async () => {
    setChecking(true);
    const data = await post('/workspaces/wow/repos/fetch');
    if (Array.isArray(data)) {
      const updateMap = {};
      for (const u of data) updateMap[u.id] = u;
      setUpdates(updateMap);
    }
    setChecking(false);
  };

  const pullAll = async () => {
    setPullingAll(true);
    await post('/workspaces/wow/repos/pull');
    setUpdates(null);
    setNeedsRebuild(true);
    await refreshStatus();
    setPullingAll(false);
  };

  const pullSingle = async (repoId) => {
    setPullingRepo(prev => ({ ...prev, [repoId]: true }));
    await post(`/workspaces/wow/repos/${repoId}/pull`);
    setNeedsRebuild(true);
    await refreshStatus();
    setPullingRepo(prev => ({ ...prev, [repoId]: false }));
  };

  const installModule = async () => {
    if (!newModuleUrl || !newModuleName) return;
    setInstalling(true);
    await post('/workspaces/wow/modules/install', { gitUrl: newModuleUrl, name: newModuleName });
    setNewModuleUrl('');
    setNewModuleName('');
    await refreshStatus();
    setInstalling(false);
  };

  const removeModule = async (name) => {
    if (!confirm(`Remove module ${name}? This deletes the directory.`)) return;
    await del(`/workspaces/wow/modules/${name}`);
    await refreshStatus();
  };

  const handleRestartContainer = async (name) => {
    if (!confirm(`Restart container ${name}?`)) return;
    setRestarting(prev => ({ ...prev, [name]: true }));
    await post(`/workspaces/wow/containers/${name}/restart`);
    await refreshStatus();
    await refreshStats();
    setRestarting(prev => ({ ...prev, [name]: false }));
  };

  const viewContainerLogs = (name) => {
    setLogsContainer(name);
    setActiveTab('logs');
  };

  const runningCount = containers.filter(c => c.status === 'running').length;
  const totalUpdates = updates
    ? Object.values(updates).reduce((acc, u) => acc + (u.behind || 0), 0)
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Sword className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">WoW Server</h2>
            <p className="text-sm text-muted-foreground">AzerothCore WotLK</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={runningCount > 0 ? 'running' : 'exited'}
            label={`${runningCount}/${containers.length} containers`} />
          <Button variant="outline" size="sm" onClick={() => { refreshStatus(); refreshStats(); }} disabled={loadingStatus}>
            <RefreshCw className={`h-3 w-3 mr-1.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => sendAction('start')}
          disabled={running}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Play className="h-4 w-4 mr-2" />
          Quick Start
        </Button>
        <Button
          variant="destructive"
          onClick={() => sendAction('stop')}
          disabled={running}
        >
          <Square className="h-4 w-4 mr-2" />
          Stop Server
        </Button>
        <Button
          variant="outline"
          onClick={() => { sendAction('rebuild'); setNeedsRebuild(false); }}
          disabled={running}
        >
          <Hammer className="h-4 w-4 mr-2" />
          Rebuild & Restart
        </Button>
      </div>

      {/* Terminal Output */}
      <TerminalOutput logs={logs} onClear={clearLogs} />

      {/* Tabs — grouped: Monitor | Maintain | Manage | Ops */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card">
          {/* Monitor */}
          <TabsTrigger value="status">
            <MonitorCheck className="h-3 w-3 mr-1.5" />
            Status
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="h-3 w-3 mr-1.5" />
            Logs
            {logAlertCount > 0 && (
              <Badge className="ml-1.5 bg-red-500/20 text-red-400 text-xs px-1.5">
                {logAlertCount}
              </Badge>
            )}
          </TabsTrigger>

          {/* Maintain */}
          <TabsTrigger value="updates">
            <GitPullRequest className="h-3 w-3 mr-1.5" />
            Updates
            {totalUpdates > 0 && (
              <Badge className="ml-1.5 bg-primary/20 text-primary text-xs px-1.5">
                {totalUpdates}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="migrations">
            <Database className="h-3 w-3 mr-1.5" />
            Migrations
          </TabsTrigger>

          {/* Manage */}
          <TabsTrigger value="config">
            <Settings2 className="h-3 w-3 mr-1.5" />
            Config
          </TabsTrigger>
          <TabsTrigger value="database">
            <TableProperties className="h-3 w-3 mr-1.5" />
            Database
          </TabsTrigger>
          <TabsTrigger value="modules">
            <Puzzle className="h-3 w-3 mr-1.5" />
            Modules
          </TabsTrigger>

          {/* Ops */}
          <TabsTrigger value="backups">
            <Archive className="h-3 w-3 mr-1.5" />
            Backups
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-3 w-3 mr-1.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* ===== Status Tab ===== */}
        <TabsContent value="status" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TooltipProvider>
              {containers.map((c) => {
                const st = stats[c.name];
                const cpuPct = parseCpuPercent(st?.cpu);
                const memPct = parseMemPercent(st?.memPercent);

                return (
                  <Card key={c.name} className="bg-card/50">
                    <CardContent className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>

                      {c.startedAt && c.status === 'running' && (
                        <p className="text-xs text-muted-foreground">
                          Up since {new Date(c.startedAt).toLocaleString()}
                        </p>
                      )}

                      {/* Resource bars */}
                      {st && c.status === 'running' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-10">CPU</span>
                            <Progress value={Math.min(cpuPct, 100)} className="flex-1 h-1.5" />
                            <span className="text-muted-foreground w-12 text-right">{st.cpu}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-10">MEM</span>
                            <Progress value={Math.min(memPct, 100)} className="flex-1 h-1.5" />
                            <span className="text-muted-foreground w-12 text-right truncate">{st.memUsage?.split('/')[0]?.trim()}</span>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 pt-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => viewContainerLogs(c.name)}
                            >
                              <ScrollText className="h-3 w-3 mr-1" />
                              Logs
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View container logs</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => handleRestartContainer(c.name)}
                              disabled={restarting[c.name]}
                            >
                              {restarting[c.name]
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <RotateCcw className="h-3 w-3 mr-1" />
                              }
                              Restart
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Restart this container</TooltipContent>
                        </Tooltip>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TooltipProvider>
            {containers.length === 0 && (
              <Card className="bg-card/50 col-span-3">
                <CardContent className="p-4 text-center text-muted-foreground text-sm">
                  {loadingStatus ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading containers...
                    </div>
                  ) : 'No containers found'}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ===== Logs Tab ===== */}
        <TabsContent value="logs" className="mt-4">
          <ContainerLogs
            containerLogs={containerLogs}
            followingContainer={followingContainer}
            sendLogs={sendLogs}
            stopLogs={stopLogs}
            clearContainerLogs={clearContainerLogs}
            initialContainer={logsContainer}
            onAlertCountChange={setLogAlertCount}
          />
        </TabsContent>

        {/* ===== Updates Tab ===== */}
        <TabsContent value="updates" className="space-y-4 mt-4">
          {needsRebuild && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Repos updated — rebuild the Docker image to apply changes
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => { sendAction('rebuild'); setNeedsRebuild(false); }}
                  disabled={running}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  <Hammer className="h-3 w-3 mr-1.5" />
                  Rebuild & Restart
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-amber-400/60 hover:text-amber-400"
                  onClick={() => setNeedsRebuild(false)}
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={checkUpdates} disabled={checking}>
              {checking ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
              Check for Updates
            </Button>
            <Button size="sm" onClick={pullAll} disabled={pullingAll} className="bg-primary text-primary-foreground">
              {pullingAll ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Download className="h-3 w-3 mr-1.5" />}
              Pull All
            </Button>
          </div>

          <div className="space-y-2">
            {repos.map((repo) => (
              <ModuleCard
                key={repo.id}
                repo={repo}
                updateInfo={updates?.[repo.id]}
                onPull={() => pullSingle(repo.id)}
                pulling={pullingRepo[repo.id]}
              />
            ))}
            {repos.length === 0 && !loadingStatus && (
              <Card className="bg-card/50">
                <CardContent className="p-4 text-center text-muted-foreground text-sm">
                  No repositories found
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ===== Migrations Tab ===== */}
        <TabsContent value="migrations" className="mt-4">
          <SqlMigrations />
        </TabsContent>

        {/* ===== Config Tab ===== */}
        <TabsContent value="config" className="mt-4">
          <ConfigEditor />
        </TabsContent>

        {/* ===== Database Tab ===== */}
        <TabsContent value="database" className="mt-4">
          <DatabaseExplorer />
        </TabsContent>

        {/* ===== Modules Tab ===== */}
        <TabsContent value="modules" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4" />
                Install New Module
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Git URL (e.g., https://github.com/user/mod-name.git)"
                  value={newModuleUrl}
                  onChange={(e) => setNewModuleUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
                />
                <input
                  type="text"
                  placeholder="Module name"
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  className="w-48 px-3 py-2 rounded-md bg-background border border-input text-sm"
                />
                <Button onClick={installModule} disabled={installing || !newModuleUrl || !newModuleName}>
                  {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {repos.filter(r => r.id !== 'core').map((repo) => (
              <Card key={repo.id} className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Puzzle className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium text-sm">{repo.name || repo.id}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <GitBranch className="h-3 w-3" />
                          <span>{repo.branch}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeModule(repo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {repos.filter(r => r.id !== 'core').length === 0 && (
              <Card className="bg-card/50">
                <CardContent className="p-4 text-center text-muted-foreground text-sm">
                  No modules installed. Use the form above to add one.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ===== Backups Tab ===== */}
        <TabsContent value="backups" className="mt-4">
          <BackupRestore onBackup={sendBackup} running={running} />
        </TabsContent>

        {/* ===== Activity Tab ===== */}
        <TabsContent value="activity" className="mt-4">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
