import { Prisma, ThreadFilterStatus } from "@shopkeeper/db";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { CHANNEL_TYPE } from "./thread-constants.js";

// The canonical "this thread belongs in the merchant's support inbox" predicate,
// shared by the dashboard inbox/home queries and the gateway operator inbox
// tools. Note it says nothing about `status` — callers add their own lifecycle
// filter on top (the inbox lists `open`; stats count every status in a window).
export function canonicalInboxThreadWhere(organizationId: string): PrismaTypes.ThreadWhereInput {
  return {
    organizationId,
    channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
    archivedAt: null,
    deletedAt: null,
    filterStatus: { not: ThreadFilterStatus.filtered },
  };
}

// Raw-SQL twin of canonicalInboxThreadWhere. Consuming queries alias the threads
// table as `t`.
export function canonicalInboxThreadSql(organizationId: string) {
  return Prisma.sql`
    t.organization_id = ${organizationId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.archived_at IS NULL
    AND t.deleted_at IS NULL
    AND t.filter_status <> 'filtered'
  `;
}
