import { sshExec } from '../../lib/ssh.js';
import config from '../../config.js';

const PROTECTED_PATHS = new Set(['/', '/root', '/home', '/etc', '/var', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys', '/lib', '/lib64']);

function validatePath(p) {
  if (!p || typeof p !== 'string') throw new Error('Path required');
  if (!p.startsWith('/')) throw new Error('Path must be absolute');
  if (p.includes('..')) throw new Error('Path traversal not allowed');
  if (p.includes('\0')) throw new Error('Invalid path');
  return p;
}

function escapePath(p) {
  return p.replace(/'/g, "'\\''");
}

function ssh(command, options) {
  return sshExec(config.gcServer, command, options);
}

export function listDirectory(dirPath) {
  dirPath = validatePath(dirPath);
  const escaped = escapePath(dirPath);

  // Get detailed listing + directory sizes in one SSH call
  const output = ssh(`ls -la --time-style=long-iso '${escaped}' 2>/dev/null; echo '===SIZES==='; du -sb '${escaped}'/* 2>/dev/null`);

  const [lsPart, duPart] = output.split('===SIZES===');

  // Parse du output for directory sizes
  const dirSizes = {};
  if (duPart) {
    for (const line of duPart.trim().split('\n')) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) dirSizes[match[2]] = parseInt(match[1]);
    }
  }

  // Parse ls output
  const entries = [];
  const lines = lsPart.trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('total ') || !line.trim()) continue;
    // drwxr-xr-x 2 slayo slayo 4096 2026-03-29 10:00 dirname
    const match = line.match(/^([dlcbsp-])([rwxsStT-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
    if (!match) continue;
    const name = match[8];
    if (name === '.' || name === '..') continue;

    const typeChar = match[1];
    const isDir = typeChar === 'd';
    const isLink = typeChar === 'l';
    const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
    const lsSize = parseInt(match[5]);

    entries.push({
      name: isLink ? name.split(' -> ')[0] : name,
      type: isDir ? 'directory' : isLink ? 'link' : 'file',
      size: isDir ? (dirSizes[fullPath] || lsSize) : lsSize,
      modified: `${match[6]} ${match[7]}`,
      permissions: match[1] + match[2],
      owner: match[3],
    });
  }

  // Sort: directories first, then by name
  entries.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export function readFile(filePath, maxSize = 512 * 1024) {
  filePath = validatePath(filePath);
  const escaped = escapePath(filePath);

  // Check size and type
  const info = ssh(`stat -c '%s' '${escaped}' && file --mime-encoding '${escaped}'`);
  const lines = info.split('\n');
  const size = parseInt(lines[0]);
  const encoding = lines[1]?.split(':').pop()?.trim() || '';

  if (size > maxSize) throw new Error(`File too large: ${(size / 1024).toFixed(0)}KB (limit: ${(maxSize / 1024).toFixed(0)}KB)`);
  if (encoding === 'binary') throw new Error('Binary file cannot be displayed');

  const content = ssh(`cat '${escaped}'`, { maxBuffer: maxSize + 1024 });
  return { content, size, encoding };
}

export function createDirectory(dirPath) {
  dirPath = validatePath(dirPath);
  ssh(`mkdir -p '${escapePath(dirPath)}'`);
  return { success: true };
}

export function createFile(filePath) {
  filePath = validatePath(filePath);
  ssh(`touch '${escapePath(filePath)}'`);
  return { success: true };
}

export function renameItem(oldPath, newPath) {
  oldPath = validatePath(oldPath);
  newPath = validatePath(newPath);
  ssh(`mv '${escapePath(oldPath)}' '${escapePath(newPath)}'`);
  return { success: true };
}

export function deleteItem(targetPath) {
  targetPath = validatePath(targetPath);
  if (PROTECTED_PATHS.has(targetPath)) throw new Error(`Cannot delete protected path: ${targetPath}`);
  ssh(`rm -rf '${escapePath(targetPath)}'`);
  return { success: true };
}

export function getDiskStats() {
  const output = ssh("df -h / | tail -1; echo '===DIRS==='; du -sh /home /var /etc /opt /root /tmp /usr /srv 2>/dev/null");
  const [dfLine, dirsPart] = output.split('===DIRS===');

  const dfMatch = dfLine.trim().match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
  const disk = dfMatch ? { total: dfMatch[1], used: dfMatch[2], available: dfMatch[3], percent: dfMatch[4] } : {};

  const directories = [];
  if (dirsPart) {
    for (const line of dirsPart.trim().split('\n')) {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (match) directories.push({ size: match[1], path: match[2] });
    }
  }
  directories.sort((a, b) => {
    const parseSize = (s) => {
      const num = parseFloat(s);
      if (s.includes('G')) return num * 1024;
      if (s.includes('M')) return num;
      if (s.includes('K')) return num / 1024;
      return num / (1024 * 1024);
    };
    return parseSize(b.size) - parseSize(a.size);
  });

  return { disk, directories };
}
