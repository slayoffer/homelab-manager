import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SessionList } from './SessionList';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useApi } from '@/hooks/useApi';
import { useAiChat } from '@/hooks/useAiChat';
import { Loader2, WifiOff, Menu } from 'lucide-react';

// Theme configs for each workspace
const THEMES = {
  'openclaw-ai': {
    accent: 'text-red-400',
    accentBg: 'bg-red-500/20',
    statusOn: 'text-red-400 border-red-400/30',
    statusOff: 'text-red-400/50 border-red-400/20',
    cursor: 'bg-red-400',
    emptyIcon: 'text-red-400/20',
  },
  'synthiq-ai': {
    accent: 'text-teal-400',
    accentBg: 'bg-teal-500/20',
    statusOn: 'text-teal-400 border-teal-400/30',
    statusOff: 'text-teal-400/50 border-teal-400/20',
    cursor: 'bg-teal-400',
    emptyIcon: 'text-teal-400/20',
  },
};

export function AiAssistantDashboard({ workspaceId, workspaceName, WorkspaceIcon }) {
  const theme = THEMES[workspaceId] || THEMES['openclaw-ai'];
  const { get, post, del } = useApi();
  const { streamContent, streaming, error, sendMessage, clearStream } = useAiChat(workspaceId);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    get(`/workspaces/${workspaceId}/sessions`).then(data => {
      if (Array.isArray(data)) {
        setSessions(data);
        if (data.length > 0) setActiveSessionId(data[0].id);
      }
    });
    get(`/workspaces/${workspaceId}/status`).then(data => {
      setGatewayStatus(data?.status);
    });
  }, [get, workspaceId]);

  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    setLoadingMessages(true);
    get(`/workspaces/${workspaceId}/sessions/${activeSessionId}/messages`).then(data => {
      if (Array.isArray(data)) setMessages(data);
      setLoadingMessages(false);
    });
  }, [activeSessionId, get, workspaceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const refreshSessions = useCallback(async () => {
    const data = await get(`/workspaces/${workspaceId}/sessions`);
    if (Array.isArray(data)) setSessions(data);
  }, [get, workspaceId]);

  const handleCreateSession = async () => {
    const data = await post(`/workspaces/${workspaceId}/sessions`, {});
    if (data?.id) {
      setActiveSessionId(data.id);
      setMessages([]);
      setShowSessions(false);
      await refreshSessions();
    }
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this conversation?')) return;
    await del(`/workspaces/${workspaceId}/sessions/${id}`);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await refreshSessions();
  };

  const handleSelectSession = (id) => {
    setActiveSessionId(id);
    setShowSessions(false);
  };

  const handleSend = async (message, attachments) => {
    if (!activeSessionId) {
      const data = await post(`/workspaces/${workspaceId}/sessions`, {});
      if (!data?.id) return;
      setActiveSessionId(data.id);
      await refreshSessions();
      await doSend(data.id, message, attachments);
    } else {
      await doSend(activeSessionId, message, attachments);
    }
  };

  const doSend = async (sessionId, message, attachments) => {
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
      const data = await get(`/workspaces/${workspaceId}/sessions/${sessionId}/messages`);
      if (Array.isArray(data)) setMessages(data);
      await refreshSessions();
    }
  };

  const isConnected = gatewayStatus === 'connected';

  return (
    <div className="flex h-[calc(100dvh-64px)] md:h-[calc(100dvh-120px)] p-2 md:p-6 gap-2 md:gap-4 relative">
      {showSessions && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setShowSessions(false)} />
      )}

      <Card className={`
        ${showSessions ? 'fixed inset-y-0 left-0 z-40 w-72 rounded-none' : 'hidden'}
        md:relative md:block md:w-60 md:shrink-0 md:rounded-xl
        overflow-hidden
      `}>
        <SessionList
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={handleSelectSession}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
          onClose={() => setShowSessions(false)}
        />
      </Card>

      <div className="flex-1 min-w-0 flex flex-col border border-border rounded-xl overflow-hidden bg-card/30">
        <div className="flex items-center justify-between px-3 md:px-4 py-2.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setShowSessions(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <WorkspaceIcon className={`h-4 w-4 ${theme.accent}`} />
            <span className="text-sm font-medium">{workspaceName}</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] ${isConnected ? theme.statusOn : 'text-red-400 border-red-400/30'}`}
          >
            {isConnected ? 'Connected' : gatewayStatus === 'unconfigured' ? 'Not configured' : (
              <><WifiOff className="h-2.5 w-2.5 mr-1" />Disconnected</>
            )}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
          {loadingMessages && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <WorkspaceIcon className={`h-10 w-10 ${theme.emptyIcon} mx-auto`} />
                <p className="text-sm text-muted-foreground/50">
                  {activeSessionId ? 'Start a conversation' : 'Create a new chat to get started'}
                </p>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} theme={theme} AssistantIcon={WorkspaceIcon} />
          ))}

          {streaming && streamContent && (
            <ChatMessage
              message={{ role: 'assistant', content: streamContent }}
              isStreaming
              theme={theme}
              AssistantIcon={WorkspaceIcon}
            />
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput onSend={handleSend} disabled={streaming || !isConnected} />
      </div>
    </div>
  );
}
