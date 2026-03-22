import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InlineEditCell } from './InlineEditCell';
import { useApi } from '@/hooks/useApi';
import {
  Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, Search, X,
} from 'lucide-react';

export function TableDataView({ database, table, onUpdate }) {
  const { get, post } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [searchColumn, setSearchColumn] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [activeSearchColumn, setActiveSearchColumn] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [orderDir, setOrderDir] = useState('asc');

  const fetchData = useCallback(async () => {
    if (!database || !table) return;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (activeSearch) params.set('search', activeSearch);
    if (activeSearchColumn) params.set('searchColumn', activeSearchColumn);
    if (orderBy) {
      params.set('orderBy', orderBy);
      params.set('orderDir', orderDir);
    }
    const result = await get(`/workspaces/wow/database/${database}/${table}/rows?${params}`);
    if (result && !result.error) setData(result);
    setLoading(false);
  }, [database, table, page, pageSize, activeSearch, activeSearchColumn, orderBy, orderDir, get]);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setSearchColumn('');
    setActiveSearch('');
    setActiveSearchColumn('');
    setOrderBy('');
    setOrderDir('asc');
  }, [database, table]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = () => {
    setPage(1);
    setActiveSearch(search);
    setActiveSearchColumn(searchColumn);
  };

  const clearSearch = () => {
    setSearch('');
    setSearchColumn('');
    setPage(1);
    setActiveSearch('');
    setActiveSearchColumn('');
  };

  const handleSort = (column) => {
    if (orderBy === column) {
      setOrderDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(column);
      setOrderDir('asc');
    }
    setPage(1);
  };

  const handleCellSave = async (rowIndex, column, newValue) => {
    if (!data) return;
    const pkColumns = data.columns.filter(c => c.key === 'PRI');
    if (pkColumns.length === 0) {
      alert('Cannot edit: table has no primary key');
      return { success: false };
    }

    const row = data.rows[rowIndex];
    const primaryKey = {};
    for (const pk of pkColumns) {
      const colIdx = data.columns.findIndex(c => c.name === pk.name);
      primaryKey[pk.name] = row[colIdx];
    }

    const result = await post(`/workspaces/wow/database/${database}/${table}/update`, {
      primaryKey,
      updates: { [column]: newValue },
    });

    if (result?.success) {
      await fetchData();
      onUpdate?.();
    }
    return result;
  };

  const formatCount = (n) => {
    if (n >= 1000000) return `~${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `~${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const hasPrimaryKey = data.columns.some(c => c.key === 'PRI');

  return (
    <div className="space-y-3">
      {/* Search & Controls */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={searchColumn} onValueChange={setSearchColumn}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All columns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All columns</SelectItem>
              {data.columns.map(col => (
                <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>
            Search
          </Button>
          {activeSearch && (
            <Button size="sm" variant="ghost" className="h-8" onClick={clearSearch}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {formatCount(data.total)} rows
        </Badge>
      </div>

      {/* Data Table */}
      <Card className="overflow-hidden">
        <ScrollArea className="max-h-[600px]" orientation="both">
          <div className="min-w-max">
            <Table>
              <TableHeader>
                <TableRow>
                  {data.columns.map((col) => (
                    <TableHead
                      key={col.name}
                      className="cursor-pointer hover:bg-accent/30 whitespace-nowrap text-xs"
                      onClick={() => handleSort(col.name)}
                    >
                      <span className="flex items-center gap-1">
                        <span className={col.key === 'PRI' ? 'text-primary' : ''}>
                          {col.name}
                        </span>
                        {orderBy === col.name && (
                          orderDir === 'asc'
                            ? <ArrowUp className="h-3 w-3" />
                            : <ArrowDown className="h-3 w-3" />
                        )}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} className="hover:bg-accent/10">
                    {row.map((cell, colIdx) => {
                      const col = data.columns[colIdx];
                      return (
                        <TableCell key={colIdx} className="py-1.5 px-3 font-mono text-xs max-w-[300px]">
                          {hasPrimaryKey ? (
                            <InlineEditCell
                              value={cell}
                              isPrimaryKey={col?.key === 'PRI'}
                              onSave={(newValue) => handleCellSave(rowIdx, col.name, newValue)}
                            />
                          ) : (
                            <span className="truncate block">{cell}</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={data.columns.length} className="text-center text-muted-foreground text-sm py-8">
                      No rows found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
            <SelectTrigger className="w-[70px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map(size => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page <= 1 || loading}>
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page >= data.pages || loading}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(data.pages)} disabled={page >= data.pages || loading}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
