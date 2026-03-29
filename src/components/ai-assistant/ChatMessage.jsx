import { User } from 'lucide-react';

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Simple markdown: code blocks, inline code, bold, line breaks
function renderMarkdown(text) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const lang = lines[0].trim();
      const code = (lang ? lines.slice(1) : lines).join('\n');
      return (
        <pre key={i} className="bg-black/30 rounded-md p-3 my-2 overflow-x-auto text-xs">
          <code>{code}</code>
        </pre>
      );
    }

    return part.split('\n').map((line, j) => {
      let processed = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      processed = processed.replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded text-xs">$1</code>');

      return (
        <span key={`${i}-${j}`}>
          {j > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: processed }} />
        </span>
      );
    });
  });
}

export function ChatMessage({ message, isStreaming, theme, AssistantIcon }) {
  const isUser = message.role === 'user';
  const attachments = message.attachments ? (typeof message.attachments === 'string' ? JSON.parse(message.attachments) : message.attachments) : [];

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`shrink-0 w-8 h-8 md:w-7 md:h-7 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary/20' : theme.accentBg
      }`}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-primary" />
          : <AssistantIcon className={`h-3.5 w-3.5 ${theme.accent}`} />
        }
      </div>

      <div className={`max-w-[92%] md:max-w-[80%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary/15 text-foreground'
            : 'bg-card border border-border text-foreground'
        }`}>
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2">
              {attachments.map((att, i) => (
                <div key={i} className="w-20 h-20 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground overflow-hidden">
                  {att.preview
                    ? <img src={att.preview} alt={att.fileName} className="w-full h-full object-cover" />
                    : att.fileName || 'image'
                  }
                </div>
              ))}
            </div>
          )}

          <div className="break-words">
            {isUser ? message.content : renderMarkdown(message.content)}
            {isStreaming && (
              <span className={`inline-block w-1.5 h-4 ${theme.cursor} animate-pulse ml-0.5 align-text-bottom`} />
            )}
          </div>
        </div>

        <p className={`text-[11px] md:text-[10px] text-muted-foreground/50 mt-1 ${isUser ? 'text-right' : ''}`}>
          {formatTime(message.created_at)}
          {message.model && <span className="ml-1.5">{message.model}</span>}
        </p>
      </div>
    </div>
  );
}
