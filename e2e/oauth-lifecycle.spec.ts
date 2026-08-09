import { expect, test } from '@playwright/test';

test.describe('OAuth completion lifecycle', () => {
  test.beforeEach(() => {
    test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');
  });

  test('a real popup publishes one typed result and closes', async ({ page }) => {
    await page.goto('/dashboard/integrations');
    await page.evaluate(() => {
      (window as typeof window & { oauthResults?: unknown[] }).oauthResults = [];
      window.addEventListener('message', (event) => {
        if (event.origin === window.location.origin) {
          (window as typeof window & { oauthResults: unknown[] }).oauthResults.push(event.data);
        }
      });
    });

    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => {
      window.open(
        '/dashboard/integrations/oauth/complete?provider=gmail&status=connected&mode=popup',
        'shopkeeper_oauth_popup',
      );
    });
    const popup = await popupPromise;
    await popup.waitForEvent('close');

    await expect.poll(() => page.evaluate(
      () => (window as typeof window & { oauthResults: unknown[] }).oauthResults,
    )).toEqual([{
      type: 'shopkeeper-oauth-done',
      outcome: { status: 'connected', provider: 'gmail' },
    }]);
  });

  test('same-tab redirect preserves feedback and never closes the page', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeClose = window.close.bind(window);
      window.close = () => {
        sessionStorage.setItem('oauth-close-called', '1');
        nativeClose();
      };
    });

    await page.goto(
      '/dashboard/integrations/oauth/complete?provider=shopify&status=failed&error=access_denied&mode=redirect&returnTo=%2Fdashboard%2Fintegrations',
    );
    await page.waitForURL((url) => (
      url.pathname === '/dashboard/integrations'
      && url.searchParams.get('provider') === 'shopify'
      && url.searchParams.get('status') === 'failed'
      && url.searchParams.get('error') === 'access_denied'
    ));

    expect(await page.evaluate(() => sessionStorage.getItem('oauth-close-called'))).toBeNull();
  });
});
