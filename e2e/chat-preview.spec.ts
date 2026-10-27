import { expect, test } from '@playwright/test';
import { Prisma } from '@prisma/client';
import dbHelpers from './db-helpers.cjs';

const { db, getE2EOrg, disconnectDb } = dbHelpers;
test.afterAll(disconnectDb);

test('chat preview submits sample messages and stays usable while editing and resizing', async ({ page }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');
  const { id } = await getE2EOrg();
  const org = await db.organization.findUniqueOrThrow({ where: { id } });
  const existing = await db.integration.findFirst({ where: { organizationId: id, platform: 'shopify', lifecycleStatus: 'active' } });
  const created = existing ? null : await db.integration.create({ data: {
    organizationId: id, platform: 'shopify', externalAccountId: 'chat-preview-e2e.myshopify.com',
    fromEmail: 'Preview store', metadata: { storefrontChat: { enabled: false } },
  } });
  try {
    await db.organization.update({ where: { id }, data: { settings: {
      ...(org.settings as object), onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
    } } });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard/chat');
    const iframe = page.locator('iframe[title="Website chat preview"]');
    const frame = iframe.contentFrame();
    await expect(frame.locator('.panel')).toBeVisible();
    const input = frame.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('A sample question');
    await input.press('Enter');
    await expect(frame.locator('.msg.me .bubble')).toHaveText('A sample question');
    await test.step('send with a mouse inside the scaled preview', async () => {
      await input.fill('A mouse question');
      const send = frame.getByRole('button', { name: 'Send message' });
      await expect(send).toBeEnabled();
      await send.scrollIntoViewIfNeeded();
      // Chromium's locator.click() ignores an opaque iframe's CSS scale. Use
      // the button's frame-local position and the iframe's rendered dimensions.
      const frameBounds = await iframe.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, scaleX: bounds.width / element.clientWidth, scaleY: bounds.height / element.clientHeight };
      });
      const buttonCenter = await send.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      });
      expect(frameBounds.scaleX).toBeLessThan(1);
      await page.mouse.click(frameBounds.x + buttonCenter.x * frameBounds.scaleX, frameBounds.y + buttonCenter.y * frameBounds.scaleY);
      await expect(frame.locator('.msg.me .bubble')).toHaveText(['A sample question', 'A mouse question']);
    });
    await input.fill('Keep this draft');
    await page.getByLabel('Welcome message', { exact: true }).fill('An updated greeting');
    await expect(frame.locator('[data-welcome] .bubble')).toHaveText('An updated greeting');
    await expect(input).toHaveValue('Keep this draft');
    await expect(frame.locator('.msg.me .bubble')).toHaveText(['A sample question', 'A mouse question']);

    await page.setViewportSize({ width: 390, height: 844 });
    for (let index = 0; index < 3; index++) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await page.getByRole('button', { name: 'Phone preview' }).click();
      await expect(frame.locator('.panel')).toBeVisible();
      await expect(input).toHaveValue('Keep this draft');
      await page.getByRole('button', { name: 'Customize', exact: true }).click();
    }
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(page.getByLabel('Welcome message', { exact: true })).toHaveValue('An updated greeting');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(frame.locator('.panel')).toBeVisible();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
  } finally {
    if (created) await db.integration.delete({ where: { id: created.id } });
    await db.organization.update({ where: { id }, data: { settings: org.settings === null ? Prisma.JsonNull : org.settings } });
  }
});
