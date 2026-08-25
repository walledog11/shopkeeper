// Source alignment between a thread's persisted request fields and the newest
// customer message on that thread. Pure summarization: the caller supplies rows,
// this returns aggregate counts and carries no identifier into the report.

// Production moved onto the guarded write when 7430ee77 (which merged 933019d5)
// deployed. A stale row created before this instant is residue of the unguarded
// window; one created after is a live defect, so the two are counted apart.
export const STALENESS_GUARD_DEPLOYED_AT = '2026-08-25T20:48:32.000Z';

export function alignmentState(row) {
  const carriesRequest = row.requestSummary != null || row.requestSourceMessageId != null;
  if (!carriesRequest) return 'no_request_fields';
  if (row.latestCustomerSentAt == null) return 'no_customer_message';
  if (row.requestSourceMessageId == null) return 'pointer_missing';
  if (row.sourceSentAt == null) return 'source_message_missing';
  if (row.requestSourceMessageId === row.latestCustomerMessageId) return 'aligned';
  return new Date(row.sourceSentAt) < new Date(row.latestCustomerSentAt) ? 'stale' : 'aligned';
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeRequestAlignment(
  rows,
  generatedAt = new Date().toISOString(),
  guardDeployedAt = STALENESS_GUARD_DEPLOYED_AT,
) {
  const states = {};
  const byChannel = {};
  const organizationIds = new Set();
  const staleDetail = [];
  let staleBeforeGuard = 0;
  let staleAfterGuard = 0;

  for (const row of rows) {
    organizationIds.add(row.organizationId);
    const state = alignmentState(row);
    increment(states, state);
    increment(byChannel, `${row.channelType}:${state}`);

    if (state !== 'stale') continue;
    const createdAfterGuard = new Date(row.createdAt) >= new Date(guardDeployedAt);
    if (createdAfterGuard) staleAfterGuard += 1;
    else staleBeforeGuard += 1;
    staleDetail.push({
      channelType: row.channelType,
      status: row.status,
      lagSeconds: Math.round(
        (new Date(row.latestCustomerSentAt) - new Date(row.sourceSentAt)) / 1000,
      ),
      createdAfterGuard,
    });
  }

  return {
    generatedAt,
    guardDeployedAt,
    scope: {
      threadCount: rows.length,
      organizationCount: organizationIds.size,
    },
    alignment: sortedCounts(states),
    alignmentByChannel: sortedCounts(byChannel),
    stale: {
      total: staleDetail.length,
      createdBeforeGuard: staleBeforeGuard,
      createdAfterGuard: staleAfterGuard,
    },
    staleDetail,
  };
}
