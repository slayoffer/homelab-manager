import { execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import config from '../../config.js';

function getModulesDir() {
  return path.join(config.wow.basePath, 'modules');
}

export function discoverModules() {
  const modulesDir = getModulesDir();
  if (!fs.existsSync(modulesDir)) return [];

  return fs.readdirSync(modulesDir)
    .filter(name => {
      const modPath = path.join(modulesDir, name);
      return fs.statSync(modPath).isDirectory() && fs.existsSync(path.join(modPath, '.git'));
    })
    .map(name => ({
      id: name,
      name,
      path: path.join(modulesDir, name),
    }));
}

export function getAllRepos() {
  const repos = [
    { id: 'core', name: 'azerothcore-wotlk', path: config.wow.basePath },
    ...discoverModules(),
  ];
  return repos;
}

function runGit(repoPath, args) {
  try {
    return execSync(`git ${args}`, { cwd: repoPath, encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (err) {
    return err.stdout?.trim() || err.message;
  }
}

export function getRepoStatus(repoPath) {
  const branch = runGit(repoPath, 'rev-parse --abbrev-ref HEAD');
  const commit = runGit(repoPath, 'rev-parse --short HEAD');
  const commitMessage = runGit(repoPath, 'log -1 --format=%s');
  const remote = runGit(repoPath, 'remote get-url origin');

  return { branch, commit, commitMessage, remote };
}

export function fetchRepo(repoPath) {
  runGit(repoPath, 'fetch origin');
  const branch = runGit(repoPath, 'rev-parse --abbrev-ref HEAD');
  const behind = runGit(repoPath, `rev-list HEAD..origin/${branch} --count`);
  const ahead = runGit(repoPath, `rev-list origin/${branch}..HEAD --count`);
  const newCommits = runGit(repoPath, `log HEAD..origin/${branch} --oneline`);

  return {
    behind: parseInt(behind) || 0,
    ahead: parseInt(ahead) || 0,
    newCommits: newCommits ? newCommits.split('\n') : [],
  };
}

export function pullRepo(repoPath) {
  try {
    const output = execSync('git pull', { cwd: repoPath, encoding: 'utf-8', timeout: 60000 });
    return { success: true, output: output.trim() };
  } catch (err) {
    return { success: false, output: err.stderr || err.message };
  }
}

export function cloneModule(gitUrl, moduleName) {
  const modulesDir = getModulesDir();
  const targetPath = path.join(modulesDir, moduleName);

  if (fs.existsSync(targetPath)) {
    return { success: false, error: `Module ${moduleName} already exists` };
  }

  try {
    execSync(`git clone ${gitUrl} ${moduleName}`, {
      cwd: modulesDir,
      encoding: 'utf-8',
      timeout: 120000,
    });
    return { success: true, path: targetPath };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

export function removeModule(moduleName) {
  const modulePath = path.join(getModulesDir(), moduleName);
  if (!fs.existsSync(modulePath)) {
    return { success: false, error: `Module ${moduleName} not found` };
  }
  fs.rmSync(modulePath, { recursive: true, force: true });
  return { success: true };
}
