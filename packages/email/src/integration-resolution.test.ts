import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    integration: { findMany: vi.fn() },
    organization: { findUnique: vi.fn(), updateMany: vi.fn() },
    thread: { findFirst: vi.fn() },
  },
}));

vi.mock('@shopkeeper/db', () => ({ db: dbMock }));

import {
  EmailIntegrationConfigurationError,
  resolveEmailIntegration,
} from './integration-resolution.js';

const GMAIL = integration('gmail-id', 'gmail');
const POSTMARK = integration('postmark-id', 'postmark');

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.organization.findUnique.mockResolvedValue({ defaultEmailIntegrationId: GMAIL.id });
  dbMock.organization.updateMany.mockResolvedValue({ count: 1 });
  dbMock.integration.findMany.mockResolvedValue([GMAIL, POSTMARK]);
  dbMock.thread.findFirst.mockResolvedValue({ replyIntegrationId: POSTMARK.id });
});

describe('resolveEmailIntegration', () => {
  it('routes replies through the latest valid inbound source', async () => {
    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'reply',
      threadId: 'thread-id',
    })).resolves.toMatchObject({ id: POSTMARK.id });
  });

  it('falls back to the default when a thread source was deleted', async () => {
    dbMock.thread.findFirst.mockResolvedValue({ replyIntegrationId: 'deleted-id' });

    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'reply',
      threadId: 'thread-id',
    })).resolves.toMatchObject({ id: GMAIL.id });
  });

  it('always uses the workspace default for proactive email', async () => {
    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'proactive',
      threadId: 'thread-id',
    })).resolves.toMatchObject({ id: GMAIL.id });
  });

  it('repairs a missing default when only one provider exists', async () => {
    dbMock.organization.findUnique.mockResolvedValue({ defaultEmailIntegrationId: null });
    dbMock.integration.findMany.mockResolvedValue([POSTMARK]);
    dbMock.thread.findFirst.mockResolvedValue(null);

    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'proactive',
    })).resolves.toMatchObject({ id: POSTMARK.id });
    expect(dbMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org-id', NOT: { defaultEmailIntegrationId: POSTMARK.id } },
      data: { defaultEmailIntegrationId: POSTMARK.id },
    });
  });

  it('returns a configuration error when both providers exist without a valid default', async () => {
    dbMock.organization.findUnique.mockResolvedValue({ defaultEmailIntegrationId: null });

    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'proactive',
    })).rejects.toBeInstanceOf(EmailIntegrationConfigurationError);
  });

  it('honors a valid outbound snapshot before current routing state', async () => {
    await expect(resolveEmailIntegration({
      organizationId: 'org-id',
      purpose: 'reply',
      threadId: 'thread-id',
      snapshotIntegrationId: GMAIL.id,
    })).resolves.toMatchObject({ id: GMAIL.id });
  });
});

function integration(id: string, emailProvider: 'gmail' | 'postmark') {
  return {
    id,
    organizationId: 'org-id',
    platform: 'email',
    emailProvider,
    externalAccountId: `${emailProvider}@example.test`,
    fromEmail: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    metadata: { provider: emailProvider },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}
