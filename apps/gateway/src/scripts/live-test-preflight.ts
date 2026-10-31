/**
 * Checks a workspace is ready for a live Instagram test before the first message
 * is sent: migrations applied, one Instagram connection that no other workspace
 * shares, Shopify and a phone connected, the approval settings the run expects,
 * no unfinished workspace deletion, no Instagram customer history and nothing
 * waiting on the phone from an earlier run. Lists paid, unrefunded orders under
 * the compensation limit, with the email and zip the order confirmation will
 * ask for. Read-only.
 *
 *   railway run --service shopkeeper --environment production -- \
 *     npm run live-test:preflight -- --workspace <clerk_org_id> --instagram <test handle>
 * Needs DATABASE_URL, TOKEN_ENCRYPTION_KEY (to read the Shopify token) and
 * SOCIALAPI_API_KEY (to find the test handle).
 */
import { readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import { readPendingPlanArray, readPendingQuestion } from '../operator-context/serialization.js';
import { findInstagramSenderIds } from './live-test-instagram.js';

const { values } = parseArgs({
  options: {
    workspace: { type: 'string' },
    instagram: { type: 'string' },
  },
});

let failures = 0;
const ok = (line: string) => console.log(`OK    ${line}`);
const warn = (line: string) => console.log(`WARN  ${line}`);
const fail = (line: string) => {
  failures += 1;
  console.log(`FAIL  ${line}`);
};

function instagramUsername(row: { fromEmail: string | null; metadata: unknown }): string | null {
  const instagram = (row.metadata as { instagram?: { username?: unknown } } | null)?.instagram;
  return row.fromEmail ?? (typeof instagram?.username === 'string' ? instagram.username : null);
}

function instagramTransport(metadata: unknown): string {
  const transport = (metadata as { instagram?: { transport?: unknown } } | null)?.instagram?.transport;
  return typeof transport === 'string' ? transport : 'meta_direct';
}

async function checkMigrations(): Promise<void> {
  const shipped = readdirSync(new URL('../../../../packages/db/prisma/migrations/', import.meta.url), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  const applied = new Set((await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `).map(row => row.migration_name));
  const pending = shipped.filter(name => !applied.has(name));
  if (pending.length === 0) ok('Every migration is applied');
  else fail(`Migrations not applied: ${pending.join(', ')} (runbook, Migrations)`);
}

async function main(): Promise<void> {
  const workspace = values.workspace?.trim();
  const handle = values.instagram?.trim().replace(/^@/, '');
  if (!workspace) throw new Error('Usage: --workspace <clerk_org_id or id> [--instagram <test handle>]');

  const organization = await db.organization.findFirst({
    where: { OR: [{ clerkOrgId: workspace }, ...(/^[0-9a-f-]{36}$/i.test(workspace) ? [{ id: workspace }] : [])] },
    select: { id: true, name: true, clerkOrgId: true, lifecycleStatus: true, settings: true },
  });
  if (!organization) throw new Error(`No workspace ${workspace}`);
  console.log(`Workspace: ${organization.name} (${organization.clerkOrgId})\n`);

  await checkMigrations();

  if (organization.lifecycleStatus === 'active') ok('Workspace is active');
  else fail(`Workspace is ${organization.lifecycleStatus}`);

  const instagramRows = await db.integration.findMany({
    where: { platform: 'ig_dm' },
    select: {
      organizationId: true, fromEmail: true, metadata: true, lifecycleStatus: true,
      organization: { select: { name: true, clerkOrgId: true, lifecycleStatus: true } },
    },
  });
  const own = instagramRows.filter(row => row.organizationId === organization.id);
  const username = own[0] ? instagramUsername(own[0]) : null;
  if (own.length !== 1) {
    fail(`Expected one Instagram connection, found ${own.length}`);
  } else if (instagramTransport(own[0]!.metadata) !== 'socialapi' || own[0]!.lifecycleStatus !== 'active') {
    fail(`Instagram is connected through ${instagramTransport(own[0]!.metadata)} (${own[0]!.lifecycleStatus}), not an active SocialAPI connection`);
  } else {
    ok(`Instagram connected through SocialAPI${username ? ` (${username})` : ''}`);
  }
  // A second connection to the same account answers every DM a second time.
  for (const row of instagramRows) {
    if (row.organizationId === organization.id) continue;
    const other = instagramUsername(row);
    if (!username || !other || other.toLowerCase() === username.toLowerCase()) {
      fail(
        `Instagram ${other ?? '(unknown account)'} is also connected in ${row.organization.name} `
        + `(${row.organization.clerkOrgId}, ${row.organization.lifecycleStatus}) through ${instagramTransport(row.metadata)}`,
      );
    }
  }

  const shopify = await db.integration.findFirst({
    where: { organizationId: organization.id, platform: 'shopify', lifecycleStatus: 'active' },
    select: { externalAccountId: true, accessToken: true },
  });
  if (shopify) ok(`Shopify connected (${shopify.externalAccountId})`);
  else fail('Shopify is not connected');

  const phones = await db.orgMemberImessageBinding.count({ where: { orgMember: { organizationId: organization.id } } });
  if (phones > 0) ok(`${phones} phone(s) linked for approvals`);
  else fail('No phone linked: approval cards have nowhere to go (Settings → Phone & briefing)');

  const settings = resolveAgentSettings(organization.settings);
  const limit = settings.maxRefundAmount;
  const settingsLine = `Trust level ${settings.autonomyTier}; largest compensation ${limit ?? 'no limit'}; daily total ${settings.dailyRefundCap ?? 'no limit'}`;
  if (settings.autonomyTier === 'trusted') warn(`${settingsLine}. At trusted, routine plans can run without reaching the phone`);
  else ok(settingsLine);

  const deletions = await db.workspaceDeletion.findMany({
    where: { status: { not: 'completed' } },
    select: { clerkOrgId: true, status: true, attempts: true, lastError: true },
  });
  for (const deletion of deletions) {
    warn(`Workspace deletion ${deletion.clerkOrgId} is ${deletion.status} after ${deletion.attempts} attempt(s)${deletion.lastError ? `: ${deletion.lastError}` : ''}`);
  }
  if (deletions.length === 0) ok('No unfinished workspace deletions');

  // Whatever an earlier run left changes this one: an order confirmed last time
  // is not asked about again, and a waiting card turns "yes" into "which one?".
  // A live-test workspace has no other Instagram customers, so this checks them
  // all rather than the test customer by name, which is empty when its lookup
  // failed.
  const instagramCustomers = await db.customer.findMany({
    where: { organizationId: organization.id, threads: { some: { channelType: 'ig_dm' } } },
    select: {
      name: true,
      platformId: true,
      threads: {
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      },
    },
  });
  if (instagramCustomers.length === 0) ok('No Instagram customer history');
  for (const customer of instagramCustomers) {
    fail(
      `Instagram customer ${customer.name ?? `(no name, sender ${customer.platformId})`} has `
      + `${customer.threads.length} conversation(s), ${customer.threads.filter(thread => thread.status === 'open').length} open. `
      + `Reset: npm run erase:customer -- --workspace ${organization.clerkOrgId} --thread ${customer.threads[0]?.id} --execute`,
    );
  }

  const contexts = await db.operatorContext.findMany({
    where: { organizationId: organization.id },
    select: { pendingPlans: true, pendingQuestion: true },
  });
  const waitingThreadIds = [...new Set(contexts.flatMap(context => [
    ...readPendingPlanArray(context.pendingPlans).map(plan => plan.threadId),
    ...[readPendingQuestion(context.pendingQuestion)?.threadId].filter((id): id is string => Boolean(id)),
  ]))];
  const waitingThreads = await db.thread.findMany({
    where: { organizationId: organization.id, id: { in: waitingThreadIds } },
    select: { id: true, channelType: true },
  });
  // An Instagram ticket's card goes with the reset above.
  const otherWaiting = waitingThreadIds.filter(id => !waitingThreads.some(thread => thread.id === id && thread.channelType === 'ig_dm'));
  if (waitingThreadIds.length === 0) ok('Nothing waiting on the phone');
  else if (otherWaiting.length > 0) {
    warn(`Still waiting on the phone for ticket(s) ${otherWaiting.join(', ')}: a bare "yes" will ask which one you mean`);
  }

  if (handle) {
    const senders = await findInstagramSenderIds(organization.id, handle);
    if (!senders.ok) warn(`Could not look up ${handle} in SocialAPI: ${senders.reason}`);
    else if (senders.senderIds.length === 0) warn(`SocialAPI has no conversation named ${handle}: its tickets will say "The customer"`);
    else ok(`SocialAPI knows ${handle} (sender ${senders.senderIds.join(', ')})`);
  }

  if (shopify?.accessToken) {
    const { orders = [] } = await shopifyRestJson<{
      orders?: Array<{
        name: string;
        current_total_price: string;
        currency: string;
        cancelled_at: string | null;
        closed_at: string | null;
        customer?: { first_name?: string | null; last_name?: string | null } | null;
        refunds?: unknown[];
        email: string | null;
        shipping_address?: { zip?: string | null } | null;
      }>;
    }>({ shop: shopify.externalAccountId, accessToken: shopify.accessToken }, 'orders.json', {
      query: {
        financial_status: 'paid',
        limit: 50,
        fields: 'name,current_total_price,currency,cancelled_at,closed_at,refunds,email,shipping_address,customer',
        status: 'open',
      },
    });
    // Open orders only: an archived order is one the merchant has finished with.
    const eligible = orders.filter(order => (
      !order.cancelled_at
      && !order.closed_at
      && (order.refunds?.length ?? 0) === 0
      && (limit === null || Number(order.current_total_price) <= limit)
    ));
    if (eligible.length === 0) {
      fail(`No paid, unrefunded order is under the ${limit ?? 'compensation'} limit`);
    } else {
      ok(`Orders a full refund can use (total including shipping and tax, under the limit):`);
      for (const order of eligible.slice(0, 5)) {
        const customer = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || '(no customer)';
        console.log(`        ${order.name}  ${order.current_total_price} ${order.currency}  ${customer}  email ${order.email ?? '-'}  zip ${order.shipping_address?.zip ?? '-'}`);
      }
    }
  }

  console.log(failures === 0 ? '\nReady for a live run.' : `\nNot ready: ${failures} problem(s) above.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
