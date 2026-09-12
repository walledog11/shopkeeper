import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeUtcWindow,
  pendingPlanReferences,
  summarizeCachedPlans,
  summarizePendingPlans,
  summarizePendingExecutions,
  summarizeShopifyIntegrations,
  summarizeTurnSamples,
  validUuidValues,
} from './conversational-overhaul-p0-inventory-lib.mjs';

test('completeUtcWindow excludes the partial current UTC day', () => {
  const window = completeUtcWindow(14, new Date('2026-09-11T19:23:00.000Z'));
  assert.equal(window.since.toISOString(), '2026-08-28T00:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-09-11T00:00:00.000Z');
});

test('cached-plan inventory reports versions and current source identity without content', () => {
  const summary = summarizeCachedPlans([
    {
      cachedPlan: { version: 7, planId: 'plan-a', lastCustomerMessageId: 'message-a' },
      cachedPlanMessageId: 'message-a',
      latestConversationMessageId: 'message-a',
    },
    {
      cachedPlan: { version: 6, planId: 'plan-b', lastCustomerMessageId: 'message-b' },
      cachedPlanMessageId: 'message-b',
      latestConversationMessageId: 'message-c',
    },
    { cachedPlan: { surprise: 'secret body' }, cachedPlanMessageId: null, latestConversationMessageId: null },
  ], 7);

  assert.deepEqual(summary, {
    total: 3,
    byVersion: { malformed_or_unversioned: 1, v6: 1, v7: 1 },
    bySourceState: { current: 1, source_identity_missing: 1, source_not_current: 1 },
  });
  assert.equal(JSON.stringify(summary).includes('secret body'), false);
});

test('pending-plan inventory distinguishes live, terminal, replaced, and incomplete projections', () => {
  const contexts = [{
    organizationId: 'org-a',
    pendingPlans: [
      { threadId: 'thread-a', planId: 'plan-a', sourceMessageId: 'message-a' },
      { threadId: 'thread-b', planId: 'plan-old', sourceMessageId: 'message-b' },
      { threadId: 'thread-c' },
      'malformed',
    ],
  }];
  const threads = new Map([
    ['org-a:thread-a', {
      cachedPlan: { version: 7, planId: 'plan-a', lastCustomerMessageId: 'message-a' },
      cachedPlanMessageId: 'message-a',
    }],
    ['org-a:thread-b', {
      cachedPlan: { version: 7, planId: 'plan-new', lastCustomerMessageId: 'message-b' },
      cachedPlanMessageId: 'message-b',
    }],
  ]);
  const executions = new Map([['org-a:plan-a', { status: 'committed' }]]);

  assert.deepEqual(summarizePendingPlans(contexts, threads, executions, 7), {
    contextRows: 1,
    total: 4,
    queueLengths: { 4: 1 },
    states: { execution_terminal: 1, identity_incomplete: 1, malformed: 1, plan_replaced: 1 },
  });
  assert.deepEqual(pendingPlanReferences(contexts), [
    { organizationId: 'org-a', threadId: 'thread-a', planId: 'plan-a', sourceMessageId: 'message-a' },
    { organizationId: 'org-a', threadId: 'thread-b', planId: 'plan-old', sourceMessageId: 'message-b' },
    { organizationId: 'org-a', threadId: 'thread-c', planId: null, sourceMessageId: null },
  ]);
});

test('Shopify grant inventory emits aggregate normalized scope sets only', () => {
  const summary = summarizeShopifyIntegrations([
    { lifecycleStatus: 'active', metadata: { oauthScopes: ['write_orders', 'read_products', 'write_orders'] } },
    { lifecycleStatus: 'active', metadata: {} },
    { lifecycleStatus: 'disconnecting', metadata: { oauthScopes: [] } },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    byLifecycle: { active: 2, disconnecting: 1 },
    grantRecording: { not_recorded: 1, recorded: 1, recorded_empty: 1 },
    scopeSets: [
      { scopes: [], count: 1 },
      { scopes: ['read_products', 'write_orders'], count: 1 },
    ],
  });
});

test('UUID filtering rejects legacy and malformed identifiers before Prisma UUID filters', () => {
  assert.deepEqual(validUuidValues([
    '00000000-0000-4000-8000-000000000001',
    'legacy-plan',
    null,
    '00000000-0000-4000-8000-000000000001',
  ]), ['00000000-0000-4000-8000-000000000001']);
});

test('turn sample percentiles use completed end-turn rows and nearest rank', () => {
  assert.deepEqual(summarizeTurnSamples([
    { outcome: 'end_turn', durationMs: 100, modelCalls: 1, totalTokens: 1_000 },
    { outcome: 'token_budget', durationMs: 900, modelCalls: 10, totalTokens: 20_000 },
    { outcome: 'end_turn', durationMs: 200, modelCalls: 2, totalTokens: 2_000 },
    { outcome: 'end_turn', durationMs: 300, modelCalls: 3, totalTokens: 3_000 },
  ]), {
    sampleCount: 4,
    completedTurnCount: 3,
    durationMs: { p50: 200, p95: 300 },
    modelCalls: { p50: 2, p95: 3 },
    totalTokens: { p50: 2_000, p95: 3_000 },
  });
});

test('pending execution inventory identifies whether the exact current cache still owns it', () => {
  assert.deepEqual(summarizePendingExecutions([
    {
      planId: 'plan-a',
      sourceMessageId: 'message-a',
      thread: {
        cachedPlan: { version: 7, planId: 'plan-a', lastCustomerMessageId: 'message-a' },
        cachedPlanMessageId: 'message-a',
      },
    },
    {
      planId: 'plan-b',
      sourceMessageId: 'message-b',
      thread: { cachedPlan: { version: 6 }, cachedPlanMessageId: 'message-b' },
    },
    { planId: 'plan-c', sourceMessageId: null, thread: null },
  ], 7), {
    total: 3,
    states: { current_cached_plan: 1, legacy_cache: 1, thread_absent: 1 },
  });
});
