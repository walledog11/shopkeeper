import { db } from "@clerk/db";
import { BadRequestError, NotFoundError } from "@/lib/api-errors";

type DashboardCustomerClient = Pick<typeof db, "customer">;

export function getDashboardPlatformId(userId: string): string {
  return `dashboard:${userId}`;
}

export async function getOrCreateDashboardCustomer(
  orgId: string,
  userId: string,
  client: DashboardCustomerClient = db,
) {
  return client.customer.upsert({
    where: {
      organizationId_platformId: {
        organizationId: orgId,
        platformId: getDashboardPlatformId(userId),
      },
    },
    update: {},
    create: {
      organizationId: orgId,
      platformId: getDashboardPlatformId(userId),
    },
  });
}

export async function requireOrgThread(threadId: string, orgId: string) {
  const thread = await db.thread.findFirst({
    where: {
      id: threadId,
      organizationId: orgId,
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      channelType: true,
      customerId: true,
      aiSummary: true,
      cachedPlanMessageId: true,
      cachedPlan: true,
      messages: {
        where: { senderType: "customer" },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!thread) {
    throw new NotFoundError("Thread not found");
  }

  return thread;
}

export function requireTrimmedInstruction(instruction: unknown): string {
  if (typeof instruction !== "string" || !instruction.trim()) {
    throw new BadRequestError("Validation failed", [
      { code: "required", field: "instruction", message: "Instruction is required" },
    ]);
  }

  const trimmed = instruction.trim();
  if (trimmed.length > 2000) {
    throw new BadRequestError("Validation failed", [
      { code: "too_long", field: "instruction", message: "Instruction must be 2000 characters or fewer" },
    ]);
  }

  return trimmed;
}
