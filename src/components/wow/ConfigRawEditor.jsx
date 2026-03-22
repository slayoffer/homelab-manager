import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, Save } from 'lucide-react';

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightLine(line) {
  // Section headers: [worldserver]
  if (/^\[.+\]/.test(line)) {
    return `<span class="text-primary font-bold">${escapeHtml(line)}</span>`;
  }
  // Comment lines
  if (line.startsWith('#')) {
    return `<span class="text-slate-500">${escapeHtml(line)}</span>`;
  }
  // Setting: Key = Value
  const match = line.match(/^(\s*[A-Za-z][A-Za-z0-9._-]+)(\s*=\s*)(.*)/);
  if (match) {
    return `<span class="text-emerald-400">${escapeHtml(match[1])}</span><span class="text-slate-500">${escapeHtml(match[2])}</span><span class="text-foreground">${escapeHtml(match[3])}</span>`;
  }
  return escapeHtml(line);
}

export function ConfigRawEditor({ content, onChange, onSave, isDirty }) {
  const [fullscreen, setFullscreen] = useState(false);
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);

  const lines = content ? content.split('\n') : [''];
  const lineCount = lines.length;

  const highlighted = useMemo(() => {
    return lines.map(highlightLine).join('\n');
  }, [content]);

  const lineNumbers = useMemo(() => {
    return lines.map((_, i) => i + 1).join('\n');
  }, [lineCount]);

  // Sync scroll between textarea, pre, and gutter
  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current && gutterRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  // Handle tab key for indentation
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newContent = content.substring(0, start) + '    ' + content.substring(end);
      onChange(newContent);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty && onSave) onSave();
    }
  };

  const editorContent = (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-[#0a0e1a] p-4' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0e1a] border-b border-border rounded-t-lg">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{lineCount} lines</Badge>
          {isDirty && <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">unsaved</Badge>}
        </div>
        <div className="flex items-center gap-1">
          {fullscreen && onSave && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSave} disabled={!isDirty}>
              <Save className="h-3 w-3 mr-1.5" />
              Save
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className={`relative overflow-hidden bg-[#0a0e1a] border border-t-0 border-border rounded-b-lg ${fullscreen ? 'flex-1' : 'min-h-[500px] max-h-[calc(100vh-500px)]'}`}>
        <div className="flex h-full">
          {/* Line numbers gutter */}
          <pre
            ref={gutterRef}
            className="overflow-hidden text-right pr-3 pl-2 py-3 text-xs font-mono leading-relaxed text-slate-600 select-none border-r border-border/30 bg-[#080c16] min-w-[50px]"
            aria-hidden="true"
          >
            {lineNumbers}
          </pre>

          {/* Editor content area */}
          <div className="relative flex-1 overflow-hidden">
            {/* Syntax-highlighted layer (visual) */}
            <pre
              ref={preRef}
              className="absolute inset-0 overflow-auto py-3 px-4 text-xs font-mono leading-relaxed whitespace-pre pointer-events-none"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
            />

            {/* Textarea layer (interactive) */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              className="absolute inset-0 w-full h-full overflow-auto py-3 px-4 text-xs font-mono leading-relaxed whitespace-pre bg-transparent text-transparent caret-white resize-none outline-none selection:bg-primary/30"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return editorContent;
}
