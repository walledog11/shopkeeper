import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planDuplicateIntegrationCleanup,
  pickCanonicalIntegration,
} from './cleanup-duplicate-integrations-lib.mjs';

function row(id, createdAt) {
  return {
    id,
    organizationId: `org-${id}`,
    platform: 'shopify',
    externalAccountId: 'shop.myshopify.com',
    createdAt: new Date(createdAt),
    organization: { name: `Org ${id}` },
  };
}

test('pickCanonicalIntegration chooses the newest createdAt', () => {
  const canonical = pickCanonicalIntegration([
    row('old', '2026-01-01T00:00:00.000Z'),
    row('new', '2026-06-01T00:00:00.000Z'),
  ]);
  assert.equal(canonical.id, 'new');
});

test('planDuplicateIntegrationCleanup keeps one row per duplicate group', () => {
  const plan = planDuplicateIntegrationCleanup([
    [
      row('old', '2026-01-01T00:00:00.000Z'),
      row('new', '2026-06-01T00:00:00.000Z'),
    ],
    [row('solo', '2026-02-01T00:00:00.000Z')],
  ]);

  assert.deepEqual(plan.keep.map((entry) => entry.id), ['new', 'solo']);
  assert.deepEqual(plan.remove.map((entry) => entry.id), ['old']);
});
