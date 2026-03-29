import { Router } from 'express';
import { WorkspaceBase } from '../base.js';
import config from '../../config.js';
import db, { audit } from '../../db.js';
import { randomUUID } from 'crypto';

// Shared map: requestId -> ws connection (set by WS handler in index.js)
export const aiStreams = new Map();

export class AiGatewayWorkspace extends WorkspaceBase {
  constructor({ id, name, icon, description, gateway }) {
    super({
      id,
      name,
      icon,
      status: gateway.token ? 'active' : 'stub',
      description,
    });
    this.gateway = gateway;
  }

  async getStatus() {
    if (!this.gateway.token) return { status: 'unconfigured' };
    try {
      // Try /v1/models first (full HTTP surface)
      const res = await fetch(`${this.gateway.gatewayUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${this.gateway.token}`,
          'x-openclaw-scopes': 'operator.read',
        },
        signal: AbortSignal.timeout(5000),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return { status: 'connected' };
      }
      // Fallback: probe chat endpoint (GET returns 405 = endpoint exists)
      const probe = await fetch(`${this.gateway.gatewayUrl}/v1/chat/completions`, {
        headers: { Authorization: `Bearer ${this.gateway.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (probe.status === 405) return { status: 'connected' };
      return { status: 'error', code: res.status };
    } catch {
      return { status: 'disconnected' };
    }
  }

  getRoutes() {
    const router = Router();
    const gw = this.gateway;
    const workspaceId = this.id;

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
          FROM ai_sessions s WHERE s.workspace_id = ? ORDER BY s.updated_at DESC
        `).all(workspaceId);
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
        db.prepare('INSERT INTO ai_sessions (id, title, workspace_id) VALUES (?, ?, ?)').run(id, title, workspaceId);
        res.json({ id, title, created_at: new Date().toISOString() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete session
    router.delete('/sessions/:id', (req, res) => {
      try {
        db.prepare('DELETE FROM ai_sessions WHERE id = ? AND workspace_id = ?').run(req.params.id, workspaceId);
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
        if (!gw.token) {
          return res.status(400).json({ error: 'Gateway not configured' });
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

        const chatHeaders = {
          Authorization: `Bearer ${gw.token}`,
          'Content-Type': 'application/json',
          'x-openclaw-scopes': 'operator.admin,operator.read,operator.write',
        };
        if (gw.defaultModel) {
          chatHeaders['x-openclaw-model'] = gw.defaultModel;
        }

        const response = await fetch(`${gw.gatewayUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: chatHeaders,
          body: JSON.stringify({
            model: 'openclaw/default',
            messages,
            stream: true,
            user: sessionId,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          const shortErr = errText.length > 200 ? errText.slice(0, 200) + '...' : errText;
          if (ws) ws.send(JSON.stringify({ type: 'ai:error', requestId, error: `Gateway error: ${response.status} ${shortErr}` }));
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
          buffer = lines.pop();

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
          sessionId, 'assistant', fullContent, gw.defaultModel || 'openclaw/default'
        );

        // Auto-title session if it's the first exchange
        const msgCount = db.prepare('SELECT COUNT(*) as c FROM ai_messages WHERE session_id = ?').get(sessionId).c;
        if (msgCount <= 2) {
          const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
          db.prepare('UPDATE ai_sessions SET title = ? WHERE id = ?').run(title, sessionId);
        }

        if (ws) ws.send(JSON.stringify({ type: 'ai:done', requestId, messageId: result.lastInsertRowid }));

        if (requestId) aiStreams.delete(requestId);

        audit('ai.chat', sessionId, { workspace: workspaceId, model: gw.defaultModel, hasImages: !!attachments?.length });
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

// Pre-configured workspace instances
export class OpenClawWorkspace extends AiGatewayWorkspace {
  constructor() {
    super({
      id: 'openclaw-ai',
      name: 'OpenClaw AI',
      icon: 'Claw',
      description: 'Chat with AI via OpenClaw gateway',
      gateway: config.openClaw,
    });
  }
}

export class SynthiqWorkspace extends AiGatewayWorkspace {
  constructor() {
    super({
      id: 'synthiq-ai',
      name: 'Synthiq AI',
      icon: 'Sparkles',
      description: 'Chat with AI via Synthiq gateway',
      gateway: config.synthiq,
    });
  }
}
