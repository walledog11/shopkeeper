import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEscalationGroups } from './escalation-backfill-lib.mjs';

const group = (overrides = {}) => ({
  organizationId: 'org-1',
  customerId: 'cust-1',
  channelType: 'email',
  existingOpen: 0,
  flipCount: 1,
  ...overrides,
});

test('one live pending, no existing open, backfills safely', () => {
  const report = classifyEscalationGroups([group({ existingOpen: 0, flipCount: 1 })]);
  assert.equal(report.safeToBackfill, true);
  assert.equal(report.collisionGroupCount, 0);
  assert.equal(report.pendingThreadsToBackfill, 1);
  assert.equal(report.backfillableCount, 1);
});

test('existing open plus a pending flip collides', () => {
  const report = classifyEscalationGroups([group({ existingOpen: 1, flipCount: 1 })]);
  assert.equal(report.safeToBackfill, false);
  assert.equal(report.collisionGroupCount, 1);
  assert.equal(report.backfillableCount, 0);
});

test('zero open but two pending flips collides (previously missed case)', () => {
  const report = classifyEscalationGroups([group({ existingOpen: 0, flipCount: 2 })]);
  assert.equal(report.safeToBackfill, false);
  assert.equal(report.collisionGroupCount, 1);
  assert.equal(report.collisionGroups[0].flipCount, 2);
  assert.equal(report.collisionGroups[0].existingOpen, 0);
});

test('an existing open with nothing to flip is not a collision', () => {
  const report = classifyEscalationGroups([group({ existingOpen: 1, flipCount: 0 })]);
  assert.equal(report.safeToBackfill, true);
  assert.equal(report.collisionGroupCount, 0);
  assert.equal(report.pendingThreadsToBackfill, 0);
});

test('any collision makes the whole backfill unsafe', () => {
  const report = classifyEscalationGroups([
    group({ customerId: 'a', existingOpen: 0, flipCount: 1 }),
    group({ customerId: 'b', existingOpen: 0, flipCount: 2 }),
    group({ customerId: 'c', existingOpen: 1, flipCount: 1 }),
  ]);
  assert.equal(report.safeToBackfill, false);
  assert.equal(report.collisionGroupCount, 2);
  assert.equal(report.pendingThreadsToBackfill, 4);
  assert.equal(report.backfillableCount, 1);
});

test('counts survive bigint-shaped inputs from the raw query', () => {
  const report = classifyEscalationGroups([
    { organizationId: 'o', customerId: 'x', channelType: 'ig_dm', existingOpen: 0n, flipCount: 1n },
  ]);
  assert.equal(report.safeToBackfill, true);
  assert.equal(report.pendingThreadsToBackfill, 1);
});
