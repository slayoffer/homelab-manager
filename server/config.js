import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  port: parseInt(process.env.PORT || '3456'),
  wow: {
    basePath: process.env.WOW_PATH || '/home/slayo/docker/wow/azerothcore-wotlk',
    composePath: process.env.WOW_COMPOSE_PATH || '/home/slayo/docker/wow/azerothcore-wotlk',
    composeProject: process.env.WOW_COMPOSE_PROJECT || 'azerothcore-wotlk',
    dbContainer: 'ac-database',
    dbUser: process.env.WOW_DB_USER || 'root',
    dbPassword: process.env.WOW_DB_PASSWORD || 'password',
    databases: {
      world: 'acore_world',
      characters: 'acore_characters',
      auth: 'acore_auth',
      playerbots: 'acore_playerbots',
    },
    containers: ['ac-database', 'ac-worldserver', 'ac-authserver'],
  },
  statePath: process.env.STATE_PATH || path.join(__dirname, '..', 'data', 'state.json'),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'homelab.db'),
  openClaw: {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://openclaw:18789',
    token: process.env.OPENCLAW_GATEWAY_TOKEN || '',
    defaultModel: process.env.OPENCLAW_MODEL || 'openai/gpt-5.4',
    systemPrompt: process.env.OPENCLAW_SYSTEM_PROMPT || '',
  },
  synthiq: {
    gatewayUrl: process.env.SYNTHIQ_GATEWAY_URL || '',
    token: process.env.SYNTHIQ_GATEWAY_TOKEN || '',
    defaultModel: process.env.SYNTHIQ_MODEL || 'openai/gpt-5.4',
    systemPrompt: process.env.SYNTHIQ_SYSTEM_PROMPT || '',
  },
  gcServer: {
    host: process.env.GC_SERVER_HOST || '147.45.101.28',
    port: parseInt(process.env.GC_SERVER_PORT || '22'),
    user: process.env.GC_SERVER_USER || 'slayo',
    keyPath: process.env.GC_SERVER_KEY || '/root/.ssh/geekconsole_timeweb_rsa',
  },
  oauth: {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI || `http://localhost:${parseInt(process.env.PORT || '3456')}/api/auth/github/callback`,
    sessionSecret: process.env.SESSION_SECRET || 'homelab-dev-secret-change-me',
    sessionExpiryDays: 30,
    allowedUsers: process.env.GITHUB_ALLOWED_USERS ? process.env.GITHUB_ALLOWED_USERS.split(',').map(u => u.trim().toLowerCase()) : [],
  },
};

export default config;
