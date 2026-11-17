import './test-fixtures/worker-test-setup.js';
import { describe, it, expect } from 'vitest';
import { db } from '@shopkeeper/db';
import { org } from './test-fixtures/worker-test-setup.js';
import { getCapturedHandlers, makeShopifyJob } from './test-fixtures/worker-test-helpers.js';

describe('Message worker — shopify branch', () => {
  // Each order used to open an "Order #…" thread, so a store's own orders filled
  // the inbox and counted against its monthly conversations.
  it.each(['orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled'])(
    'opens no ticket for %s',
    async (topic) => {
      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeShopifyJob(org.id, topic, { email: 'jane@shop.com', first_name: 'Jane', last_name: 'Doe' }));

      await expect(db.customer.count({ where: { organizationId: org.id } })).resolves.toBe(0);
      await expect(db.thread.count({ where: { organizationId: org.id } })).resolves.toBe(0);
      await expect(db.message.count({ where: { organizationId: org.id } })).resolves.toBe(0);
    },
  );
});
