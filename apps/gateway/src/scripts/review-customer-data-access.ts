/**
 * The weekly review of who read customer data (runbook *Customer data access
 * review*). Per workspace it lists each person and ops script with what they
 * opened, then what is worth a look: every ops script run, every export, anyone
 * who opened more than `--bulk` tickets or customers in one day, and anyone who
 * read in more than one workspace. Read-only; it prints ids and counts, never
 * customer details.
 *
 *   railway run --service shopkeeper --environment production -- \
 *     npm run review:customer-data-access -- [--days 7] [--bulk 200]
 * Needs DATABASE_URL.
 */
import { parseArgs } from 'node:util';
import { CUSTOMER_DATA_ACCESS_RETENTION_DAYS, db } from '@shopkeeper/db';

const { values } = parseArgs({
  options: {
    days: { type: 'string' },
    bulk: { type: 'string' },
  },
});

interface ActorSummary {
  organization_id: string;
  actor_type: string;
  actor_id: string;
  reads: number;
  tickets: number;
  customers: number;
  exports: number;
  runs: number;
  last: Date;
}

interface BulkDay {
  organization_id: string;
  actor_id: string;
  day: Date;
  records: number;
}

const hour = (value: Date) => `${value.toISOString().slice(0, 13).replace('T', ' ')}:00 UTC`;

async function main(): Promise<void> {
  const days = Number(values.days ?? 7);
  const bulk = Number(values.bulk ?? 200);
  if (!Number.isInteger(days) || days < 1 || days > CUSTOMER_DATA_ACCESS_RETENTION_DAYS
    || !Number.isInteger(bulk) || bulk < 1) {
    throw new Error(`Usage: [--days 1-${CUSTOMER_DATA_ACCESS_RETENTION_DAYS}] [--bulk <tickets or customers a day>]`);
  }
  const since = new Date(Date.now() - days * 86_400_000);

  const actors = await db.$queryRaw<ActorSummary[]>`
    SELECT organization_id, actor_type, actor_id,
      COUNT(*)::int AS reads,
      (COUNT(DISTINCT resource_id) FILTER (WHERE resource = 'thread' AND resource_id <> ''))::int AS tickets,
      (COUNT(DISTINCT resource_id) FILTER (WHERE resource = 'customer' AND resource_id <> ''))::int AS customers,
      (COUNT(*) FILTER (WHERE resource = 'export'))::int AS exports,
      (COUNT(*) FILTER (WHERE resource = 'script'))::int AS runs,
      MAX(accessed_hour) AS last
    FROM customer_data_access
    WHERE accessed_hour >= ${since}
    GROUP BY organization_id, actor_type, actor_id
    ORDER BY organization_id, reads DESC`;
  const bulkDays = await db.$queryRaw<BulkDay[]>`
    SELECT organization_id, actor_id, date_trunc('day', accessed_hour) AS day,
      COUNT(DISTINCT resource_id)::int AS records
    FROM customer_data_access
    WHERE accessed_hour >= ${since} AND resource IN ('thread', 'customer') AND resource_id <> ''
    GROUP BY organization_id, actor_id, day
    HAVING COUNT(DISTINCT resource_id) > ${bulk}
    ORDER BY day`;

  const organizations = await db.organization.findMany({
    where: { id: { in: [...new Set(actors.map(row => row.organization_id))] } },
    select: { id: true, name: true, clerkOrgId: true },
  });
  const workspace = new Map(organizations.map(org => [org.id, `${org.name} (${org.clerkOrgId})`]));
  const named = (organizationId: string) => workspace.get(organizationId) ?? `deleted workspace ${organizationId}`;

  console.log(`Customer data access over ${days} day${days === 1 ? '' : 's'}, from ${hour(since)}\n`);
  if (actors.length === 0) {
    console.log('Nobody read customer data in this window.');
    return;
  }

  let current: string | null = null;
  for (const row of actors) {
    if (row.organization_id !== current) {
      current = row.organization_id;
      console.log(named(current));
    }
    const detail = row.actor_type === 'script'
      ? `${row.runs} run${row.runs === 1 ? '' : 's'}`
      : `${row.reads} reads · ${row.tickets} tickets · ${row.customers} customers`
        + (row.exports > 0 ? ` · ${row.exports} export${row.exports === 1 ? '' : 's'}` : '');
    console.log(`  ${row.actor_type.padEnd(6)} ${row.actor_id}  ${detail} · last ${hour(row.last)}`);
  }

  const notes: string[] = [];
  for (const row of actors) {
    if (row.actor_type === 'script') notes.push(`Ops script ${row.actor_id} ran ${row.runs}× in ${named(row.organization_id)}`);
    if (row.exports > 0) notes.push(`${row.actor_id} exported data from ${named(row.organization_id)} (${row.exports}×)`);
  }
  for (const row of bulkDays) {
    notes.push(`${row.actor_id} opened ${row.records} tickets or customers in ${named(row.organization_id)} on ${row.day.toISOString().slice(0, 10)}`);
  }
  const workspacesByMember = new Map<string, number>();
  for (const row of actors) {
    if (row.actor_type === 'member') workspacesByMember.set(row.actor_id, (workspacesByMember.get(row.actor_id) ?? 0) + 1);
  }
  for (const [actorId, count] of workspacesByMember) {
    if (count > 1) notes.push(`${actorId} read customer data in ${count} workspaces`);
  }

  console.log(notes.length > 0 ? '\nWorth a look:' : '\nNothing stands out.');
  for (const note of notes) console.log(`  - ${note}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
