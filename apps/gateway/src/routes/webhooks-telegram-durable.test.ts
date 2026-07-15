import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@shopkeeper/db';
import {
  SECRET,
  telegramFixture,
  waitForReplies,
  lastReplyText,
} from '../test-fixtures/telegram-webhook-test-fixture.js';

const { app, executeOperatorAgentTurnSpy, queueAddSpy } = telegramFixture;
let org: { id: string };

// Distinct chatId namespace so this file's globally-unique OperatorEvent /
// OrgMemberTelegramChat rows do not collide with other test files on the DB.
const CHAT_ID = 990003;
const CLERK_USER = 'usr_durable';

async function bindMember(): Promise<void> {
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: CLERK_USER },
  });
  await db.orgMemberTelegramChat.create({
    data: { orgMemberId: member.id, chatId: String(CHAT_ID) },
  });
}

function post(messageId: number, text: string) {
  return request(app)
    .post('/webhooks/telegram')
    .set('x-telegram-bot-api-secret-token', SECRET)
    .send({
      message: {
        message_id: messageId,
        from: { id: 555, first_name: 'Raj' },
        chat: { id: CHAT_ID, type: 'private', first_name: 'Raj' },
        text,
      },
    });
}

// The durable (P4-03) ingestion path: enabled via the per-channel flag. Persists
// the operator event and enqueues before acknowledging, instead of running the
// turn synchronously inside the webhook.
beforeEach(() => {
  org = telegramFixture.org;
  process.env.OPERATOR_DURABLE_QUEUE_TELEGRAM = 'true';
});

afterEach(async () => {
  delete process.env.OPERATOR_DURABLE_QUEUE_TELEGRAM;
  await db.operatorEvent.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
});

describe('POST /webhooks/telegram — durable ingestion', () => {
  it('persists a pending operator event and does not run the turn synchronously', async () => {
    await bindMember();

    const res = await post(1, 'refund #1234');
    expect(res.status).toBe(200);

    const rows = await db.operatorEvent.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].channel).toBe('telegram');
    expect(rows[0].providerMessageId).toBe(`telegram:${CHAT_ID}:1`);
    expect(rows[0].body).toBe('refund #1234');
    // The webhook only enqueues; the turn runs later in the worker.
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    expect(queueAddSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ operatorEventId: rows[0].id }),
      expect.objectContaining({ jobId: rows[0].id }),
    );
  });

  it('re-enqueues a stranded pending event on redelivery when the first enqueue failed', async () => {
    await bindMember();

    // First delivery: row persists, but the enqueue fails → 500, no ack.
    queueAddSpy.mockRejectedValueOnce(new Error('redis down'));
    const first = await post(1, 'refund #1234');
    expect(first.status).toBe(500);

    const stranded = await db.operatorEvent.findFirst({ where: { organizationId: org.id } });
    expect(stranded?.status).toBe('pending');
    queueAddSpy.mockClear();

    // Telegram redelivers: ingest dedupes, but the enqueue is retried so the
    // pending row is not stranded without a job.
    const second = await post(1, 'refund #1234');
    expect(second.status).toBe(200);
    expect(await db.operatorEvent.count({ where: { organizationId: org.id } })).toBe(1);
    expect(queueAddSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ operatorEventId: stranded!.id }),
      expect.objectContaining({ jobId: stranded!.id }),
    );
  });

  it('deduplicates a provider redelivery of the same message', async () => {
    await bindMember();

    await post(1, 'refund #1234');
    const second = await post(1, 'refund #1234');
    expect(second.status).toBe(200);

    const count = await db.operatorEvent.count({ where: { organizationId: org.id } });
    expect(count).toBe(1);
  });

  it('acknowledges an unbound sender without persisting an event', async () => {
    const res = await post(1, 'hello');
    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/connected/i);

    const count = await db.operatorEvent.count({ where: { organizationId: org.id } });
    expect(count).toBe(0);
  });
});
