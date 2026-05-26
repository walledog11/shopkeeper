import { auth, clerkClient } from "@clerk/nextjs/server";
import logger from "@/lib/server/logger";
import type { ApproverIdentity } from "@/lib/agent/api/plan-execution";

function bestDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  username?: string | null;
  emailAddresses?: { emailAddress: string }[];
}): string | null {
  const composed = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  if (user.fullName?.trim()) return user.fullName.trim();
  if (user.username?.trim()) return user.username.trim();
  return user.emailAddresses?.[0]?.emailAddress ?? null;
}

export async function resolveSessionApprover(): Promise<ApproverIdentity | undefined> {
  const { userId } = await auth();
  if (!userId) return undefined;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return { clerkUserId: userId, displayName: bestDisplayName(user) };
  } catch (err) {
    logger.warn({ err, userId }, "[agent] failed to resolve approver display name");
    return { clerkUserId: userId, displayName: null };
  }
}

export async function resolveClerkUserApprover(userId: string | null | undefined): Promise<ApproverIdentity | undefined> {
  if (!userId) return undefined;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return { clerkUserId: userId, displayName: bestDisplayName(user) };
  } catch (err) {
    logger.warn({ err, userId }, "[agent] failed to resolve approver display name");
    return { clerkUserId: userId, displayName: null };
  }
}
