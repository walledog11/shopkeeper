import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { normalizeStoredOrgSettings } from '@clerk/agent/settings';
import { clerkClient, auth } from '@clerk/nextjs/server';
import { getOrCreateOrg } from '@/lib/server/org';
import { BadRequestError, handleApiError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import {
  buildSettingsUpdate,
  hasVersionConflict,
  parseOrgPatchBody,
  versionConflictResponse,
} from './_lib/settings';
import {
  cancelWorkspaceSubscription,
  hasOtherWorkspace,
  LAST_WORKSPACE_MESSAGE,
  readWorkspaceDeleteConfirmation,
} from './_lib/delete-workspace';

function resolvePlanName(priceId: string | null): string {
  if (!priceId) return 'Free';
  if (priceId === process.env.PRICE_ID_STARTER) return 'Starter';
  if (priceId === process.env.PRICE_ID_PRO || priceId === process.env.PRICE_ID) return 'Pro';
  return 'Paid';
}

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({
      id: org.id,
      name: org.name,
      settings: normalizeStoredOrgSettings(org.settings),
      version: org.updatedAt.toISOString(),
      planName: resolvePlanName(org.stripePriceId),
      stripeStatus: org.stripeStatus,
      inboundEmailDomain: process.env.INBOUND_EMAIL_DOMAIN || 'mail.clerkapp.com',
    });
  } catch (error) {
    return handleApiError(error, 'Org GET', 'Failed to fetch org');
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    assertBillingWriteAllowed(org);
    const body = await request.json().catch(() => {
      throw new BadRequestError('Invalid JSON body');
    });
    const { name, settings: newSettings, settingsUnset, version } = parseOrgPatchBody(body);

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    const settingsUpdate = buildSettingsUpdate(org.settings, newSettings, settingsUnset);

    if (hasVersionConflict(version, org)) {
      return versionConflictResponse(org);
    }

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        ...(name !== undefined && { name }),
        ...(settingsUpdate.changed && {
          settings: settingsUpdate.settings,
        }),
      },
    });

    // Keep Clerk org name in sync so the sidebar switcher shows the same name
    if (name !== undefined) {
      const { orgId } = await auth();
      if (orgId) {
        const client = await clerkClient();
        await client.organizations.updateOrganization(orgId, { name });
      }
    }

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      settings: normalizeStoredOrgSettings(updated.settings),
      version: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, 'Org PATCH', 'Failed to update org');
  }
}

export async function DELETE(request: Request) {
  try {
    const { orgId, userId, orgRole } = await auth();
    if (!orgId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (orgRole !== 'org:admin') {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const org = await getOrCreateOrg();

    const confirmName = await readWorkspaceDeleteConfirmation(request);
    if (typeof confirmName !== 'string' || confirmName !== org.name) {
      return NextResponse.json({ error: 'Confirmation name does not match' }, { status: 400 });
    }

    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    if (!hasOtherWorkspace(memberships, org.clerkOrgId)) {
      return NextResponse.json(
        {
          error: 'last_workspace',
          message: LAST_WORKSPACE_MESSAGE,
        },
        { status: 409 },
      );
    }

    await cancelWorkspaceSubscription(org);
    await client.organizations.deleteOrganization(org.clerkOrgId);
    await db.organization.deleteMany({ where: { id: org.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Org DELETE', 'Failed to delete workspace');
  }
}
