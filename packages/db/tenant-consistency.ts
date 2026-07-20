import type { PrismaClient } from "@prisma/client";

type TenantAuditDb = Pick<PrismaClient, "$queryRawUnsafe">;

type RawMismatchRow = {
  total: number | bigint;
  childId: string;
  childOrganizationId: string;
  parentId: string | null;
  parentOrganizationId: string | null;
};

export interface TenantConsistencyMismatch {
  childId: string;
  childOrganizationId: string;
  parentId: string | null;
  parentOrganizationId: string | null;
}

export interface TenantConsistencyCheckResult {
  total: number;
  samples: TenantConsistencyMismatch[];
}

export interface TenantConsistencyReport {
  safeToConstrain: boolean;
  totalMismatches: number;
  sampleLimit: number;
  checks: Record<string, TenantConsistencyCheckResult>;
}

const TENANT_CONSISTENCY_QUERIES = [
  {
    name: "thread_customer",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             t.id::text AS "childId",
             t.organization_id::text AS "childOrganizationId",
             c.id::text AS "parentId",
             c.organization_id::text AS "parentOrganizationId"
      FROM threads t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE c.id IS NULL OR c.organization_id <> t.organization_id
      ORDER BY t.id
      LIMIT $1
    `,
  },
  {
    name: "thread_reply_integration",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             t.id::text AS "childId",
             t.organization_id::text AS "childOrganizationId",
             i.id::text AS "parentId",
             i.organization_id::text AS "parentOrganizationId"
      FROM threads t
      LEFT JOIN integrations i ON i.id = t.reply_integration_id
      WHERE t.reply_integration_id IS NOT NULL
        AND (i.id IS NULL OR i.organization_id <> t.organization_id)
      ORDER BY t.id
      LIMIT $1
    `,
  },
  {
    name: "thread_cached_plan_message",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             t.id::text AS "childId",
             t.organization_id::text AS "childOrganizationId",
             m.id::text AS "parentId",
             m.organization_id::text AS "parentOrganizationId"
      FROM threads t
      LEFT JOIN messages m ON m.id = t.cached_plan_message_id
      WHERE t.cached_plan_message_id IS NOT NULL
        AND (
          m.id IS NULL
          OR m.organization_id <> t.organization_id
          OR m.thread_id <> t.id
        )
      ORDER BY t.id
      LIMIT $1
    `,
  },
  {
    name: "message_thread",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             m.id::text AS "childId",
             m.organization_id::text AS "childOrganizationId",
             t.id::text AS "parentId",
             t.organization_id::text AS "parentOrganizationId"
      FROM messages m
      LEFT JOIN threads t ON t.id = m.thread_id
      WHERE t.id IS NULL OR t.organization_id <> m.organization_id
      ORDER BY m.id
      LIMIT $1
    `,
  },
  {
    name: "message_integration",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             m.id::text AS "childId",
             m.organization_id::text AS "childOrganizationId",
             i.id::text AS "parentId",
             i.organization_id::text AS "parentOrganizationId"
      FROM messages m
      LEFT JOIN integrations i ON i.id = m.integration_id
      WHERE m.integration_id IS NOT NULL
        AND (i.id IS NULL OR i.organization_id <> m.organization_id)
      ORDER BY m.id
      LIMIT $1
    `,
  },
  {
    name: "agent_action_thread",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             a.id::text AS "childId",
             a.organization_id::text AS "childOrganizationId",
             t.id::text AS "parentId",
             t.organization_id::text AS "parentOrganizationId"
      FROM agent_actions a
      LEFT JOIN threads t ON t.id = a.thread_id
      WHERE a.thread_id IS NOT NULL
        AND (t.id IS NULL OR t.organization_id <> a.organization_id)
      ORDER BY a.id
      LIMIT $1
    `,
  },
  {
    name: "agent_action_customer",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             a.id::text AS "childId",
             a.organization_id::text AS "childOrganizationId",
             c.id::text AS "parentId",
             c.organization_id::text AS "parentOrganizationId"
      FROM agent_actions a
      LEFT JOIN customers c ON c.id = a.customer_id
      WHERE a.customer_id IS NOT NULL
        AND (c.id IS NULL OR c.organization_id <> a.organization_id)
      ORDER BY a.id
      LIMIT $1
    `,
  },
  {
    name: "agent_action_execution",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             a.id::text AS "childId",
             a.organization_id::text AS "childOrganizationId",
             p.id::text AS "parentId",
             p.organization_id::text AS "parentOrganizationId"
      FROM agent_actions a
      LEFT JOIN plan_executions p ON p.id = a.execution_id
      WHERE a.execution_id IS NOT NULL
        AND (p.id IS NULL OR p.organization_id <> a.organization_id)
      ORDER BY a.id
      LIMIT $1
    `,
  },
  {
    name: "plan_execution_thread",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             p.id::text AS "childId",
             p.organization_id::text AS "childOrganizationId",
             t.id::text AS "parentId",
             t.organization_id::text AS "parentOrganizationId"
      FROM plan_executions p
      LEFT JOIN threads t ON t.id = p.thread_id
      WHERE p.thread_id IS NOT NULL
        AND (t.id IS NULL OR t.organization_id <> p.organization_id)
      ORDER BY p.id
      LIMIT $1
    `,
  },
  {
    name: "plan_execution_source_message",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             p.id::text AS "childId",
             p.organization_id::text AS "childOrganizationId",
             m.id::text AS "parentId",
             m.organization_id::text AS "parentOrganizationId"
      FROM plan_executions p
      LEFT JOIN messages m ON m.id = p.source_message_id
      WHERE p.source_message_id IS NOT NULL
        AND (
          m.id IS NULL
          OR m.organization_id <> p.organization_id
          OR (p.thread_id IS NOT NULL AND m.thread_id <> p.thread_id)
        )
      ORDER BY p.id
      LIMIT $1
    `,
  },
  {
    name: "kb_article_knowledge_base",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             a.id::text AS "childId",
             a.organization_id::text AS "childOrganizationId",
             k.id::text AS "parentId",
             k.organization_id::text AS "parentOrganizationId"
      FROM kb_articles a
      LEFT JOIN knowledge_bases k ON k.id = a.knowledge_base_id
      WHERE k.id IS NULL OR k.organization_id <> a.organization_id
      ORDER BY a.id
      LIMIT $1
    `,
  },
  {
    name: "kb_citation_article",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             c.id::text AS "childId",
             c.organization_id::text AS "childOrganizationId",
             a.id::text AS "parentId",
             a.organization_id::text AS "parentOrganizationId"
      FROM kb_citations c
      LEFT JOIN kb_articles a ON a.id = c.kb_article_id
      WHERE a.id IS NULL OR a.organization_id <> c.organization_id
      ORDER BY c.id
      LIMIT $1
    `,
  },
  {
    name: "kb_citation_thread",
    sql: `
      SELECT COUNT(*) OVER()::int AS total,
             c.id::text AS "childId",
             c.organization_id::text AS "childOrganizationId",
             t.id::text AS "parentId",
             t.organization_id::text AS "parentOrganizationId"
      FROM kb_citations c
      LEFT JOIN threads t ON t.id = c.thread_id
      WHERE c.thread_id IS NOT NULL
        AND (t.id IS NULL OR t.organization_id <> c.organization_id)
      ORDER BY c.id
      LIMIT $1
    `,
  },
] as const;

export async function computeTenantConsistencyReport(
  auditDb: TenantAuditDb,
  options: { sampleLimit?: number } = {},
): Promise<TenantConsistencyReport> {
  const sampleLimit = options.sampleLimit ?? 50;
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 1_000) {
    throw new Error("sampleLimit must be an integer between 1 and 1000");
  }

  const results = await Promise.all(TENANT_CONSISTENCY_QUERIES.map(async (check) => {
    const rows = await auditDb.$queryRawUnsafe<RawMismatchRow[]>(check.sql, sampleLimit);
    const total = Number(rows[0]?.total ?? 0);
    return [check.name, {
      total,
      samples: rows.map(({ childId, childOrganizationId, parentId, parentOrganizationId }) => ({
        childId,
        childOrganizationId,
        parentId,
        parentOrganizationId,
      })),
    }] as const;
  }));

  const checks: Record<string, TenantConsistencyCheckResult> = Object.fromEntries(results);
  const totalMismatches = Object.values(checks).reduce((sum, check) => sum + check.total, 0);
  return {
    safeToConstrain: totalMismatches === 0,
    totalMismatches,
    sampleLimit,
    checks,
  };
}
