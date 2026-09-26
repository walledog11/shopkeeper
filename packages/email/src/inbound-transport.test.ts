import { describe, expect, it } from 'vitest';

import { assessEmailInboundPaths, isGmailWatchReceivingConfigured } from './inbound-transport.js';

describe('isGmailWatchReceivingConfigured', () => {
  it('is false when inboundMode is postmark', () => {
    expect(isGmailWatchReceivingConfigured({
      emailProvider: 'gmail',
      lifecycleStatus: 'active',
      metadata: { provider: 'gmail', inboundMode: 'postmark', gmail: { inboundStatus: 'active' } },
    })).toBe(false);
  });

  it('is true for active native status', () => {
    expect(isGmailWatchReceivingConfigured({
      emailProvider: 'gmail',
      lifecycleStatus: 'active',
      metadata: { provider: 'gmail', inboundMode: 'native', gmail: { inboundStatus: 'active' } },
    })).toBe(true);
  });
});

describe('assessEmailInboundPaths', () => {
  it('flags dual delivery when Gmail watch and Postmark are both active', () => {
    const assessment = assessEmailInboundPaths([
      {
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        metadata: { provider: 'gmail', gmail: { inboundStatus: 'active' } },
      },
      {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    ], { gmailNativeInboundEnabled: true });

    expect(assessment.dualDeliveryRisk).toBe(true);
  });

  it('allows Postmark when native inbound flag is off', () => {
    const assessment = assessEmailInboundPaths([
      {
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        metadata: { provider: 'gmail', gmail: { inboundStatus: 'active' } },
      },
      {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    ], { gmailNativeInboundEnabled: false });

    expect(assessment.dualDeliveryRisk).toBe(false);
  });
});
