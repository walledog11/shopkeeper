import { NextResponse } from 'next/server';
import { db, Prisma, parseVoiceProposal } from '@clerk/db';
import { normalizeStoredOrgSettings } from '@clerk/agent/settings';
import { readRequiredJsonObject } from '@/lib/api/body';
import { parseAgentVoiceBody } from '@/lib/agent/api/validation';
import { withOrgRoute } from '@/lib/api/route';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';

export const GET = withOrgRoute(
  { context: 'Voice proposal GET', errorMessage: 'Failed to fetch voice proposal' },
  async ({ org }) => {
    return NextResponse.json({ proposal: parseVoiceProposal(org.voiceProposal) });
  },
);

export const POST = withOrgRoute(
  { context: 'Voice proposal POST', errorMessage: 'Failed to update voice proposal' },
  async ({ org, request }) => {
    const { action } = parseAgentVoiceBody(await readRequiredJsonObject(request));

    if (action !== 'approve' && action !== 'dismiss') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const proposal = parseVoiceProposal(org.voiceProposal);
    if (!proposal) {
      return NextResponse.json({ error: 'No pending proposal' }, { status: 404 });
    }

    if (action === 'dismiss') {
      await db.organization.update({
        where: { id: org.id },
        data: { voiceProposal: Prisma.DbNull },
      });
      return NextResponse.json({ ok: true });
    }

    // approve: adopt the proposed brief as the brand voice, clear the proposal.
    assertBillingWriteAllowed(org);
    const currentSettings = normalizeStoredOrgSettings(org.settings);
    const updatedSettings = { ...currentSettings, brandVoice: proposal.brief };

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        settings: JSON.parse(JSON.stringify(updatedSettings)) as object,
        voiceProposal: Prisma.DbNull,
      },
    });

    return NextResponse.json({
      settings: normalizeStoredOrgSettings(updated.settings),
      version: updated.updatedAt.toISOString(),
    });
  },
);
