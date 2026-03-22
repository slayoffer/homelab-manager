import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/useApi';
import { Settings2, FileText, Search, Loader2, Puzzle } from 'lucide-react';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

export function ConfigFileBrowser({ selectedFile, onSelectFile, diffSummaries }) {
  const { get } = useApi();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    get('/workspaces/wow/configs').then(data => {
      if (Array.isArray(data)) setFiles(data);
      setLoading(false);
    });
  }, [get]);

  const coreFiles = files.filter(f => f.type === 'core');
  const moduleFiles = files.filter(f => f.type === 'module');
  const filterLower = filter.toLowerCase();

  const filterFiles = (list) =>
    filter ? list.filter(f => f.name.toLowerCase().includes(filterLower)) : list;

  const renderFile = (file) => {
    const isSelected = selectedFile === file.relativePath;
    const summary = diffSummaries[file.relativePath];

    return (
      <button
        key={file.relativePath}
        onClick={() => onSelectFile(file.relativePath)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
          isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-accent/20'
        }`}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono">
          {file.name.replace('.conf', '')}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {file.unconfigured && (
            <Badge variant="outline" className="text-[9px] px-1 h-4 text-muted-foreground">new</Badge>
          )}
          {summary && summary.new > 0 && (
            <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1 h-4">
              +{summary.new}
            </Badge>
          )}
          {summary && summary.modified > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1 h-4">
              ~{summary.modified}
            </Badge>
          )}
          {summary && summary.deprecated > 0 && (
            <Badge className="bg-red-500/20 text-red-400 text-[9px] px-1 h-4">
              -{summary.deprecated}
            </Badge>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Filter configs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Core */}
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <Settings2 className="h-3 w-3" />
                  Core
                </div>
                {filterFiles(coreFiles).map(renderFile)}
                {filterFiles(coreFiles).length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-2 py-1">No core configs</p>
                )}
              </div>

              {/* Modules */}
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <Puzzle className="h-3 w-3" />
                  Modules
                </div>
                {filterFiles(moduleFiles).map(renderFile)}
                {filterFiles(moduleFiles).length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-2 py-1">No module configs</p>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
