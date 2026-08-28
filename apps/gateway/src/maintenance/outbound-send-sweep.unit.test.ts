import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction, disconnect, errorLog } = vi.hoisted(() => ({
  transaction: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
  errorLog: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    $transaction: transaction,
    $disconnect: disconnect,
    message: { updateMany: vi.fn() },
  },
}));

vi.mock('../logger.js', () => ({
  default: { debug: vi.fn(), error: errorLog, info: vi.fn(), warn: vi.fn() },
}));

import { runOutboundSendSweep } from './outbound-send-sweep.js';

function sweepCounts(pending = 0, unattempted = 0, attempted = 0) {
  return [{ count: pending }, { count: unattempted }, { count: attempted }];
}

beforeEach(() => {
  vi.clearAllMocks();
  disconnect.mockResolvedValue(undefined);
});

describe('runOutboundSendSweep', () => {
  it('reconnects and retries once when the database connection was closed', async () => {
    transaction
      .mockRejectedValueOnce(new Error('Server has closed the connection'))
      .mockResolvedValueOnce(sweepCounts());

    await expect(runOutboundSendSweep()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('gives up after the retry rather than looping', async () => {
    transaction
      .mockRejectedValueOnce(new Error('P1017'))
      .mockRejectedValueOnce(new Error('P1017'));

    await expect(runOutboundSendSweep()).rejects.toThrow('P1017');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('still retries when the disconnect itself fails', async () => {
    disconnect.mockRejectedValueOnce(new Error('already disconnected'));
    transaction
      .mockRejectedValueOnce(new Error('kind: Closed'))
      .mockResolvedValueOnce(sweepCounts());

    await expect(runOutboundSendSweep()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
  'Error in PostgreSQL connection: kind: Closed',
  'P1017: connection terminated',
  'connection was closed unexpectedly',
  'closed the connection',
])('retries once for a reconnectable database error (%s)', async (message) => {
    transaction
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce(sweepCounts());

    await expect(runOutboundSendSweep()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a non-Error throw', 'kind: Closed'],
    ['a stack-only match', Object.assign(new Error('query failed'), { stack: 'P1017 at db' })],
  ])('classifies %s as a closed connection', async (_label, thrown) => {
    transaction.mockRejectedValueOnce(thrown).mockResolvedValueOnce(sweepCounts());

    await expect(runOutboundSendSweep()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-connection database error without retrying', async () => {
    transaction.mockRejectedValueOnce(new Error('permission denied for table message'));

    await expect(runOutboundSendSweep()).rejects.toThrow('permission denied');
    expect(transaction).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('logs an ops alert when stale rows were reconciled', async () => {
    transaction.mockResolvedValueOnce(sweepCounts(2, 1, 3));

    await runOutboundSendSweep();

    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ opsAlert: true, failedCount: 3, unknownCount: 3 }),
      expect.stringContaining('Reconciled orphaned outbound send claims'),
    );
  });

  it('sums both no-send buckets into the failed count', async () => {
    transaction.mockResolvedValueOnce(sweepCounts(2, 3, 0));

    await runOutboundSendSweep();

    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ opsAlert: true, failedCount: 5, unknownCount: 0 }),
      expect.stringContaining('Reconciled orphaned outbound send claims'),
    );
  });

  it('alerts when only the ambiguous post-provider case fired', async () => {
    transaction.mockResolvedValueOnce(sweepCounts(0, 0, 4));

    await runOutboundSendSweep();

    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ opsAlert: true, failedCount: 0, unknownCount: 4 }),
      expect.anything(),
    );
  });

  it('stays quiet when nothing was reconciled', async () => {
    transaction.mockResolvedValueOnce(sweepCounts());

    await runOutboundSendSweep();

    expect(errorLog).not.toHaveBeenCalled();
  });
});
