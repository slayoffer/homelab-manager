import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApi } from '@/hooks/useApi';
import { CopyPath } from '@/components/shared/CopyPath';
import {
  Folder, File, FileText, FolderPlus, FilePlus, RefreshCw,
  Loader2, ChevronRight, Pencil, Trash2, X, Check, ArrowUp,
} from 'lucide-react';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function FileIcon({ type }) {
  if (type === 'directory') return <Folder className="h-4 w-4 text-amber-400 shrink-0" />;
  if (type === 'link') return <File className="h-4 w-4 text-blue-400 shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function FileManager() {
  const { get, post } = useApi();
  const [currentPath, setCurrentPath] = useState('/home/slayo');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewFile, setViewFile] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [dialog, setDialog] = useState(null); // { type: 'mkdir'|'create'|'rename'|'delete', name?, path? }
  const [dialogInput, setDialogInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDir = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    const data = await get(`/workspaces/gc-server/fs/list?path=${encodeURIComponent(path)}`);
    if (data?.error) {
      setError(data.error);
      setEntries([]);
    } else if (Array.isArray(data)) {
      setEntries(data);
      setCurrentPath(path);
    }
    setLoading(false);
  }, [get]);

  useEffect(() => { loadDir(currentPath); }, []);

  const navigate = (path) => {
    setViewFile(null);
    loadDir(path);
  };

  const goUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigate(parent);
  };

  const openFile = async (entry) => {
    const fullPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    setViewLoading(true);
    const data = await get(`/workspaces/gc-server/fs/read?path=${encodeURIComponent(fullPath)}`);
    setViewLoading(false);
    if (data?.error) {
      setError(data.error);
    } else {
      setViewFile({ ...data, path: fullPath, name: entry.name });
    }
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(col === 'name'); }
  };

  const sorted = [...entries].sort((a, b) => {
    // Directories always first
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (sortBy === 'modified') cmp = (a.modified || '').localeCompare(b.modified || '');
    return sortAsc ? cmp : -cmp;
  });

  const doAction = async () => {
    setActionLoading(true);
    setError(null);
    try {
      if (dialog.type === 'mkdir') {
        await post('/workspaces/gc-server/fs/mkdir', { path: `${currentPath}/${dialogInput}`.replace('//', '/') });
      } else if (dialog.type === 'create') {
        await post('/workspaces/gc-server/fs/create', { path: `${currentPath}/${dialogInput}`.replace('//', '/') });
      } else if (dialog.type === 'rename') {
        const dir = dialog.path.split('/').slice(0, -1).join('/') || '/';
        await post('/workspaces/gc-server/fs/rename', { oldPath: dialog.path, newPath: `${dir}/${dialogInput}` });
      } else if (dialog.type === 'delete') {
        const result = await post('/workspaces/gc-server/fs/delete', { path: dialog.path, confirm: true });
        if (result?.error) { setError(result.error); setActionLoading(false); setDialog(null); return; }
      }
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(false);
    setDialog(null);
    setDialogInput('');
    loadDir(currentPath);
  };

  const openDialog = (type, entry) => {
    const fullPath = entry ? (currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`) : null;
    setDialog({ type, path: fullPath, name: entry?.name });
    setDialogInput(type === 'rename' ? entry.name : '');
  };

  // Breadcrumb segments
  const segments = currentPath === '/' ? ['/'] : ['/', ...currentPath.split('/').filter(Boolean)];

  return (
    <div className="space-y-3">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
          {segments.map((seg, i) => {
            const path = i === 0 ? '/' : '/' + segments.slice(1, i + 1).join('/');
            return (
              <span key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                <button
                  onClick={() => navigate(path)}
                  className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs"
                >
                  {seg}
                </button>
              </span>
            );
          })}
          <CopyPath path={currentPath} className="ml-2" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goUp} disabled={currentPath === '/'} title="Go up">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog('mkdir')} title="New folder">
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog('create')} title="New file">
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadDir(currentPath)} title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Dialog */}
      {dialog && (
        <Card className="border-primary/30">
          <CardContent className="p-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">
              {dialog.type === 'mkdir' ? 'New folder:' : dialog.type === 'create' ? 'New file:' : dialog.type === 'rename' ? 'Rename to:' : `Delete ${dialog.name}?`}
            </span>
            {dialog.type !== 'delete' ? (
              <input
                autoFocus
                value={dialogInput}
                onChange={e => setDialogInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && dialogInput && doAction()}
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={dialog.type === 'mkdir' ? 'folder-name' : 'filename.txt'}
              />
            ) : (
              <span className="flex-1 text-xs font-mono text-red-400 truncate">{dialog.path}</span>
            )}
            <Button size="sm" className="h-7 text-xs" onClick={doAction} disabled={actionLoading || (dialog.type !== 'delete' && !dialogInput)}>
              {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDialog(null); setDialogInput(''); }}>
              <X className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* File table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort('name')}>
                  Name {sortBy === 'name' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="text-right py-2 px-3 font-medium cursor-pointer hover:text-foreground w-24" onClick={() => handleSort('size')}>
                  Size {sortBy === 'size' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="text-left py-2 px-3 font-medium cursor-pointer hover:text-foreground w-36" onClick={() => handleSort('modified')}>
                  Modified {sortBy === 'modified' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="text-left py-2 px-3 font-medium w-24">Perms</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!loading && sorted.map(entry => (
                <tr
                  key={entry.name}
                  className="border-b border-border/50 hover:bg-accent/20 transition-colors group"
                >
                  <td className="py-1.5 px-3">
                    <button
                      onClick={() => entry.type === 'directory' ? navigate(currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`) : openFile(entry)}
                      className="flex items-center gap-2 hover:text-primary transition-colors"
                    >
                      <FileIcon type={entry.type} />
                      <span className="font-mono truncate max-w-[300px]">{entry.name}</span>
                    </button>
                  </td>
                  <td className="py-1.5 px-3 text-right text-muted-foreground font-mono">
                    {formatBytes(entry.size)}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground">
                    {entry.modified}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground font-mono text-[10px]">
                    {entry.permissions}
                  </td>
                  <td className="py-1.5 px-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openDialog('rename', entry)} className="p-1 hover:text-primary" title="Rename">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => openDialog('delete', entry)} className="p-1 hover:text-red-400" title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Empty directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* File viewer */}
      {(viewFile || viewLoading) && (
        <Card>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono truncate">{viewFile?.name || '...'}</span>
              {viewFile && <Badge variant="outline" className="text-[9px]">{formatBytes(viewFile.size)}</Badge>}
              {viewFile && <CopyPath path={viewFile.path} />}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setViewFile(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="max-h-[400px]">
            {viewLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
                {viewFile?.content}
              </pre>
            )}
          </ScrollArea>
        </Card>
      )}

      {/* Entry count */}
      {!loading && (
        <p className="text-[10px] text-muted-foreground/40">
          {sorted.length} items
        </p>
      )}
    </div>
  );
}
