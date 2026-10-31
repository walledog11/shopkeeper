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
 * Name the customer by Instagram handle, email, or a ticket (its id or link).
 * A handle matches the stored name and the sender id SocialAPI shows for it,
 * since the name is empty when its lookup failed. Dry run unless --execute.
 * Against production:
 *   railway run --service shopkeeper --environment production -- \
 *     npm run erase:customer -- --workspace <clerk_org_id> --instagram <handle> [--execute]
 * Needs DATABASE_URL, SOCIALAPI_API_KEY for a handle and, to delete attachments,
 * BLOB_READ_WRITE_TOKEN.
 */
import { parseArgs } from 'node:util';
import { db } from '@shopkeeper/db';
import { eraseCustomers } from '../routes/shopify-compliance.js';
import { findInstagramSenderIds } from './live-test-instagram.js';

const { values } = parseArgs({
  options: {
    workspace: { type: 'string' },
    instagram: { type: 'string' },
    email: { type: 'string' },
    thread: { type: 'string' },
    execute: { type: 'boolean', default: false },
  },
});

async function main(): Promise<void> {
  const workspace = values.workspace?.trim();
  const handle = values.instagram?.trim().replace(/^@/, '');
  const email = values.email?.trim();
  const threadId = values.thread?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!workspace || [handle, email, values.thread].filter(Boolean).length !== 1 || (values.thread && !threadId)) {
    throw new Error(
      'Usage: --workspace <clerk_org_id or id> and exactly one of --instagram <handle>, --email <address> '
      + 'or --thread <ticket id or link> [--execute]',
    );
  }

  const organization = await db.organization.findFirst({
    where: { OR: [{ clerkOrgId: workspace }, ...(/^[0-9a-f-]{36}$/i.test(workspace) ? [{ id: workspace }] : [])] },
    select: { id: true, name: true, clerkOrgId: true },
  });
  if (!organization) throw new Error(`No workspace ${workspace}`);
  console.log(`Workspace: ${organization.name} (${organization.clerkOrgId})`);

  const senders = handle ? await findInstagramSenderIds(organization.id, handle) : null;
  if (senders && !senders.ok) console.log(`Matching ${handle} by stored name only: ${senders.reason}.`);
  else if (senders?.ok && senders.senderIds.length === 0) {
    console.log(`Matching ${handle} by stored name only: SocialAPI has no conversation named ${handle}.`);
  }
  const senderIds = senders?.ok ? senders.senderIds : [];

  const customers = await db.customer.findMany({
    where: {
      organizationId: organization.id,
      ...(handle
        ? {
          threads: { some: { channelType: 'ig_dm' } },
          OR: [
            { name: { equals: handle, mode: 'insensitive' as const } },
            ...(senderIds.length > 0 ? [{ platformId: { in: senderIds } }] : []),
          ],
        }
        : threadId
          ? { threads: { some: { id: threadId } } }
          : { platformId: { equals: email, mode: 'insensitive' as const } }),
    },
    select: {
      id: true,
      name: true,
      platformId: true,
      threads: { where: { organizationId: organization.id }, select: { status: true, _count: { select: { messages: true } } } },
      _count: { select: { orderVerifications: true } },
    },
  });

  if (customers.length === 0) {
    console.log(`No customer matches ${handle ? `Instagram ${handle}` : threadId ? `ticket ${threadId}` : email}. Nothing to erase.`);
    return;
  }
  for (const customer of customers) {
    const open = customer.threads.filter(thread => thread.status === 'open').length;
    const messages = customer.threads.reduce((total, thread) => total + thread._count.messages, 0);
    console.log(
      `- ${customer.name ?? `(no name, sender ${customer.platformId})`}: ${customer.threads.length} conversation(s), ${open} open, `
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
