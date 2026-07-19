import type { ApproverIdentity } from '@shopkeeper/agent/plan-execution';
import logger from '../logger.js';
import { fetchWithDeadline } from './request-deadline.js';

interface ClerkUserPayload {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email_addresses?: { email_address: string }[];
}

function bestDisplayName(user: ClerkUserPayload): string | null {
  const composed = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  if (user.username?.trim()) return user.username.trim();
  return user.email_addresses?.[0]?.email_address ?? null;
}

export async function resolveClerkUserApprover(
  userId: string | null | undefined,
): Promise<ApproverIdentity | undefined> {
  if (!userId) return undefined;

  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) {
    return { clerkUserId: userId, displayName: null };
  }

  try {
    const response = await fetchWithDeadline(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    }, {
      provider: 'clerk',
      operation: 'approver lookup',
    });
    if (!response.ok) {
      logger.warn({ userId, status: response.status }, '[clerk] failed to resolve approver display name');
      return { clerkUserId: userId, displayName: null };
    }

    const user = await response.json() as ClerkUserPayload;
    return { clerkUserId: userId, displayName: bestDisplayName(user) };
  } catch (err) {
    logger.warn({ err, userId }, '[clerk] failed to resolve approver display name');
    return { clerkUserId: userId, displayName: null };
  }
}
