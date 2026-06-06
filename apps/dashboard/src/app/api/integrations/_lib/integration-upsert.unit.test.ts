import { describe, expect, it } from 'vitest';
import { Prisma } from '@clerk/db';
import { isIntegrationUniqueConstraintError } from './integration-upsert';

function knownRequestError(code: string, meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    clientVersion: 'test',
    code,
    meta,
  });
}

describe('isIntegrationUniqueConstraintError', () => {
  it('matches the integration compound unique constraint', () => {
    const error = knownRequestError('P2002', {
      modelName: 'Integration',
      target: ['organizationId', 'platform', 'externalAccountId'],
    });

    expect(isIntegrationUniqueConstraintError(error)).toBe(true);
  });

  it('does not treat unrelated P2002 errors as integration races', () => {
    const organizationError = knownRequestError('P2002', {
      modelName: 'Organization',
      target: ['clerkOrgId'],
    });
    const broadCastShape = { code: 'P2002' };

    expect(isIntegrationUniqueConstraintError(organizationError)).toBe(false);
    expect(isIntegrationUniqueConstraintError(broadCastShape)).toBe(false);
  });
});
