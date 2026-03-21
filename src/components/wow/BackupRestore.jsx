import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/useApi';
import {
  Archive, Database, HardDrive, FolderArchive, Download,
  Trash2, Loader2, RefreshCw, RotateCcw, AlertCircle,
} from 'lucide-react';

const typeConfig = {
  directory: { label: 'Directory', icon: FolderArchive, color: 'text-blue-400' },
  database: { label: 'Database', icon: Database, color: 'text-emerald-400' },
  'volume-db': { label: 'DB Volume', icon: HardDrive, color: 'text-purple-400' },
  'volume-client': { label: 'Client Volume', icon: HardDrive, color: 'text-amber-400' },
  unknown: { label: 'Other', icon: Archive, color: 'text-zinc-400' },
};

export function BackupRestore({ onBackup, running }) {
  const { get, post } = useApi();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [pruning, setPruning] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    const data = await get('/workspaces/wow/backups');
    if (Array.isArray(data)) setBackups(data);
    setLoading(false);
  }, [get]);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  const handleRestore = async (backup) => {
    setRestoring(backup.name);
    const result = await post('/workspaces/wow/backups/restore', {
      file: backup.name,
      type: backup.type,
    });
    setRestoring(null);
    setConfirmRestore(null);
    if (result?.success) {
      alert(`Restored ${backup.name} successfully`);
    } else {
      alert(`Restore failed: ${result?.error || 'Unknown error'}`);
    }
  };

  const handlePrune = async () => {
    setPruning(true);
    const result = await post('/workspaces/wow/backups/prune');
    setPruning(false);
    if (result) {
      alert(`Pruned ${result.count} old backup(s)`);
      loadBackups();
    }
  };

  // Group by type
  const grouped = {};
  for (const b of backups) {
    if (!grouped[b.type]) grouped[b.type] = [];
    grouped[b.type].push(b);
  }

  const totalSize = backups.reduce((acc, b) => acc + b.size, 0);
  const totalSizeHuman = totalSize < 1024 * 1024 * 1024
    ? `${(totalSize / (1024 * 1024)).toFixed(0)} MB`
    : `${(totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;

  const oldBackups = backups.filter(b => b.age > 14).length;

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => onBackup('database')}
          disabled={running}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Database className="h-4 w-4 mr-2" />
          Backup Database
        </Button>
        <Button variant="outline" onClick={() => onBackup('directory')} disabled={running}>
          <FolderArchive className="h-4 w-4 mr-2" />
          Backup Directory
        </Button>
        <Button variant="outline" onClick={() => onBackup('volumes')} disabled={running}>
          <HardDrive className="h-4 w-4 mr-2" />
          Backup Volumes
        </Button>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={loadBackups} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {oldBackups > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrune}
            disabled={pruning}
            className="text-destructive border-destructive/30"
          >
            {pruning ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Trash2 className="h-3 w-3 mr-1.5" />}
            Prune ({oldBackups} old)
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="flex gap-3 text-sm text-muted-foreground">
        <span>{backups.length} backup(s)</span>
        <span>|</span>
        <span>{totalSizeHuman} total</span>
      </div>

      {/* Confirm restore dialog */}
      {confirmRestore && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Confirm Restore</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Restore <code>{confirmRestore.name}</code>? This will overwrite existing data.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRestore(confirmRestore)}
                    disabled={!!restoring}
                  >
                    {restoring ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RotateCcw className="h-3 w-3 mr-1.5" />}
                    Yes, Restore
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmRestore(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup list grouped by type */}
      {Object.entries(grouped).map(([type, files]) => {
        const cfg = typeConfig[type] || typeConfig.unknown;
        const Icon = cfg.icon;

        return (
          <Card key={type}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className={`h-4 w-4 ${cfg.color}`} />
                {cfg.label}
                <Badge variant="outline" className="ml-1">{files.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {files.map((backup) => (
                <div
                  key={backup.name}
                  className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-accent/20 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs truncate">{backup.name}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{backup.sizeHuman}</span>
                      <span>{new Date(backup.modified).toLocaleDateString()}</span>
                      <span>{backup.age}d ago</span>
                      {backup.database && (
                        <Badge variant="outline" className="text-xs py-0 h-4">
                          {backup.database}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setConfirmRestore(backup)}
                    disabled={!!restoring}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {backups.length === 0 && !loading && (
        <Card className="bg-card/50">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No backups found in /opt/backups/wow/
          </CardContent>
        </Card>
      )}
    </div>
  );
}
