import { pathToFileURL } from 'node:url';
import { loadGatewayEnv } from './config/load-env.js';

export function isMainModule(moduleUrl: string): boolean {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(process.argv[1]).href;
}

export async function runGatewayEntry(
  moduleUrl: string,
  fallbackErrorMessage: string,
  start: () => Promise<unknown>,
): Promise<void> {
  if (!isMainModule(moduleUrl)) {
    return;
  }

  try {
    loadGatewayEnv();
    await start();
  } catch (error) {
    console.error(error instanceof Error ? error.message : fallbackErrorMessage);
    process.exit(1);
  }
}