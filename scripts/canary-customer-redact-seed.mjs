#!/usr/bin/env node
// `customers/redact` canary — seed half.
//
// Plants one fixture customer in the shape that used to abort the redaction
// transaction: a customer holding a RequestEpisodeOutcome whose sourceMessageId
// points at a message the delete cascades through. Until 20260830230000 that
// column was NOT NULL behind an ON DELETE SET NULL key, so the cascade raised
// 23502 and the webhook returned 200 having deleted nothing.
//
// A synthetic `shopify app webhook trigger` payload names a customer that does
// not exist locally, so the selection comes back empty and the transaction
// commits trivially. That certifies the empty path, not the fix. This seeds a
// target the payload can actually match.
//
// Inspect-only by default. Prints the payload to send and the state the verify
// half consumes.
//
//   node scripts/canary-customer-redact-seed.mjs --shop=example.myshopify.com
//   node scripts/canary-customer-redact-seed.mjs --shop=example.myshopify.com --execute
//   SHOPKEEPER_DB_TARGET=prod node scripts/canary-customer-redact-seed.mjs \
//     --shop=example.myshopify.com --execute --out=redact-canary.json
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

function stringArg(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

const shop = stringArg('shop');
if (!shop) {
  console.error('--shop=<domain>.myshopify.com is required. The store is never chosen implicitly.');
  process.exit(1);
}
const execute = flag('execute');
const outPath = stringArg('out');

const { db } = await import('@shopkeeper/db');

// Same resolution order as handleShopifyComplianceWebhook: the live credential
// row first, then the uninstall tombstone that shop/redact relies on.
async function resolveOrganizationId(shopDomain) {
  const integration = await db.integration.findFirst({
    where: { platform: 'shopify', externalAccountId: shopDomain },
    select: { organizationId: true },
  });
  if (integration) return integration.organizationId;
  const disconnected = await db.integrationDisconnect.findFirst({
    where: { platform: 'shopify', externalAccountId: shopDomain },
    orderBy: { createdAt: 'desc' },
    select: { organizationId: true },
  });
  return disconnected?.organizationId ?? null;
}

async function uploadFixtureAttachment(organizationId) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[blob] BLOB_READ_WRITE_TOKEN unset — seeding without an attachment.');
    console.error('[blob] Blob deletion will not be exercised by this run.');
    return null;
  }
  const { put } = await import('@vercel/blob');
  const pathname = `attachments/${organizationId}/${randomUUID()}/redact-canary.txt`;
  await put(pathname, Buffer.from(`redact canary ${new Date().toISOString()}\n`), {
    access: 'private',
    contentType: 'text/plain',
    addRandomSuffix: false,
  });
  return pathname;
}

try {
  const organizationId = await resolveOrganizationId(shop);
  if (!organizationId) {
    console.error(`No Shopify integration or disconnect tombstone for ${shop}.`);
    console.error('The compliance handler would log "no local shop data" and return without acting.');
    process.exit(1);
  }

  const nonce = randomUUID().slice(0, 8);
  const email = `redact-canary+${nonce}@useshopkeeper.com`;
  // Numerically plausible but far outside any real Shopify id range.
  const shopifyCustomerId = String(9_900_000_000_000 + Math.floor(Math.random() * 1_000_000));

  if (!execute) {
    console.log(JSON.stringify({
      mode: 'inspect',
      shop,
      organizationId,
      wouldSeed: { email, shopifyCustomerId },
      note: 'Re-run with --execute to write these rows.',
    }, null, 2));
    process.exit(0);
  }

  const blobPathname = await uploadFixtureAttachment(organizationId);
  const attachmentRef = blobPathname ? `blob:${blobPathname}` : null;

  const seeded = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId,
        name: 'Redact Canary',
        platformId: email,
      },
      select: { id: true },
    });

    const thread = await tx.thread.create({
      data: {
        organizationId,
        customerId: customer.id,
        channelType: 'email',
        // Closed so the fixture never surfaces in the merchant inbox. The
        // selection ignores status, so this costs the canary nothing.
        status: 'closed',
        subject: `Redact canary ${nonce}`,
        shopifyCustomerId,
        aiSummary: 'Fixture thread planted by the customers/redact canary.',
      },
      select: { id: true },
    });

    const customerMessage = await tx.message.create({
      data: {
        organizationId,
        threadId: thread.id,
        senderType: 'customer',
        contentText: `Redact canary ${nonce} — customer turn.`,
        attachments: attachmentRef ? [attachmentRef] : [],
      },
      select: { id: true },
    });

    const agentMessage = await tx.message.create({
      data: {
        organizationId,
        threadId: thread.id,
        senderType: 'ai',
        contentText: `Redact canary ${nonce} — agent turn.`,
      },
      select: { id: true },
    });

    // The regression. sourceMessageId is the column that was NOT NULL behind a
    // SET NULL key; without it planted, this canary proves nothing.
    const outcome = await tx.requestEpisodeOutcome.create({
      data: {
        organizationId,
        threadId: thread.id,
        customerId: customer.id,
        sourceMessageId: customerMessage.id,
        planId: randomUUID(),
        channelType: 'email',
        planVerdict: 'valid',
        planHash: createHash('sha256').update(`plan-${nonce}`).digest('hex'),
        instructionHash: createHash('sha256').update(`instruction-${nonce}`).digest('hex'),
        terminalResolution: 'auto_resolved',
        terminalAt: new Date(),
      },
      select: { id: true },
    });

    // Covers the branch that loads every AgentAction for the org and filters by
    // customer/thread, which the transaction deletes alongside the outcome row.
    const action = await tx.agentAction.create({
      data: {
        organizationId,
        turnId: randomUUID(),
        threadId: thread.id,
        customerId: customer.id,
        tool: 'get_order',
        category: 'read',
        input: { canary: nonce },
        status: 'success',
        mode: 'auto',
        durationMs: 1,
      },
      select: { id: true },
    });

    return {
      customerId: customer.id,
      threadId: thread.id,
      messageIds: [customerMessage.id, agentMessage.id],
      outcomeId: outcome.id,
      agentActionId: action.id,
    };
  });

  const state = {
    seededAt: new Date().toISOString(),
    shop,
    organizationId,
    email,
    shopifyCustomerId,
    blobPathname,
    attachmentRef,
    ...seeded,
    payload: {
      shop_domain: shop,
      customer: { id: Number(shopifyCustomerId), email },
    },
  };

  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(state, null, 2)}\n`);
    console.error(`[state] written to ${outPath}`);
  }
  console.log(JSON.stringify(state, null, 2));
  console.error('');
  console.error('Now deliver a signed customers/redact carrying the payload above, with');
  console.error(`x-shopify-shop-domain: ${shop}, signed with the same secret the gateway holds.`);
  console.error('Then run scripts/canary-customer-redact-verify.mjs against this state.');
} finally {
  await db.$disconnect();
}
