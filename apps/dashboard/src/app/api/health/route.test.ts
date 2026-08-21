import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /api/health', () => {
  it('reports liveness without any request context', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('stays cheap enough to poll: touches no dependency', () => {
    // This is the property the route exists for, not an incidental detail.
    // Uptime monitors poll this endpoint every few minutes; a DB check here
    // holds the Neon compute above its scale-to-zero idle window and bills it
    // around the clock. /api/health/deep is where dependency checks belong.
    const source = readFileSync(join(__dirname, 'route.ts'), 'utf8');
    const imports = source.match(/^import .*$/gm) ?? [];

    expect(imports.join('\n')).not.toMatch(/@shopkeeper\/db|server\/redis|@upstash/);
  });
});
