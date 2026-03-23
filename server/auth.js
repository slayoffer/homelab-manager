import crypto from 'crypto';
import config from './config.js';
import db from './db.js';

export const authEnabled = !!(config.oauth.clientId && config.oauth.clientSecret);

// --- Token signing ---

function signToken(payload) {
  const data = JSON.stringify(payload);
  const b64 = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', config.oauth.sessionSecret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.oauth.sessionSecret).update(b64).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Cookie helpers ---

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const [key, ...vals] = part.trim().split('=');
    if (key) cookies[key] = vals.join('=');
  }
  return cookies;
}

function sessionCookie(token, maxAge) {
  const parts = [`session=${token}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  return parts.join('; ');
}

function clearSessionCookie() {
  return 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
}

// --- GitHub OAuth ---

export function getAuthorizeUrl() {
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: config.oauth.clientId,
    redirect_uri: config.oauth.redirectUri,
    scope: 'read:user',
    state,
  });
  return { url: `https://github.com/login/oauth/authorize?${params}`, state };
}

export async function exchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.oauth.clientId,
      client_secret: config.oauth.clientSecret,
      code,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  return data.access_token;
}

export async function fetchGitHubUser(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

// --- Session management ---

export function createSession(userId) {
  const expiryMs = config.oauth.sessionExpiryDays * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiryMs);
  const token = signToken({ userId, exp: expiresAt.getTime() });

  // Clean up old sessions for this user
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')`).run(userId);

  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token, userId, expiresAt.toISOString()
  );

  return { token, maxAge: Math.floor(expiryMs / 1000) };
}

export function createOrUpdateUser(ghUser) {
  const existing = db.prepare('SELECT id FROM users WHERE github_id = ?').get(ghUser.id);
  if (existing) {
    db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar_url = ?, last_login_at = datetime('now') WHERE github_id = ?`)
      .run(ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url, ghUser.id);
    return existing.id;
  }
  const result = db.prepare(`INSERT INTO users (github_id, username, display_name, avatar_url, last_login_at) VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(ghUser.id, ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url);
  return result.lastInsertRowid;
}

// --- Middleware ---

export function requireAuth(req, res, next) {
  if (!authEnabled) {
    req.user = null;
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid session' });

  const session = db.prepare(`SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`).get(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });

  req.user = db.prepare('SELECT id, github_id, username, display_name, avatar_url FROM users WHERE id = ?').get(session.user_id);
  if (!req.user) return res.status(401).json({ error: 'User not found' });

  next();
}

// Validate WebSocket upgrade request
export function authenticateWebSocket(req) {
  if (!authEnabled) return true;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;
  if (!token) return false;
  const payload = verifyToken(token);
  if (!payload) return false;
  const session = db.prepare(`SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`).get(token);
  return !!session;
}

// --- Route handlers ---

export function registerAuthRoutes(app) {
  // Check auth status
  app.get('/api/auth/me', (req, res) => {
    if (!authEnabled) {
      return res.json({ user: null, authEnabled: false });
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.session;
    if (!token) return res.json({ user: null, authEnabled: true });

    const payload = verifyToken(token);
    if (!payload) return res.json({ user: null, authEnabled: true });

    const session = db.prepare(`SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`).get(token);
    if (!session) return res.json({ user: null, authEnabled: true });

    const user = db.prepare('SELECT id, github_id, username, display_name, avatar_url FROM users WHERE id = ?').get(session.user_id);
    res.json({ user: user || null, authEnabled: true });
  });

  // Start GitHub OAuth flow
  app.get('/api/auth/github', (req, res) => {
    if (!authEnabled) return res.status(400).json({ error: 'Auth not configured' });
    const { url } = getAuthorizeUrl();
    res.redirect(url);
  });

  // GitHub OAuth callback
  app.get('/api/auth/github/callback', async (req, res) => {
    try {
      if (!authEnabled) return res.status(400).send('Auth not configured');

      const { code } = req.query;
      if (!code) return res.status(400).send('Missing code parameter');

      const accessToken = await exchangeCode(code);
      const ghUser = await fetchGitHubUser(accessToken);

      // Check allowlist if configured
      if (config.oauth.allowedUsers.length > 0 && !config.oauth.allowedUsers.includes(ghUser.login.toLowerCase())) {
        return res.status(403).send(`Access denied. User "${ghUser.login}" is not in the allowed users list.`);
      }

      const userId = createOrUpdateUser(ghUser);
      const { token, maxAge } = createSession(userId);

      res.setHeader('Set-Cookie', sessionCookie(token, maxAge));
      res.redirect('/');
    } catch (err) {
      console.error('[auth] GitHub callback error:', err.message);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.session;
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.json({ success: true });
  });
}
