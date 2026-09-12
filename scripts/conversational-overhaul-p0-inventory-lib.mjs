const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function cacheIdentity(value) {
  if (!isRecord(value)) return null;
  return {
    version: Number.isInteger(value.version) ? value.version : null,
    planId: typeof value.planId === 'string' ? value.planId : null,
    sourceMessageId: typeof value.lastCustomerMessageId === 'string'
      ? value.lastCustomerMessageId
      : null,
  };
}

export function completeUtcWindow(days, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    since: new Date(end.getTime() - days * 24 * 60 * 60 * 1000),
    end,
  };
}

export function summarizeCachedPlans(rows, currentVersion) {
  const byVersion = {};
  const bySourceState = {};

  for (const row of rows) {
    const cache = cacheIdentity(row.cachedPlan);
    increment(byVersion, cache?.version === null || cache?.version === undefined
      ? 'malformed_or_unversioned'
      : `v${cache.version}`);

    let sourceState;
    if (!cache?.sourceMessageId || !row.cachedPlanMessageId) sourceState = 'source_identity_missing';
    else if (cache.sourceMessageId !== row.cachedPlanMessageId) sourceState = 'cache_pointer_mismatch';
    else if (row.latestConversationMessageId !== row.cachedPlanMessageId) sourceState = 'source_not_current';
    else if (cache.version !== currentVersion) sourceState = 'current_source_legacy_cache';
    else sourceState = 'current';
    increment(bySourceState, sourceState);
  }

  return {
    total: rows.length,
    byVersion: sortedCounts(byVersion),
    bySourceState: sortedCounts(bySourceState),
  };
}

function pendingPlanIdentity(value) {
  if (!isRecord(value)) return null;
  return {
    threadId: typeof value.threadId === 'string' ? value.threadId : null,
    planId: typeof value.planId === 'string' ? value.planId : null,
    sourceMessageId: typeof value.sourceMessageId === 'string' ? value.sourceMessageId : null,
  };
}

export function pendingPlanReferences(contextRows) {
  const references = [];
  for (const context of contextRows) {
    if (!Array.isArray(context.pendingPlans)) continue;
    for (const rawPlan of context.pendingPlans) {
      const plan = pendingPlanIdentity(rawPlan);
      if (!plan) continue;
      references.push({ organizationId: context.organizationId, ...plan });
    }
  }
  return references;
}

export function validUuidValues(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && UUID_RE.test(value)))];
}

export function summarizePendingPlans(contextRows, threadByIdentity, executionByIdentity, currentVersion) {
  const queueLengths = {};
  const states = {};
  let total = 0;

  for (const context of contextRows) {
    const plans = Array.isArray(context.pendingPlans) ? context.pendingPlans : [];
    increment(queueLengths, String(plans.length));
    for (const rawPlan of plans) {
      total += 1;
      const plan = pendingPlanIdentity(rawPlan);
      if (!plan?.threadId) {
        increment(states, 'malformed');
        continue;
      }
      if (!plan.planId || !plan.sourceMessageId) {
        increment(states, 'identity_incomplete');
        continue;
      }
      const identity = `${context.organizationId}:${plan.threadId}`;
      const thread = threadByIdentity.get(identity);
      if (!thread) {
        increment(states, 'thread_absent');
        continue;
      }
      const cache = cacheIdentity(thread.cachedPlan);
      if (!cache) increment(states, 'cache_absent');
      else if (cache.version !== currentVersion) increment(states, 'cache_version_superseded');
      else if (cache.planId !== plan.planId) increment(states, 'plan_replaced');
      else if (cache.sourceMessageId !== plan.sourceMessageId
        || thread.cachedPlanMessageId !== plan.sourceMessageId) increment(states, 'source_message_advanced');
      else {
        const execution = executionByIdentity.get(`${context.organizationId}:${plan.planId}`);
        if (execution && execution.status !== 'pending' && execution.status !== 'claimed') {
          increment(states, 'execution_terminal');
        } else {
          increment(states, 'live_identity');
        }
      }
    }
  }

  return {
    contextRows: contextRows.length,
    total,
    queueLengths: sortedCounts(queueLengths),
    states: sortedCounts(states),
  };
}

export function summarizePendingExecutions(rows, currentVersion) {
  const states = {};
  for (const row of rows) {
    if (!row.thread) {
      increment(states, 'thread_absent');
      continue;
    }
    const cache = cacheIdentity(row.thread.cachedPlan);
    if (!cache) increment(states, 'cache_absent');
    else if (cache.version !== currentVersion) increment(states, 'legacy_cache');
    else if (cache.planId !== row.planId) increment(states, 'plan_replaced');
    else if (cache.sourceMessageId !== row.sourceMessageId
      || row.thread.cachedPlanMessageId !== row.sourceMessageId) increment(states, 'source_message_advanced');
    else increment(states, 'current_cached_plan');
  }
  return { total: rows.length, states: sortedCounts(states) };
}

function recordedScopes(metadata) {
  if (!isRecord(metadata) || !Array.isArray(metadata.oauthScopes)) return null;
  return [...new Set(metadata.oauthScopes.filter((scope) => typeof scope === 'string'))].sort();
}

export function summarizeShopifyIntegrations(rows) {
  const byLifecycle = {};
  const grantRecording = {};
  const scopeSets = new Map();

  for (const row of rows) {
    increment(byLifecycle, row.lifecycleStatus ?? 'unset');
    const scopes = recordedScopes(row.metadata);
    if (scopes === null) {
      increment(grantRecording, 'not_recorded');
      continue;
    }
    increment(grantRecording, scopes.length === 0 ? 'recorded_empty' : 'recorded');
    const key = JSON.stringify(scopes);
    scopeSets.set(key, (scopeSets.get(key) ?? 0) + 1);
  }

  return {
    total: rows.length,
    byLifecycle: sortedCounts(byLifecycle),
    grantRecording: sortedCounts(grantRecording),
    scopeSets: [...scopeSets.entries()]
      .map(([key, count]) => ({ scopes: JSON.parse(key), count }))
      .sort((left, right) => (
        left.scopes.length - right.scopes.length
        || JSON.stringify(left.scopes).localeCompare(JSON.stringify(right.scopes))
      )),
  };
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

export function summarizeTurnSamples(rows) {
  const completed = rows.filter((row) => row.outcome === 'end_turn');
  return {
    sampleCount: rows.length,
    completedTurnCount: completed.length,
    durationMs: {
      p50: nearestRank(completed.map((row) => row.durationMs), 0.5),
      p95: nearestRank(completed.map((row) => row.durationMs), 0.95),
    },
    modelCalls: {
      p50: nearestRank(completed.map((row) => row.modelCalls), 0.5),
      p95: nearestRank(completed.map((row) => row.modelCalls), 0.95),
    },
    totalTokens: {
      p50: nearestRank(completed.map((row) => row.totalTokens), 0.5),
      p95: nearestRank(completed.map((row) => row.totalTokens), 0.95),
    },
  };
}
