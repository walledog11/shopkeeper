import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY read-only diagnostic for the iMessage operator "something went
// wrong": resolveOperatorThread's create is failing and the empty catch masks
// the real error. Inspect the prod threads schema + the actual operator threads,
// then reproduce the create in a rolled-back transaction to surface the true error.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const orgId = process.env.ORG_ID ?? '10c25c34-7a92-4963-b9cd-537ef893f6c0'; // Palette

  const cols = await db.$queryRawUnsafe<{ column_name: string; is_nullable: string; column_default: string | null }[]>(
    `SELECT column_name::text, is_nullable::text, column_default::text FROM information_schema.columns WHERE table_name='threads' ORDER BY ordinal_position`,
  );
  console.log('── threads columns (prod) ──');
  console.log('  has operator_key:', cols.some((c) => c.column_name === 'operator_key'));
  const notNullNoDefault = cols.filter((c) => c.is_nullable === 'NO' && c.column_default === null);
  console.log('  NOT NULL, no default:', notNullNoDefault.map((c) => c.column_name).join(', '));

  const enumVals = await db.$queryRawUnsafe<{ v: string }[]>(
    `SELECT unnest(enum_range(NULL::"ChannelType"))::text AS v`,
  );
  console.log('── ChannelType enum (prod) ──');
  console.log('  ', enumVals.map((e) => e.v).join(', '));

  const bindings = await db.orgMemberImessageBinding.findMany({
    where: { orgMember: { organizationId: orgId } },
    select: { senderId: true, spaceId: true },
  });
  console.log('── iMessage bindings ──', bindings);

  for (const b of bindings) {
    const operatorKey = `imessage:${b.senderId}`;
    const threads = await db.$queryRawUnsafe<{ id: string; channel_type: string; operator_key: string | null; deleted_at: Date | null }[]>(
      `SELECT id, channel_type, operator_key, deleted_at FROM threads WHERE organization_id=$1 AND operator_key=$2`,
      orgId,
      operatorKey,
    );
    console.log(`── existing threads for ${operatorKey} ──`, threads);

    // Reproduce the create inside a transaction we always roll back, so we see
    // the REAL error without leaving a row behind.
    const customer = await db.customer.upsert({
      where: { organizationId_platformId: { organizationId: orgId, platformId: operatorKey } },
      update: {},
      create: { organizationId: orgId, platformId: operatorKey },
    });
    try {
      await db.$transaction(async (tx) => {
        await tx.thread.create({
          data: { organizationId: orgId, customerId: customer.id, channelType: 'sms_agent', status: 'open', operatorKey },
          select: { id: true },
        });
        throw new Error('__ROLLBACK__'); // always roll back the probe insert
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('__ROLLBACK__')) {
        console.log(`  ✅ create would SUCCEED for ${operatorKey} (rolled back)`);
      } else {
        console.log(`  ❌ create FAILS for ${operatorKey}:`);
        console.log('  ', msg.replace(/\n/g, '\n   '));
      }
    }
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
