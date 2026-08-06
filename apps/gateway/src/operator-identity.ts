/**
 * Who the operator is, independent of what they texted from.
 *
 * Every transport arrives with a Clerk user id — Telegram and iMessage resolve it
 * from their binding, the dashboard has it from the session — and that maps to one
 * OrgMember, which is the key for the durable operator thread and the pending
 * ledger alike.
 */

import { db } from '@shopkeeper/db';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';

// Upserts because a Clerk user can reach the Concierge before ever binding a
// phone, and OrgMember rows are otherwise only created by the bind routes.
export async function resolveOperatorMemberKey(
  organizationId: string,
  clerkUserId: string,
): Promise<string> {
  const member = await db.orgMember.upsert({
    where: { organizationId_clerkUserId: { organizationId, clerkUserId } },
    update: {},
    create: { organizationId, clerkUserId },
    select: { id: true },
  });
  return memberOperatorKey(member.id);
}
