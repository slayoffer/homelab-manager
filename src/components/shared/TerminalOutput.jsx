import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Copy, Trash2 } from 'lucide-react';

export function TerminalOutput({ logs, onClear, className = '' }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
  };

  if (!logs.length) return null;

  return (
    <div className={`rounded-lg border border-border bg-[#0a0e1a] ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">Terminal Output</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            <Copy className="h-3 w-3" />
          </Button>
          {onClear && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-64">
        <pre className="p-3 text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
          {logs.join('')}
          <span ref={bottomRef} />
        </pre>
      </ScrollArea>
    </div>
  );
}
