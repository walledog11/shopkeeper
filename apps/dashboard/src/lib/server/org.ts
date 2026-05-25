import { db } from '@clerk/db';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NoActiveOrganizationError, UnauthorizedError } from '@/lib/api/errors';
import type { OrgSettings } from '@/types';
import { getE2EBypassOrg } from './e2e-org';

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
  const casePhrases = cases.map(c => USE_CASE_PHRASES[c]).filter(Boolean);

  if (!teamPhrase && casePhrases.length === 0) return '';

  const subject = teamPhrase ?? 'Team';
  if (casePhrases.length === 0) return `${subject} using Clerk for customer support.`;

  const list =
    casePhrases.length === 1
      ? casePhrases[0]
      : casePhrases.length === 2
        ? `${casePhrases[0]} and ${casePhrases[1]}`
        : `${casePhrases.slice(0, -1).join(', ')}, and ${casePhrases[casePhrases.length - 1]}`;

  return `${subject} using Clerk to ${list}.`;
}

/**
 * Looks up the Organization for the currently active Clerk organization.
 * Creates one on first use if it doesn't exist yet.
 */
export async function getOrCreateOrg() {
  const e2eOrg = await getE2EBypassOrg();
  if (e2eOrg) return e2eOrg;

  const { userId, orgId } = await auth();

  if (!userId) throw new UnauthorizedError();
  if (!orgId) throw new NoActiveOrganizationError();

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
    return await db.organization.create({
      data: {
        clerkOrgId: orgId,
        name: clerkOrg.name,
        settings: JSON.parse(JSON.stringify(settings)),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err;
    return db.organization.findUniqueOrThrow({ where: { clerkOrgId: orgId } });
  }
}
