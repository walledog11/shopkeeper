import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import type { AgentToolDefinition } from '@shopkeeper/agent/tools';
import type { OperatorContext } from '../operator-context.js';

const { mockSendDigestThreadReply } = vi.hoisted(() => ({
  mockSendDigestThreadReply: vi.fn(),
}));

vi.mock('./digest-triage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest-triage.js')>();
  return {
    ...actual,
    sendDigestThreadReply: mockSendDigestThreadReply,
  };
});

import { buildOperatorDigestTools } from './operator-digest-tools.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg!: Awaited<ReturnType<typeof createTestOrg>>;
let customer!: Awaited<ReturnType<typeof createTestCustomer>>;
let flaggedThread!: Awaited<ReturnType<typeof createTestThread>>;
let otherThread!: Awaited<ReturnType<typeof createTestThread>>;
let tools!: Record<string, AgentToolDefinition>;

const UNUSED = {} as never;

const digestContext: OperatorContext = {
  pendingPlan: null,
  pendingQuestion: null,
  pendingDigest: null,
};

function withDigest(threadIds: string[]): OperatorContext {
  return {
    ...digestContext,
    pendingDigest: { threadIds, sentAt: new Date().toISOString() },
  };
}

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = await createTestOrg();
  customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
  flaggedThread = await createTestThread(org.id, customer.id, 'email', { tag: 'Spam?' });
  await db.thread.update({
    where: { id: flaggedThread.id },
    data: {
      filterStatus: 'questionable',
      aiSummary: 'Promotional offer with suspicious link',
    },
  });
  const otherCustomer = await createTestCustomer(org.id, 'bob@example.com', { name: 'Bob Lee' });
  otherThread = await createTestThread(org.id, otherCustomer.id, 'email');
  mockSendDigestThreadReply.mockReset();
  mockSendDigestThreadReply.mockResolvedValue({ ok: true, data: { ok: true } });
  tools = buildOperatorDigestTools({
    organizationId: org.id,
    context: withDigest([flaggedThread.id, otherThread.id]),
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
});

describe('mark_ticket_spam', () => {
  it('marks a flagged digest ticket as spam', async () => {
    const result = await tools.mark_ticket_spam.execute(
      { ticket_id: flaggedThread.id },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('ok');
    expect(result.message).toContain("Sarah");
    const updated = await db.thread.findUniqueOrThrow({ where: { id: flaggedThread.id } });
    expect(updated.filterStatus).toBe('filtered');
    expect(updated.filterFeedback).toBe('confirmed_spam');
  });

  it('rejects tickets outside the digest list', async () => {
    const outsider = await createTestCustomer(org.id, 'outsider@example.com');
    const outsiderThread = await createTestThread(org.id, outsider.id, 'email');

    const result = await tools.mark_ticket_spam.execute(
      { ticket_id: outsiderThread.id },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('not in the current digest');
  });

  it('rejects another organization ticket id', async () => {
    const otherCustomer = await createTestCustomer(otherOrg.id, 'other@example.com');
    const otherOrgThread = await createTestThread(otherOrg.id, otherCustomer.id, 'email');
    const crossOrgTools = buildOperatorDigestTools({
      organizationId: org.id,
      context: withDigest([flaggedThread.id]),
    });

    const result = await crossOrgTools.mark_ticket_spam.execute(
      { ticket_id: otherOrgThread.id },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('error');
  });

  it('requires an active digest', async () => {
    const noDigestTools = buildOperatorDigestTools({
      organizationId: org.id,
      context: digestContext,
    });

    const result = await noDigestTools.mark_ticket_spam.execute(
      { ticket_id: flaggedThread.id },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('no digest');
  });
});

describe('send_ticket_reply', () => {
  it('sends a reply through the internal dashboard boundary', async () => {
    const result = await tools.send_ticket_reply.execute(
      { ticket_id: flaggedThread.id, text: 'We ship on Fridays.' },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('ok');
    expect(result.message).toContain('We ship on Fridays');
    expect(mockSendDigestThreadReply).toHaveBeenCalledWith(flaggedThread.id, 'We ship on Fridays.');
  });

  it('surfaces send failures clearly', async () => {
    mockSendDigestThreadReply.mockResolvedValueOnce({
      ok: false,
      status: 502,
      responseBody: 'bad gateway',
      outcome: 'failed',
    });

    const result = await tools.send_ticket_reply.execute(
      { ticket_id: flaggedThread.id, text: 'Hello' },
      UNUSED,
      UNUSED,
      UNUSED,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('failed to send');
  });
});
