import { execSync, spawn } from 'child_process';

function buildSshArgs(config) {
  return [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-i', config.keyPath,
    '-p', String(config.port),
    `${config.user}@${config.host}`,
  ];
}

export function sshExec(config, command, options = {}) {
  const timeout = options.timeout || 30000;
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024;
  const args = buildSshArgs(config);
  args.push(command);
  return execSync(['ssh', ...args.map(a => `'${a}'`)].join(' '), {
    encoding: 'utf-8',
    timeout,
    maxBuffer,
    shell: true,
  }).trim();
}

export function sshSpawn(config, command) {
  const args = [...buildSshArgs(config), command];
  return spawn('ssh', args);
}
