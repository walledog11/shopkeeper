import { describe, expect, it } from 'vitest';
import { returnArrivedIdempotencyKey } from './return-lifecycle-monitor.js';

describe('return lifecycle monitor helpers', () => {
  it('builds a stable idempotency key per org/order/return', () => {
    expect(returnArrivedIdempotencyKey('org-1', '1001', 'gid://shopify/Return/9'))
      .toBe('return-arrived:org-1:1001:gid://shopify/Return/9');
  });
});
