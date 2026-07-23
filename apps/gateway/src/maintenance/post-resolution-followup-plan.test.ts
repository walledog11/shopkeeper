import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFollowUpNudgeMessage,
  postResolutionFollowUpIdempotencyKey,
  pushFollowUpNudge,
} from './post-resolution-followup-plan.js';

const { listOperatorBindingsSpy, notifyOperatorSpy } = vi.hoisted(() => ({
  listOperatorBindingsSpy: vi.fn(),
  notifyOperatorSpy: vi.fn(),
}));

vi.mock('../operator-notify.js', () => ({
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: notifyOperatorSpy,
}));

beforeEach(() => {
  listOperatorBindingsSpy.mockReset();
  notifyOperatorSpy.mockReset();
  notifyOperatorSpy.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postResolutionFollowUpIdempotencyKey', () => {
  it('builds a stable key per org/order/kind', () => {
    expect(postResolutionFollowUpIdempotencyKey('org-1', '1001', 'exchange'))
      .toBe('post-resolution-followup:org-1:1001:exchange');
  });
});

describe('buildFollowUpNudgeMessage', () => {
  it('names the customer and the exchange', () => {
    const message = buildFollowUpNudgeMessage({
      orderId: '1001',
      kind: 'exchange',
      customerName: 'Sarah Jones',
      daysAgo: 5,
    });
    expect(message).toContain("Sarah's exchange");
    expect(message).toContain('order 1001');
    expect(message).toContain('5 days ago');
    expect(message).toContain('reply to Sarah');
  });

  it('names a refund', () => {
    const message = buildFollowUpNudgeMessage({
      orderId: '1001',
      kind: 'refund',
      customerName: 'Jake',
      daysAgo: 3,
    });
    expect(message).toContain("Jake's refund");
  });

  it('uses "yesterday" for a one-day-old resolution', () => {
    const message = buildFollowUpNudgeMessage({
      orderId: '1001',
      kind: 'refund',
      customerName: 'Jake',
      daysAgo: 1,
    });
    expect(message).toContain('yesterday');
    expect(message).not.toContain('1 days ago');
  });

  it('falls back gracefully without a customer name', () => {
    const message = buildFollowUpNudgeMessage({
      orderId: '1001',
      kind: 'refund',
      customerName: null,
      daysAgo: 5,
    });
    expect(message).toContain('A refund on order 1001');
    expect(message).not.toContain("'s refund");
  });
});

describe('pushFollowUpNudge', () => {
  const nudge = { id: 'watch-1', orderId: '1001', kind: 'refund' as const, customerName: 'Sarah Jones', daysAgo: 5 };

  it('notifies every bound operator with a stable idempotency key', async () => {
    listOperatorBindingsSpy.mockResolvedValue([
      { clerkUserId: 'user_1', channel: 'telegram', contextKey: '1' },
    ]);

    await expect(pushFollowUpNudge('org-1', nudge)).resolves.toBe('notified');
    expect(notifyOperatorSpy).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      expect.stringContaining("Sarah's refund"),
      {},
      { idempotencyKey: 'post-resolution-followup:org-1:1001:refund' },
    );
  });

  it('skips when no operators are bound', async () => {
    listOperatorBindingsSpy.mockResolvedValue([]);

    await expect(pushFollowUpNudge('org-1', nudge)).resolves.toBe('skipped');
    expect(notifyOperatorSpy).not.toHaveBeenCalled();
  });
});
