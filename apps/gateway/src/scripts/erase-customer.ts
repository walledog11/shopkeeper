/**
 * Erases one customer from one workspace, the way Shopify's customers/redact
 * does: conversations, messages and attachments, order confirmations, waiting
 * phone cards and the agent's records of them. Two uses:
 *
 * - a verified deletion request that did not come through Shopify
 *   (docs/production/data-deletion.md, Customer Deletion Or Redaction);
 * - resetting the controlled test customer before a live run, so it starts with
 *   no history (runbook, Live testing on the dev store).
 *
 * Dry run unless --execute. Against production:
 *   railway run --service shopkeeper --environment production -- \
 *     npm run erase:customer -- --workspace <clerk_org_id> --instagram <handle> [--execute]
 * Needs DATABASE_URL and, to delete attachments, BLOB_READ_WRITE_TOKEN.
 */
import { parseArgs } from 'node:util';
import { db } from '@shopkeeper/db';
import { eraseCustomers } from '../routes/shopify-compliance.js';

const { values } = parseArgs({
  options: {
    workspace: { type: 'string' },
    instagram: { type: 'string' },
    email: { type: 'string' },
    execute: { type: 'boolean', default: false },
  },
});

async function main(): Promise<void> {
  const workspace = values.workspace?.trim();
  const handle = values.instagram?.trim().replace(/^@/, '');
  const email = values.email?.trim();
  if (!workspace || (!handle && !email) || (handle && email)) {
    throw new Error('Usage: --workspace <clerk_org_id or id> and exactly one of --instagram <handle> or --email <address> [--execute]');
  }

  const organization = await db.organization.findFirst({
    where: { OR: [{ clerkOrgId: workspace }, ...(/^[0-9a-f-]{36}$/i.test(workspace) ? [{ id: workspace }] : [])] },
    select: { id: true, name: true, clerkOrgId: true },
  });
  if (!organization) throw new Error(`No workspace ${workspace}`);

  const customers = await db.customer.findMany({
    where: {
      organizationId: organization.id,
      ...(handle
        ? { name: { equals: handle, mode: 'insensitive' as const }, threads: { some: { channelType: 'ig_dm' } } }
        : { platformId: { equals: email, mode: 'insensitive' as const } }),
    },
    select: {
      id: true,
      name: true,
      threads: { where: { organizationId: organization.id }, select: { status: true, _count: { select: { messages: true } } } },
      _count: { select: { orderVerifications: true } },
    },
  });

  console.log(`Workspace: ${organization.name} (${organization.clerkOrgId})`);
  if (customers.length === 0) {
    console.log(`No customer matches ${handle ? `Instagram ${handle}` : email}. Nothing to erase.`);
    return;
  }
  for (const customer of customers) {
    const open = customer.threads.filter(thread => thread.status === 'open').length;
    const messages = customer.threads.reduce((total, thread) => total + thread._count.messages, 0);
    console.log(
      `- ${customer.name ?? '(no name)'}: ${customer.threads.length} conversation(s), ${open} open, `
      + `${messages} message(s), ${customer._count.orderVerifications} order confirmation(s)`,
    );
  }

  if (!values.execute) {
    console.log('\nDry run. Add --execute to erase the customer(s) above.');
    return;
  }
  const erased = await eraseCustomers(organization.id, customers.map(customer => customer.id));
  console.log(
    `\nErased ${erased.customerIds.length} customer(s), ${erased.threadIds.length} conversation(s), `
    + `${erased.messageCount} message(s), ${erased.attachmentRefs.length} attachment(s).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
