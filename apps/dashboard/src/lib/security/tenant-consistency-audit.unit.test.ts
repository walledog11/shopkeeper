import { describe, expect, it, vi } from 'vitest';
import { computeTenantConsistencyReport } from '@shopkeeper/db';

describe('computeTenantConsistencyReport', () => {
  it('reports a clean database as safe to constrain', async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);

    const report = await computeTenantConsistencyReport(
      { $queryRawUnsafe: queryRawUnsafe } as never,
      { sampleLimit: 25 },
    );

    expect(report.safeToConstrain).toBe(true);
    expect(report.totalMismatches).toBe(0);
    expect(report.sampleLimit).toBe(25);
    expect(Object.keys(report.checks)).toHaveLength(13);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(13);
    expect(queryRawUnsafe.mock.calls.every(([, limit]) => limit === 25)).toBe(true);
  });

  it('preserves total counts while returning privacy-safe identifier samples', async () => {
    let call = 0;
    const queryRawUnsafe = vi.fn(async () => {
      call += 1;
      if (call !== 4) return [];
      return [{
        total: 3,
        childId: 'message-1',
        childOrganizationId: 'org-a',
        parentId: 'thread-1',
        parentOrganizationId: 'org-b',
      }];
    });

    const report = await computeTenantConsistencyReport(
      { $queryRawUnsafe: queryRawUnsafe } as never,
    );

    expect(report.safeToConstrain).toBe(false);
    expect(report.totalMismatches).toBe(3);
    expect(report.checks.message_thread).toEqual({
      total: 3,
      samples: [{
        childId: 'message-1',
        childOrganizationId: 'org-a',
        parentId: 'thread-1',
        parentOrganizationId: 'org-b',
      }],
    });
  });

  it.each([0, 1.5, 1_001])('rejects invalid sample limit %s', async (sampleLimit) => {
    await expect(computeTenantConsistencyReport(
      { $queryRawUnsafe: vi.fn() } as never,
      { sampleLimit },
    )).rejects.toThrow(/sampleLimit/);
  });
});
