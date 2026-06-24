import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, ChannelType, createOrgMemberBindToken, findOrgMemberBindToken } from '@shopkeeper/db';
import { createTestOrg, createTestIntegration, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { handleImessageOperatorMessage } from './message-handler.js';
import { HELP_TEXT } from '../telegram/format.js';
import type { OperatorReply } from '../operator-message.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let integration!: Awaited<ReturnType<typeof createTestIntegration>>;
let member!: Awaited<ReturnType<typeof db.orgMember.create>>;

const clerkUserId = 'user_imessage_test';
const SENDER = '+15550001111';

beforeEach(async () => {
  org = await createTestOrg();
  integration = await createTestIntegration(org.id, {
    platform: ChannelType.imessage,
    externalAccountId: 'proj_test',
    accessToken: 'secret',
  });
  member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId } });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('handleImessageOperatorMessage', () => {
  it('rejects an unbound sender with connect instructions and creates no binding', async () => {
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      integrationId: integration.id,
      organizationId: org.id,
      senderId: SENDER,
      spaceId: 'space_1',
      body: 'hello there',
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain('Integrations → iMessage');

    const binding = await db.orgMemberImessageBinding.findUnique({
      where: { integrationId_senderId: { integrationId: integration.id, senderId: SENDER } },
    });
    expect(binding).toBeNull();
  });

  it('binds the sender when it texts a valid connect token and consumes the token', async () => {
    const { token } = await createOrgMemberBindToken({ organizationId: org.id, clerkUserId });
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      integrationId: integration.id,
      organizationId: org.id,
      senderId: SENDER,
      spaceId: 'space_2',
      body: token,
      displayName: null,
      reply,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain('Connected');

    const binding = await db.orgMemberImessageBinding.findUnique({
      where: { integrationId_senderId: { integrationId: integration.id, senderId: SENDER } },
    });
    expect(binding?.orgMemberId).toBe(member.id);
    expect(binding?.spaceId).toBe('space_2');

    // Single-use: the token is gone after binding.
    expect(await findOrgMemberBindToken(token)).toBeNull();
  });

  it('dispatches commands for a bound sender (HELP)', async () => {
    await db.orgMemberImessageBinding.create({
      data: {
        orgMemberId: member.id,
        integrationId: integration.id,
        senderId: SENDER,
        spaceId: 'space_1',
        displayName: null,
      },
    });
    const reply = vi.fn<OperatorReply>();

    await handleImessageOperatorMessage({
      integrationId: integration.id,
      organizationId: org.id,
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
