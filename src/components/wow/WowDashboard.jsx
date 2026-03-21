import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TerminalOutput } from '@/components/shared/TerminalOutput';
import { ModuleCard } from './ModuleCard';
import { SqlMigrations } from './SqlMigrations';
import { BackupRestore } from './BackupRestore';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Sword, Play, Square, Hammer, RefreshCw, Download,
  Loader2, GitBranch, Plus, Trash2, AlertCircle, Archive,
} from 'lucide-react';

export function WowDashboard() {
  const { get, post, del } = useApi();
  const { logs, running, sendAction, sendBackup, clearLogs } = useWebSocket();
  const [containers, setContainers] = useState([]);
  const [repos, setRepos] = useState([]);
  const [updates, setUpdates] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pullingAll, setPullingAll] = useState(false);
  const [pullingRepo, setPullingRepo] = useState({});
  const [newModuleUrl, setNewModuleUrl] = useState('');
  const [newModuleName, setNewModuleName] = useState('');
  const [installing, setInstalling] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    const data = await get('/workspaces/wow/status');
    if (data && !data.error) {
      setContainers(data.containers || []);
      setRepos(data.repos || []);
    }
    setLoadingStatus(false);
  }, [get]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

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
    await refreshStatus();
    setPullingAll(false);
  };

  const pullSingle = async (repoId) => {
    setPullingRepo(prev => ({ ...prev, [repoId]: true }));
    await post(`/workspaces/wow/repos/${repoId}/pull`);
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
          <Button variant="outline" size="sm" onClick={refreshStatus} disabled={loadingStatus}>
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
          onClick={() => sendAction('rebuild')}
          disabled={running}
        >
          <Hammer className="h-4 w-4 mr-2" />
          Rebuild & Restart
        </Button>
      </div>

      {/* Terminal Output */}
      <TerminalOutput logs={logs} onClear={clearLogs} />

      {/* Tabs */}
      <Tabs defaultValue="status">
        <TabsList className="bg-card">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="updates">
            Git Updates
            {totalUpdates > 0 && (
              <Badge className="ml-1.5 bg-primary/20 text-primary text-xs px-1.5">
                {totalUpdates}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="migrations">SQL Migrations</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="backups">
            <Archive className="h-3 w-3 mr-1.5" />
            Backups
          </TabsTrigger>
        </TabsList>

        {/* Status Tab */}
        <TabsContent value="status" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {containers.map((c) => (
              <Card key={c.name} className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.startedAt && c.status === 'running' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Since {new Date(c.startedAt).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {containers.length === 0 && (
              <Card className="bg-card/50 col-span-3">
                <CardContent className="p-4 text-center text-muted-foreground text-sm">
                  {loadingStatus ? 'Loading...' : 'No containers found'}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Git Updates Tab */}
        <TabsContent value="updates" className="space-y-4 mt-4">
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
          </div>
        </TabsContent>

        {/* SQL Migrations Tab */}
        <TabsContent value="migrations" className="mt-4">
          <SqlMigrations />
        </TabsContent>

        {/* Modules Tab */}
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
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{repo.name || repo.id}</h3>
                        <StatusBadge status="active" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <GitBranch className="h-3 w-3" />
                        <span>{repo.branch}</span>
                        <span className="text-border">|</span>
                        <span className="truncate">{repo.remote}</span>
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
          </div>
        </TabsContent>

        {/* Backups Tab */}
        <TabsContent value="backups" className="mt-4">
          <BackupRestore onBackup={sendBackup} running={running} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

