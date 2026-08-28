import { db } from '@shopkeeper/db';
import { DIGEST_WINDOW_SETTING } from './constants.js';

/**
 * Claim this org's send window. Returns false when another caller already holds
 * it, which is the whole point: the guard has to be a single conditional write
 * that separate processes contend for, since they share only Postgres.
 *
 * A jsonb merge rather than a read-modify-write of `settings` so a concurrent
 * settings update keeps its keys.
 */
export async function claimDigestWindow(organizationId: string, windowKey: string): Promise<boolean> {
  const claimed = await db.$executeRaw`
    UPDATE organizations
    SET settings = COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(${DIGEST_WINDOW_SETTING}::text, ${windowKey}::text)
    WHERE id = ${organizationId}::uuid
      AND COALESCE(settings, '{}'::jsonb)->>${DIGEST_WINDOW_SETTING}::text IS DISTINCT FROM ${windowKey}::text`;
  return claimed > 0;
}

export async function releaseDigestWindow(organizationId: string, windowKey: string): Promise<void> {
  await db.$executeRaw`
    UPDATE organizations
    SET settings = COALESCE(settings, '{}'::jsonb) - ${DIGEST_WINDOW_SETTING}::text
    WHERE id = ${organizationId}::uuid
      AND COALESCE(settings, '{}'::jsonb)->>${DIGEST_WINDOW_SETTING}::text = ${windowKey}::text`;
}
