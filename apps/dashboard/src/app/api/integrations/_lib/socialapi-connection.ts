import { ChannelType, db, Prisma } from '@shopkeeper/db';
import type { Integration, Prisma as PrismaTypes } from '@prisma/client';

import { AmbiguousInstagramIntegrationError } from '@shopkeeper/integrations/instagram';
import { assertInstagramUsernameUnclaimed, InstagramAccountInUseError } from './instagram-connection';

export interface PersistSocialApiConnectionInput {
  brandId: string;
  connectedAt: Date;
  organizationId: string;
  providerAccountId: string;
  username: string;
}

export interface PersistSocialApiConnectionResult {
  integration: Integration;
  replacedIntegrationId: string | null;
}

/**
 * Neither the OAuth exchange nor the account listing returns Instagram's own
 * account id, so `externalAccountId` holds the provider's. The source is
 * recorded rather than assumed: the schema comment on `external_account_id`
 * says it is the native platform id, and code that joins the two transports on
 * that column has to be able to see that a SocialAPI row cannot honour it.
 */
function socialApiMetadata(
  current: unknown,
  input: PersistSocialApiConnectionInput,
): PrismaTypes.InputJsonValue {
  const root = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};

  return {
    ...root,
    instagram: {
      authModel: 'socialapi',
      transport: 'socialapi',
      socialApiAccountId: input.providerAccountId,
      socialApiBrandId: input.brandId,
      externalAccountIdSource: 'provider',
      username: input.username,
      connectedAt: input.connectedAt.toISOString(),
    },
  } as PrismaTypes.InputJsonValue;
}

/**
 * Writes the workspace's SocialAPI Instagram row. Ownership is decided on
 * `providerAccountId` — the column the gateway's ingress lookup resolves — so a
 * provider account claimed by another workspace is refused here rather than
 * discovered later by a webhook that resolves to two rows.
 */
export async function persistSocialApiConnection(
  input: PersistSocialApiConnectionInput,
): Promise<PersistSocialApiConnectionResult> {
  try {
    return await db.$transaction(async (tx) => {
      const providerRows = await tx.integration.findMany({
        where: { platform: ChannelType.ig_dm, providerAccountId: input.providerAccountId },
      });
      const organizationRows = await tx.integration.findMany({
        where: { organizationId: input.organizationId, platform: ChannelType.ig_dm },
      });

      if (providerRows.length > 1 || organizationRows.length > 1) {
        throw new AmbiguousInstagramIntegrationError(
          'Instagram integration uniqueness constraints were bypassed',
        );
      }
      if (providerRows[0] && providerRows[0].organizationId !== input.organizationId) {
        throw new InstagramAccountInUseError();
      }
      await assertInstagramUsernameUnclaimed(tx, input.organizationId, input.username);

      const existing = organizationRows[0] ?? null;
      const data = {
        // A SocialAPI row holds no Meta token. Leaving one behind from a prior
        // direct connection would make the row look reachable from Meta ingress.
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        fromEmail: input.username,
        providerAccountId: input.providerAccountId,
        // Reconnecting clears a lifecycle left behind by a failed disconnect.
        lifecycleStatus: 'active',
        metadata: socialApiMetadata(
          existing?.providerAccountId === input.providerAccountId ? existing.metadata : null,
          input,
        ),
      } satisfies PrismaTypes.IntegrationUncheckedUpdateInput;

      if (existing?.providerAccountId === input.providerAccountId) {
        const integration = await tx.integration.update({ where: { id: existing.id }, data });
        return { integration, replacedIntegrationId: null };
      }

      let replacedIntegrationId: string | null = null;
      if (existing) {
        replacedIntegrationId = existing.id;
        await tx.thread.updateMany({
          where: { replyIntegrationId: existing.id },
          data: {
            replyIntegrationId: null,
            replyIntegrationUpdatedAt: input.connectedAt,
          },
        });
        await tx.integration.delete({ where: { id: existing.id } });
      }

      const integration = await tx.integration.create({
        data: {
          organizationId: input.organizationId,
          platform: ChannelType.ig_dm,
          externalAccountId: input.providerAccountId,
          ...data,
        },
      });
      return { integration, replacedIntegrationId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InstagramAccountInUseError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const owner = await db.integration.findFirst({
        where: { platform: ChannelType.ig_dm, providerAccountId: input.providerAccountId },
        select: { organizationId: true },
      });
      if (owner && owner.organizationId !== input.organizationId) {
        throw new InstagramAccountInUseError();
      }
    }
    throw error;
  }
}
