function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function classifierState(value) {
  if (value == null) return 'missing';
  if (!isRecord(value)) return 'malformed';
  return typeof value.version === 'number' && Number.isFinite(value.version)
    ? `v${value.version}`
    : 'unversioned';
}

function sourceState(row) {
  if (!row.requestSourceMessageId) return 'pointer_missing';
  return row.sourceMessageAvailable ? 'available' : 'message_missing_or_empty';
}

function sourceRecoveryState(row) {
  const aligned = sourceState(row);
  if (aligned === 'available') return 'aligned_source';
  return row.historyCustomerTextAvailable ? 'history_only_candidate' : 'no_customer_text';
}

function pendingPlanState(row) {
  const cached = row.cachedPlan != null;
  const operator = row.operatorPlanPending === true;
  if (cached && operator) return 'cached_and_operator';
  if (cached) return 'cached';
  if (operator) return 'operator';
  return 'none';
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeAgentBriefingInventory(rows, generatedAt = new Date().toISOString()) {
  const classifierVersions = {};
  const requestSource = {};
  const sourceRecovery = {};
  const escalation = {};
  const pendingPlans = {};
  const matrix = new Map();
  const organizationIds = new Set();
  const shapesByOrganization = new Map();
  let actionableLegacyTotal = 0;
  let actionableLegacyWithSource = 0;
  let actionableLegacyWithHistoryOnly = 0;
  let actionableLegacyWithoutSource = 0;

  for (const row of rows) {
    organizationIds.add(row.organizationId);
    const classifier = classifierState(row.classifierSignals);
    const organizationShapes = shapesByOrganization.get(row.organizationId) ?? new Set();
    organizationShapes.add(classifier === 'v5' ? 'current' : 'legacy');
    shapesByOrganization.set(row.organizationId, organizationShapes);
    const source = sourceState(row);
    const recovery = sourceRecoveryState(row);
    const escalationState = row.escalatedAt ? 'escalated' : 'not_escalated';
    const pending = pendingPlanState(row);
    increment(classifierVersions, classifier);
    increment(requestSource, source);
    increment(sourceRecovery, recovery);
    increment(escalation, escalationState);
    increment(pendingPlans, pending);

    const key = JSON.stringify([classifier, source, escalationState, pending]);
    matrix.set(key, (matrix.get(key) ?? 0) + 1);

    const actionable = row.escalatedAt != null
      || row.filterStatus === 'questionable'
      || pending !== 'none';
    if (actionable && classifier !== 'v5') {
      actionableLegacyTotal += 1;
      if (source === 'available') actionableLegacyWithSource += 1;
      else if (recovery === 'history_only_candidate') actionableLegacyWithHistoryOnly += 1;
      else actionableLegacyWithoutSource += 1;
    }
  }

  return {
    generatedAt,
    privacy: 'Aggregate counts only; no organization, customer, thread, message, or plan identifiers.',
    scope: {
      openBriefingThreadCount: rows.length,
      organizationCount: organizationIds.size,
      mixedCurrentAndLegacyOrganizationCount: [...shapesByOrganization.values()]
        .filter((shapes) => shapes.has('current') && shapes.has('legacy')).length,
    },
    classifierVersions: sortedCounts(classifierVersions),
    requestSource: sortedCounts(requestSource),
    sourceRecovery: sortedCounts(sourceRecovery),
    escalation: sortedCounts(escalation),
    pendingPlans: sortedCounts(pendingPlans),
    merchantWorkLegacyCandidates: {
      total: actionableLegacyTotal,
      sourceAvailable: actionableLegacyWithSource,
      historyOnlyCandidate: actionableLegacyWithHistoryOnly,
      sourceUnavailable: actionableLegacyWithoutSource,
    },
    matrix: [...matrix.entries()]
      .map(([key, count]) => {
        const [classifier, source, escalationState, pending] = JSON.parse(key);
        return { classifier, source, escalation: escalationState, pendingPlan: pending, count };
      })
      .sort((left, right) => (
        left.classifier.localeCompare(right.classifier)
        || left.source.localeCompare(right.source)
        || left.escalation.localeCompare(right.escalation)
        || left.pendingPlan.localeCompare(right.pendingPlan)
      )),
  };
}
