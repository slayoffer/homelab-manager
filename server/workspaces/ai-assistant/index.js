import { Router } from 'express';
import { WorkspaceBase } from '../base.js';
import config from '../../config.js';
import db, { audit } from '../../db.js';
import { randomUUID } from 'crypto';

// Shared map: requestId -> ws connection (set by WS handler in index.js)
export const aiStreams = new Map();

export class AiAssistantWorkspace extends WorkspaceBase {
  constructor() {
    super({
      id: 'ai-assistant',
      name: 'AI Assistant',
      icon: 'BrainCircuit',
      status: config.openClaw.token ? 'active' : 'stub',
      description: 'Chat with AI via OpenClaw gateway',
    });
  }

  async getStatus() {
    if (!config.openClaw.token) return { status: 'unconfigured' };
    try {
      const res = await fetch(`${config.openClaw.gatewayUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${config.openClaw.token}` },
        signal: AbortSignal.timeout(5000),
      });
      return { status: res.ok ? 'connected' : 'error', code: res.status };
    } catch {
      return { status: 'disconnected' };
    }
  }

  getRoutes() {
    const router = Router();

    // Gateway status
    router.get('/status', async (req, res) => {
      try {
        res.json(await this.getStatus());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // List sessions
    router.get('/sessions', (req, res) => {
      try {
        const sessions = db.prepare(`
          SELECT s.*,
            (SELECT content FROM ai_messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as lastMessage,
            (SELECT COUNT(*) FROM ai_messages WHERE session_id = s.id) as messageCount
          FROM ai_sessions s ORDER BY s.updated_at DESC
        `).all();
        res.json(sessions);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create session
    router.post('/sessions', (req, res) => {
      try {
        const id = randomUUID();
        const title = req.body.title || 'New conversation';
        db.prepare('INSERT INTO ai_sessions (id, title) VALUES (?, ?)').run(id, title);
        res.json({ id, title, created_at: new Date().toISOString() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete session
    router.delete('/sessions/:id', (req, res) => {
      try {
        db.prepare('DELETE FROM ai_sessions WHERE id = ?').run(req.params.id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get messages for session
    router.get('/sessions/:id/messages', (req, res) => {
      try {
        const messages = db.prepare('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id);
        res.json(messages);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Chat — send message, stream response via WS
    router.post('/chat', async (req, res) => {
      try {
        const { sessionId, message, attachments, requestId } = req.body;
        if (!sessionId || !message) {
          return res.status(400).json({ error: 'sessionId and message required' });
        }
        if (!config.openClaw.token) {
          return res.status(400).json({ error: 'OpenClaw not configured' });
        }

        // Store user message
        const attachmentMeta = attachments?.map(a => ({ type: a.type, mimeType: a.mimeType, fileName: a.fileName }));
        db.prepare('INSERT INTO ai_messages (session_id, role, content, attachments) VALUES (?, ?, ?, ?)').run(
          sessionId, 'user', message, attachmentMeta ? JSON.stringify(attachmentMeta) : null
        );

        // Update session timestamp
        db.prepare(`UPDATE ai_sessions SET updated_at = datetime('now') WHERE id = ?`).run(sessionId);

        // Build conversation history (last 30 messages)
        const history = db.prepare('SELECT role, content, attachments FROM ai_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 30').all(sessionId).reverse();

        // Build OpenAI messages format
        const messages = history.map(m => {
          if (m.role === 'user' && m.attachments) {
            const parsed = JSON.parse(m.attachments);
            // For the current message, include actual image data
            if (m.content === message && attachments?.length) {
              const content = [{ type: 'text', text: m.content }];
              for (const att of attachments) {
                if (att.type === 'image') {
                  content.push({
                    type: 'image_url',
                    image_url: { url: `data:${att.mimeType};base64,${att.content}` },
                  });
                }
              }
              return { role: 'user', content };
            }
          }
          return { role: m.role, content: m.content };
        });

        // Get WS connection for streaming
        const ws = requestId ? aiStreams.get(requestId) : null;

        // Call OpenClaw
        const response = await fetch(`${config.openClaw.gatewayUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.openClaw.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.openClaw.defaultModel,
            messages,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          if (ws) ws.send(JSON.stringify({ type: 'ai:error', requestId, error: `Gateway error: ${response.status} ${errText}` }));
          return res.json({ success: false, error: `Gateway error: ${response.status}` });
        }

        // Parse SSE stream
        let fullContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta && ws) {
                fullContent += delta;
                ws.send(JSON.stringify({ type: 'ai:delta', requestId, content: delta }));
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }

        // Store assistant message
        const result = db.prepare('INSERT INTO ai_messages (session_id, role, content, model) VALUES (?, ?, ?, ?)').run(
          sessionId, 'assistant', fullContent, config.openClaw.defaultModel
        );

        // Auto-title session if it's the first exchange
        const msgCount = db.prepare('SELECT COUNT(*) as c FROM ai_messages WHERE session_id = ?').get(sessionId).c;
        if (msgCount <= 2) {
          const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
          db.prepare('UPDATE ai_sessions SET title = ? WHERE id = ?').run(title, sessionId);
        }

        if (ws) ws.send(JSON.stringify({ type: 'ai:done', requestId, messageId: result.lastInsertRowid }));

        // Cleanup stream subscription
        if (requestId) aiStreams.delete(requestId);

        audit('ai.chat', sessionId, { model: config.openClaw.defaultModel, hasImages: !!attachments?.length });
        res.json({ success: true, messageId: result.lastInsertRowid });
      } catch (err) {
        const ws = req.body.requestId ? aiStreams.get(req.body.requestId) : null;
        if (ws) ws.send(JSON.stringify({ type: 'ai:error', requestId: req.body.requestId, error: err.message }));
        if (req.body.requestId) aiStreams.delete(req.body.requestId);
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }
}
