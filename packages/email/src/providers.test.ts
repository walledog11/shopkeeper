import { describe, expect, it } from 'vitest';
import {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
} from './providers';

describe('email provider helpers', () => {
  it('defaults missing provider metadata to forwarding', () => {
    expect(getEmailProvider({ metadata: null })).toBe('postmark');
    expect(getEmailProviderLabel({ metadata: null })).toBe('Forwarding');
  });

  it('does not require reauthorization for normal OAuth access-token expiry', () => {
    const recentlyExpired = new Date(Date.now() - 60_000);
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'gmail' },
      tokenExpiresAt: recentlyExpired,
    })).toBe(false);
  });

  it('requires OAuth reauthorization only for the explicit expired marker', () => {
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'outlook' },
      tokenExpiresAt: new Date(0),
    })).toBe(true);
    expect(getEmailReauthorizePath({ metadata: { provider: 'outlook' } })).toBe('/api/integrations/outlook/auth');
  });

  it('does not show forwarding integrations as OAuth auth failures', () => {
    expect(isEmailAuthReauthorizationRequired({
      metadata: { provider: 'postmark' },
      tokenExpiresAt: new Date(0),
    })).toBe(false);
    expect(getEmailReauthorizePath({ metadata: { provider: 'postmark' } })).toBeNull();
  });
});
