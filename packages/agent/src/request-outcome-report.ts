import { Prisma, db } from "@shopkeeper/db";

export interface RequestOutcomeReportRow {
  requestTag: string;
  volume: number;
  autoResolved: number;
  merchantApproved: number;
  merchantInput: number;
  escalated: number;
  failed: number;
  invalidPlan: number;
  namespaceMiss: number;
}

export interface RequestOutcomeReportParams {
  orgId: string;
  from: Date;
  to: Date;
}

export async function queryRequestOutcomeReport(
  params: RequestOutcomeReportParams,
): Promise<RequestOutcomeReportRow[]> {
  const rows = await db.$queryRaw<Array<{
    requestTag: string;
    volume: bigint;
    autoResolved: bigint;
    merchantApproved: bigint;
    merchantInput: bigint;
    escalated: bigint;
    failed: bigint;
    invalidPlan: bigint;
    namespaceMiss: bigint;
  }>>(Prisma.sql`
    SELECT
      COALESCE(request_tag, '(null)') AS "requestTag",
      COUNT(*)::bigint AS volume,
      COUNT(*) FILTER (WHERE terminal_resolution = 'auto_resolved')::bigint AS "autoResolved",
      COUNT(*) FILTER (WHERE terminal_resolution = 'merchant_approved')::bigint AS "merchantApproved",
      COUNT(*) FILTER (
        WHERE terminal_resolution = 'merchant_input'
          OR merchant_input_requested_at IS NOT NULL
      )::bigint AS "merchantInput",
      COUNT(*) FILTER (WHERE terminal_resolution = 'escalated')::bigint AS "escalated",
      COUNT(*) FILTER (WHERE terminal_resolution = 'failed')::bigint AS "failed",
      COUNT(*) FILTER (WHERE terminal_resolution = 'invalid_plan')::bigint AS "invalidPlan",
      COUNT(*) FILTER (WHERE namespace_miss = true)::bigint AS "namespaceMiss"
    FROM request_episode_outcomes
    WHERE organization_id = ${params.orgId}::uuid
      AND created_at >= ${params.from}
      AND created_at <= ${params.to}
    GROUP BY 1
    ORDER BY volume DESC, "requestTag" ASC
  `);

  return rows.map((row) => ({
    requestTag: row.requestTag,
    volume: Number(row.volume),
    autoResolved: Number(row.autoResolved),
    merchantApproved: Number(row.merchantApproved),
    merchantInput: Number(row.merchantInput),
    escalated: Number(row.escalated),
    failed: Number(row.failed),
    invalidPlan: Number(row.invalidPlan),
    namespaceMiss: Number(row.namespaceMiss),
  }));
}
