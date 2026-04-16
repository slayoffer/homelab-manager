import { useState, useCallback, useRef } from 'react';

let entryCounter = 0;

function parseLogEntry(data, container) {
  const id = ++entryCounter;
  const raw = data;

  // Parse docker timestamp: 2024-01-15T10:30:45.123456789Z rest
  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s/);
  const timestamp = tsMatch ? new Date(tsMatch[1]).getTime() : Date.now();
  const text = tsMatch ? raw.slice(tsMatch[0].length) : raw;

  // Parse log level
  let level = 'info';
  if (/\b(ERROR|FATAL|CRIT(ICAL)?)\b/i.test(text)) level = 'error';
  else if (/\b(WARN(ING)?)\b/i.test(text)) level = 'warn';
  else if (/\b(DEBUG|TRACE)\b/i.test(text)) level = 'debug';

  return { id, container, raw, timestamp, text, level };
}

export function useWebSocket() {
  const [logs, setLogs] = useState([]);
  const [containerLogs, setContainerLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [followingContainer, setFollowingContainer] = useState(null);
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setRunning(false);
      setFollowingContainer(null);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'docker:start':
          setRunning(true);
          setLogs([`> docker compose ${msg.action}...\n`]);
          break;
        case 'docker:stdout':
        case 'docker:stderr':
        case 'backup:stdout':
        case 'backup:stderr':
          setLogs(prev => [...prev, msg.data]);
          break;
        case 'docker:done':
          setRunning(false);
          setLogs(prev => [...prev, `\nProcess exited with code ${msg.code}`]);
          break;
        case 'docker:error':
        case 'backup:error':
          setRunning(false);
          setLogs(prev => [...prev, `\nERROR: ${msg.data}`]);
          break;
        case 'backup:start':
          setRunning(true);
          setLogs([`> ${msg.label}...\n`]);
          break;
        case 'backup:done':
          setRunning(false);
          setLogs(prev => [...prev, `\n${msg.label} completed (exit code ${msg.code})`]);
          break;
        case 'logs:start':
          setFollowingContainer(msg.container);
          break;
        case 'logs:stdout': {
          // Split multi-line data into individual entries
          const lines = msg.data.split('\n').filter(l => l.trim());
          const entries = lines.map(line => parseLogEntry(line, msg.container));
          setContainerLogs(prev => {
            const next = [...prev, ...entries];
            return next.length > 8000 ? next.slice(-6000) : next;
          });
          break;
        }
        case 'logs:done':
          if (msg.container) {
            // Only clear following if all processes are done (for 'all' mode)
            // The last logs:done will naturally end the stream
          }
          break;
        case 'logs:error':
          setContainerLogs(prev => [...prev, {
            id: ++entryCounter,
            container: msg.container,
            raw: `ERROR: ${msg.data}`,
            timestamp: Date.now(),
            text: `ERROR: ${msg.data}`,
            level: 'error',
          }]);
          break;
        case 'error':
          setLogs(prev => [...prev, `ERROR: ${msg.data}`]);
          break;
      }
    };

    wsRef.current = ws;
    return ws;
  }, []);

  const sendRaw = useCallback((payload) => {
    const ws = connect();
    const send = () => ws.send(JSON.stringify(payload));
    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.addEventListener('open', send, { once: true });
    }
  }, [connect]);

  const sendAction = useCallback((action) => sendRaw({ type: 'docker', action }), [sendRaw]);
  const sendBackup = useCallback((action) => sendRaw({ type: 'backup', action }), [sendRaw]);

  const sendLogs = useCallback((container, { tail = 100, follow = false } = {}) => {
    setContainerLogs([]);
    sendRaw({ type: 'logs', action: 'start', container, tail, follow });
  }, [sendRaw]);

  const stopLogs = useCallback(() => {
    sendRaw({ type: 'logs', action: 'stop' });
    setFollowingContainer(null);
  }, [sendRaw]);

  const clearLogs = useCallback(() => setLogs([]), []);
  const clearContainerLogs = useCallback(() => setContainerLogs([]), []);
  const appendLog = useCallback((msg) => setLogs(prev => [...prev, msg]), []);

  return {
    logs, connected, running, sendAction, sendBackup, clearLogs, appendLog,
    containerLogs, followingContainer, sendLogs, stopLogs, clearContainerLogs,
  };
}
