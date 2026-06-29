import { describe, expect, it, vi } from 'vitest';
import { createProductAnalyticsShutdownResource } from './product-analytics.js';

describe('product analytics shutdown resource', () => {
  it('flushes the analytics sink when the resource closes', async () => {
    const shutdown = vi.fn(async () => {});
    const resource = createProductAnalyticsShutdownResource(shutdown);

    await resource.close();

    expect(resource.label).toBe('product-analytics');
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
