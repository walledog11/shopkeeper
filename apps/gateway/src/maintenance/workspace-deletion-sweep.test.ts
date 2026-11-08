import { beforeEach, describe, expect, it, vi } from 'vitest';

const { claim, fail, list, release, post, alert } = vi.hoisted(() => ({
  claim: vi.fn(),
  fail: vi.fn(),
  list: vi.fn(),
  release: vi.fn(),
  post: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  claimWorkspaceDeletion: claim,
  failWorkspaceDeletion: fail,
  listRecoverableWorkspaceDeletions: list,
  releaseWorkspaceDeletion: release,
}));
vi.mock('../clients/dashboard-internal.js', () => ({ postDashboardInternal: post }));
vi.mock('../ops-alerts.js', () => ({ emitOpsAlert: alert }));

import { recoverWorkspaceDeletions, WORKSPACE_DELETION_MAX_ATTEMPTS } from './workspace-deletion-sweep.js';

const operation = { id: 'op_1', organizationId: 'org_1' };

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([operation]);
  post.mockResolvedValue({ ok: false, status: 503, outcome: 'http_error' });
});

describe('recoverWorkspaceDeletions', () => {
  // A cleanup that could never succeed was released for another try every
  // minute, forever.
  it('stops retrying a deletion that still fails after its allowance, and reports it once', async () => {
    claim.mockResolvedValueOnce({
      claimToken: 'claim_1',
      operation: { ...operation, attempts: WORKSPACE_DELETION_MAX_ATTEMPTS - 1 },
    });
    await recoverWorkspaceDeletions();
    expect(release).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();

    claim.mockResolvedValueOnce({
      claimToken: 'claim_2',
      operation: { ...operation, attempts: WORKSPACE_DELETION_MAX_ATTEMPTS },
    });
    await recoverWorkspaceDeletions();
    expect(fail).toHaveBeenCalledWith('op_1', 'claim_2', expect.any(Error));
    expect(release).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'data_deletion', level: 'error' }),
    );
  });
});
