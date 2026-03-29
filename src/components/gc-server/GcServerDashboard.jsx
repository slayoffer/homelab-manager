import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useApi } from '@/hooks/useApi';
import { HardDrive, RefreshCw, FolderTree, BarChart3 } from 'lucide-react';
import { FileManager } from './FileManager';

export function GcServerDashboard() {
  const { get } = useApi();
  const [status, setStatus] = useState(null);
  const [diskStats, setDiskStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [s, d] = await Promise.all([
      get('/workspaces/gc-server/status'),
      get('/workspaces/gc-server/fs/stats'),
    ]);
    if (s) setStatus(s);
    if (d) setDiskStats(d);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const isOnline = status?.status === 'online';
  const usagePercent = diskStats?.disk?.percent ? parseInt(diskStats.disk.percent) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10">
            <HardDrive className="h-7 w-7 text-violet-400" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">GC Server</h2>
            <p className="text-sm text-muted-foreground">
              {status?.uptime || 'Virtual server'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={isOnline ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30'}>
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            Files
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="mt-4">
          <FileManager />
        </TabsContent>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Disk Usage */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Disk Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {diskStats?.disk?.used || '—'} / {diskStats?.disk?.total || '—'}
                </span>
                <span className={usagePercent > 80 ? 'text-red-400' : 'text-muted-foreground'}>
                  {diskStats?.disk?.percent || '—'}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
            </CardContent>
          </Card>

          {/* Directory Sizes */}
          {diskStats?.directories?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Directory Sizes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {diskStats.directories.map(d => (
                    <div key={d.path} className="flex items-center justify-between text-sm font-mono">
                      <span className="text-muted-foreground">{d.path}</span>
                      <span>{d.size}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
