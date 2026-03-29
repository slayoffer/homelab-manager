import { useState, useCallback, useRef } from 'react';

export function useAiChat(workspaceId) {
  const [streamContent, setStreamContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const resolveRef = useRef(null);

  const getWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    return ws;
  }, []);

  const sendMessage = useCallback(async (sessionId, message, attachments) => {
    setStreamContent('');
    setStreaming(true);
    setError(null);

    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      const ws = getWs();

      const onMessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.requestId !== requestId) return;

        if (msg.type === 'ai:delta') {
          setStreamContent(prev => prev + msg.content);
        } else if (msg.type === 'ai:done') {
          setStreaming(false);
          ws.removeEventListener('message', onMessage);
          resolve({ success: true, messageId: msg.messageId });
        } else if (msg.type === 'ai:error') {
          setStreaming(false);
          setError(msg.error);
          ws.removeEventListener('message', onMessage);
          resolve({ success: false, error: msg.error });
        }
      };

      const doSend = () => {
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ type: 'ai', action: 'subscribe', requestId }));

        fetch(`/api/workspaces/${workspaceId}/chat`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message, attachments, requestId }),
        }).catch(err => {
          setStreaming(false);
          setError(err.message);
          ws.removeEventListener('message', onMessage);
          resolve({ success: false, error: err.message });
        });
      };

      if (ws.readyState === WebSocket.OPEN) {
        doSend();
      } else {
        ws.addEventListener('open', doSend, { once: true });
      }
    });
  }, [getWs, workspaceId]);

  const clearStream = useCallback(() => {
    setStreamContent('');
    setError(null);
  }, []);

  return { streamContent, streaming, error, sendMessage, clearStream };
}
