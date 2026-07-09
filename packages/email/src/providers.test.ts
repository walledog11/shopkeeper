import { describe, expect, it } from 'vitest';
import {
  GMAIL_READONLY_SCOPE,
  getEmailAuthReauthorizationReason,
  getGmailInboundStatus,
  getGmailLastSyncedAt,
  getGmailWatchFailureCount,
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  getGmailAccountType,
  isEmailAuthReauthorizationRequired,
  isPersonalGmailAddress,
  resolveGmailAccountType,
} from './providers';

describe('email provider helpers', () => {
  it('defaults missing provider metadata to forwarding', () => {
    expect(getEmailProvider({ metadata: null })).toBe('postmark');
    expect(getEmailProviderLabel({ metadata: null })).toBe('Forwarding');
  });

  it('does not require reauthorization for normal OAuth access-token expiry', () => {
    const recentlyExpired = new Date(Date.now() - 60_000);
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'gmail', oauthScopes: [GMAIL_READONLY_SCOPE] },
      tokenExpiresAt: recentlyExpired,
    })).toBe(false);
  });

  it('requires OAuth reauthorization only for the explicit expired marker', () => {
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'gmail', oauthScopes: [GMAIL_READONLY_SCOPE] },
      tokenExpiresAt: new Date(0),
    })).toBe(true);
    expect(getEmailReauthorizePath({ metadata: { provider: 'gmail' } })).toBe('/api/integrations/gmail/auth');
  });

  it('requires Gmail reauthorization when the read scope is missing', () => {
    const integration = {
      metadata: {
        provider: 'gmail',
        oauthScopes: ['openid', 'https://www.googleapis.com/auth/gmail.send'],
      },
      tokenExpiresAt: new Date(Date.now() + 60_000),
    };

    expect(getEmailAuthReauthorizationReason(integration)).toBe('missing_gmail_read_scope');
    expect(isEmailAuthReauthorizationRequired(integration)).toBe(true);
  });

  it('accepts Gmail integrations with the read scope and exposes inbound status', () => {
    const integration = {
      metadata: {
        provider: 'gmail',
        oauthScopes: [GMAIL_READONLY_SCOPE],
        gmail: { inboundStatus: 'pending' },
      },
    };

    expect(getEmailAuthReauthorizationReason(integration)).toBeNull();
    expect(getGmailInboundStatus(integration)).toBe('pending');
    expect(getGmailWatchFailureCount(integration)).toBe(0);
    expect(getGmailLastSyncedAt({
      metadata: {
        provider: 'gmail',
        gmail: { lastSyncedAt: '2026-07-08T12:00:00.000Z' },
      },
    })).toBe('2026-07-08T12:00:00.000Z');
  });

  it('prioritizes an expired grant over a missing Gmail read scope', () => {
    expect(getEmailAuthReauthorizationReason({
      metadata: { provider: 'gmail' },
      tokenExpiresAt: new Date(0),
    })).toBe('expired_grant');
  });

  it('does not show forwarding integrations as OAuth auth failures', () => {
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'postmark' },
      tokenExpiresAt: new Date(0),
    })).toBe(false);
    expect(getEmailReauthorizePath({ metadata: { provider: 'postmark' } })).toBeNull();
  });

  it('classifies personal and workspace Gmail accounts', () => {
    expect(isPersonalGmailAddress('merchant@gmail.com')).toBe(true);
    expect(isPersonalGmailAddress('owner@merchant.test')).toBe(false);
    expect(resolveGmailAccountType('merchant@gmail.com')).toBe('personal');
    expect(resolveGmailAccountType('owner@merchant.test', 'merchant.test')).toBe('workspace');
    expect(getGmailAccountType({
      externalAccountId: 'merchant@gmail.com',
      metadata: { provider: 'gmail', gmail: { accountType: 'personal' } },
    })).toBe('personal');
    expect(getGmailAccountType({
      externalAccountId: 'owner@merchant.test',
      metadata: { provider: 'gmail' },
    })).toBe('workspace');
  });
});
