import { cache } from 'react';
import { productEventInsertId } from '@shopkeeper/analytics';
import { db } from '@shopkeeper/db';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ForbiddenError, NoActiveOrganizationError, UnauthorizedError } from '@/lib/api/errors';
import type { OrgSettings } from '@/types';
import { getE2EBypassOrg } from './e2e-org';
import { captureDashboardProductEvent } from './product-analytics';

const USE_CASE_PHRASES: Record<string, string> = {
  organize: 'organize support tickets',
  automate: 'automate responses to common questions',
  team: 'collaborate on a team inbox',
  analyze: 'track response times and customer satisfaction',
};

const TEAM_SIZE_PHRASES: Record<string, string> = {
  solo: 'Solo merchant',
  small: 'Small team (2–10 people)',
  mid: 'Mid-sized team (11–50 people)',
  large: 'Larger team (51+ people)',
};

function composeAiContext(useCases: unknown, teamSize: unknown): string {
  const cases = Array.isArray(useCases)
    ? useCases.filter((c): c is string => typeof c === 'string')
    : [];
  const team = typeof teamSize === 'string' ? teamSize : null;

  const teamPhrase = team && TEAM_SIZE_PHRASES[team] ? TEAM_SIZE_PHRASES[team] : null;
  const casePhrases = cases.flatMap(c => USE_CASE_PHRASES[c] ? [USE_CASE_PHRASES[c]] : []);

  if (!teamPhrase && casePhrases.length === 0) return '';

  const subject = teamPhrase ?? 'Team';
  if (casePhrases.length === 0) return `${subject} using Shopkeeper for customer support.`;

  const list =
    casePhrases.length === 1
      ? casePhrases[0]
      : casePhrases.length === 2
        ? `${casePhrases[0]} and ${casePhrases[1]}`
        : `${casePhrases.slice(0, -1).join(', ')}, and ${casePhrases[casePhrases.length - 1]}`;

  return `${subject} using Shopkeeper to ${list}.`;
}

/**
 * Looks up the Organization for the currently active Clerk organization and
 * the signed-in user's member record in it. Creates either on first use.
 */
export const getOrCreateOrg = cache(async () => {
  const e2eOrg = await getE2EBypassOrg();
  if (e2eOrg) return e2eOrg;

  const { userId, orgId } = await auth();

  if (!userId) throw new UnauthorizedError();
  if (!orgId) throw new NoActiveOrganizationError();

  const org = await findOrProvisionOrg(orgId, userId);
  await recordSessionMember(org, orgId, userId);
  return org;
});

/**
 * OrgMember mirrors Clerk membership: agent requests and approvals refuse a
 * user without one, and Clerk's webhook deletes it when the membership ends.
 * Nothing else creates it for a member who never linked a phone or used the
 * agent chat, so the first signed-in request does, once Clerk confirms the
 * membership — a session token can outlive a removal by about a minute.
 */
async function recordSessionMember(
  org: { id: string; lifecycleStatus: string },
  clerkOrgId: string,
  clerkUserId: string,
) {
  const existing = await db.orgMember.findUnique({
    where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId } },
    select: { id: true },
  });
  if (existing || org.lifecycleStatus !== 'active') return;

  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    userId: [clerkUserId],
  });
  if (!data.some(membership => membership.publicUserData?.userId === clerkUserId)) {
    throw new ForbiddenError('You are no longer a member of this workspace.');
  }
  await db.orgMember.createMany({
    data: [{ organizationId: org.id, clerkUserId }],
    skipDuplicates: true,
  });
}

async function findOrProvisionOrg(orgId: string, userId: string) {
  const existing = await db.organization.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (existing) return existing;

  // First time this Clerk org is seen — provision it in our DB
  const client = await clerkClient();
  const [clerkOrg, clerkUser] = await Promise.all([
    client.organizations.getOrganization({ organizationId: orgId }),
    // Welcome metadata is best-effort; never block org creation on it.
    client.users.getUser(userId).catch(() => null),
  ]);

  const meta = (clerkUser?.unsafeMetadata ?? {}) as Record<string, unknown>;
  const aiContext = composeAiContext(meta.useCases, meta.teamSize);

  const settings: Partial<OrgSettings> = aiContext ? { aiContext } : {};

  try {
    const created = await db.organization.create({
      data: {
        clerkOrgId: orgId,
        name: clerkOrg.name,
        settings: JSON.parse(JSON.stringify(settings)),
      },
    });
    await captureDashboardProductEvent({
      event: 'workspace_created',
      organizationId: created.id,
      source: 'dashboard',
      insertId: productEventInsertId.workspaceCreated(created.id),
    });
    return created;
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err;
    return db.organization.findUniqueOrThrow({ where: { clerkOrgId: orgId } });
  }
}
