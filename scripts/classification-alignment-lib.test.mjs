import assert from 'node:assert/strict';
import test from 'node:test';
import { alignmentState, summarizeRequestAlignment } from './classification-alignment-lib.mjs';

test('alignmentState separates the shapes a request contract can hold', () => {
  assert.equal(alignmentState({ requestSummary: null, requestSourceMessageId: null }), 'no_request_fields');
  assert.equal(
    alignmentState({ requestSummary: 'x', requestSourceMessageId: 'm1', latestCustomerSentAt: null }),
    'no_customer_message',
  );
  assert.equal(
    alignmentState({
      requestSummary: 'x',
      requestSourceMessageId: null,
      latestCustomerMessageId: 'm1',
      latestCustomerSentAt: '2026-08-20T00:00:00Z',
    }),
    'pointer_missing',
  );
  assert.equal(
    alignmentState({
      requestSummary: 'x',
      requestSourceMessageId: 'gone',
      sourceSentAt: null,
      latestCustomerMessageId: 'm1',
      latestCustomerSentAt: '2026-08-20T00:00:00Z',
    }),
    'source_message_missing',
  );
  assert.equal(
    alignmentState({
      requestSummary: 'x',
      requestSourceMessageId: 'm1',
      sourceSentAt: '2026-08-20T00:00:00Z',
      latestCustomerMessageId: 'm1',
      latestCustomerSentAt: '2026-08-20T00:00:00Z',
    }),
    'aligned',
  );
  assert.equal(
    alignmentState({
      requestSummary: 'x',
      requestSourceMessageId: 'm1',
      sourceSentAt: '2026-08-20T00:00:00Z',
      latestCustomerMessageId: 'm2',
      latestCustomerSentAt: '2026-08-20T00:01:00Z',
    }),
    'stale',
  );
});

test('a stale row is counted against the guard deploy and reported without identifiers', () => {
  const report = summarizeRequestAlignment([
    {
      organizationId: 'org-secret-1',
      channelType: 'email',
      status: 'open',
      createdAt: '2026-08-20T00:00:00Z',
      requestSummary: 'secret ask',
      requestSourceMessageId: 'message-secret-1',
      sourceSentAt: '2026-08-20T00:00:00Z',
      latestCustomerMessageId: 'message-secret-2',
      latestCustomerSentAt: '2026-08-20T00:00:30Z',
    },
    {
      organizationId: 'org-secret-1',
      channelType: 'email',
      status: 'open',
      createdAt: '2026-08-26T00:00:00Z',
      requestSummary: 'secret ask',
      requestSourceMessageId: 'message-secret-3',
      sourceSentAt: '2026-08-26T00:00:00Z',
      latestCustomerMessageId: 'message-secret-4',
      latestCustomerSentAt: '2026-08-26T00:00:10Z',
    },
    {
      organizationId: 'org-secret-2',
      channelType: 'instagram',
      status: 'closed',
      createdAt: '2026-08-24T00:00:00Z',
      requestSummary: null,
      requestSourceMessageId: null,
    },
  ], '2026-08-26T12:00:00.000Z');

  assert.deepEqual(report.scope, { threadCount: 3, organizationCount: 2 });
  assert.deepEqual(report.alignment, { no_request_fields: 1, stale: 2 });
  assert.deepEqual(report.stale, { total: 2, createdBeforeGuard: 1, createdAfterGuard: 1 });
  assert.deepEqual(report.staleDetail, [
    { channelType: 'email', status: 'open', lagSeconds: 30, createdAfterGuard: false },
    { channelType: 'email', status: 'open', lagSeconds: 10, createdAfterGuard: true },
  ]);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('secret'), false);
});
