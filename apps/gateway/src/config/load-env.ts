import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

export function loadGatewayEnv(): void {
  dotenv.config({
    path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
  });
}
