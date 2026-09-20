import { describe, expect, it } from 'vitest';

import {
  buildInstagramLoginMetadata,
  buildSocialApiInstagramMetadata,
  hasVerifiedInstagramMessagingPermission,
  instagramReconnectRequiredByHealth,
  instagramTransport,
  isLegacyInstagramMetadata,
  isMetaDirectInstagramMetadata,
  isSocialApiMetadata,
  mergeInstagramHealthMetadata,
  readInstagramHealth,
  readInstagramMetadata,
  readSocialApiAccountId,
} from './metadata.js';

describe('readInstagramMetadata', () => {
  it('returns the instagram object when present', () => {
    expect(readInstagramMetadata({ instagram: { authModel: 'instagram_login' } })).toEqual({
      authModel: 'instagram_login',
    });
  });

  it('returns null for invalid roots', () => {
    expect(readInstagramMetadata(null)).toBeNull();
    expect(readInstagramMetadata({})).toBeNull();
  });
});

describe('transport and auth model', () => {
  it('classifies SocialAPI rows', () => {
    const metadata = { instagram: { transport: 'socialapi', authModel: 'socialapi' } };
    expect(isSocialApiMetadata(metadata)).toBe(true);
    expect(instagramTransport(metadata)).toBe('socialapi');
    expect(isMetaDirectInstagramMetadata(metadata)).toBe(false);
    expect(isLegacyInstagramMetadata(metadata)).toBe(false);
  });

  it('classifies direct Meta login rows', () => {
    const metadata = { instagram: { authModel: 'instagram_login' } };
    expect(isMetaDirectInstagramMetadata(metadata)).toBe(true);
    expect(instagramTransport(metadata)).toBe('meta_direct');
    expect(isLegacyInstagramMetadata(metadata)).toBe(false);
  });

  it('treats unknown shapes as legacy', () => {
    expect(isLegacyInstagramMetadata({ instagram: { authModel: 'legacy' } })).toBe(true);
    expect(isLegacyInstagramMetadata(null)).toBe(true);
  });
});

describe('health and permissions', () => {
  it('reads health snapshot fields', () => {
    const snapshot = readInstagramHealth({
      instagram: {
        healthStatus: 'reconnect_required',
        lastHealthError: { category: 'permission', code: 'messages_subscription_missing' },
      },
    });
    expect(snapshot.status).toBe('reconnect_required');
    expect(snapshot.errorCategory).toBe('permission');
    expect(snapshot.errorCode).toBe('messages_subscription_missing');
  });

  it('detects reconnect required by health', () => {
    expect(instagramReconnectRequiredByHealth({
      healthStatus: 'reconnect_required',
      lastHealthError: { category: 'permission' },
    })).toBe('permission');
    expect(instagramReconnectRequiredByHealth({
      healthStatus: 'reconnect_required',
      lastHealthError: { category: 'authentication' },
    })).toBe('connection');
  });

  it('checks granted scopes when permissions are verified', () => {
    const instagram = {
      permissionsVerified: true,
      grantedScopes: ['instagram_business_basic'],
    };
    expect(hasVerifiedInstagramMessagingPermission(instagram, ['instagram_business_basic'])).toBe(true);
    expect(hasVerifiedInstagramMessagingPermission(instagram, ['instagram_business_manage_messages'])).toBe(false);
    expect(hasVerifiedInstagramMessagingPermission({ permissionsVerified: false }, [])).toBe(true);
  });
});

describe('builders', () => {
  it('builds instagram_login metadata', () => {
    const at = new Date('2026-01-02T03:04:05.000Z');
    const metadata = buildInstagramLoginMetadata(null, {
      accountType: 'BUSINESS',
      grantedScopes: ['instagram_business_basic'],
      permissionsVerified: true,
      subscriptionVerifiedAt: at,
      username: 'merchant',
    });
    expect(metadata.instagram).toMatchObject({
      authModel: 'instagram_login',
      username: 'merchant',
      subscribedFields: ['messages'],
      accessTokenIssuedAt: at.toISOString(),
    });
  });

  it('builds SocialAPI metadata', () => {
    const at = new Date('2026-01-02T03:04:05.000Z');
    const metadata = buildSocialApiInstagramMetadata(null, {
      brandId: 'brand-1',
      connectedAt: at,
      providerAccountId: 'acct-1',
      username: 'merchant',
    });
    expect(metadata.instagram).toMatchObject({
      transport: 'socialapi',
      socialApiAccountId: 'acct-1',
      externalAccountIdSource: 'provider',
    });
    expect(readSocialApiAccountId(metadata.instagram as Record<string, unknown>)).toBe('acct-1');
  });

  it('merges health metadata onto existing root', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const merged = mergeInstagramHealthMetadata(
      { other: true, instagram: { authModel: 'instagram_login', username: 'x' } },
      {
        error: null,
        now,
        status: 'healthy',
        subscriptionFields: ['messages'],
        successful: true,
      },
    );
    expect(merged.other).toBe(true);
    expect(merged.instagram).toMatchObject({
      authModel: 'instagram_login',
      username: 'x',
      healthStatus: 'healthy',
      subscribedFields: ['messages'],
      lastSuccessfulHealthCheckAt: now.toISOString(),
    });
  });
});
