import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import {
  claimOperatorEvent,
  finalizeOperatorEventCommitted,
  finalizeOperatorEventFailed,
  ingestOperatorEvent,
  markOperatorEventReplyDelivered,
  type IngestOperatorEventParams,
} from './operator-event-store.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

function baseParams(overrides: Partial<IngestOperatorEventParams> = {}): IngestOperatorEventParams {
  // Distinct chatId namespace so this file's globally-unique
  // (channel, providerMessageId) rows never collide with other test files that
  // run against the same DB.
  return {
    organizationId: org.id,
    channel: 'telegram',
    providerMessageId: 'telegram:990001:1',
    chatId: '990001',
    clerkUserId: 'usr_1',
    operatorKey: 'telegram:990001',
    body: 'refund #1234',
    metadata: { messageId: 1 },
    ...overrides,
  };
}

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('ingestOperatorEvent', () => {
  it('persists a pending event with the supplied fields', async () => {
    const { event, created } = await ingestOperatorEvent(baseParams());
    expect(created).toBe(true);
    expect(event.status).toBe('pending');
    expect(event.body).toBe('refund #1234');
    expect(event.chatId).toBe('990001');
    expect(event.claimToken).toBeNull();
    expect(event.processedAt).toBeNull();
  });

  it('deduplicates a redelivery of the same (channel, providerMessageId)', async () => {
    const first = await ingestOperatorEvent(baseParams());
    const second = await ingestOperatorEvent(baseParams({ body: 'different body on redelivery' }));

    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    // The original row wins — the redelivery does not overwrite it.
    expect(second.event.body).toBe('refund #1234');
    const count = await db.operatorEvent.count({ where: { organizationId: org.id } });
    expect(count).toBe(1);
  });

  it('treats the same providerMessageId on a different channel as distinct', async () => {
    await ingestOperatorEvent(baseParams());
    const other = await ingestOperatorEvent(baseParams({ channel: 'imessage' }));
    expect(other.created).toBe(true);
    expect(await db.operatorEvent.count({ where: { organizationId: org.id } })).toBe(2);
  });
});

describe('claimOperatorEvent', () => {
  it('lets exactly one caller claim a pending event', async () => {
    const { event } = await ingestOperatorEvent(baseParams());

    const first = await claimOperatorEvent(event.id);
    const second = await claimOperatorEvent(event.id);

    expect(first?.status).toBe('claimed');
    expect(first?.claimToken).toBeTruthy();
    expect(first?.claimedAt).toBeTruthy();
    // Already claimed → not claimable again.
    expect(second).toBeNull();
  });

  it('returns null for a terminal event', async () => {
    const { event } = await ingestOperatorEvent(baseParams());
    const claimed = await claimOperatorEvent(event.id);
    await finalizeOperatorEventCommitted(event.id, claimed!.claimToken!, 'Done.');

    expect(await claimOperatorEvent(event.id)).toBeNull();
  });
});

describe('finalize transitions', () => {
  it('commits only with the matching claim token', async () => {
    const { event } = await ingestOperatorEvent(baseParams());
    const claimed = await claimOperatorEvent(event.id);

    // A stale worker with the wrong token cannot finalize.
    await finalizeOperatorEventCommitted(event.id, '00000000-0000-4000-8000-000000000000', 'stale');
    let row = await db.operatorEvent.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe('claimed');

    await finalizeOperatorEventCommitted(event.id, claimed!.claimToken!, 'Refunded Sarah $12.');
    row = await db.operatorEvent.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe('committed');
    expect(row?.processedAt).toBeTruthy();
    expect(row?.replyText).toBe('Refunded Sarah $12.');
    expect(row?.replyDeliveredAt).toBeNull();
  });

  it('records a failure with the error message', async () => {
    const { event } = await ingestOperatorEvent(baseParams());
    const claimed = await claimOperatorEvent(event.id);

    await finalizeOperatorEventFailed(event.id, claimed!.claimToken!, 'boom');
    const row = await db.operatorEvent.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe('failed');
    expect(row?.processedAt).toBeTruthy();
    expect(row?.lastError).toBe('boom');
  });

  it('marks reply delivery independently of turn commit', async () => {
    const { event } = await ingestOperatorEvent(baseParams());
    const claimed = await claimOperatorEvent(event.id);
    await finalizeOperatorEventCommitted(event.id, claimed!.claimToken!, 'Done.');

    await markOperatorEventReplyDelivered(event.id);
    const row = await db.operatorEvent.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe('committed');
    expect(row?.replyDeliveredAt).toBeTruthy();
  });
});
