// Backfills Customer.name for SocialAPI Instagram threads ingested before
// display-name enrichment existed. Reads the participant name off SocialAPI's
// conversation list, keyed on the conversation id the thread already stores.
//
// New DMs are named at ingest; this is only for rows already in the table.
//
//   node scripts/backfill-socialapi-customer-names.mjs            # dry run
//   node scripts/backfill-socialapi-customer-names.mjs --execute
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const { createSocialApiClient } = await import('@shopkeeper/integrations/socialapi');

const execute = process.argv.includes('--execute');
const apiKey = process.env.SOCIALAPI_API_KEY?.trim();
if (!apiKey) throw new Error('SOCIALAPI_API_KEY is required');

try {
  const integrations = await db.integration.findMany({
    where: { platform: 'ig_dm', lifecycleStatus: 'active' },
    select: { id: true, externalAccountId: true, metadata: true },
  });
  const socialApi = integrations.filter((row) => (
    row.metadata?.instagram?.transport === 'socialapi'
  ));

  const api = createSocialApiClient({ apiKey });
  let named = 0;
  let unresolved = 0;

  for (const integration of socialApi) {
    const threads = await db.thread.findMany({
      where: {
        replyIntegrationId: integration.id,
        channelType: 'ig_dm',
        deletedAt: null,
        externalSpaceId: { not: null },
        customer: { name: null },
      },
      select: {
        externalSpaceId: true,
        customerId: true,
        customer: { select: { platformId: true } },
      },
    });
    if (threads.length === 0) continue;

    const conversations = await api.listInstagramConversations({
      accountId: integration.externalAccountId,
      limit: 100,
    });
    if (!conversations.ok) {
      console.error('conversation read failed', conversations.error.category);
      continue;
    }
    const byConversationId = new Map(
      conversations.data.data.map((c) => [c.id, c]),
    );

    for (const thread of threads) {
      const conversation = byConversationId.get(thread.externalSpaceId);
      // Same binding the worker enforces: the participant must be this thread's
      // sender, or the name belongs to somebody else.
      const name = conversation?.participantId === thread.customer?.platformId
        ? conversation.participantName
        : null;
      if (!name) {
        unresolved += 1;
        continue;
      }
      console.log(`${execute ? 'naming' : 'would name'} customer …${thread.customerId.slice(-6)} → ${name}`);
      if (execute) {
        // Only ever fills a blank. A name written since this row was read wins.
        await db.customer.updateMany({
          where: { id: thread.customerId, name: null },
          data: { name },
        });
      }
      named += 1;
    }
  }

  console.log({ execute, named, unresolved });
} finally {
  await db.$disconnect();
}
