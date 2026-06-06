import { Prisma, ThreadFilterStatus } from "@clerk/db"
import type { Prisma as PrismaTypes } from "@prisma/client"
import { CHANNEL_TYPE } from "@clerk/agent/thread-constants"

export function canonicalInboxThreadWhere(organizationId: string): PrismaTypes.ThreadWhereInput {
  return {
    organizationId,
    channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
    archivedAt: null,
    deletedAt: null,
    filterStatus: { not: ThreadFilterStatus.filtered },
  }
}

// Raw home-summary queries consistently alias the threads table as `t`.
export function canonicalInboxThreadSql(organizationId: string) {
  return Prisma.sql`
    t.organization_id = ${organizationId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.archived_at IS NULL
    AND t.deleted_at IS NULL
    AND t.filter_status <> 'filtered'
  `
}
