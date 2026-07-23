import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbChannelType } from '@shopkeeper/db';
import { db, recordFollowUpWatch, type FollowUpWatchKind, type FollowUpWatchStatus } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { runPostResolutionFollowUpMonitor } from './post-resolution-followup-monitor.js';

const { listOperatorBindingsSpy, notifyOperatorSpy } = vi.hoisted(() => ({
  listOperatorBindingsSpy: vi.fn(),
  notifyOperatorSpy: vi.fn(),
}));

vi.mock('../operator-notify.js', () => ({
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: notifyOperatorSpy,
}));

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function setOrgSettings(settings: Record<string, unknown>): Promise<void> {
  await db.organization.update({ where: { id: org.id }, data: { settings } });
}

async function seedWatch(params: {
  orderId: string;
  kind: FollowUpWatchKind;
  ageDays: number;
  channel?: DbChannelType;
  closed?: boolean;
  status?: FollowUpWatchStatus;
}): Promise<void> {
  const customer = await createTestCustomer(org.id, `${params.orderId}@example.com`, { name: 'Sarah Jones' });
  const thread = await createTestThread(org.id, customer.id, params.channel ?? 'email');
  if (params.closed ?? true) {
    await db.thread.update({ where: { id: thread.id }, data: { status: 'closed' } });
  }
  await recordFollowUpWatch({
    organizationId: org.id,
    threadId: thread.id,
    orderId: params.orderId,
    kind: params.kind,
  });
  await db.followUpWatch.update({
    where: { organizationId_orderId: { organizationId: org.id, orderId: params.orderId } },
    data: {
      createdAt: new Date(Date.now() - params.ageDays * ONE_DAY_MS),
      ...(params.status ? { status: params.status } : {}),
    },
  });
}

function watchStatus(orderId: string): Promise<FollowUpWatchStatus | undefined> {
  return db.followUpWatch
    .findUnique({
      where: { organizationId_orderId: { organizationId: org.id, orderId } },
      select: { status: true },
    })
    .then((row) => row?.status as FollowUpWatchStatus | undefined);
}

beforeEach(async () => {
  vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', '1');
  org = await createTestOrg();
  listOperatorBindingsSpy.mockReset();
  notifyOperatorSpy.mockReset();
  notifyOperatorSpy.mockResolvedValue(true);
  listOperatorBindingsSpy.mockResolvedValue([{ clerkUserId: 'user_1', channel: 'telegram', contextKey: '1' }]);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllEnvs();
});

describe('runPostResolutionFollowUpMonitor', () => {
  it('nudges the operator for a due, closed refund ticket', async () => {
    await seedWatch({ orderId: '1001', kind: 'refund', ageDays: 6 });

    const result = await runPostResolutionFollowUpMonitor();

    expect(result.nudgesSent).toBe(1);
    expect(notifyOperatorSpy).toHaveBeenCalledTimes(1);
    expect(notifyOperatorSpy).toHaveBeenCalledWith(
      org.id,
      expect.anything(),
      expect.stringContaining("Sarah's refund"),
      {},
      { idempotencyKey: `post-resolution-followup:${org.id}:1001:refund` },
    );
    await expect(watchStatus('1001')).resolves.toBe('notified');
  });

  it('leaves a watch open until the window elapses', async () => {
    await seedWatch({ orderId: '1002', kind: 'exchange', ageDays: 2 });

    const result = await runPostResolutionFollowUpMonitor();

    expect(result.nudgesSent).toBe(0);
    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1002')).resolves.toBe('open');
  });

  it('ignores tickets that are still open', async () => {
    await seedWatch({ orderId: '1003', kind: 'refund', ageDays: 6, closed: false });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1003')).resolves.toBe('open');
  });

  it('ignores operator/internal threads', async () => {
    await seedWatch({ orderId: '1004', kind: 'refund', ageDays: 6, channel: 'sms_agent' });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1004')).resolves.toBe('open');
  });

  it('retires the watch when the org has opted out', async () => {
    await setOrgSettings({ postResolutionFollowUpEnabled: false });
    await seedWatch({ orderId: '1005', kind: 'refund', ageDays: 6 });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1005')).resolves.toBe('skipped');
  });

  it('is a no-op when the global flag is off', async () => {
    vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', 'false');
    await seedWatch({ orderId: '1006', kind: 'refund', ageDays: 6 });

    const result = await runPostResolutionFollowUpMonitor();

    expect(result).toEqual({ orgsScanned: 0, watchesChecked: 0, nudgesSent: 0 });
    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1006')).resolves.toBe('open');
  });

  it('does not re-nudge an already-notified watch', async () => {
    await seedWatch({ orderId: '1007', kind: 'refund', ageDays: 6, status: 'notified' });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
  });

  it('retires the watch when no operators are bound', async () => {
    listOperatorBindingsSpy.mockResolvedValue([]);
    await seedWatch({ orderId: '1008', kind: 'exchange', ageDays: 6 });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1008')).resolves.toBe('skipped');
  });

  it('respects a custom follow-up window', async () => {
    await setOrgSettings({ postResolutionFollowUpDays: 10 });
    await seedWatch({ orderId: '1009', kind: 'refund', ageDays: 6 });

    await runPostResolutionFollowUpMonitor();

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
    await expect(watchStatus('1009')).resolves.toBe('open');
  });
});
