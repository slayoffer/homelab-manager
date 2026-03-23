import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Filter, Regex, Clock, ArrowDown, Pause, Play,
  Copy, Trash2, Download, X, Maximize2, Minimize2,
} from 'lucide-react';

const CONTAINER_COLORS = {
  'ac-database': { text: 'text-blue-400', bg: 'bg-blue-400/20', border: 'border-l-blue-400' },
  'ac-worldserver': { text: 'text-emerald-400', bg: 'bg-emerald-400/20', border: 'border-l-emerald-400' },
  'ac-authserver': { text: 'text-amber-400', bg: 'bg-amber-400/20', border: 'border-l-amber-400' },
};

const LEVEL_COLORS = {
  error: 'text-red-400 font-bold',
  warn: 'text-amber-400',
  debug: 'text-muted-foreground/50',
  info: '',
};

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleTimeString();
}

function formatIsoTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false, fractionalSecondDigits: 3 });
}

function highlightText(text, searchTerm, isRegex) {
  if (!searchTerm) return text;
  try {
    const regex = isRegex ? new RegExp(`(${searchTerm})`, 'gi') : new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{part}</mark>
        : part
    );
  } catch {
    return text;
  }
}

function LogLine({ entry, searchTerm, isRegex, showRelativeTime, isAlert }) {
  const colors = CONTAINER_COLORS[entry.container] || { text: 'text-gray-400', bg: 'bg-gray-400/20', border: 'border-l-gray-400' };
  const levelColor = LEVEL_COLORS[entry.level] || '';
  const timeStr = showRelativeTime ? formatRelativeTime(entry.timestamp) : formatIsoTime(entry.timestamp);

  // Extract level keyword for coloring
  const levelMatch = entry.text.match(/\b(ERROR|FATAL|CRIT(?:ICAL)?|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i);
  let beforeLevel = entry.text;
  let levelKeyword = '';
  let afterLevel = '';

  if (levelMatch) {
    const idx = levelMatch.index;
    beforeLevel = entry.text.slice(0, idx);
    levelKeyword = levelMatch[0];
    afterLevel = entry.text.slice(idx + levelMatch[0].length);
  }

  return (
    <div
      className={`flex gap-2 py-0.5 px-2 hover:bg-white/5 border-l-2 ${isAlert ? `${colors.border} animate-pulse` : 'border-l-transparent'}`}
      style={{ contentVisibility: 'auto' }}
    >
      <span className="text-muted-foreground/60 shrink-0 w-[80px] text-right tabular-nums">
        {timeStr}
      </span>
      {entry.container && (
        <span className={`${colors.text} ${colors.bg} px-1.5 rounded text-[10px] shrink-0 leading-relaxed`}>
          {entry.container.replace('ac-', '')}
        </span>
      )}
      <span className={`flex-1 break-all ${colors.text}`}>
        {levelMatch ? (
          <>
            {highlightText(beforeLevel, searchTerm, isRegex)}
            <span className={levelColor}>{highlightText(levelKeyword, searchTerm, isRegex)}</span>
            {highlightText(afterLevel, searchTerm, isRegex)}
          </>
        ) : (
          highlightText(entry.text, searchTerm, isRegex)
        )}
      </span>
    </div>
  );
}

export function EnhancedLogViewer({ entries, onClear, alertChecker }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterMode, setFilterMode] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const [relativeTime, setRelativeTime] = useState(true);
  const [paused, setPaused] = useState(false);
  const [pausedBuffer, setPausedBuffer] = useState([]);
  const [atBottom, setAtBottom] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Check alerts on new entries
  const alertSet = useRef(new Set());
  useEffect(() => {
    if (!alertChecker || entries.length === 0) return;
    const latest = entries.slice(-20); // check latest batch
    for (const entry of latest) {
      if (!alertSet.current.has(entry.id)) {
        alertSet.current.add(entry.id);
        if (alertChecker(entry)) {
          entry._isAlert = true;
        }
      }
    }
    // Limit set size
    if (alertSet.current.size > 10000) {
      const arr = [...alertSet.current];
      alertSet.current = new Set(arr.slice(-5000));
    }
  }, [entries, alertChecker]);

  // Buffer entries when paused
  const visibleEntries = useMemo(() => {
    if (paused) return entries.slice(0, entries.length - pausedBuffer.length);
    return entries;
  }, [entries, paused, pausedBuffer.length]);

  useEffect(() => {
    if (paused) {
      const prevLen = visibleEntries.length;
      if (entries.length > prevLen) {
        setPausedBuffer(entries.slice(prevLen));
      }
    }
  }, [entries, paused, visibleEntries.length]);

  // Filter/search
  const filteredEntries = useMemo(() => {
    if (!debouncedSearch || !filterMode) return visibleEntries;
    try {
      const regex = regexMode
        ? new RegExp(debouncedSearch, 'i')
        : new RegExp(debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return visibleEntries.filter(e => regex.test(e.text) || regex.test(e.raw));
    } catch {
      return visibleEntries;
    }
  }, [visibleEntries, debouncedSearch, filterMode, regexMode]);

  // Auto-scroll
  useEffect(() => {
    if (atBottom && !paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEntries.length, atBottom, paused]);

  // Intersection observer for bottom detection
  useEffect(() => {
    if (!bottomRef.current || !scrollRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, []);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleResume = () => {
    setPaused(false);
    setPausedBuffer([]);
  };

  const handleExport = () => {
    const text = filteredEntries.map(e => {
      const time = new Date(e.timestamp).toISOString();
      const container = e.container || 'unknown';
      return `${time} [${container}] ${e.text}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const text = filteredEntries.map(e => e.raw).join('\n');
    navigator.clipboard.writeText(text);
  };

  if (entries.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border bg-[#0a0e1a] flex flex-col ${
      fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
    }`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 h-7 text-xs bg-transparent border-border"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <Button
          variant={filterMode ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setFilterMode(!filterMode)}
          title={filterMode ? 'Filter mode (showing matches only)' : 'Highlight mode (showing all)'}
        >
          <Filter className="h-3 w-3" />
        </Button>

        <Button
          variant={regexMode ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setRegexMode(!regexMode)}
          title="Toggle regex"
        >
          <Regex className="h-3 w-3" />
        </Button>

        <div className="h-4 w-px bg-border" />

        <Button
          variant={relativeTime ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setRelativeTime(!relativeTime)}
          title={relativeTime ? 'Relative timestamps' : 'Absolute timestamps'}
        >
          <Clock className="h-3 w-3" />
        </Button>

        <Badge variant="outline" className="text-[10px] h-5">
          {filteredEntries.length} lines
        </Badge>

        <div className="h-4 w-px bg-border" />

        <Button
          variant={paused ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => paused ? handleResume() : setPaused(true)}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </Button>

        {paused && pausedBuffer.length > 0 && (
          <Badge className="bg-primary/20 text-primary text-[10px]">
            +{pausedBuffer.length} new
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy">
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export .txt">
            <Download className="h-3 w-3" />
          </Button>
          {onClear && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} title="Clear">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Log Area */}
      <div ref={scrollRef} className={`overflow-y-auto font-mono text-xs relative ${
        fullscreen ? 'flex-1' : 'min-h-[400px] max-h-[calc(100vh-300px)]'
      }`}>
        {filteredEntries.map(entry => (
          <LogLine
            key={entry.id}
            entry={entry}
            searchTerm={debouncedSearch}
            isRegex={regexMode}
            showRelativeTime={relativeTime}
            isAlert={entry._isAlert}
          />
        ))}
        <div ref={bottomRef} className="h-1" />

        {/* Jump to bottom */}
        {!atBottom && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 right-3 bg-primary/80 hover:bg-primary text-primary-foreground rounded-full p-2 shadow-lg"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
