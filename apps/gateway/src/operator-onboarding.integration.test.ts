import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { finalizeOperatorBind } from './operator-onboarding.js';

describe('finalizeOperatorBind', () => {
  let org!: Awaited<ReturnType<typeof createTestOrg>>;

  beforeEach(async () => {
    org = await createTestOrg();
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  it('arms the morning digest + first briefing on the first bind', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `u-${org.id}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}` },
    });

    await finalizeOperatorBind(org.id);

    const settings = (await db.organization.findUnique({
      where: { id: org.id },
      select: { settings: true },
    }))?.settings as Record<string, unknown>;
    expect(settings.digestEnabled).toBe(true);
    expect(settings.firstBriefingPending).toBe(true);
  });

  it('does not re-arm the digest when a second channel binds', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `u-${org.id}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}` },
    });
    await finalizeOperatorBind(org.id);

    // Merchant later turns the digest off; binding a second channel must not
    // silently switch it back on.
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { digestEnabled: false, firstBriefingPending: false } },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `s-${org.id}`, spaceId: `sp-${org.id}` },
    });

    await finalizeOperatorBind(org.id);

    const settings = (await db.organization.findUnique({
      where: { id: org.id },
      select: { settings: true },
    }))?.settings as Record<string, unknown>;
    expect(settings.digestEnabled).toBe(false);
    expect(settings.firstBriefingPending).toBe(false);
  });
});
