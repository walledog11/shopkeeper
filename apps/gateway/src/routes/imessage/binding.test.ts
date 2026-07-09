import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shopkeeperDb from '@shopkeeper/db';
import { createOrgMemberBindToken, db } from '@shopkeeper/db';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  installProductAnalytics,
} from '@shopkeeper/analytics';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { handleImessageBinding } from './binding.js';
import type { OperatorReply } from '../operator-message.js';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../../clients/clerk-approver.js', () => ({
  resolveClerkUserApprover: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../operator-onboarding.js', () => ({
  finalizeOperatorBind: vi.fn().mockResolvedValue('Welcome to Shopkeeper.'),
}));

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let analyticsSink: RecordingAnalyticsSink;

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: 'usr_bind_log' } });
  analyticsSink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink: analyticsSink, environment: 'test' });
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

afterEach(async () => {
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  await cleanupTestData(org?.id);
});

describe('handleImessageBinding log hygiene', () => {
  it('captures integration_connection_completed when bind succeeds', async () => {
    const { token } = await createOrgMemberBindToken({
      organizationId: org.id,
      clerkUserId: 'usr_bind_log',
    });
    const reply = vi.fn<OperatorReply>();

    await handleImessageBinding({
      senderId: '+15550004444',
      spaceId: 'space_analytics',
      body: token,
      displayName: null,
      reply,
    });

    const binding = await db.orgMemberImessageBinding.findUnique({
      where: { senderId: '+15550004444' },
    });
    expect(binding).not.toBeNull();
    expect(analyticsSink.events).toEqual([
      expect.objectContaining({
        event: 'integration_connection_completed',
        distinctId: org.id,
        properties: expect.objectContaining({
          organization_id: org.id,
          platform: 'imessage',
          '$insert_id': `integration_connection_completed:${binding?.id}`,
        }),
      }),
    ]);
  });

  it('does not log connect tokens or message bodies at info level', async () => {
    const { token } = await createOrgMemberBindToken({
      organizationId: org.id,
      clerkUserId: 'usr_bind_log',
    });
    const reply = vi.fn<OperatorReply>();

    await handleImessageBinding({
      senderId: '+15550002222',
      spaceId: 'space_bind',
      body: token,
      displayName: null,
      reply,
    });

    for (const call of [...mockLogger.info.mock.calls, ...mockLogger.warn.mock.calls]) {
      const fields = call[0] as Record<string, unknown> | undefined;
      const serialized = JSON.stringify(fields ?? {});
      expect(serialized).not.toContain(token);
      expect(fields).not.toHaveProperty('body');
      expect(fields).not.toHaveProperty('token');
    }
  });

  it('logs only sender metadata when rejecting an unbound stranger', async () => {
    const reply = vi.fn<OperatorReply>();

    await handleImessageBinding({
      senderId: '+15550003333',
      spaceId: 'space_stranger',
      body: 'random hello',
      displayName: null,
      reply,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: '+15550003333',
        outcome: 'rejected_unbound',
      }),
      '[iMessage] Bind rejected — sender not linked',
    );

    const fields = mockLogger.info.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('body');
  });

  it('does not query bind tokens for stranger messages that are not connect codes', async () => {
    const findTokenSpy = vi.spyOn(shopkeeperDb, 'findOrgMemberBindToken');
    const reply = vi.fn<OperatorReply>();

    await handleImessageBinding({
      senderId: '+15550005555',
      spaceId: 'space_stranger',
      body: 'hello',
      displayName: null,
      reply,
    });

    expect(findTokenSpy).not.toHaveBeenCalled();
    findTokenSpy.mockRestore();
    expect(reply).toHaveBeenCalledTimes(1);
  });
});
