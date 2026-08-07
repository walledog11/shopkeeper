/**
 * Pure helpers for duplicate integration cleanup.
 */

export function groupKey(platform, externalAccountId) {
  return `${platform}\0${externalAccountId}`;
}

export function pickCanonicalIntegration(rows) {
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => {
    const createdAtDiff = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return right.id.localeCompare(left.id);
  })[0];
}

export function planDuplicateIntegrationCleanup(groups) {
  const keep = [];
  const remove = [];

  for (const rows of groups) {
    if (rows.length <= 1) {
      if (rows[0]) keep.push(rows[0]);
      continue;
    }
    const canonical = pickCanonicalIntegration(rows);
    keep.push(canonical);
    for (const row of rows) {
      if (row.id !== canonical.id) remove.push(row);
    }
  }

  return { keep, remove };
}
