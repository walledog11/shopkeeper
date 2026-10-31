/**
 * Checks a workspace is ready for a live Instagram test before the first message
 * is sent: migrations applied, one Instagram connection that no other workspace
 * shares, Shopify and a phone connected, the approval settings the run expects,
 * no unfinished workspace deletion, and the test customer starting with no
 * history. Lists paid, unrefunded orders under the compensation limit, with the
 * email and zip the order confirmation will ask for. Read-only.
 *
 *   railway run --service shopkeeper --environment production -- \
 *     npm run live-test:preflight -- --workspace <clerk_org_id> --instagram <test handle>
 * Needs DATABASE_URL and TOKEN_ENCRYPTION_KEY (to read the Shopify token).
 */
import { readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';

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

  if (handle) {
    const customers = await db.customer.findMany({
      where: {
        organizationId: organization.id,
        name: { equals: handle, mode: 'insensitive' },
        threads: { some: { channelType: 'ig_dm' } },
      },
      select: { threads: { where: { organizationId: organization.id }, select: { status: true } } },
    });
    const conversations = customers.flatMap(customer => customer.threads);
    if (conversations.length === 0) {
      ok(`Test customer ${handle} has no history`);
    } else {
      fail(
        `Test customer ${handle} has ${conversations.length} conversation(s), `
        + `${conversations.filter(thread => thread.status === 'open').length} open. Reset first: `
        + `npm run erase:customer -- --workspace ${organization.clerkOrgId} --instagram ${handle} --execute`,
      );
    }
  }

  if (shopify?.accessToken) {
    const { orders = [] } = await shopifyRestJson<{
      orders?: Array<{
        name: string;
        current_total_price: string;
        currency: string;
        cancelled_at: string | null;
        refunds?: unknown[];
        email: string | null;
        shipping_address?: { zip?: string | null } | null;
      }>;
    }>({ shop: shopify.externalAccountId, accessToken: shopify.accessToken }, 'orders.json', {
      query: {
        status: 'any',
        financial_status: 'paid',
        limit: 50,
        fields: 'name,current_total_price,currency,cancelled_at,refunds,email,shipping_address',
      },
    });
    const eligible = orders.filter(order => (
      !order.cancelled_at
      && (order.refunds?.length ?? 0) === 0
      && (limit === null || Number(order.current_total_price) <= limit)
    ));
    if (eligible.length === 0) {
      fail(`No paid, unrefunded order is under the ${limit ?? 'compensation'} limit`);
    } else {
      ok(`Orders a full refund can use (total including shipping and tax, under the limit):`);
      for (const order of eligible.slice(0, 5)) {
        console.log(`        ${order.name}  ${order.current_total_price} ${order.currency}  email ${order.email ?? '-'}  zip ${order.shipping_address?.zip ?? '-'}`);
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
