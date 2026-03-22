import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/useApi';
import {
  Database, Table2, ChevronDown, ChevronRight, Loader2,
  Search, Columns3,
} from 'lucide-react';

const dbColors = {
  acore_world: 'text-emerald-400',
  acore_characters: 'text-blue-400',
  acore_auth: 'text-amber-400',
  acore_playerbots: 'text-purple-400',
};

const dbBgColors = {
  acore_world: 'bg-emerald-400/10',
  acore_characters: 'bg-blue-400/10',
  acore_auth: 'bg-amber-400/10',
  acore_playerbots: 'bg-purple-400/10',
};

function formatSize(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)}G`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

export function DatabaseBrowser({ selectedDb, selectedTable, onSelectTable, onViewSchema }) {
  const { get } = useApi();
  const [databases, setDatabases] = useState([]);
  const [expandedDbs, setExpandedDbs] = useState({});
  const [tables, setTables] = useState({});
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingTables, setLoadingTables] = useState({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoadingDbs(true);
    get('/workspaces/wow/database').then(data => {
      if (Array.isArray(data)) setDatabases(data);
      setLoadingDbs(false);
    });
  }, [get]);

  const toggleDb = async (dbName) => {
    const isExpanding = !expandedDbs[dbName];
    setExpandedDbs(prev => ({ ...prev, [dbName]: isExpanding }));

    if (isExpanding && !tables[dbName]) {
      setLoadingTables(prev => ({ ...prev, [dbName]: true }));
      const data = await get(`/workspaces/wow/database/${dbName}/tables`);
      if (Array.isArray(data)) {
        setTables(prev => ({ ...prev, [dbName]: data }));
      }
      setLoadingTables(prev => ({ ...prev, [dbName]: false }));
    }
  };

  const filterLower = filter.toLowerCase();

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-1">
          {loadingDbs ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            databases.map(db => {
              const isExpanded = expandedDbs[db.name];
              const dbTables = tables[db.name] || [];
              const filtered = filter
                ? dbTables.filter(t => t.name.toLowerCase().includes(filterLower))
                : dbTables;

              return (
                <div key={db.name}>
                  <button
                    onClick={() => toggleDb(db.name)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-accent/30 transition-colors text-left ${dbBgColors[db.name] || ''}`}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 shrink-0" />
                      : <ChevronRight className="h-3 w-3 shrink-0" />
                    }
                    <Database className={`h-3.5 w-3.5 shrink-0 ${dbColors[db.name] || ''}`} />
                    <span className={`text-xs font-medium truncate ${dbColors[db.name] || ''}`}>
                      {db.name.replace('acore_', '')}
                    </span>
                    <Badge variant="outline" className="ml-auto text-[10px] px-1 h-4">
                      {db.tableCount}
                    </Badge>
                  </button>

                  {isExpanded && (
                    <div className="ml-3 pl-2 border-l border-border/50">
                      {loadingTables[db.name] ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        filtered.map(tbl => {
                          const isSelected = selectedDb === db.name && selectedTable === tbl.name;
                          return (
                            <div
                              key={tbl.name}
                              className={`flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer group text-xs ${isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-accent/20'}`}
                            >
                              <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <button
                                onClick={() => onSelectTable(db.name, tbl.name)}
                                className="flex-1 text-left truncate"
                                title={`${tbl.name} (${tbl.rows} rows, ${formatSize(tbl.dataSize)})`}
                              >
                                {tbl.name}
                              </button>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {tbl.rows > 0 ? tbl.rows.toLocaleString() : '0'}
                              </span>
                              <button
                                onClick={() => onViewSchema(db.name, tbl.name)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="View schema"
                              >
                                <Columns3 className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </button>
                            </div>
                          );
                        })
                      )}
                      {!loadingTables[db.name] && filtered.length === 0 && (
                        <p className="text-[10px] text-muted-foreground px-2 py-1">
                          {filter ? 'No matches' : 'No tables'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
