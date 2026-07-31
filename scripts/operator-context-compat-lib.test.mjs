import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeOperatorContextRow,
  hasLegacyInlineToolCall,
  summarizeOperatorContextCompatibility,
} from './operator-context-compat-lib.mjs';

test('detects legacy inline tool-call shape', () => {
  assert.equal(
    hasLegacyInlineToolCall({ id: 'tc1', name: 'create_refund', order_id: '123' }),
    true,
  );
  assert.equal(
    hasLegacyInlineToolCall({ id: 'tc1', name: 'create_refund', input: { order_id: '123' } }),
    false,
  );
});

test('flags dual-read fallback rows and identity-less queued plans', () => {
  const row = {
    pendingPlan: {
      threadId: 'thread-a',
      instruction: 'reply',
      rawToolCalls: [{ id: 'tc1', name: 'send_reply', text: 'hi' }],
    },
    pendingPlans: null,
  };

  const analysis = analyzeOperatorContextRow(row);
  assert.equal(analysis.dualReadFallback, true);
  assert.equal(analysis.legacyToolCalls, 1);
  assert.equal(analysis.identityLessQueuedPlans, 1);
});

test('summarizes a clean database as safe to retire', () => {
  const summary = summarizeOperatorContextCompatibility([
    {
      pendingPlan: null,
      pendingPlans: [
        {
          threadId: 'thread-a',
          instruction: 'reply',
          planId: 'plan-a',
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'hi' } }],
        },
      ],
    },
  ]);

  assert.equal(summary.safeToRetireLegacyPendingPlanColumn, true);
  assert.equal(summary.safeToRetireLegacyToolCallShape, true);
});
