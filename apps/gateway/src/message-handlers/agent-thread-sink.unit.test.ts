import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMessage,
  postInternal,
  publishThreadEvent,
  pushEscalation,
  recordFailure,
  threadUpdateMany,
} = vi.hoisted(() => ({
  createMessage: vi.fn(),
  postInternal: vi.fn(),
  publishThreadEvent: vi.fn(),
  pushEscalation: vi.fn(),
  recordFailure: vi.fn(),
  threadUpdateMany: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: { thread: { updateMany: threadUpdateMany } },
  SenderType: { note: 'note' },
  createMessage,
}));
vi.mock('../clients/dashboard-internal.js', () => ({
  postDashboardInternal: postInternal,
}));
vi.mock('../agent-failure-alerts.js', () => ({
  recordAgentFailureInBackground: recordFailure,
}));
vi.mock('../operator-escalation.js', () => ({
  pushOperatorEscalation: pushEscalation,
}));
vi.mock('../realtime/publish.js', () => ({
  publishThreadEvent,
}));
vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { gatewayThreadSink } from './agent-thread-sink.js';

const ctx = { threadId: 'thread-1', orgId: 'org-1', orgName: 'Acme' };

describe('gatewayThreadSink persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMessage.mockResolvedValue({});
    publishThreadEvent.mockResolvedValue(undefined);
    threadUpdateMany.mockResolvedValue({ count: 1 });
    pushEscalation.mockResolvedValue(undefined);
  });

  it('persists notes, status, tags, and merchant questions', async () => {
    await gatewayThreadSink.addInternalNote({ text: 'Investigating' }, ctx);
    await gatewayThreadSink.updateThreadStatus({ status: 'closed' }, ctx);
    await gatewayThreadSink.updateThreadTag({ tag: 'shipping' }, ctx);
    await gatewayThreadSink.askOperator({ question: '  What is the policy?  ' }, ctx);

    expect(createMessage).toHaveBeenNthCalledWith(1, {
      threadId: 'thread-1',
      senderType: 'note',
      contentText: '__shopkeeper_agent_note__Investigating',
    });
    expect(threadUpdateMany.mock.calls).toEqual([
      [{ where: { id: 'thread-1', organizationId: 'org-1' }, data: { status: 'closed' } }],
      [{ where: { id: 'thread-1', organizationId: 'org-1' }, data: { tag: 'shipping' } }],
    ]);
    expect(createMessage).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-1',
      senderType: 'note',
      contentText: '__shopkeeper_agent_note__Asked the merchant: What is the policy?',
    });
    expect(publishThreadEvent).toHaveBeenCalledTimes(4);
    expect(publishThreadEvent).toHaveBeenCalledWith('org-1', 'thread-1');
  });

  it('persists escalation state before notifying the operator', async () => {
    const result = await gatewayThreadSink.escalateToHuman({ reason: '  Refund approval needed  ' }, ctx);

    expect(threadUpdateMany).toHaveBeenCalledWith({
      where: { id: 'thread-1', organizationId: 'org-1' },
      data: { status: 'open', tag: 'needs_human', escalatedAt: expect.any(Date) },
    });
    expect(createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      senderType: 'note',
      contentText: '__shopkeeper_agent_note__Escalated to merchant: Refund approval needed',
    });
    expect(pushEscalation).toHaveBeenCalledWith('org-1', 'thread-1', 'Refund approval needed');
    expect(publishThreadEvent).toHaveBeenCalledWith('org-1', 'thread-1');
    expect(result).toEqual({ status: 'escalated', message: 'Refund approval needed' });
  });

  it('returns and records dashboard dispatch failures without partial persistence', async () => {
    postInternal.mockResolvedValue({
      ok: false,
      outcome: 'failed',
      status: 503,
      responseBody: 'provider unavailable',
    });

    const result = await gatewayThreadSink.sendReply({ text: 'Hello' }, ctx);

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/message dispatch failed \(503\)/);
    expect(result.message).toMatch(/Reference:/);
    expect(postInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({ op: 'send_reply', threadId: 'thread-1' }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_result',
      orgId: 'org-1',
      tool: 'send_reply',
      statusCode: 503,
    }));
    expect(createMessage).not.toHaveBeenCalled();
    expect(threadUpdateMany).not.toHaveBeenCalled();
    expect(publishThreadEvent).not.toHaveBeenCalled();
  });

  it('returns unknown when the dashboard send outcome cannot be confirmed', async () => {
    postInternal.mockResolvedValue({
      ok: false,
      outcome: 'unknown',
      status: null,
      responseBody: 'dashboard request timed out',
    });

    const result = await gatewayThreadSink.sendReply({ text: 'Hello' }, ctx);

    expect(result).toEqual({
      status: 'unknown',
      message: expect.stringMatching(/may have completed/i),
    });
    expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_result',
      orgId: 'org-1',
      tool: 'send_reply',
      statusCode: null,
    }));
    expect(publishThreadEvent).toHaveBeenCalledWith('org-1', 'thread-1');
  });

  it('does not persist or notify when the thread belongs to another org', async () => {
    threadUpdateMany.mockResolvedValue({ count: 0 });

    const status = await gatewayThreadSink.updateThreadStatus({ status: 'closed' }, ctx);
    const tag = await gatewayThreadSink.updateThreadTag({ tag: 'shipping' }, ctx);
    const escalation = await gatewayThreadSink.escalateToHuman({ reason: 'Refund approval needed' }, ctx);

    expect(status).toEqual({ status: 'error', message: 'Error: thread not found.' });
    expect(tag).toEqual({ status: 'error', message: 'Error: thread not found.' });
    expect(escalation).toEqual({ status: 'error', message: 'Error: thread not found.' });
    expect(createMessage).not.toHaveBeenCalled();
    expect(pushEscalation).not.toHaveBeenCalled();
    expect(publishThreadEvent).not.toHaveBeenCalled();
  });
});
