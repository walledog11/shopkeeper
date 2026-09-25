import { describe, expect, it, vi } from 'vitest';
import { resolveEmailCustomerName } from './shopify-customer.js';

const email = 'walle@example.com';
const resolve = (overrides: Partial<Parameters<typeof resolveEmailCustomerName>[0]>) =>
  resolveEmailCustomerName({
    senderEmail: email,
    senderName: null,
    existingName: null,
    lookupShopifyName: async () => null,
    ...overrides,
  });

describe('resolveEmailCustomerName', () => {
  it('uses the Shopify customer name over the email display name', async () => {
    await expect(resolve({
      senderName: 'Rajbir Sambi',
      existingName: 'Rajbir Sambi',
      lookupShopifyName: async () => 'Walle Walson',
    })).resolves.toBe('Walle Walson');
  });

  it('keeps a stored real name when Shopify has no match', async () => {
    await expect(resolve({ senderName: 'Someone Else', existingName: 'Walle Walson' }))
      .resolves.toBeNull();
  });

  it('replaces a placeholder name with the display name when Shopify has no match', async () => {
    await expect(resolve({ senderName: 'Walle Walson', existingName: 'walle' }))
      .resolves.toBe('Walle Walson');
    await expect(resolve({ senderName: 'Walle Walson', existingName: email }))
      .resolves.toBe('Walle Walson');
  });

  it('falls back to the email local part only for a new customer', async () => {
    await expect(resolve({})).resolves.toBe('walle');
    await expect(resolve({ existingName: email })).resolves.toBeNull();
  });

  it('asks Shopify even when the email carries a display name', async () => {
    const lookupShopifyName = vi.fn(async () => null);
    await resolve({ senderName: 'Rajbir Sambi', lookupShopifyName });
    expect(lookupShopifyName).toHaveBeenCalledOnce();
  });
});
