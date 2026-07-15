import { db, type EmailProvider as DbEmailProvider } from '@shopkeeper/db';
import type { Integration } from '@prisma/client';
import { EmailNotConfiguredError } from './types.js';
import { getEmailProvider } from './providers.js';

export type EmailIntegrationPurpose = 'proactive' | 'reply';

export class EmailIntegrationConfigurationError extends EmailNotConfiguredError {
  readonly code = 'email_default_not_configured';

  constructor(message = 'Choose a default email integration before sending email.') {
    super(message);
    this.name = 'EmailIntegrationConfigurationError';
  }
}

export interface ResolveEmailIntegrationInput {
  organizationId: string;
  purpose: EmailIntegrationPurpose;
  threadId?: string | null;
  snapshotIntegrationId?: string | null;
}

function hasAuthoritativeProvider(integration: Integration): boolean {
  return integration.emailProvider === 'gmail' || integration.emailProvider === 'postmark';
}

function providerKey(integration: Integration): DbEmailProvider {
  return getEmailProvider(integration) as DbEmailProvider;
}

async function repairOnlyIntegrationDefault(
  organizationId: string,
  integrationId: string,
): Promise<void> {
  await db.organization.updateMany({
    where: {
      id: organizationId,
      NOT: { defaultEmailIntegrationId: integrationId },
    },
    data: { defaultEmailIntegrationId: integrationId },
  });
}

/**
 * Resolves the exact integration for an outbound email. The caller must persist
 * the returned id on the Message before enqueueing so a later default or thread
 * source change cannot redirect an approved send.
 */
export async function resolveEmailIntegration(
  input: ResolveEmailIntegrationInput,
): Promise<Integration> {
  const [organization, candidates, thread] = await Promise.all([
    db.organization.findUnique({
      where: { id: input.organizationId },
      select: { defaultEmailIntegrationId: true },
    }),
    db.integration.findMany({
      where: { organizationId: input.organizationId, platform: 'email' },
      orderBy: { createdAt: 'asc' },
    }),
    input.threadId
      ? db.thread.findFirst({
          where: {
            id: input.threadId,
            organizationId: input.organizationId,
            channelType: 'email',
          },
          select: { replyIntegrationId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!organization) {
    throw new EmailNotConfiguredError('Email workspace not found.');
  }

  // During the additive rollout, legacy rows without emailProvider remain
  // readable. New writes always set it, and it is authoritative when present.
  const integrations = candidates.filter((candidate, _index, rows) => {
    if (hasAuthoritativeProvider(candidate)) return true;
    const provider = providerKey(candidate);
    return !rows.some((other) => other.id !== candidate.id && other.emailProvider === provider);
  });
  if (integrations.length === 0) {
    throw new EmailNotConfiguredError('No email integration configured.');
  }

  const byId = new Map(integrations.map((integration) => [integration.id, integration]));
  const snapshot = input.snapshotIntegrationId
    ? byId.get(input.snapshotIntegrationId)
    : undefined;
  if (snapshot) return snapshot;

  if (input.purpose === 'reply' && thread?.replyIntegrationId) {
    const replyIntegration = byId.get(thread.replyIntegrationId);
    if (replyIntegration) return replyIntegration;
  }

  if (integrations.length === 1) {
    const only = integrations[0];
    if (organization.defaultEmailIntegrationId !== only.id) {
      await repairOnlyIntegrationDefault(input.organizationId, only.id);
    }
    return only;
  }

  const defaultIntegration = organization.defaultEmailIntegrationId
    ? byId.get(organization.defaultEmailIntegrationId)
    : undefined;
  if (defaultIntegration) return defaultIntegration;

  throw new EmailIntegrationConfigurationError();
}
