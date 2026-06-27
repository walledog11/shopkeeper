import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function getNgrokArgs(env = process.env) {
  const port = env.GATEWAY_PORT?.trim() || '8080';
  const domain = env.NGROK_DOMAIN?.trim();
  return ['http', port, ...(domain ? ['--url', domain] : [])];
}

function startNgrok() {
  const child = spawn('ngrok', getNgrokArgs(), {
    stdio: 'inherit',
    env: process.env,
  });

  child.once('error', (error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('[ngrok] Command not found. Install ngrok from https://ngrok.com/download.');
    } else {
      console.error('[ngrok] Failed to start tunnel', error);
    }
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startNgrok();
}
