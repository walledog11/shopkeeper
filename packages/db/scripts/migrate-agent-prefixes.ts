/**
 * One-shot migration: rewrite legacy `__clerk_agent__` / `__clerk_agent_note__`
 * message prefixes to `__shopkeeper_agent__` / `__shopkeeper_agent_note__`.
 *
 * Run after Phase 3 dual-read parsers are deployed. Idempotent — rows already
 * using the new prefixes are untouched.
 *
 * Usage:
 *   DATABASE_URL=<url> node --import tsx \
 *     packages/db/scripts/migrate-agent-prefixes.ts [--dry-run] [--org <orgId>]
 */
import { db } from '../index.js';

// Kept in sync with packages/agent/src/tools/turn-content.ts and thread-constants.ts
const LEGACY_AGENT_TURN_PREFIX = '__clerk_agent__';
const AGENT_TURN_PREFIX = '__shopkeeper_agent__';
const LEGACY_AGENT_NOTE_PREFIX = '__clerk_agent_note__';
const AGENT_NOTE_PREFIX = '__shopkeeper_agent_note__';

interface PrefixMigration {
  label: string;
  legacyPrefix: string;
  newPrefix: string;
}

const PREFIX_MIGRATIONS: PrefixMigration[] = [
  {
    label: 'agent_turn',
    legacyPrefix: LEGACY_AGENT_TURN_PREFIX,
    newPrefix: AGENT_TURN_PREFIX,
  },
  {
    label: 'agent_note',
    legacyPrefix: LEGACY_AGENT_NOTE_PREFIX,
    newPrefix: AGENT_NOTE_PREFIX,
  },
];

interface CliArgs {
  dryRun: boolean;
  orgId: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let orgId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--org') {
      orgId = argv[++i] ?? null;
      if (!orgId) throw new Error('--org requires a value');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dryRun, orgId };
}

async function countLegacyRows(legacyPrefix: string, orgId: string | null): Promise<number> {
  return db.message.count({
    where: {
      contentText: { startsWith: legacyPrefix },
      ...(orgId ? { thread: { organizationId: orgId } } : {}),
    },
  });
}

async function migratePrefix(
  migration: PrefixMigration,
  orgId: string | null,
  dryRun: boolean,
): Promise<number> {
  const suffixStart = migration.legacyPrefix.length + 1;

  if (dryRun) {
    return countLegacyRows(migration.legacyPrefix, orgId);
  }

  if (orgId) {
    const result = await db.$executeRaw`
      UPDATE messages AS m
      SET content_text = ${migration.newPrefix} || SUBSTRING(m.content_text FROM ${suffixStart})
      FROM threads AS t
      WHERE m.thread_id = t.id
        AND t.organization_id = ${orgId}::uuid
        AND m.content_text LIKE ${`${migration.legacyPrefix}%`}
    `;
    return Number(result);
  }

  const result = await db.$executeRaw`
    UPDATE messages AS m
    SET content_text = ${migration.newPrefix} || SUBSTRING(m.content_text FROM ${suffixStart})
    WHERE m.content_text LIKE ${`${migration.legacyPrefix}%`}
  `;
  return Number(result);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[migrate-agent-prefixes] starting${args.dryRun ? ' (dry-run)' : ''}`
    + `${args.orgId ? ` org=${args.orgId}` : ''}`,
  );

  let totalMigrated = 0;

  for (const migration of PREFIX_MIGRATIONS) {
    const count = await migratePrefix(migration, args.orgId, args.dryRun);
    totalMigrated += count;
    console.log(
      `[migrate-agent-prefixes] ${migration.label}: `
      + `${args.dryRun ? 'would migrate' : 'migrated'} ${count} row(s)`,
    );
  }

  console.log(
    `[migrate-agent-prefixes] done — `
    + `${args.dryRun ? 'would migrate' : 'migrated'} ${totalMigrated} row(s) total`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('[migrate-agent-prefixes] failed', err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
