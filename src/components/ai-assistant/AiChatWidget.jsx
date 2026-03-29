import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useAiChat } from '@/hooks/useAiChat';
import { useApi } from '@/hooks/useApi';
import { AI_WORKSPACES, THEMES } from './ai-themes';

function WidgetAgentChat({ workspaceId, visible, onStatusChange }) {
  const theme = THEMES[workspaceId];
  const config = AI_WORKSPACES[workspaceId];
  const { get, post } = useApi();
  const { streamContent, streaming, error, sendMessage, clearStream } = useAiChat(workspaceId);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Load most recent session on mount
  useEffect(() => {
    get(`/workspaces/${workspaceId}/sessions`).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setSessionId(data[0].id);
      }
      setLoading(false);
    });
    get(`/workspaces/${workspaceId}/status`).then(data => {
      onStatusChange?.(workspaceId, data?.status === 'connected');
    });
  }, [get, workspaceId, onStatusChange]);

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    get(`/workspaces/${workspaceId}/sessions/${sessionId}/messages`).then(data => {
      if (Array.isArray(data)) setMessages(data);
    });
  }, [sessionId, get, workspaceId]);

  // Auto-scroll
  useEffect(() => {
    if (visible) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent, visible]);

  const handleSend = async (message, attachments) => {
    let sid = sessionId;
    if (!sid) {
      const data = await post(`/workspaces/${workspaceId}/sessions`, {});
      if (!data?.id) return;
      sid = data.id;
      setSessionId(sid);
    }

    // Optimistic user message
    setMessages(prev => [...prev, {
      id: Date.now(), session_id: sid, role: 'user', content: message,
      attachments: attachments?.map(a => ({ type: a.type, mimeType: a.mimeType, fileName: a.fileName, preview: a.preview })),
      created_at: new Date().toISOString(),
    }]);
    clearStream();

    const result = await sendMessage(sid, message, attachments);
    if (result?.success) {
      const data = await get(`/workspaces/${workspaceId}/sessions/${sid}/messages`);
      if (Array.isArray(data)) setMessages(data);
    }
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${visible ? '' : 'hidden'}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-1.5">
              <config.Icon className={`h-8 w-8 ${theme.emptyIcon} mx-auto`} />
              <p className="text-xs text-muted-foreground/40">Ask {config.name} anything</p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} theme={theme} AssistantIcon={config.Icon} />
        ))}

        {streaming && streamContent && (
          <ChatMessage
            message={{ role: 'assistant', content: streamContent }}
            isStreaming
            theme={theme}
            AssistantIcon={config.Icon}
          />
        )}

        {error && (
          <div className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-2.5 py-1.5">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}

export function AiChatWidget({ activeWorkspaceId }) {
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('openclaw-ai');
  const [statuses, setStatuses] = useState({});

  const handleStatusChange = useCallback((id, connected) => {
    setStatuses(prev => ({ ...prev, [id]: connected }));
  }, []);

  // Hide on AI workspace pages
  const isAiPage = Object.keys(AI_WORKSPACES).includes(activeWorkspaceId);
  if (isAiPage) return null;

  const activeTheme = THEMES[selectedAgent];
  const isConnected = statuses[selectedAgent];

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-card border border-border shadow-lg
            flex items-center justify-center hover:scale-105 transition-transform ${activeTheme.ring} ring-2`}
        >
          <MessageCircle className={`h-5 w-5 ${activeTheme.accent}`} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[380px] h-[500px] flex flex-col
          rounded-2xl border border-border bg-background shadow-2xl overflow-hidden
          max-sm:bottom-0 max-sm:right-0 max-sm:w-full max-sm:h-[80dvh] max-sm:rounded-b-none">

          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-card/50 shrink-0">
            <div className="flex gap-0.5">
              {Object.entries(AI_WORKSPACES).map(([id, { name, Icon }]) => (
                <button
                  key={id}
                  onClick={() => setSelectedAgent(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${selectedAgent === id
                      ? `${THEMES[id].accentBg} ${THEMES[id].accent}`
                      : 'text-muted-foreground hover:bg-accent/20'
                    }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : isConnected === false ? 'bg-red-400' : 'bg-muted-foreground/30'}`} />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Agent chats — both rendered, only active visible */}
          {Object.keys(AI_WORKSPACES).map(id => (
            <WidgetAgentChat
              key={id}
              workspaceId={id}
              visible={selectedAgent === id}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </>
  );
}
