import { db, Prisma, type DbChannelType } from '@shopkeeper/db';
import type { Integration, Prisma as PrismaTypes } from '@prisma/client';

const INTEGRATION_UNIQUE_TARGET = ['organizationId', 'platform', 'externalAccountId'] as const;
const INTEGRATION_UNIQUE_DB_TARGET = ['organization_id', 'platform', 'external_account_id'] as const;
const INTEGRATION_UNIQUE_CONSTRAINTS = new Set([
  'Integration_organizationId_platform_externalAccountId_key',
  'integrations_organization_id_platform_external_account_id_key',
]);

export type IntegrationUpsertData = Omit<
  PrismaTypes.IntegrationUncheckedCreateInput,
  'id' | 'organizationId' | 'platform' | 'externalAccountId' | 'createdAt'
>;

export interface RaceSafeIntegrationUpsertArgs {
  organizationId: string;
  platform: DbChannelType;
  externalAccountId: string;
  data?: IntegrationUpsertData;
}

type IntegrationUniqueKey = {
  organizationId: string;
  platform: DbChannelType;
  externalAccountId: string;
};

function targetArrayMatches(target: unknown[], expected: readonly string[]): boolean {
  const fields = target.filter((field): field is string => typeof field === 'string');
  return fields.length === expected.length && expected.every((field) => fields.includes(field));
}

function targetStringMatches(target: string): boolean {
  if (INTEGRATION_UNIQUE_CONSTRAINTS.has(target)) return true;
  const normalized = target.toLowerCase();
  return (
    normalized.includes('integration') &&
    normalized.includes('organization') &&
    normalized.includes('platform') &&
    normalized.includes('external') &&
    normalized.includes('account')
  );
}

function targetMatchesIntegrationUnique(target: unknown): boolean {
  if (Array.isArray(target)) {
    return (
      targetArrayMatches(target, INTEGRATION_UNIQUE_TARGET) ||
      targetArrayMatches(target, INTEGRATION_UNIQUE_DB_TARGET)
    );
  }
  return typeof target === 'string' && targetStringMatches(target);
}

export function isIntegrationUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  if (error.meta?.modelName !== undefined && error.meta.modelName !== 'Integration') return false;
  return targetMatchesIntegrationUnique(error.meta?.target);
}

function hasUpdateData(data: IntegrationUpsertData): boolean {
  return Object.keys(data).length > 0;
}

async function updateIntegrationById(id: string, data: IntegrationUpsertData): Promise<Integration> {
  if (!hasUpdateData(data)) {
    return db.integration.findUniqueOrThrow({ where: { id } });
  }
  return db.integration.update({ where: { id }, data });
}

export async function upsertRaceSafeIntegration(
  args: RaceSafeIntegrationUpsertArgs,
): Promise<Integration> {
  const data = args.data ?? {};
  const key: IntegrationUniqueKey = {
    organizationId: args.organizationId,
    platform: args.platform,
    externalAccountId: args.externalAccountId,
  };
  const where = { organizationId_platform_externalAccountId: key };
  const existing = await db.integration.findUnique({ where });

  if (existing) {
    return updateIntegrationById(existing.id, data);
  }

  try {
    return await db.integration.create({
      data: {
        ...key,
        ...data,
      },
    });
  } catch (err) {
    if (!isIntegrationUniqueConstraintError(err)) throw err;
    const race = await db.integration.findUnique({ where });
    if (!race) throw err;
    return updateIntegrationById(race.id, data);
  }
}
