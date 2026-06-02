import { NextResponse } from 'next/server';
import { db, Prisma, parseVoiceProposal } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import type { OrgSettings } from '@/types';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({ proposal: parseVoiceProposal(org.voiceProposal) });
  } catch (error) {
    return handleApiError(error, 'Voice proposal GET', 'Failed to fetch voice proposal');
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { action } = (await request.json()) as { action?: string };

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
    const currentSettings = (org.settings as Partial<OrgSettings> | null) ?? {};
    const updatedSettings = { ...currentSettings, brandVoice: proposal.brief };

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        settings: JSON.parse(JSON.stringify(updatedSettings)) as object,
        voiceProposal: Prisma.DbNull,
      },
    });

    return NextResponse.json({
      settings: updated.settings ?? {},
      version: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, 'Voice proposal POST', 'Failed to update voice proposal');
  }
}
