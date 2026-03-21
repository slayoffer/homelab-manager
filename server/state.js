import fs from 'fs';
import path from 'path';
import config from './config.js';

const defaultState = {
  wow: {
    lastAppliedCommits: {},
    sqlPreferences: {},
    modules: [],
  },
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadState() {
  try {
    if (fs.existsSync(config.statePath)) {
      return JSON.parse(fs.readFileSync(config.statePath, 'utf-8'));
    }
  } catch {
    // corrupted state, reset
  }
  return { ...defaultState };
}

export function saveState(state) {
  ensureDir(config.statePath);
  fs.writeFileSync(config.statePath, JSON.stringify(state, null, 2));
}

export function updateState(updater) {
  const state = loadState();
  updater(state);
  saveState(state);
  return state;
}
