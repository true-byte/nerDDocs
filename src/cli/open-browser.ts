import { spawn } from 'node:child_process';

function openCommand(url: string): [string, string[]] {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

export function openBrowser(url: string, onFailure: () => void): void {
  const [command, args] = openCommand(url);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', onFailure);
  child.on('exit', (code) => {
    if (code) onFailure();
  });
  child.unref();
}
