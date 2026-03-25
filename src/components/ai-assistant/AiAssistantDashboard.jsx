import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionList } from './SessionList';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useApi } from '@/hooks/useApi';
import { useAiChat } from '@/hooks/useAiChat';
import { BrainCircuit, Loader2, WifiOff } from 'lucide-react';

export function AiAssistantDashboard() {
  const { get, post, del } = useApi();
  const { streamContent, streaming, error, sendMessage, clearStream } = useAiChat();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const messagesEndRef = useRef(null);

  // Load sessions on mount
  useEffect(() => {
    get('/workspaces/ai-assistant/sessions').then(data => {
      if (Array.isArray(data)) {
        setSessions(data);
        if (data.length > 0) setActiveSessionId(data[0].id);
      }
    });
    get('/workspaces/ai-assistant/status').then(data => {
      setGatewayStatus(data?.status);
    });
  }, [get]);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    setLoadingMessages(true);
    get(`/workspaces/ai-assistant/sessions/${activeSessionId}/messages`).then(data => {
      if (Array.isArray(data)) setMessages(data);
      setLoadingMessages(false);
    });
  }, [activeSessionId, get]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const refreshSessions = useCallback(async () => {
    const data = await get('/workspaces/ai-assistant/sessions');
    if (Array.isArray(data)) setSessions(data);
  }, [get]);

  const handleCreateSession = async () => {
    const data = await post('/workspaces/ai-assistant/sessions', {});
    if (data?.id) {
      setActiveSessionId(data.id);
      setMessages([]);
      await refreshSessions();
    }
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this conversation?')) return;
    await del(`/workspaces/ai-assistant/sessions/${id}`);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await refreshSessions();
  };

  const handleSend = async (message, attachments) => {
    if (!activeSessionId) {
      // Auto-create session
      const data = await post('/workspaces/ai-assistant/sessions', {});
      if (!data?.id) return;
      setActiveSessionId(data.id);
      await refreshSessions();
      await doSend(data.id, message, attachments);
    } else {
      await doSend(activeSessionId, message, attachments);
    }
  };

  const doSend = async (sessionId, message, attachments) => {
    // Optimistically add user message
    const userMsg = {
      id: Date.now(),
      session_id: sessionId,
      role: 'user',
      content: message,
      attachments: attachments?.map(a => ({ type: a.type, mimeType: a.mimeType, fileName: a.fileName, preview: a.preview })),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    clearStream();

    const result = await sendMessage(sessionId, message, attachments);

    if (result?.success) {
      // Reload messages from server to get the stored assistant message
      const data = await get(`/workspaces/ai-assistant/sessions/${sessionId}/messages`);
      if (Array.isArray(data)) setMessages(data);
      await refreshSessions();
    }
  };

  const isConnected = gatewayStatus === 'connected';

  return (
    <div className="flex h-[calc(100vh-120px)] p-6 gap-4">
      {/* Session List */}
      <Card className="w-60 shrink-0 overflow-hidden">
        <SessionList
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
        />
      </Card>

      {/* Chat Area */}
      <div className="flex-1 min-w-0 flex flex-col border border-border rounded-xl overflow-hidden bg-card/30">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">AI Assistant</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] ${isConnected ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30'}`}
          >
            {isConnected ? 'Connected' : gatewayStatus === 'unconfigured' ? 'Not configured' : (
              <><WifiOff className="h-2.5 w-2.5 mr-1" />Disconnected</>
            )}
          </Badge>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingMessages && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <BrainCircuit className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                <p className="text-sm text-muted-foreground/50">
                  {activeSessionId ? 'Start a conversation' : 'Create a new chat to get started'}
                </p>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Streaming message */}
          {streaming && streamContent && (
            <ChatMessage
              message={{ role: 'assistant', content: streamContent }}
              isStreaming
            />
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={streaming || !isConnected} />
      </div>
    </div>
  );
}
