import { useState, useCallback, useRef } from 'react';

export function useWebSocket() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setRunning(false);
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
        case 'error':
          setLogs(prev => [...prev, `ERROR: ${msg.data}`]);
          break;
      }
    };

    wsRef.current = ws;
    return ws;
  }, []);

  const sendMessage = useCallback((type, action) => {
    const ws = connect();
    const send = () => ws.send(JSON.stringify({ type, action }));
    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.addEventListener('open', send, { once: true });
    }
  }, [connect]);

  const sendAction = useCallback((action) => sendMessage('docker', action), [sendMessage]);
  const sendBackup = useCallback((action) => sendMessage('backup', action), [sendMessage]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, running, sendAction, sendBackup, clearLogs };
}
