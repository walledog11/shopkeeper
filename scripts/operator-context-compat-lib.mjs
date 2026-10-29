// Shared read-only analysis for operator_context compatibility retirement (P9-02).
// Used by audit-operator-context-compatibility.mjs and its unit tests.

export function hasLegacyInlineToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) return false;
  if (toolCall.input !== undefined) return false;
  const extraKeys = Object.keys(toolCall).filter((key) => key !== 'id' && key !== 'name');
  return extraKeys.length > 0;
}

export function analyzePendingPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { valid: false, identityLess: false, legacyToolCalls: 0, toolCalls: 0 };
  }

  const rawToolCalls = Array.isArray(plan.rawToolCalls) ? plan.rawToolCalls : [];
  const legacyToolCalls = rawToolCalls.filter(hasLegacyInlineToolCall).length;

  return {
    valid: typeof plan.threadId === 'string' && typeof plan.instruction === 'string',
    // The same test the queue's own liveness check applies (identity_incomplete
    // in pendingPlanStaleReason): all four fields, where a null source is a
    // draft made before its ticket had any message, not a missing one.
    identityLess: !plan.planId || !Object.hasOwn(plan, 'sourceMessageId')
      || !plan.planHash || !plan.instructionHash,
    legacyToolCalls,
    toolCalls: rawToolCalls.length,
  };
}

export function analyzeOperatorContextRow(row) {
  const queuedPlans = Array.isArray(row.pendingPlans) ? row.pendingPlans : [];

  let identityLessQueuedPlans = 0;
  let legacyToolCalls = 0;
  let queuedPlanCount = 0;

  for (const plan of queuedPlans) {
    const analysis = analyzePendingPlan(plan);
    if (!analysis.valid) continue;
    queuedPlanCount += 1;
    if (analysis.identityLess) identityLessQueuedPlans += 1;
    legacyToolCalls += analysis.legacyToolCalls;
  }

  return {
    queuedPlanCount,
    identityLessQueuedPlans,
    legacyToolCalls,
  };
}

export function summarizeOperatorContextCompatibility(rows) {
  const summary = {
    totalRows: rows.length,
    identityLessQueuedPlans: 0,
    legacyToolCalls: 0,
    queuedPlanCount: 0,
    safeToRetireIdentityLessReader: true,
    safeToRetireLegacyToolCallShape: true,
  };

  for (const row of rows) {
    const analysis = analyzeOperatorContextRow(row);
    summary.identityLessQueuedPlans += analysis.identityLessQueuedPlans;
    summary.legacyToolCalls += analysis.legacyToolCalls;
    summary.queuedPlanCount += analysis.queuedPlanCount;
  }

  summary.safeToRetireIdentityLessReader = summary.identityLessQueuedPlans === 0;
  summary.safeToRetireLegacyToolCallShape = summary.legacyToolCalls === 0;

  return summary;
}
