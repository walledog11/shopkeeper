import { ChannelType, db } from '@shopkeeper/db';

/**
 * Soft-delete pre-rewire customer-support threads on the `imessage` channel type.
 * iMessage is operator-only today — these rows are orphaned inbox noise, not
 * operator `sms_agent` sessions (which use a different channel type).
 */
export async function purgeLegacyImessageCustomerThreads(options: {
  dryRun: boolean;
  now?: Date;
}): Promise<number> {
  const now = options.now ?? new Date();
  const where = {
    channelType: ChannelType.imessage,
    deletedAt: null,
  };

  if (options.dryRun) {
    return db.thread.count({ where });
  }

  const result = await db.thread.updateMany({
    where,
    data: {
      deletedAt: now,
      status: 'closed',
    },
  });

  return result.count;
}
