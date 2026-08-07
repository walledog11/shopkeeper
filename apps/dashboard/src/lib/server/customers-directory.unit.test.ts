import { describe, expect, it } from 'vitest';
import { mergeCustomerDirectory } from './customers-directory';

describe('mergeCustomerDirectory', () => {
  it('dedupes inbox customers onto matching Shopify rows by email', () => {
    const merged = mergeCustomerDirectory(
      [{
        id: 'inbox-1',
        name: 'Alex Buyer',
        platformId: 'alex@example.com',
        profilePicUrl: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        threadCount: 2,
        lastMessageAt: new Date('2026-06-10T00:00:00.000Z'),
        channels: ['email'],
        shopifyCustomerId: null,
      }],
      [{
        id: 42,
        first_name: 'Alex',
        last_name: 'Buyer',
        email: 'alex@example.com',
        phone: null,
        orders_count: 3,
        total_spent: '120.00',
        created_at: '2026-05-01T00:00:00.000Z',
        default_address: null,
      }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      source: 'shopify',
      shopifyCustomerId: 42,
      inboxCustomerId: 'inbox-1',
      threadCount: 2,
      orders_count: 3,
    });
  });

  it('keeps inbox-only customers when no Shopify match exists', () => {
    const merged = mergeCustomerDirectory(
      [{
        id: 'inbox-2',
        name: 'IG Fan',
        platformId: 'ig:user123',
        profilePicUrl: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        threadCount: 1,
        lastMessageAt: new Date('2026-06-02T00:00:00.000Z'),
        channels: ['ig_dm'],
        shopifyCustomerId: null,
      }],
      [],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('inbox');
    expect(merged[0]?.email).toBe('ig:user123');
  });
});
