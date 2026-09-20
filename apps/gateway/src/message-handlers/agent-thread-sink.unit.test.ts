import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMessage,
  postInternal,
  publishThreadEvent,
  pushEscalation,
  recordFailure,
  threadFindFirst,
  threadUpdate,
  threadUpdateMany,
} = vi.hoisted(() => ({
  createMessage: vi.fn(),
  postInternal: vi.fn(),
  publishThreadEvent: vi.fn(),
  pushEscalation: vi.fn(),
  recordFailure: vi.fn(),
  threadFindFirst: vi.fn(),
  threadUpdate: vi.fn(),
  threadUpdateMany: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    thread: { findFirst: threadFindFirst, update: threadUpdate, updateMany: threadUpdateMany },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      thread: { findFirst: threadFindFirst, update: threadUpdate },
    }),
  },
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
    createMessage.mockResolvedValue({ id: 'message-1' });
    publishThreadEvent.mockResolvedValue(undefined);
    threadUpdateMany.mockResolvedValue({ count: 1 });
    threadFindFirst.mockResolvedValue({ id: 'thread-1', status: 'open', tag: null });
    threadUpdate.mockImplementation(async ({ data }: { data: { status?: string; tag?: string } }) => (
      data.status ? { status: data.status } : { tag: data.tag }
    ));
    pushEscalation.mockResolvedValue(undefined);
  });

  it('persists notes, status, tags, and merchant questions', async () => {
    await gatewayThreadSink.addInternalNote({ text: 'Investigating' }, ctx);
    await gatewayThreadSink.updateThreadStatus({ status: 'closed' }, ctx);
    await gatewayThreadSink.updateThreadTag({ tag: 'shipping' }, ctx);
    await gatewayThreadSink.askOperator({ question: '  What is the policy?  ' }, ctx);

    expect(createMessage).toHaveBeenNthCalledWith(1, {
      threadId: 'thread-1',
      organizationId: 'org-1',
      senderType: 'note',
      contentText: '__shopkeeper_agent_note__Investigating',
    });
    expect(threadUpdate).toHaveBeenCalledTimes(2);
    expect(createMessage).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-1',
      senderType: 'note',
      contentText: '__shopkeeper_agent_note__Asked the merchant: What is the policy?',
    });
    expect(publishThreadEvent).toHaveBeenCalledTimes(4);
    expect(publishThreadEvent).toHaveBeenCalledWith('org-1', 'thread-1');
  });

  it('returns provider-observed receipts for identity-bearing thread writes', async () => {
    const execution = { ...ctx, operationId: 'operation-1', executionId: 'execution-1' };
    const note = await gatewayThreadSink.addInternalNote({ text: 'Investigating' }, execution);
    const status = await gatewayThreadSink.updateThreadStatus({ status: 'closed' }, execution);
    const tag = await gatewayThreadSink.updateThreadTag({ tag: 'shipping' }, execution);

    expect(note.receipt).toEqual(expect.objectContaining({
      tool: 'add_internal_note',
      providerReference: 'message-1',
      facts: expect.objectContaining({
        threadId: 'thread-1',
        messageId: 'message-1',
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(status.receipt).toEqual(expect.objectContaining({
      tool: 'update_thread_status',
      facts: { threadId: 'thread-1', beforeStatus: 'open', afterStatus: 'closed' },
    }));
    expect(tag.receipt).toEqual(expect.objectContaining({
      tool: 'update_thread_tag',
      facts: { threadId: 'thread-1', beforeTag: null, afterTag: 'shipping' },
    }));
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

  it('forwards the durable work identity with a customer reply', async () => {
    postInternal.mockResolvedValue({
      ok: true,
      status: 200,
      responseBody: '',
      data: { status: 'ok', message: 'sent' },
    });

    await gatewayThreadSink.sendReply({ text: 'Your order is on the way.' }, {
      ...ctx,
      operationId: 'operation-1',
      executionId: 'execution-1',
      agentRequestId: 'request-1',
      agentTaskId: 'task-1',
    });

    expect(postInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        operationId: 'operation-1',
        executionId: 'execution-1',
        agentRequestId: 'request-1',
        agentTaskId: 'task-1',
      }),
      expect.anything(),
    );
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
    threadFindFirst.mockResolvedValue(null);
    threadUpdateMany.mockResolvedValue({ count: 0 });

    const status = await gatewayThreadSink.updateThreadStatus({ status: 'closed' }, ctx);
    const tag = await gatewayThreadSink.updateThreadTag({ tag: 'shipping' }, ctx);
    const escalation = await gatewayThreadSink.escalateToHuman({ reason: 'Refund approval needed' }, ctx);

    expect(status).toEqual({ status: 'not_found', message: 'Error: thread not found.' });
    expect(tag).toEqual({ status: 'not_found', message: 'Error: thread not found.' });
    expect(escalation).toEqual({ status: 'error', message: 'Error: thread not found.' });
    expect(createMessage).not.toHaveBeenCalled();
    expect(pushEscalation).not.toHaveBeenCalled();
    expect(publishThreadEvent).not.toHaveBeenCalled();
  });
});
