import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, createOrgMemberBindToken, findOrgMemberBindToken } from '@shopkeeper/db';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  installProductAnalytics,
} from '@shopkeeper/analytics';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { handleImessageOperatorMessage } from './message-handler.js';
import { HELP_TEXT } from '../telegram/format.js';
import type { OperatorReply } from '../operator-message.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let member!: Awaited<ReturnType<typeof db.orgMember.create>>;
let analyticsSink: RecordingAnalyticsSink;

const clerkUserId = 'user_imessage_test';
const SENDER = '+15550001111';

beforeEach(async () => {
  org = await createTestOrg();
  member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId } });
  analyticsSink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink: analyticsSink, environment: 'test' });
});

afterEach(async () => {
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  await cleanupTestData(org?.id);
});

describe('handleImessageOperatorMessage', () => {
  it('rejects an unbound sender with connect instructions and creates no binding', async () => {
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      senderId: SENDER,
      spaceId: 'space_1',
      body: 'hello there',
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain('Integrations → iMessage');

    const binding = await db.orgMemberImessageBinding.findUnique({
      where: { senderId: SENDER },
    });
    expect(binding).toBeNull();
  });

  it('binds the sender when it texts a valid connect token and consumes the token', async () => {
    const { token } = await createOrgMemberBindToken({ organizationId: org.id, clerkUserId });
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      senderId: SENDER,
      spaceId: 'space_2',
      body: token,
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    const welcome = reply.mock.calls[0]?.[0] as string;
    expect(welcome).toContain("it's Shopkeeper");
    expect(welcome).toContain('watching');

    const binding = await db.orgMemberImessageBinding.findUnique({
      where: { senderId: SENDER },
    });
    expect(binding?.orgMemberId).toBe(member.id);
    expect(binding?.spaceId).toBe('space_2');
    expect(binding?.displayName).toBe(SENDER);

    // First operator channel for the org — the morning digest and first briefing
    // are armed as part of the bind.
    const activated = (await db.organization.findUnique({
      where: { id: org.id },
      select: { settings: true },
    }))?.settings as Record<string, unknown>;
    expect(activated.digestEnabled).toBe(true);
    expect(activated.firstBriefingPending).toBe(true);
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

    // Single-use: the token is gone after binding.
    expect(await findOrgMemberBindToken(token)).toBeNull();
  });

  it('rejects an expired connect token with connect instructions', async () => {
    const { token } = await createOrgMemberBindToken({ organizationId: org.id, clerkUserId });
    await db.orgMemberBindToken.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const reply = vi.fn<OperatorReply>();
    await handleImessageOperatorMessage({
      senderId: SENDER,
      spaceId: 'space_expired',
      body: token,
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain('Integrations → iMessage');
    expect(await db.orgMemberImessageBinding.findUnique({ where: { senderId: SENDER } })).toBeNull();
  });

  it('re-binds after unlink when the sender texts a fresh connect token', async () => {
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: SENDER, spaceId: 'space_old' },
    });
    await db.orgMemberImessageBinding.delete({ where: { senderId: SENDER } });

    const { token } = await createOrgMemberBindToken({ organizationId: org.id, clerkUserId });
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      senderId: SENDER,
      spaceId: 'space_new',
      body: token,
      displayName: null,
      reply,
    });

    const binding = await db.orgMemberImessageBinding.findUnique({ where: { senderId: SENDER } });
    expect(binding?.orgMemberId).toBe(member.id);
    expect(binding?.spaceId).toBe('space_new');
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it('dispatches commands for a bound sender (HELP)', async () => {
    await db.orgMemberImessageBinding.create({
      data: {
        orgMemberId: member.id,
        senderId: SENDER,
        spaceId: 'space_1',
        displayName: null,
      },
    });
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      senderId: SENDER,
      spaceId: 'space_1',
      body: 'HELP',
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toBe(HELP_TEXT);
  });
});
