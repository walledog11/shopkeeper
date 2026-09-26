import { describe, expect, it } from 'vitest';

import { gmailNativeSyncConfigured, type EmailIntegrationAuditRow } from './email-inbound-transport-audit.js';

function gmailRow(overrides: Partial<EmailIntegrationAuditRow> = {}): EmailIntegrationAuditRow {
  return {
    integrationId: 'gmail-id',
    emailProvider: 'gmail',
    lifecycleStatus: 'active',
    externalAccountId: 'support@example.com',
    fromEmail: 'support@example.com',
    inboundMode: 'hybrid',
    gmailInboundStatus: 'active',
    ...overrides,
  };
}

describe('gmailNativeSyncConfigured', () => {
  it('is false when inboundMode is postmark', () => {
    expect(gmailNativeSyncConfigured(gmailRow({ inboundMode: 'postmark' }))).toBe(false);
  });

  it('is true for active native sync', () => {
    expect(gmailNativeSyncConfigured(gmailRow())).toBe(true);
  });

  it('is true for degraded sync (recovery path)', () => {
    expect(gmailNativeSyncConfigured(gmailRow({ gmailInboundStatus: 'degraded' }))).toBe(true);
  });

  it('is false when lifecycle is not active', () => {
    expect(gmailNativeSyncConfigured(gmailRow({ lifecycleStatus: 'disconnected' }))).toBe(false);
  });
});
