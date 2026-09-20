import { ChannelType, db, Prisma } from '@shopkeeper/db';
import type { Integration, Prisma as PrismaTypes } from '@prisma/client';

import {
  AmbiguousInstagramIntegrationError,
  buildSocialApiInstagramMetadata,
} from '@shopkeeper/integrations/instagram';
import { InstagramAccountInUseError } from './instagram-connection';

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
        metadata: buildSocialApiInstagramMetadata(
          existing?.providerAccountId === input.providerAccountId ? existing.metadata : null,
          {
            brandId: input.brandId,
            connectedAt: input.connectedAt,
            providerAccountId: input.providerAccountId,
            username: input.username,
          },
        ) as PrismaTypes.InputJsonValue,
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
