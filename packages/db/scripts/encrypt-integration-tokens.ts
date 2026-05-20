/**
 * One-shot backfill: encrypt any legacy plaintext access/refresh tokens in the
 * `integrations` table. Idempotent — rows already prefixed with `enc:v1:` are
 * skipped. Run with:
 *
 *   TOKEN_ENCRYPTION_KEY=<key> DATABASE_URL=<url> \
 *     node --import tsx packages/db/scripts/encrypt-integration-tokens.ts
 */
import { db, encryptToken, isEncrypted } from '../index.js';

type Row = { id: string; accessToken: string | null; refreshToken: string | null };

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set before running this backfill');
  }

  const rows = await db.$queryRaw<Row[]>`
    SELECT id, access_token AS "accessToken", refresh_token AS "refreshToken"
    FROM integrations
  `;

  let scanned = 0;
  let migrated = 0;
  for (const row of rows) {
    scanned++;
    const accessNeedsMigrate = row.accessToken !== null && !isEncrypted(row.accessToken);
    const refreshNeedsMigrate = row.refreshToken !== null && !isEncrypted(row.refreshToken);
    if (!accessNeedsMigrate && !refreshNeedsMigrate) continue;

    const nextAccess = accessNeedsMigrate ? encryptToken(row.accessToken) : undefined;
    const nextRefresh = refreshNeedsMigrate ? encryptToken(row.refreshToken) : undefined;

    await db.$executeRaw`
      UPDATE integrations
      SET
        access_token = COALESCE(${nextAccess}, access_token),
        refresh_token = COALESCE(${nextRefresh}, refresh_token)
      WHERE id = ${row.id}::uuid
    `;
    migrated++;
  }

  console.log(`[encrypt-integration-tokens] scanned=${scanned} migrated=${migrated}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error('[encrypt-integration-tokens] failed', err);
  process.exit(1);
});
