import { describe, expect, it } from 'vitest';
import { hasDualInboundDeliveryRisk } from './inbound-transport-policy.js';

describe('hasDualInboundDeliveryRisk', () => {
  it('is false when only Gmail is active without watch status', () => {
    expect(hasDualInboundDeliveryRisk({
      gmail: {
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        metadata: { provider: 'gmail' },
      },
      postmark: {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    })).toBe(false);
  });

  it('is true when Gmail watch and Postmark are both active', () => {
    expect(hasDualInboundDeliveryRisk({
      gmail: {
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        metadata: {
          provider: 'gmail',
          gmail: { inboundStatus: 'active' },
        },
      },
      postmark: {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    })).toBe(true);
  });

  it('is false when Gmail ingest is disabled via inboundMode postmark', () => {
    expect(hasDualInboundDeliveryRisk({
      gmail: {
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        metadata: {
          provider: 'gmail',
          inboundMode: 'postmark',
          gmail: { inboundStatus: 'active' },
        },
      },
      postmark: {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    })).toBe(false);
  });
});
