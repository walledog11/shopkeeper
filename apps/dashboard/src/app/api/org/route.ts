import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { clerkClient, auth } from '@clerk/nextjs/server';
import type { Prisma } from '@prisma/client';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import stripe from '@/lib/billing/stripe';
import logger from '@/lib/server/logger';
import type { OrgSettings } from '@/types';

const ALLOWED_SETTINGS_UNSET = new Set([
  'alwaysDraftReply',
  'requireApprovalForActions',
  'maxRefundAmount',
  'blockCancellations',
  'blockCustomLineItems',
  'toolsEnabled.action',
  'toolsEnabled.communication',
  'toolsEnabled.internal',
  'toolsEnabled.read',
]);

function resolvePlanName(priceId: string | null): string {
  if (!priceId) return 'Free';
  if (priceId === process.env.PRICE_ID_STARTER) return 'Starter';
  if (priceId === process.env.PRICE_ID_PRO || priceId === process.env.PRICE_ID) return 'Pro';
  return 'Paid';
}

function toPrismaJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeSettingsPatch(
  currentSettings: Record<string, unknown>,
  newSettings: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...currentSettings };
  for (const [key, value] of Object.entries(newSettings)) {
    const currentValue = merged[key];
    merged[key] = isPlainObject(currentValue) && isPlainObject(value)
      ? { ...currentValue, ...value }
      : value;
  }
  return merged;
}

function deleteSettingPath(settings: Record<string, unknown>, path: string) {
  const [first, second] = path.split('.');
  if (!second) {
    delete settings[first];
    return;
  }

  const nested = settings[first];
  if (!isPlainObject(nested)) return;
  delete nested[second];
  if (Object.keys(nested).length === 0) delete settings[first];
}

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({
      id: org.id,
      name: org.name,
      settings: org.settings ?? {},
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
    const body = await request.json();
    const { name, settings: newSettings, settingsUnset, version } = body as {
      name?: string;
      settings?: Partial<OrgSettings>;
      settingsUnset?: unknown;
      version?: string;
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    if (version !== undefined && version !== org.updatedAt.toISOString()) {
      return NextResponse.json(
        {
          error: 'stale_version',
          message: 'Settings were updated elsewhere. Reload to see the latest values.',
          current: {
            id: org.id,
            name: org.name,
            settings: org.settings ?? {},
            version: org.updatedAt.toISOString(),
          },
        },
        { status: 409 },
      );
    }

    const unsetPaths = settingsUnset === undefined ? [] : settingsUnset;
    if (!Array.isArray(unsetPaths) || unsetPaths.some(path => typeof path !== 'string' || !ALLOWED_SETTINGS_UNSET.has(path))) {
      return NextResponse.json({ error: 'Invalid settingsUnset' }, { status: 400 });
    }

    const currentSettings = (org.settings as Record<string, unknown> | null) ?? {};
    const settingsPatch = newSettings === undefined
      ? {}
      : JSON.parse(JSON.stringify(newSettings)) as Record<string, unknown>;
    const updatedSettings = mergeSettingsPatch(currentSettings, settingsPatch);
    for (const path of unsetPaths) {
      deleteSettingPath(updatedSettings, path);
    }
    const settingsChanged = newSettings !== undefined || unsetPaths.length > 0;

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        ...(name !== undefined && { name }),
        ...(settingsChanged && {
          settings: toPrismaJsonObject(updatedSettings),
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
      settings: updated.settings ?? {},
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

    const body = await request.json().catch(() => ({}));
    const { confirmName } = body as { confirmName?: string };
    if (typeof confirmName !== 'string' || confirmName !== org.name) {
      return NextResponse.json({ error: 'Confirmation name does not match' }, { status: 400 });
    }

    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    const hasOtherWorkspace = memberships.data.some(m => m.organization.id !== org.clerkOrgId);
    if (!hasOtherWorkspace) {
      return NextResponse.json(
        {
          error: 'last_workspace',
          message: 'This is your only workspace. Create another workspace first, or delete your account from Settings → Account to leave Clerk.',
        },
        { status: 409 },
      );
    }

    if (org.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(org.stripeSubscriptionId);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== 'resource_missing') {
          logger.error({ err, orgId: org.id }, '[Org DELETE] Failed to cancel Stripe subscription');
          throw err;
        }
      }
    }

    await client.organizations.deleteOrganization(org.clerkOrgId);

    await db.organization.deleteMany({ where: { id: org.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Org DELETE', 'Failed to delete workspace');
  }
}
