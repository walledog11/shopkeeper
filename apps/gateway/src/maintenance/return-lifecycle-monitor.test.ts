import { describe, expect, it } from 'vitest';
import { buildReturnArrivalInstruction } from './return-arrival-plan.js';
import { returnArrivedIdempotencyKey } from './return-lifecycle-monitor.js';

describe('return lifecycle monitor helpers', () => {
  it('builds a stable idempotency key per org/order/return', () => {
    expect(returnArrivedIdempotencyKey('org-1', '1001', 'gid://shopify/Return/9'))
      .toBe('return-arrived:org-1:1001:gid://shopify/Return/9');
  });

  it('builds refund-oriented arrival instructions', () => {
    expect(buildReturnArrivalInstruction({
      orderId: '1001',
      returnName: '#R12',
      tool: 'create_return',
    })).toContain('Issue the refund');
  });
});
