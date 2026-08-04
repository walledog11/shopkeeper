import { db } from "@shopkeeper/db";
import { NotFoundError } from "@/lib/api/errors";
import { getDashboardPlatformId, getOrCreateDashboardCustomer } from "@shopkeeper/agent/thread-auth";

const MESSAGE_LIMIT = 100;

export interface DashboardAgentSessionTranscript {
  id: string;
  createdAt: Date;
  messages: Array<{ role: "user" | "agent"; text: string }>;
}

async function findDashboardCustomer(orgId: string, userId: string) {
  return db.customer.findUnique({
    where: {
      organizationId_platformId: {
        organizationId: orgId,
        platformId: getDashboardPlatformId(userId),
      },
    },
    select: { id: true },
  });
}

export async function getDashboardAgentSession(orgId: string, userId: string, sessionId: string): Promise<DashboardAgentSessionTranscript> {
  const customer = await findDashboardCustomer(orgId, userId);
  if (!customer) {
    throw new NotFoundError("Session not found");
  }

  const thread = await db.thread.findFirst({
    where: {
      id: sessionId,
      organizationId: orgId,
      customerId: customer.id,
      channelType: "dashboard_agent",
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      createdAt: true,
      messages: {
        where: { senderType: { in: ["customer", "agent"] } },
        orderBy: { sentAt: "asc" },
        take: MESSAGE_LIMIT,
        select: { senderType: true, contentText: true },
      },
    },
  });

  if (!thread) {
    throw new NotFoundError("Session not found");
  }

  return {
    id: thread.id,
    createdAt: thread.createdAt,
    messages: thread.messages.map((message) => ({
      role: message.senderType === "customer" ? "user" : "agent",
      text: message.contentText ?? "",
    })),
  };
}

export async function resolveDashboardAgentSession(orgId: string, userId: string, sessionId: string) {
  const customer = await findDashboardCustomer(orgId, userId);
  if (!customer) {
    throw new NotFoundError("Session not found");
  }

  const thread = await db.thread.findFirst({
    where: {
      id: sessionId,
      organizationId: orgId,
      customerId: customer.id,
      channelType: "dashboard_agent",
      archivedAt: null,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!thread) {
    throw new NotFoundError("Session not found");
  }

  return thread;
}

export async function createDashboardAgentSession(orgId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const customer = await getOrCreateDashboardCustomer(orgId, userId, tx);

    await tx.thread.updateMany({
      where: {
        organizationId: orgId,
        customerId: customer.id,
        channelType: "dashboard_agent",
        status: "open",
        archivedAt: null,
        deletedAt: null,
      },
      data: { status: "closed" },
    });

    return tx.thread.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        channelType: "dashboard_agent",
        status: "open",
        tag: "Dashboard Session",
      },
      select: { id: true },
    });
  });
}
