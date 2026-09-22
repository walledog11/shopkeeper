import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client.js';
import { createInternalNoteOnce } from './messages.js';
import { cleanupTestData, createTestCustomer, createTestOrg, createTestThread } from './test-helpers.js';

const orgIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe('internal turn journal', () => {
  it('persists one note for concurrent retries of the same turn identity', async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, 'email');
    const initialLastMessageAt = thread.lastMessageAt;
    const externalMessageId = `agent-audit:${randomUUID()}`;
    const input = {
      threadId: thread.id,
      senderType: 'note' as const,
      externalMessageId,
      contentText: 'Action result',
    };

    const notes = await Promise.all(Array.from({ length: 3 }, () => createInternalNoteOnce(input)));
    expect(new Set(notes.map(note => note.id)).size).toBe(1);
    expect(await db.message.count({ where: { organizationId: org.id, externalMessageId } })).toBe(1);
    expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).lastMessageAt)
      .toEqual(initialLastMessageAt);
  });
});
