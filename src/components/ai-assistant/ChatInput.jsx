import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, ImagePlus, X, Loader2 } from 'lucide-react';

function resizeImage(file, maxDim = 1024) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height / width) * maxDim);
            width = maxDim;
          } else {
            width = Math.round((width / height) * maxDim);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve({
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: file.name || 'screenshot.jpg',
          content: base64,
          preview: dataUrl,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return;
    onSend(text.trim(), attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) handleSend();
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const attachment = await resizeImage(file);
          setAttachments(prev => [...prev, attachment]);
        }
      }
    }
  };

  const handleFileSelect = async (e) => {
    for (const file of e.target.files) {
      if (file.type.startsWith('image/')) {
        const attachment = await resizeImage(file);
        setAttachments(prev => [...prev, attachment]);
      }
    }
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-border bg-card/50 p-2 md:p-3 space-y-2">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              <img src={att.preview} alt={att.fileName} className="w-14 h-14 md:w-16 md:h-16 rounded-lg object-cover border border-border" />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 md:w-4 md:h-4 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:h-9 md:w-9 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach image"
        >
          <ImagePlus className="h-5 w-5 md:h-4 md:w-4" />
        </Button>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          disabled={disabled}
          className="min-h-[44px] max-h-[200px] resize-none text-base md:text-sm bg-background"
          rows={1}
        />

        <Button
          size="icon"
          className="h-11 w-11 md:h-9 md:w-9 shrink-0 bg-primary text-primary-foreground"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && attachments.length === 0)}
        >
          {disabled ? <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin" /> : <Send className="h-5 w-5 md:h-4 md:w-4" />}
        </Button>
      </div>
    </div>
  );
}
