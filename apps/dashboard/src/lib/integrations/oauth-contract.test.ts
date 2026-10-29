import { describe, expect, it } from 'vitest';
import {
  OAUTH_ERROR_MESSAGES,
  parseOAuthOutcome,
} from './oauth-contract';

describe('OAuth lifecycle contract', () => {
  it('parses connected and failed outcomes', () => {
    expect(parseOAuthOutcome(new URLSearchParams('provider=gmail&status=connected'))).toEqual({
      provider: 'gmail',
      status: 'connected',
    });
    expect(parseOAuthOutcome(new URLSearchParams(
      'provider=tiktok-shop&status=failed&error=tiktok_shop_token_failed',
    ))).toEqual({
      provider: 'tiktok-shop',
      status: 'failed',
      error: 'tiktok_shop_token_failed',
    });
  });

  it('rejects unknown providers, statuses, and errors', () => {
    expect(parseOAuthOutcome(new URLSearchParams('provider=unknown&status=connected'))).toBeNull();
    expect(parseOAuthOutcome(new URLSearchParams('provider=gmail&status=done'))).toBeNull();
    expect(parseOAuthOutcome(new URLSearchParams(
      'provider=gmail&status=failed&error=made_up',
    ))).toBeNull();
  });

  it('provides provider-neutral shared copy and Gmail no-email copy', () => {
    expect(OAUTH_ERROR_MESSAGES.invalid_callback).toContain('provider');
    expect(OAUTH_ERROR_MESSAGES.provider_unavailable).toContain('provider');
    expect(OAUTH_ERROR_MESSAGES.no_email).toContain('email address');
    expect(OAUTH_ERROR_MESSAGES.invalid_callback).not.toContain('Instagram');
    expect(OAUTH_ERROR_MESSAGES.provider_unavailable).not.toContain('Instagram');
  });
});
