import { db } from '@shopkeeper/db';
import logger from '../logger.js';
import { deleteInboundAttachments } from '../storage/blob.js';

export const SHOPIFY_COMPLIANCE_TOPICS = new Set([
  'customers/data_request',
  'customers/redact',
  'shop/redact',
]);

type ShopifyComplianceTopic =
  | 'customers/data_request'
  | 'customers/redact'
  | 'shop/redact';

interface ShopifyCompliancePayload {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string | null;
    phone?: string | null;
  };
  data_request?: { id?: number | string };
  orders_requested?: Array<number | string>;
  orders_to_redact?: Array<number | string>;
}

interface CustomerDataSelection {
  customerIds: string[];
  threadIds: string[];
  attachmentRefs: string[];
  messageCount: number;
}

function containsExactIdentifier(value: unknown, identifiers: ReadonlySet<string>): boolean {
  if (value === null || value === undefined || identifiers.size === 0) return false;
  if (typeof value === 'string' || typeof value === 'number') {
    return identifiers.has(String(value).trim().toLowerCase());
  }
  if (Array.isArray(value)) {
    return value.some(item => containsExactIdentifier(item, identifiers));
  }
  if (typeof value === 'object') {
    return Object.values(value).some(item => containsExactIdentifier(item, identifiers));
  }
  return false;
}

function stringId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function customerEmail(payload: ShopifyCompliancePayload): string | null {
  const value = payload.customer?.email?.trim().toLowerCase();
  return value || null;
}

function orderIds(payload: ShopifyCompliancePayload): string[] {
  const values = [
    ...(payload.orders_requested ?? []),
    ...(payload.orders_to_redact ?? []),
  ];
  return [...new Set(values.map(stringId).filter((value): value is string => value !== null))];
}

async function resolveShopifyOrganizationId(shopDomain: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { platform: 'shopify', externalAccountId: shopDomain },
    select: { organizationId: true },
  });
  if (integration) return integration.organizationId;

  // app/uninstalled arrives about 48 hours before shop/redact. The live
  // credential row is removed immediately, so the durable disconnect record is
  // the non-secret tenancy tombstone used by that delayed compliance delivery.
  const disconnected = await db.integrationDisconnect.findFirst({
    where: { platform: 'shopify', externalAccountId: shopDomain },
    orderBy: { createdAt: 'desc' },
    select: { organizationId: true },
  });
  return disconnected?.organizationId ?? null;
}

async function selectCustomerData(
  organizationId: string,
  payload: ShopifyCompliancePayload,
): Promise<CustomerDataSelection> {
  const shopifyCustomerId = stringId(payload.customer?.id);
  const email = customerEmail(payload);
  if (!shopifyCustomerId && !email) {
    return { customerIds: [], threadIds: [], attachmentRefs: [], messageCount: 0 };
  }

  const customers = await db.customer.findMany({
    where: {
      organizationId,
      OR: [
        ...(email ? [{ platformId: { equals: email, mode: 'insensitive' as const } }] : []),
        ...(shopifyCustomerId
          ? [{ threads: { some: { organizationId, shopifyCustomerId } } }]
          : []),
      ],
    },
    select: {
      id: true,
      threads: {
        where: { organizationId },
        select: {
          id: true,
          messages: { select: { attachments: true } },
        },
      },
    },
  });

  const threads = customers.flatMap(customer => customer.threads);
  return {
    customerIds: customers.map(customer => customer.id),
    threadIds: threads.map(thread => thread.id),
    attachmentRefs: [...new Set(
      threads.flatMap(thread => thread.messages.flatMap(message => message.attachments)),
    )],
    messageCount: threads.reduce((count, thread) => count + thread.messages.length, 0),
  };
}

async function deleteSelectedCustomerData(
  organizationId: string,
  selection: CustomerDataSelection,
  payload: ShopifyCompliancePayload,
): Promise<void> {
  const customerOrderIds = orderIds(payload);
  const shopifyCustomerId = stringId(payload.customer?.id);
  const email = customerEmail(payload);
  if (
    selection.customerIds.length === 0
    && customerOrderIds.length === 0
    && !shopifyCustomerId
    && !email
  ) return;

  const identifiers = new Set(
    [
      shopifyCustomerId,
      email,
      ...customerOrderIds,
      ...selection.customerIds,
      ...selection.threadIds,
    ]
      .filter((value): value is string => value !== null)
      .map(value => value.toLowerCase()),
  );
  const [actionCandidates, reservationCandidates, contextCandidates] =
    await Promise.all([
      db.agentAction.findMany({
        where: { organizationId },
        select: {
          id: true,
          customerId: true,
          threadId: true,
          providerOperationKey: true,
          input: true,
        },
      }),
      db.refundSpendReservation.findMany({
        where: { organizationId },
        select: { id: true, operationKey: true, input: true },
      }),
      db.operatorContext.findMany({
        where: { organizationId },
        select: { id: true, pendingPlans: true, pendingDigest: true, pendingQuestion: true },
      }),
    ]);
  const actionIds = actionCandidates
    .filter(action => (
      (action.customerId !== null && selection.customerIds.includes(action.customerId))
      || (action.threadId !== null && selection.threadIds.includes(action.threadId))
      || containsExactIdentifier(action.input, identifiers)
    ))
    .map(action => action.id);
  const matchedOperationKeys = new Set(
    actionCandidates
      .filter(action => actionIds.includes(action.id))
      .map(action => action.providerOperationKey)
      .filter((value): value is string => value !== null),
  );
  const reservationIds = reservationCandidates
    .filter(reservation => (
      matchedOperationKeys.has(reservation.operationKey)
      || containsExactIdentifier(reservation.input, identifiers)
    ))
    .map(reservation => reservation.id);
  const operatorContextIds = contextCandidates
    .filter(context => (
      containsExactIdentifier(context.pendingPlans, identifiers)
      || containsExactIdentifier(context.pendingDigest, identifiers)
      || containsExactIdentifier(context.pendingQuestion, identifiers)
    ))
    .map(context => context.id);

  // Blob deletion happens first. If it fails, the webhook returns 500 and
  // Shopify retries without leaving detached personal data in object storage.
  await deleteInboundAttachments(selection.attachmentRefs);

  await db.$transaction(async (tx) => {
    const threadWhere = { organizationId, threadId: { in: selection.threadIds } };
    const watchWhere = {
      organizationId,
      OR: [
        { threadId: { in: selection.threadIds } },
        ...(customerOrderIds.length > 0 ? [{ orderId: { in: customerOrderIds } }] : []),
      ],
    };

    await tx.storefrontChatSession.deleteMany({
      where: {
        organizationId,
        OR: [
          { customerId: { in: selection.customerIds } },
          { threadId: { in: selection.threadIds } },
          { episodes: { some: { threadId: { in: selection.threadIds } } } },
        ],
      },
    });
    await tx.storefrontChatVerification.deleteMany({
      where: { organizationId, orderId: { in: customerOrderIds } },
    });
    await tx.returnWatch.deleteMany({ where: watchWhere });
    await tx.shipmentWatch.deleteMany({ where: watchWhere });
    await tx.followUpWatch.deleteMany({ where: watchWhere });
    await tx.voiceEdit.deleteMany({ where: threadWhere });
    await tx.kbCitation.deleteMany({ where: threadWhere });
    await tx.autonomyShadowDecision.deleteMany({ where: threadWhere });
    await tx.agentAction.deleteMany({
      where: {
        organizationId,
        OR: [
          { id: { in: actionIds } },
          { customerId: { in: selection.customerIds } },
          { threadId: { in: selection.threadIds } },
        ],
      },
    });
    await tx.planExecution.deleteMany({ where: threadWhere });
    await tx.refundSpendReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await tx.operatorContext.deleteMany({ where: { id: { in: operatorContextIds } } });
    await tx.shopifyPrivacyRequest.deleteMany({
      where: {
        organizationId,
        OR: [
          ...(shopifyCustomerId ? [{ shopifyCustomerId }] : []),
          ...(email ? [{ customerEmail: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(customerOrderIds.length > 0 ? [{ orderIds: { hasSome: customerOrderIds } }] : []),
        ],
      },
    });
    await tx.customer.deleteMany({
      where: { organizationId, id: { in: selection.customerIds } },
    });
  });
}

async function selectShopData(organizationId: string): Promise<CustomerDataSelection> {
  const customers = await db.customer.findMany({
    where: {
      organizationId,
      threads: {
        some: {
          organizationId,
          OR: [
            { channelType: { in: ['shopify', 'shopify_chat'] } },
            { shopifyCustomerId: { not: null } },
          ],
        },
      },
    },
    select: {
      id: true,
      threads: {
        where: { organizationId },
        select: { id: true, messages: { select: { attachments: true } } },
      },
    },
  });
  const threads = customers.flatMap(customer => customer.threads);
  return {
    customerIds: customers.map(customer => customer.id),
    threadIds: threads.map(thread => thread.id),
    attachmentRefs: [...new Set(
      threads.flatMap(thread => thread.messages.flatMap(message => message.attachments)),
    )],
    messageCount: threads.reduce((count, thread) => count + thread.messages.length, 0),
  };
}

export async function preserveShopifyUninstallTombstone(shopDomain: string): Promise<number> {
  const integrations = await db.integration.findMany({
    where: { platform: 'shopify', externalAccountId: shopDomain },
    select: { id: true, organizationId: true, platform: true, externalAccountId: true },
  });
  if (integrations.length === 0) return 0;

  const completedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.integrationDisconnect.createMany({
      data: integrations.map(integration => ({
        integrationId: integration.id,
        organizationId: integration.organizationId,
        platform: integration.platform,
        externalAccountId: integration.externalAccountId,
        status: 'completed',
        providerCleanedAt: completedAt,
        localDataDeletedAt: completedAt,
        completedAt,
      })),
      skipDuplicates: true,
    });
    await tx.integration.deleteMany({
      where: { id: { in: integrations.map(integration => integration.id) } },
    });
  });
  return integrations.length;
}

export async function handleShopifyComplianceWebhook(
  topic: ShopifyComplianceTopic,
  shopDomain: string,
  payload: ShopifyCompliancePayload,
  webhookId: string | null,
): Promise<void> {
  const organizationId = await resolveShopifyOrganizationId(shopDomain);
  if (!organizationId) {
    logger.info({ shopDomain, topic }, '[Webhook] Shopify compliance request has no local shop data');
    return;
  }

  if (topic === 'customers/data_request') {
    const selection = await selectCustomerData(organizationId, payload);
    const shopifyRequestId = stringId(payload.data_request?.id) ?? webhookId;
    if (!shopifyRequestId) {
      throw new Error('Shopify data request is missing both data_request.id and webhook id');
    }
    const privacyRequest = await db.shopifyPrivacyRequest.upsert({
      where: {
        shopDomain_topic_shopifyRequestId: {
          shopDomain,
          topic,
          shopifyRequestId,
        },
      },
      create: {
        organizationId,
        shopDomain,
        topic,
        shopifyRequestId,
        shopifyCustomerId: stringId(payload.customer?.id),
        customerEmail: customerEmail(payload),
        orderIds: orderIds(payload),
      },
      update: {},
    });
    logger.warn(
      {
        opsAlert: true,
        organizationId,
        topic,
        dataRequestId: shopifyRequestId,
        privacyRequestId: privacyRequest.id,
        fulfillmentPath: `/api/org/gdpr-export?privacyRequestId=${privacyRequest.id}`,
        matchedCustomers: selection.customerIds.length,
        matchedThreads: selection.threadIds.length,
        matchedMessages: selection.messageCount,
      },
      '[Webhook] Shopify customer data request received',
    );
    return;
  }

  if (topic === 'customers/redact') {
    const selection = await selectCustomerData(organizationId, payload);
    await deleteSelectedCustomerData(organizationId, selection, payload);
    logger.info(
      {
        organizationId,
        topic,
        deletedCustomers: selection.customerIds.length,
        deletedThreads: selection.threadIds.length,
        deletedMessages: selection.messageCount,
      },
      '[Webhook] Shopify customer data redacted',
    );
    return;
  }

  const selection = await selectShopData(organizationId);
  await deleteSelectedCustomerData(organizationId, selection, payload);
  await db.$transaction([
    db.integration.deleteMany({
      where: { organizationId, platform: 'shopify', externalAccountId: shopDomain },
    }),
    db.integrationDisconnect.deleteMany({
      where: { organizationId, platform: 'shopify', externalAccountId: shopDomain },
    }),
    db.shopifyPrivacyRequest.deleteMany({ where: { organizationId, shopDomain } }),
    db.knowledgeBase.deleteMany({ where: { organizationId, source: 'shopify' } }),
  ]);
  logger.info(
    {
      organizationId,
      topic,
      deletedCustomers: selection.customerIds.length,
      deletedThreads: selection.threadIds.length,
      deletedMessages: selection.messageCount,
    },
    '[Webhook] Shopify shop data redacted',
  );
}
