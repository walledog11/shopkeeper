import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getGatewayRuntimeRole, shouldRunGatewayServer, shouldRunGatewayWorker } from './config/runtime-config.js';

const distDir = dirname(fileURLToPath(import.meta.url));
const children = new Map<string, ChildProcess>();
let shuttingDown = false;

function spawnProcess(name: string, entryFile: string): ChildProcess {
  const child = spawn(process.execPath, [resolve(distDir, entryFile)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    console.error(`[GatewayStart] ${name} exited`, { code, signal });
    children.delete(name);

    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const sibling of children.values()) {
      sibling.kill('SIGTERM');
    }

    process.exitCode = code ?? 1;
  });

  child.on('error', (error) => {
    console.error(`[GatewayStart] Failed to start ${name}`, error);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const sibling of children.values()) {
        sibling.kill('SIGTERM');
      }
      process.exit(1);
    }
  });

  children.set(name, child);
  return child;
}

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[GatewayStart] Received ${signal}, shutting down child processes`);

  for (const child of children.values()) {
    child.kill(signal);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const runtimeRole = getGatewayRuntimeRole();

if (shouldRunGatewayServer(runtimeRole)) {
  spawnProcess('server', './index.js');
}

if (shouldRunGatewayWorker(runtimeRole)) {
  spawnProcess('worker', './worker.js');
}

if (children.size === 0) {
  console.error('[GatewayStart] No child processes were started');
  process.exit(1);
}
