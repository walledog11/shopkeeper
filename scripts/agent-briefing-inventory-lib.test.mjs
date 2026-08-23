import assert from 'node:assert/strict';
import test from 'node:test';
import { classifierState, summarizeAgentBriefingInventory } from './agent-briefing-inventory-lib.mjs';

test('classifierState separates missing, malformed, unversioned, and numbered rows', () => {
  assert.equal(classifierState(null), 'missing');
  assert.equal(classifierState('bad'), 'malformed');
  assert.equal(classifierState({ language: 'en' }), 'unversioned');
  assert.equal(classifierState({ version: 5 }), 'v5');
});

test('inventory contains aggregate compatibility counts and no identifiers', () => {
  const report = summarizeAgentBriefingInventory([
    {
      id: 'thread-secret-1',
      organizationId: 'org-secret-1',
      classifierSignals: { version: 5 },
      requestSourceMessageId: 'message-secret-1',
      sourceMessageAvailable: true,
      historyCustomerTextAvailable: true,
      escalatedAt: null,
      filterStatus: 'genuine',
      cachedPlan: null,
      operatorPlanPending: false,
    },
    {
      id: 'thread-secret-2',
      organizationId: 'org-secret-1',
      classifierSignals: { version: 4 },
      requestSourceMessageId: null,
      sourceMessageAvailable: false,
      historyCustomerTextAvailable: true,
      escalatedAt: new Date('2026-08-23T12:00:00Z'),
      filterStatus: 'genuine',
      cachedPlan: { version: 3 },
      operatorPlanPending: true,
    },
  ], '2026-08-23T20:00:00.000Z');

  assert.deepEqual(report.scope, {
    openBriefingThreadCount: 2,
    organizationCount: 1,
    mixedCurrentAndLegacyOrganizationCount: 1,
  });
  assert.deepEqual(report.classifierVersions, { v4: 1, v5: 1 });
  assert.deepEqual(report.merchantWorkLegacyCandidates, {
    total: 1,
    sourceAvailable: 0,
    historyOnlyCandidate: 1,
    sourceUnavailable: 0,
  });
  assert.deepEqual(report.sourceRecovery, { aligned_source: 1, history_only_candidate: 1 });
  assert.deepEqual(report.pendingPlans, { cached_and_operator: 1, none: 1 });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /thread-secret|org-secret|message-secret/);
});
