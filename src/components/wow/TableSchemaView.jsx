import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { Columns3, Key, Loader2, Copy, Check } from 'lucide-react';

export function TableSchemaView({ database, table }) {
  const { get } = useApi();
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!database || !table) return;
    setLoading(true);
    get(`/workspaces/wow/database/${database}/${table}/schema`).then(data => {
      if (data && !data.error) setSchema(data);
      setLoading(false);
    });
  }, [database, table, get]);

  const copyCreate = () => {
    if (schema?.createStatement) {
      navigator.clipboard.writeText(schema.createStatement);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schema) return null;

  return (
    <div className="space-y-4">
      {/* Columns */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Columns3 className="h-4 w-4" />
            Columns
            <Badge variant="outline">{schema.columns.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Field</TableHead>
                  <TableHead className="w-[180px]">Type</TableHead>
                  <TableHead className="w-[60px]">Null</TableHead>
                  <TableHead className="w-[60px]">Key</TableHead>
                  <TableHead className="w-[120px]">Default</TableHead>
                  <TableHead>Extra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.columns.map((col) => (
                  <TableRow key={col.field}>
                    <TableCell className="font-mono text-xs">
                      <span className={col.key === 'PRI' ? 'text-primary font-medium' : ''}>
                        {col.field}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{col.type}</TableCell>
                    <TableCell className="text-xs">{col.null}</TableCell>
                    <TableCell className="text-xs">
                      {col.key === 'PRI' && <Badge className="bg-primary/20 text-primary text-[10px] px-1">PRI</Badge>}
                      {col.key === 'UNI' && <Badge variant="outline" className="text-[10px] px-1">UNI</Badge>}
                      {col.key === 'MUL' && <Badge variant="outline" className="text-[10px] px-1">MUL</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{col.default || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{col.extra || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Indexes */}
      {schema.indexes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Key className="h-4 w-4" />
              Indexes
              <Badge variant="outline">{schema.indexes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Unique</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.indexes.map((idx) => (
                  <TableRow key={idx.name}>
                    <TableCell className="font-mono text-xs">{idx.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {idx.columns.sort((a, b) => a.seq - b.seq).map(c => c.column).join(', ')}
                    </TableCell>
                    <TableCell className="text-xs">{idx.type}</TableCell>
                    <TableCell className="text-xs">{idx.unique ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CREATE TABLE */}
      {schema.createStatement && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">CREATE TABLE</CardTitle>
              <Button variant="ghost" size="sm" onClick={copyCreate} className="h-7">
                {copied ? <Check className="h-3 w-3 mr-1.5 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {schema.createStatement}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
