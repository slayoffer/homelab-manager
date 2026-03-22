import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatabaseBrowser } from './DatabaseBrowser';
import { TableDataView } from './TableDataView';
import { TableSchemaView } from './TableSchemaView';
import { Database, Table2, Columns3 } from 'lucide-react';

export function DatabaseExplorer() {
  const [selectedDb, setSelectedDb] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [viewMode, setViewMode] = useState('data'); // 'data' | 'schema'

  const handleSelectTable = (db, table) => {
    setSelectedDb(db);
    setSelectedTable(table);
    setViewMode('data');
  };

  const handleViewSchema = (db, table) => {
    setSelectedDb(db);
    setSelectedTable(table);
    setViewMode('schema');
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-400px)] min-h-[500px]">
      {/* Left Sidebar - Database Browser */}
      <Card className="w-64 shrink-0 overflow-hidden">
        <DatabaseBrowser
          selectedDb={selectedDb}
          selectedTable={selectedTable}
          onSelectTable={handleSelectTable}
          onViewSchema={handleViewSchema}
        />
      </Card>

      {/* Right Panel - Data or Schema View */}
      <div className="flex-1 min-w-0">
        {selectedTable ? (
          <div className="space-y-3">
            {/* Table Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{selectedTable}</span>
                <Badge variant="outline" className="text-xs">
                  {selectedDb.replace('acore_', '')}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === 'data' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setViewMode('data')}
                >
                  <Database className="h-3 w-3 mr-1.5" />
                  Data
                </Button>
                <Button
                  variant={viewMode === 'schema' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setViewMode('schema')}
                >
                  <Columns3 className="h-3 w-3 mr-1.5" />
                  Schema
                </Button>
              </div>
            </div>

            {/* Content */}
            {viewMode === 'data' ? (
              <TableDataView
                database={selectedDb}
                table={selectedTable}
                onUpdate={() => {}}
              />
            ) : (
              <TableSchemaView
                database={selectedDb}
                table={selectedTable}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Database className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Select a database and table to explore
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
