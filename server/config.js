import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  port: parseInt(process.env.PORT || '3456'),
  wow: {
    basePath: process.env.WOW_PATH || '/home/slayo/docker/wow/azerothcore-wotlk',
    composePath: process.env.WOW_COMPOSE_PATH || '/home/slayo/docker/wow/azerothcore-wotlk',
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
