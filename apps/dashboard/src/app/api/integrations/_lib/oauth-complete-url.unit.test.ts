import { describe, expect, it } from 'vitest';
// Deterministic OAuth URL unit coverage.
import { buildOAuthCompleteUrl } from './oauth-complete-url';

describe('buildOAuthCompleteUrl', () => {
  it('builds the oauth completion page with connected and returnTo params', () => {
    expect(
      buildOAuthCompleteUrl('https://dashboard.test', {
        connected: 'shopify',
        returnTo: '/dashboard/settings',
      }),
    ).toBe('https://dashboard.test/dashboard/integrations/oauth/complete?connected=shopify&returnTo=%2Fdashboard%2Fsettings');
  });

  it('rejects unsafe returnTo values', () => {
    expect(
      buildOAuthCompleteUrl('https://dashboard.test', {
        error: 'shopify_token_failed',
        returnTo: 'https://evil.test',
      }),
    ).toBe('https://dashboard.test/dashboard/integrations/oauth/complete?error=shopify_token_failed');
  });
});
