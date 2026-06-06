import { requireJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';

const ALLOWED_ROLES = ['org:admin', 'org:member'] as const;

export type TeamInviteRole = typeof ALLOWED_ROLES[number];

export function parseTeamInviteBody(body: unknown): { emailAddress: string; role: TeamInviteRole } {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  if (typeof candidate.emailAddress !== 'string' || !candidate.emailAddress.trim()) {
    throw new BadRequestError('Email required');
  }

  const role = ALLOWED_ROLES.includes(candidate.role as TeamInviteRole)
    ? candidate.role as TeamInviteRole
    : 'org:member';

  return {
    emailAddress: candidate.emailAddress.trim(),
    role,
  };
}
