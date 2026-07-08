import { describe, expect, it } from 'vitest';
import {
  autoExecutionNotificationIdempotencyKey,
  digestNotificationIdempotencyKey,
  escalationNotificationIdempotencyKey,
  planNotificationIdempotencyKey,
  questionNotificationIdempotencyKey,
} from './operator-notify-idempotency.js';

describe('operator notify idempotency keys', () => {
  it('plan keys are stable for the same plan payload', () => {
    const rawToolCalls = [{ id: 'tc_1', name: 'send_email' }];
    const first = planNotificationIdempotencyKey('org_1', 'thread_1', rawToolCalls, 'Handle refund');
    const second = planNotificationIdempotencyKey('org_1', 'thread_1', rawToolCalls, 'Handle refund');
    expect(first).toBe(second);
  });

  it('plan keys change when the thread or instruction changes', () => {
    const rawToolCalls = [{ id: 'tc_1', name: 'send_email' }];
    const base = planNotificationIdempotencyKey('org_1', 'thread_1', rawToolCalls, 'Handle refund');
    expect(planNotificationIdempotencyKey('org_1', 'thread_2', rawToolCalls, 'Handle refund')).not.toBe(base);
    expect(planNotificationIdempotencyKey('org_1', 'thread_1', rawToolCalls, 'Different')).not.toBe(base);
  });

  it('question keys incorporate the question text', () => {
    const first = questionNotificationIdempotencyKey('org_1', 'thread_1', 'Ship to Canada?');
    const second = questionNotificationIdempotencyKey('org_1', 'thread_1', 'Ship to Canada?');
    expect(first).toBe(second);
    expect(questionNotificationIdempotencyKey('org_1', 'thread_1', 'Other question')).not.toBe(first);
  });

  it('escalation keys incorporate the reason', () => {
    const first = escalationNotificationIdempotencyKey('org_1', 'thread_1', 'High refund risk');
    expect(first).toBe(escalationNotificationIdempotencyKey('org_1', 'thread_1', 'High refund risk'));
    expect(escalationNotificationIdempotencyKey('org_1', 'thread_1', 'Other reason')).not.toBe(first);
  });

  it('digest keys incorporate the digest sentAt stamp', () => {
    const sentAt = '2026-07-08T12:00:00.000Z';
    expect(digestNotificationIdempotencyKey('org_1', sentAt)).toBe(
      digestNotificationIdempotencyKey('org_1', sentAt),
    );
    expect(digestNotificationIdempotencyKey('org_1', '2026-07-08T13:00:00.000Z')).not.toBe(
      digestNotificationIdempotencyKey('org_1', sentAt),
    );
  });

  it('auto-execution keys incorporate thread and instruction', () => {
    const first = autoExecutionNotificationIdempotencyKey('org_1', 'thread_1', 'Auto reply');
    expect(first).toBe(autoExecutionNotificationIdempotencyKey('org_1', 'thread_1', 'Auto reply'));
    expect(autoExecutionNotificationIdempotencyKey('org_1', 'thread_2', 'Auto reply')).not.toBe(first);
  });
});
