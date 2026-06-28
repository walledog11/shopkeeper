import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: { organization: { findUnique } },
}));

import {
  assertBillingWriteAllowed,
  assertBillingWriteAllowedForOrgId,
} from './write-gate.js';

describe('gateway billing write gate', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it.each([null, 'trialing', 'active'])('allows writes for %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus })).not.toThrow();
  });

  it.each(['past_due', 'canceled'])('blocks writes for %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus })).toThrow(
      expect.objectContaining({ status: 402 }),
    );
  });

  it('loads the organization status before allowing a write', async () => {
    findUnique.mockResolvedValue({ stripeStatus: 'active' });

    await expect(assertBillingWriteAllowedForOrgId('org-1')).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { stripeStatus: true },
    });
  });

  it('returns not-found semantics for an unknown organization', async () => {
    findUnique.mockResolvedValue(null);

    await expect(assertBillingWriteAllowedForOrgId('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Organization not found',
    });
  });
});
