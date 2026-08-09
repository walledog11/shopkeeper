import { describe, expect, it } from 'vitest';
import { buildOAuthCompleteUrl } from './oauth-complete-url';

describe('buildOAuthCompleteUrl', () => {
  it('serializes a typed success outcome and transaction context', () => {
    expect(buildOAuthCompleteUrl('https://dashboard.test', {
      outcome: { status: 'connected', provider: 'shopify' },
      mode: 'popup',
      returnTo: '/dashboard/settings',
    })).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=shopify&status=connected&mode=popup&returnTo=%2Fdashboard%2Fsettings',
    );
  });

  it('serializes a typed failure and rejects unsafe returnTo values', () => {
    expect(buildOAuthCompleteUrl('https://dashboard.test', {
      outcome: { status: 'failed', provider: 'shopify', error: 'shopify_token_failed' },
      mode: 'redirect',
      returnTo: 'https://evil.test',
    })).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=shopify&status=failed&error=shopify_token_failed&mode=redirect',
    );
  });
});
