import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestCustomer, createTestOrg, createTestThread } from '@clerk/db/test-helpers';
import { captureVoiceEdit } from './voice-capture';

function cachedPlanWithDraft(draft: string) {
  return {
    version: 2,
    instruction: 'reply to customer',
    lastCustomerMessageId: null,
    settingsFingerprint: 'fp',
    plan: {
      instruction: 'reply to customer',
      steps: [],
      rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: draft } }],
    },
  };
}

describe('captureVoiceEdit', () => {
  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  async function seedThread(cachedPlan: unknown, tag = 'Shipping') {
    const org = await createTestOrg();
    orgId = org.id;
    const customer = await createTestCustomer(org.id, `c-${org.id}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'email', { tag });
    await db.thread.update({ where: { id: thread.id }, data: { cachedPlan: cachedPlan as object } });
    return { org, thread };
  }

  it('records an edit when the sent reply diverges from the cached draft', async () => {
    const { org, thread } = await seedThread(cachedPlanWithDraft('We are so sorry for the delay. Your order ships tomorrow.'));

    const captured = await captureVoiceEdit({
      organizationId: org.id,
      threadId: thread.id,
      cachedPlan: cachedPlanWithDraft('We are so sorry for the delay. Your order ships tomorrow.'),
      tag: thread.tag,
      sentText: 'Heads up — your order ships tomorrow. Thanks for hanging in there!',
    });

    expect(captured).toBe(true);
    const rows = await db.voiceEdit.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].aiDraft).toContain('so sorry for the delay');
    expect(rows[0].finalText).toContain('hanging in there');
    expect(rows[0].tag).toBe('Shipping');
    expect(rows[0].consumedAt).toBeNull();
  });

  it('does not record when the sent reply matches the draft (modulo whitespace/case)', async () => {
    const { org, thread } = await seedThread(cachedPlanWithDraft('Your order ships tomorrow.'));

    const captured = await captureVoiceEdit({
      organizationId: org.id,
      threadId: thread.id,
      cachedPlan: cachedPlanWithDraft('Your order ships tomorrow.'),
      tag: thread.tag,
      sentText: '  your order   ships TOMORROW.  ',
    });

    expect(captured).toBe(false);
    const count = await db.voiceEdit.count({ where: { organizationId: org.id } });
    expect(count).toBe(0);
  });

  it('does not record when there is no cached draft', async () => {
    const { org, thread } = await seedThread(null);

    const captured = await captureVoiceEdit({
      organizationId: org.id,
      threadId: thread.id,
      cachedPlan: null,
      tag: thread.tag,
      sentText: 'A perfectly good reply that the operator typed from scratch.',
    });

    expect(captured).toBe(false);
    const count = await db.voiceEdit.count({ where: { organizationId: org.id } });
    expect(count).toBe(0);
  });
});
