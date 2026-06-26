import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@shopkeeper/db';
import { normalizeStoredOrgSettings } from '@shopkeeper/agent/settings';
import { clerkClient, auth } from '@clerk/nextjs/server';
import { getOrCreateOrg } from '@/lib/server/org';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withClerkOrgRoute } from '@/lib/api/clerk-route';
import { withOrgRoute } from '@/lib/api/route';
import { getInboundEmailDomain, resolveBillingPlanName } from '@/lib/env';
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

export const GET = withOrgRoute(
  { context: 'Org GET', errorMessage: 'Failed to fetch org' },
  async ({ org }) => {
    return NextResponse.json({
      id: org.id,
      name: org.name,
      settings: normalizeStoredOrgSettings(org.settings),
      version: org.updatedAt.toISOString(),
      planName: resolveBillingPlanName(org.stripePriceId),
      stripeStatus: org.stripeStatus,
      inboundEmailDomain: getInboundEmailDomain(),
    });
  },
);

export const PATCH = withOrgRoute(
  {
    context: 'Org PATCH',
    errorMessage: 'Failed to update org',
    requireBillingWriteAllowed: true,
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request, {
      malformed: { message: 'Invalid JSON body' },
      empty: { message: 'Invalid JSON body' },
      object: { message: 'Invalid request body' },
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

    if (settingsUpdate.changed) {
      revalidatePath('/dashboard', 'layout');
      revalidatePath('/onboarding', 'layout');
    }

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
  },
);

export const DELETE = withClerkOrgRoute(
  { context: 'Org DELETE', errorMessage: 'Failed to delete workspace', requireAdmin: true },
  async ({ auth: clerkAuth, request }) => {
    const org = await getOrCreateOrg();

    const confirmName = await readWorkspaceDeleteConfirmation(request);
    if (typeof confirmName !== 'string' || confirmName !== org.name) {
      return NextResponse.json({ error: 'Confirmation name does not match' }, { status: 400 });
    }

    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId: clerkAuth.userId as string });
    if (!hasOtherWorkspace(memberships, org.clerkOrgId)) {
      return NextResponse.json(
        {
          error: 'last_workspace',
          message: LAST_WORKSPACE_MESSAGE,
        },
        { status: 409 },
      );
    }

    await Promise.all([
      cancelWorkspaceSubscription(org),
      client.organizations.deleteOrganization(org.clerkOrgId),
    ]);
    await db.organization.deleteMany({ where: { id: org.id } });

    return new NextResponse(null, { status: 204 });
  },
);
