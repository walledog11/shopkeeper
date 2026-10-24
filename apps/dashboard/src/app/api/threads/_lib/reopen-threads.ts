import { Prisma, type db } from '@shopkeeper/db';
import { ConflictError } from '@/lib/api/errors';

// The caller must keep the checks and its status update in this transaction.
export async function assertThreadsCanReopen(
  tx: Pick<typeof db, '$queryRaw' | 'thread'>,
  organizationId: string,
  threads: readonly { id: string; customerId: string; channelType: string }[],
): Promise<void> {
  if (threads.length === 0) return;
  const customerIds = [...new Set(threads.map(thread => thread.customerId))].sort();
  // Same customer-first protocol as inbound episode resolution. Ordering locks
  // makes overlapping bulk requests safe even when their input order differs.
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM customers
    WHERE organization_id = ${organizationId}::uuid
      AND id IN (${Prisma.join(customerIds.map(id => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR UPDATE
  `);
  const openThreads = await tx.thread.findMany({
    where: { organizationId, customerId: { in: customerIds }, status: 'open' },
    select: { id: true, customerId: true, channelType: true },
  });
  const owners = new Map(openThreads.map(thread => [`${thread.customerId}:${thread.channelType}`, thread.id]));
  for (const thread of threads) {
    const key = `${thread.customerId}:${thread.channelType}`;
    const owner = owners.get(key);
    if (owner && owner !== thread.id) {
      throw new ConflictError(openThreads.some(open => open.id === owner)
        ? 'This customer already has an open conversation on this channel. Close it to reopen this one.'
        : 'Two selected conversations are with the same customer on the same channel. Only one of them can be open.');
    }
    owners.set(key, thread.id);
  }
}
