import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import db, { audit } from '../../db.js';

const CONFIG_BASE = 'env/dist/etc';
const SETTING_RE = /^\s*([A-Za-z][A-Za-z0-9._-]+)\s*=\s*(.*?)\s*$/;
const COMMENTED_SETTING_RE = /^#\s*([A-Za-z][A-Za-z0-9._-]+)\s*=\s*(.*?)\s*$/;
const SECTION_RE = /^\[([^\]]+)\]$/;

function validateConfigPath(relativePath) {
  if (!relativePath || relativePath.includes('..')) {
    throw new Error('Invalid config path');
  }
  const resolved = path.resolve(config.wow.basePath, relativePath);
  const allowedBase = path.resolve(config.wow.basePath, CONFIG_BASE);
  if (!resolved.startsWith(allowedBase)) {
    throw new Error('Path outside allowed directory');
  }
  return resolved;
}

function parseConfig(content) {
  const lines = content.split('\n');
  const settings = [];
  const sections = [];
  let currentSection = '';
  let descBuffer = [];
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;

    // Section header
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.includes(currentSection)) sections.push(currentSection);
      descBuffer = [];
      continue;
    }

    // Active setting: Key = Value
    const settingMatch = line.match(SETTING_RE);
    if (settingMatch) {
      const key = settingMatch[1];
      // Clean description: remove decorative lines, key name echoes, and empty lines
      const cleanDesc = descBuffer
        .filter(l => !/^#{2,}$/.test(l))            // Remove ####... decoration
        .filter(l => !/^-{2,}$/.test(l))             // Remove ---- decoration
        .filter(l => !/^={2,}$/.test(l))             // Remove ==== decoration
        .filter(l => l !== key)                       // Remove line that's just the key name
        .filter(l => !l.match(/^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+ (Configuration|Settings|Options)$/)) // Remove section titles
        .map(l => l.replace(/^\s{0,4}/, ''))          // Remove leading indent (up to 4 spaces)
        .join('\n').trim();

      settings.push({
        key,
        value: settingMatch[2],
        description: cleanDesc || '',
        section: currentSection,
        lineNumber: lineNum,
        commented: false,
      });
      descBuffer = [];
      continue;
    }

    // Comment line — accumulate for description
    if (line.startsWith('#')) {
      const stripped = line.slice(1).trim();
      // Skip pure decoration lines inline
      if (/^#{2,}$/.test(stripped) || /^-{2,}$/.test(stripped) || /^={2,}$/.test(stripped)) {
        continue;
      }
      descBuffer.push(stripped);
    } else if (line.trim() === '') {
      if (descBuffer.length > 20) descBuffer = [];
    }
  }

  return { settings, sections };
}

function diffSettings(confSettings, distSettings) {
  const confMap = new Map();
  const distMap = new Map();

  for (const s of confSettings) confMap.set(s.key, s);
  for (const s of distSettings) distMap.set(s.key, s);

  const results = [];

  // Check all dist settings (new + modified + unchanged)
  for (const [key, dist] of distMap) {
    const conf = confMap.get(key);
    if (!conf) {
      results.push({
        key,
        status: 'new',
        confValue: null,
        distValue: dist.value,
        description: dist.description,
        section: dist.section,
      });
    } else if (conf.value.trim() !== dist.value.trim()) {
      results.push({
        key,
        status: 'modified',
        confValue: conf.value,
        distValue: dist.value,
        description: dist.description || conf.description,
        section: dist.section || conf.section,
      });
    } else {
      results.push({
        key,
        status: 'unchanged',
        confValue: conf.value,
        distValue: dist.value,
        description: dist.description || conf.description,
        section: dist.section || conf.section,
      });
    }
  }

  // Check for deprecated (in conf but not in dist)
  for (const [key, conf] of confMap) {
    if (!distMap.has(key)) {
      results.push({
        key,
        status: 'deprecated',
        confValue: conf.value,
        distValue: null,
        description: conf.description,
        section: conf.section,
      });
    }
  }

  return results;
}

export function listConfigFiles() {
  const etcPath = path.join(config.wow.basePath, CONFIG_BASE);
  const files = [];

  // Scan core configs
  if (fs.existsSync(etcPath)) {
    for (const entry of fs.readdirSync(etcPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.conf')) continue;
      const fullPath = path.join(etcPath, entry.name);
      const distPath = fullPath + '.dist';
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry.name,
        relativePath: path.join(CONFIG_BASE, entry.name),
        type: 'core',
        hasDist: fs.existsSync(distPath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
    // Also check for .conf.dist without a .conf (unconfigured)
    for (const entry of fs.readdirSync(etcPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.conf.dist')) continue;
      const confName = entry.name.replace('.dist', '');
      if (!files.some(f => f.name === confName)) {
        files.push({
          name: confName,
          relativePath: path.join(CONFIG_BASE, confName),
          type: 'core',
          hasDist: true,
          size: 0,
          modified: null,
          unconfigured: true,
        });
      }
    }
  }

  // Scan module configs
  const modulesPath = path.join(etcPath, 'modules');
  if (fs.existsSync(modulesPath)) {
    for (const entry of fs.readdirSync(modulesPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.conf')) continue;
      const fullPath = path.join(modulesPath, entry.name);
      const distPath = fullPath + '.dist';
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry.name,
        relativePath: path.join(CONFIG_BASE, 'modules', entry.name),
        type: 'module',
        hasDist: fs.existsSync(distPath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
    // Unconfigured module .dist files
    for (const entry of fs.readdirSync(modulesPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.conf.dist')) continue;
      const confName = entry.name.replace('.dist', '');
      if (!files.some(f => f.name === confName && f.type === 'module')) {
        files.push({
          name: confName,
          relativePath: path.join(CONFIG_BASE, 'modules', confName),
          type: 'module',
          hasDist: true,
          size: 0,
          modified: null,
          unconfigured: true,
        });
      }
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export function readConfig(relativePath) {
  const fullPath = validateConfigPath(relativePath);
  if (!fs.existsSync(fullPath)) {
    return { raw: '', settings: [], sections: [] };
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const { settings, sections } = parseConfig(raw);
  return { raw, settings, sections };
}

export function diffConfig(relativePath) {
  const confPath = validateConfigPath(relativePath);
  const distPath = confPath + '.dist';

  const confContent = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : '';
  const distContent = fs.existsSync(distPath) ? fs.readFileSync(distPath, 'utf-8') : '';

  const confParsed = parseConfig(confContent);
  const distParsed = parseConfig(distContent);

  const settings = diffSettings(confParsed.settings, distParsed.settings);

  const summary = { new: 0, deprecated: 0, modified: 0, unchanged: 0 };
  for (const s of settings) summary[s.status]++;

  return { settings, summary };
}

export function saveConfig(relativePath, content) {
  if (relativePath.endsWith('.dist')) {
    throw new Error('Cannot write to .conf.dist files');
  }
  const fullPath = validateConfigPath(relativePath);

  // Snapshot current content before overwriting
  if (fs.existsSync(fullPath)) {
    const oldContent = fs.readFileSync(fullPath, 'utf-8');
    db.prepare('INSERT INTO config_snapshots (config_path, content) VALUES (?, ?)').run(relativePath, oldContent);
  }

  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf-8');
  audit('config.save', relativePath, { size: content.length });
  return { success: true };
}

export function getConfigHistory(relativePath) {
  return db.prepare('SELECT id, config_path, saved_at, length(content) as size FROM config_snapshots WHERE config_path = ? ORDER BY saved_at DESC LIMIT 20').all(relativePath);
}

export function rollbackConfig(snapshotId) {
  const snapshot = db.prepare('SELECT config_path, content FROM config_snapshots WHERE id = ?').get(snapshotId);
  if (!snapshot) throw new Error('Snapshot not found');
  // Save current before rollback
  saveConfig(snapshot.config_path, snapshot.content);
  audit('config.rollback', snapshot.config_path, { snapshotId });
  return { success: true };
}

export function mergeNewSettings(relativePath) {
  const { settings } = diffConfig(relativePath);
  const newSettings = settings.filter(s => s.status === 'new');

  if (newSettings.length === 0) {
    return { success: true, added: 0 };
  }

  const confPath = validateConfigPath(relativePath);
  let content = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : '';

  // Group new settings by section
  const bySection = {};
  for (const s of newSettings) {
    const sec = s.section || 'default';
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(s);
  }

  // Append new settings
  for (const [section, items] of Object.entries(bySection)) {
    content += `\n\n# --- New settings from upstream (${section}) ---\n`;
    for (const item of items) {
      if (item.description) {
        content += `#\n# ${item.key}\n#     ${item.description.split('\n').slice(0, 3).join('\n#     ')}\n#\n`;
      }
      content += `${item.key} = ${item.distValue}\n`;
    }
  }

  // Snapshot before merge
  if (fs.existsSync(confPath)) {
    const oldContent = fs.readFileSync(confPath, 'utf-8');
    db.prepare('INSERT INTO config_snapshots (config_path, content) VALUES (?, ?)').run(relativePath, oldContent);
  }

  fs.writeFileSync(confPath, content, 'utf-8');
  audit('config.merge', relativePath, { added: newSettings.length, keys: newSettings.map(s => s.key) });
  return { success: true, added: newSettings.length };
}
