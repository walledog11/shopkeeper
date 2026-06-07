import { db } from "@shopkeeper/db";
import { NotFoundError } from "@/lib/api/errors";
import { getDashboardPlatformId, getOrCreateDashboardCustomer } from "@/lib/agent/api/auth";

const SESSION_LIMIT = 50;
const MESSAGE_LIMIT = 100;

export interface DashboardAgentSessionListItem {
  id: string;
  createdAt: Date;
  preview: string;
}

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

export async function listDashboardAgentSessions(orgId: string, userId: string): Promise<DashboardAgentSessionListItem[]> {
  const customer = await findDashboardCustomer(orgId, userId);
  if (!customer) {
    return [];
  }

  const threads = await db.thread.findMany({
    where: {
      organizationId: orgId,
      customerId: customer.id,
      channelType: "dashboard_agent",
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: SESSION_LIMIT,
    select: {
      id: true,
      createdAt: true,
      messages: {
        where: { senderType: "customer" },
        orderBy: { sentAt: "asc" },
        take: 1,
        select: { contentText: true },
      },
    },
  });

  return threads.map((thread) => {
    const raw = thread.messages[0]?.contentText ?? "Empty session";
    const preview = raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
    return {
      id: thread.id,
      createdAt: thread.createdAt,
      preview,
    };
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

export async function archiveDashboardAgentSessions(orgId: string, userId: string) {
  const customer = await findDashboardCustomer(orgId, userId);
  if (!customer) {
    return;
  }

  await db.thread.updateMany({
    where: {
      organizationId: orgId,
      customerId: customer.id,
      channelType: "dashboard_agent",
      deletedAt: null,
    },
    data: { archivedAt: new Date() },
  });
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
