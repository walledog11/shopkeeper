import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { hmacSha256Base64 } from '../test-fixtures/webhook-route-test-helpers.js';
import {
  SHOPIFY_SECRET,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const {
  app,
  deleteOrgAttachmentsSpy,
  mockLogger,
  queueAddSpy,
} = webhookFixture;

function signedShopifyRequest(
  topic: string,
  shopDomain: string,
  payload: Record<string, unknown>,
) {
  const body = JSON.stringify(payload);
  return request(app)
    .post('/webhooks/shopify')
    .set('Content-Type', 'application/json')
    .set('x-shopify-hmac-sha256', hmacSha256Base64(SHOPIFY_SECRET, body))
    .set('x-shopify-topic', topic)
    .set('x-shopify-shop-domain', shopDomain)
    .send(body);
}

describe('POST /webhooks/shopify — mandatory compliance topics', () => {
  it('acknowledges a customer data request and audits matching data without queueing it', async () => {
    const org = webhookFixture.org;
    const shopDomain = `privacy-${org.id.slice(0, 8)}.myshopify.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });
    const customer = await createTestCustomer(org.id, 'buyer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email, {
      shopifyCustomerId: '191167',
    });
    await createTestMessage(thread.id, 'Where is my order?');

    const response = await signedShopifyRequest('customers/data_request', shopDomain, {
      shop_id: 954889,
      shop_domain: shopDomain,
      customer: { id: 191167, email: 'buyer@example.com' },
      data_request: { id: 9999 },
      orders_requested: [299938],
    });

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(await db.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    const privacyRequest = await db.shopifyPrivacyRequest.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    expect(privacyRequest).toMatchObject({
      shopDomain,
      shopifyRequestId: '9999',
      shopifyCustomerId: '191167',
      customerEmail: 'buyer@example.com',
      orderIds: ['299938'],
      status: 'pending',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        opsAlert: true,
        organizationId: org.id,
        dataRequestId: '9999',
        privacyRequestId: privacyRequest.id,
        fulfillmentPath: `/api/org/gdpr-export?privacyRequestId=${privacyRequest.id}`,
        matchedCustomers: 1,
        matchedThreads: 1,
        matchedMessages: 1,
      }),
      '[Webhook] Shopify customer data request received',
    );
  });

  it('hard-deletes matching customer data and private attachments on customers/redact', async () => {
    const org = webhookFixture.org;
    const shopDomain = `redact-${org.id.slice(0, 8)}.myshopify.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });
    const customer = await createTestCustomer(org.id, 'redact@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email, {
      shopifyCustomerId: '191168',
    });
    const message = await createTestMessage(thread.id, 'My address is private.');
    await db.message.update({
      where: { id: message.id },
      data: { attachments: ['blob:attachments/test/private.png'] },
    });
    // Production always has one of these for a classified request, and its
    // absence here is why the NOT NULL / ON DELETE SET NULL contradiction on
    // request_episode_outcomes.source_message_id survived: without it the
    // customer delete never cascaded into a message the table pointed at.
    const outcome = await db.requestEpisodeOutcome.create({
      data: {
        organizationId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        sourceMessageId: message.id,
        planId: randomUUID(),
        channelType: ChannelType.email,
        planVerdict: 'quick_reply',
        planHash: 'plan-hash',
        instructionHash: 'instruction-hash',
      },
    });
    const other = await createTestCustomer(org.id, 'keep@example.com');
    await db.shopifyPrivacyRequest.create({
      data: {
        organizationId: org.id,
        shopDomain,
        topic: 'customers/data_request',
        shopifyRequestId: 'prior-request',
        shopifyCustomerId: '191168',
        customerEmail: 'redact@example.com',
      },
    });
    const matchingReservation = await db.refundSpendReservation.create({
      data: {
        organizationId: org.id,
        day: '2026-08-14',
        operationKey: 'privacy-match',
        tool: 'create_refund',
        input: { orderId: '299938' },
        reservedCents: 100,
      },
    });
    const substringOnlyReservation = await db.refundSpendReservation.create({
      data: {
        organizationId: org.id,
        day: '2026-08-14',
        operationKey: 'privacy-substring-control',
        tool: 'create_refund',
        input: { note: 'unrelated reference 299938-suffix' },
        reservedCents: 100,
      },
    });

    const response = await signedShopifyRequest('customers/redact', shopDomain, {
      shop_id: 954889,
      shop_domain: shopDomain,
      customer: { id: 191168, email: 'redact@example.com' },
      orders_to_redact: [299938],
    });

    expect(response.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(deleteOrgAttachmentsSpy).toHaveBeenCalledWith([
      'blob:attachments/test/private.png',
    ]);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await db.thread.findUnique({ where: { id: thread.id } })).toBeNull();
    expect(await db.message.findUnique({ where: { id: message.id } })).toBeNull();
    expect(await db.customer.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await db.shopifyPrivacyRequest.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.requestEpisodeOutcome.findUnique({ where: { id: outcome.id } })).toBeNull();
    expect(await db.refundSpendReservation.findUnique({
      where: { id: matchingReservation.id },
    })).toBeNull();
    expect(await db.refundSpendReservation.findUnique({
      where: { id: substringOnlyReservation.id },
    })).not.toBeNull();
  });

  it('uses the uninstall tombstone to process Shopify-linked shop data later', async () => {
    const org = webhookFixture.org;
    const shopDomain = `shop-redact-${org.id.slice(0, 8)}.myshopify.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
      accessToken: 'must-not-survive-uninstall',
    });
    const shopifyCustomer = await createTestCustomer(org.id, 'shopify-buyer@example.com');
    await createTestThread(org.id, shopifyCustomer.id, ChannelType.shopify, {
      shopifyCustomerId: '191169',
    });
    const independentCustomer = await createTestCustomer(org.id, 'email-only@example.com');
    await createTestThread(org.id, independentCustomer.id, ChannelType.email);
    const independentReservation = await db.refundSpendReservation.create({
      data: {
        organizationId: org.id,
        day: '2026-08-14',
        operationKey: 'independent-email-refund',
        tool: 'create_refund',
        input: { orderId: 'not-shopify-linked' },
        reservedCents: 100,
      },
    });

    const uninstall = await signedShopifyRequest('app/uninstalled', shopDomain, {
      id: 954889,
      domain: shopDomain,
    });

    expect(uninstall.status).toBe(200);
    expect(await db.integration.findUnique({ where: { id: integration.id } })).toBeNull();
    const tombstone = await db.integrationDisconnect.findUnique({
      where: { integrationId: integration.id },
    });
    expect(tombstone).toMatchObject({
      organizationId: org.id,
      externalAccountId: shopDomain,
      status: 'completed',
    });

    const response = await signedShopifyRequest('shop/redact', shopDomain, {
      shop_id: 954889,
      shop_domain: shopDomain,
    });

    expect(response.status).toBe(200);
    expect(await db.customer.findUnique({ where: { id: shopifyCustomer.id } })).toBeNull();
    expect(await db.customer.findUnique({ where: { id: independentCustomer.id } })).not.toBeNull();
    expect(await db.refundSpendReservation.findUnique({
      where: { id: independentReservation.id },
    })).not.toBeNull();
    expect(await db.integrationDisconnect.findUnique({
      where: { integrationId: integration.id },
    })).toBeNull();
  });

  it('rejects a compliance delivery with an invalid HMAC', async () => {
    const response = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', 'invalid')
      .set('x-shopify-topic', 'customers/redact')
      .set('x-shopify-shop-domain', 'shop.myshopify.com')
      .send(JSON.stringify({ customer: { id: 1 } }));

    expect(response.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });
});
