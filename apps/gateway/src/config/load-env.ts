import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

export function loadGatewayEnv(): void {
  dotenv.config({
    path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
    override: process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_RUN !== 'true',
  });
}

// Gateway entrypoints import this module first so dotenv runs before any
// @shopkeeper/agent import evaluates the Anthropic singleton.
loadGatewayEnv();
