import { db } from "@shopkeeper/db";
import { memberOperatorKey } from "@shopkeeper/agent/internal-thread";

const MESSAGE_LIMIT = 100;

export interface OperatorTranscriptMessage {
  role: "user" | "agent";
  text: string;
}

// The tail of the merchant's durable operator thread — the same conversation
// their phone is having, which is the whole reason to open the panel. Read-only:
// the thread is created by the gateway on the first turn, so no member or thread
// here simply means nothing has been said yet.
export async function getOperatorTranscript(
  orgId: string,
  clerkUserId: string,
): Promise<OperatorTranscriptMessage[]> {
  const member = await db.orgMember.findUnique({
    where: { organizationId_clerkUserId: { organizationId: orgId, clerkUserId } },
    select: { id: true },
  });
  if (!member) return [];

  const thread = await db.thread.findFirst({
    where: {
      organizationId: orgId,
      operatorKey: memberOperatorKey(member.id),
      deletedAt: null,
    },
    select: {
      messages: {
        where: { senderType: { in: ["customer", "agent"] }, deletedAt: null },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: MESSAGE_LIMIT,
        select: { senderType: true, contentText: true },
      },
    },
  });
  if (!thread) return [];

  // Newest-first above so a long-running thread yields its most recent window,
  // not its oldest; the panel renders oldest-first.
  return thread.messages
    .reverse()
    .map((message) => ({
      role: message.senderType === "customer" ? "user" as const : "agent" as const,
      text: message.contentText ?? "",
    }));
}
