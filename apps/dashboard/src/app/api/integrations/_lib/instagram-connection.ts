import { ChannelType, db, Prisma } from '@shopkeeper/db';
import type { Integration, Prisma as PrismaTypes } from '@prisma/client';

export class InstagramAccountInUseError extends Error {
  constructor() {
    super('Instagram account is already connected to another workspace');
    this.name = 'InstagramAccountInUseError';
  }
}

export class AmbiguousInstagramIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousInstagramIntegrationError';
  }
}

export interface InstagramConnectionState {
  existingForOrganization: Integration | null;
}

export interface PersistInstagramConnectionInput {
  accessToken: string;
  accountId: string;
  accountType: string;
  expiresAt: Date;
  grantedScopes: string[];
  organizationId: string;
  permissionsVerified: boolean;
  subscriptionVerifiedAt: Date;
  username: string;
}

export interface PersistInstagramConnectionResult {
  integration: Integration;
  replacedIntegration: Pick<Integration, 'accessToken' | 'externalAccountId' | 'id'> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function instagramLoginMetadata(
  current: unknown,
  input: PersistInstagramConnectionInput,
): PrismaTypes.InputJsonValue {
  const root = isRecord(current) ? { ...current } : {};
  const instagram = isRecord(root.instagram) ? { ...root.instagram } : {};

  return {
    ...root,
    instagram: {
      ...instagram,
      accountType: input.accountType,
      authModel: 'instagram_login',
      grantedScopes: input.grantedScopes,
      lastSuccessfulSubscriptionAt: input.subscriptionVerifiedAt.toISOString(),
      permissionsVerified: input.permissionsVerified,
      subscribedFields: ['messages'],
      username: input.username,
    },
  } as PrismaTypes.InputJsonValue;
}

export async function inspectInstagramConnection(
  organizationId: string,
  accountId: string,
): Promise<InstagramConnectionState> {
  const [accountRows, organizationRows] = await Promise.all([
    db.integration.findMany({
      where: { platform: ChannelType.ig_dm, externalAccountId: accountId },
    }),
    db.integration.findMany({
      where: { organizationId, platform: ChannelType.ig_dm },
    }),
  ]);

  if (accountRows.length > 1) {
    throw new AmbiguousInstagramIntegrationError(
      `Instagram account ${accountId} resolves to multiple integrations`,
    );
  }
  if (organizationRows.length > 1) {
    throw new AmbiguousInstagramIntegrationError(
      `Organization ${organizationId} has multiple Instagram integrations`,
    );
  }
  if (accountRows[0] && accountRows[0].organizationId !== organizationId) {
    throw new InstagramAccountInUseError();
  }

  return { existingForOrganization: organizationRows[0] ?? null };
}

export async function persistInstagramConnection(
  input: PersistInstagramConnectionInput,
): Promise<PersistInstagramConnectionResult> {
  try {
    return await db.$transaction(async (tx) => {
      const accountRows = await tx.integration.findMany({
        where: { platform: ChannelType.ig_dm, externalAccountId: input.accountId },
      });
      const organizationRows = await tx.integration.findMany({
        where: { organizationId: input.organizationId, platform: ChannelType.ig_dm },
      });

      if (accountRows.length > 1 || organizationRows.length > 1) {
        throw new AmbiguousInstagramIntegrationError(
          'Instagram integration uniqueness constraints were bypassed',
        );
      }
      if (accountRows[0] && accountRows[0].organizationId !== input.organizationId) {
        throw new InstagramAccountInUseError();
      }

      const existing = organizationRows[0] ?? null;
      const data = {
        accessToken: input.accessToken,
        refreshToken: null,
        fromEmail: input.username,
        tokenExpiresAt: input.expiresAt,
        metadata: instagramLoginMetadata(
          existing?.externalAccountId === input.accountId ? existing.metadata : null,
          input,
        ),
      } satisfies PrismaTypes.IntegrationUncheckedUpdateInput;

      if (existing?.externalAccountId === input.accountId) {
        const integration = await tx.integration.update({
          where: { id: existing.id },
          data,
        });
        return { integration, replacedIntegration: null };
      }

      let replacedIntegration: PersistInstagramConnectionResult['replacedIntegration'] = null;
      if (existing) {
        replacedIntegration = {
          accessToken: existing.accessToken,
          externalAccountId: existing.externalAccountId,
          id: existing.id,
        };
        await tx.thread.updateMany({
          where: { replyIntegrationId: existing.id },
          data: {
            replyIntegrationId: null,
            replyIntegrationUpdatedAt: input.subscriptionVerifiedAt,
          },
        });
        await tx.integration.delete({ where: { id: existing.id } });
      }

      const integration = await tx.integration.create({
        data: {
          organizationId: input.organizationId,
          platform: ChannelType.ig_dm,
          externalAccountId: input.accountId,
          ...data,
        },
      });
      return { integration, replacedIntegration };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InstagramAccountInUseError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const owner = await db.integration.findFirst({
        where: { platform: ChannelType.ig_dm, externalAccountId: input.accountId },
        select: { organizationId: true },
      });
      if (owner && owner.organizationId !== input.organizationId) {
        throw new InstagramAccountInUseError();
      }
    }
    throw error;
  }
}
