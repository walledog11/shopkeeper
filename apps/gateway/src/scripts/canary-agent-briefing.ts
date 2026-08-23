// Root operational scripts are plain ESM and intentionally have no TS build.
// @ts-expect-error no declaration file for the repository-level env loader
import { loadLocalEnv } from '../../../../scripts/load-local-env.mjs';

// Mixed-shape briefing canary. Discovery and rendering are read-only; SEND=1
// uses the same delivery function as the scheduled worker and therefore updates
// OperatorContext.pendingDigest to the identities the merchant just received.
// It deliberately does not advance the scheduled digest cursor/window.
//
//   SHOPKEEPER_DB_TARGET=prod DISCOVER=1 npm run canary:agent-briefings
//   SHOPKEEPER_DB_TARGET=prod ORG_ID=<uuid> npm run canary:agent-briefings
//   SHOPKEEPER_DB_TARGET=prod ORG_ID=<uuid> SEND=1 npm run canary:agent-briefings
//   SHOPKEEPER_DB_TARGET=prod ORG_ID=<internal-uuid> STAGE=1 SEND=1 npm run canary:agent-briefings
//
// STAGE=1 creates two exact synthetic customer/thread/message fixtures, verifies
// the delivery state, then deletes those customers (cascading only their newly
// created rows) and restores every operator's prior pendingDigest.
loadLocalEnv();

function classifierVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).version;
  return typeof version === 'number' && Number.isFinite(version) ? version : null;
}

async function main(): Promise<void> {
  const { db, Prisma } = await import('@shopkeeper/db');
  const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');
  const { memberOperatorKey } = await import('@shopkeeper/agent/internal-thread');
  const { buildOrgDigest, buildDigestOpener, deliverOrgDigest } = await import('../maintenance/digest.js');
  const { listOperatorBindings } = await import('../operator-notify.js');
  const { stopAllSpectrumApps } = await import('../clients/spectrum.js');

  async function inspect(organizationId: string) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, settings: true },
    });
    if (!org) return null;
    const settings = (org.settings as Record<string, unknown> | null) ?? {};
    const now = new Date();
    const digest = await buildOrgDigest(org.id, now, settings, {
      opener: buildDigestOpener(resolveAgentSettings(org.settings).agentName, settings, now, false),
      includeEmptyInbox: false,
    });
    if (!digest) return { org, digest: null, current: 0, legacy: 0, review: 0, bindings: 0 };

    const rows = await db.thread.findMany({
      where: { organizationId: org.id, id: { in: digest.pendingDigest.items.map((item) => item.threadId) } },
      select: { id: true, classifierSignals: true },
    });
    const versionByThread = new Map(rows.map((row) => [row.id, classifierVersion(row.classifierSignals)]));
    let current = 0;
    let legacy = 0;
    let review = 0;
    for (const item of digest.pendingDigest.items) {
      if (item.needsThreadReview === true) {
        review += 1;
        continue;
      }
      const version = versionByThread.get(item.threadId) ?? null;
      if (version !== null && version >= 5) current += 1;
      else legacy += 1;
    }
    const bindings = await listOperatorBindings(org.id);
    return { org, digest, current, legacy, review, bindings: bindings.length };
  }

  if (process.env.DISCOVER === '1') {
    const organizations = await db.organization.findMany({
      where: {
        members: {
          some: { OR: [{ telegramChats: { some: {} } }, { imessageBindings: { some: {} } }] },
        },
      },
      select: { id: true },
    });
    const discovered = [];
    for (const organization of organizations) {
      const result = await inspect(organization.id);
      if (result) {
        discovered.push({
          organizationId: result.org.id,
          organizationName: result.org.name,
          currentItems: result.current,
          legacyItems: result.legacy,
          threadReviewItems: result.review,
          operatorBindings: result.bindings,
          mixedShapeReady: Boolean(result.current && result.legacy && result.bindings),
        });
      }
    }
    console.log(JSON.stringify({ organizations: discovered }, null, 2));
    await db.$disconnect();
    return;
  }

  const organizationId = process.env.ORG_ID?.trim();
  if (!organizationId) throw new Error('Set DISCOVER=1 or ORG_ID=<uuid>.');
  const shouldStage = process.env.STAGE === '1';
  const bindingsBefore = await listOperatorBindings(organizationId);
  const contextKeys = [...new Set(bindingsBefore.map((binding) => memberOperatorKey(binding.orgMemberId)))];
  const priorContexts = new Map((await db.operatorContext.findMany({
    where: { organizationId, memberKey: { in: contextKeys } },
    select: { memberKey: true, pendingDigest: true },
  })).map((context) => [context.memberKey, context.pendingDigest]));
  const stagedCustomerIds: string[] = [];
  const stagedThreadIds: string[] = [];

  try {
    if (shouldStage) {
      if (bindingsBefore.length < 1) throw new Error('Canary refused: the organization has no operator binding.');
      const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      for (const fixture of [
        {
          shape: 'current',
          name: 'Briefing Canary Current',
          text: '[Canary] Review the current v5 briefing shape. No customer or order action exists.',
          classifierSignals: {
            version: 5,
            language: 'en',
            intents: { mutative_request: false },
            requestFacts: { ask: 'other', subject: 'the synthetic current-shape canary' },
          },
        },
        {
          shape: 'legacy',
          name: 'Briefing Canary Legacy',
          text: '[Canary] Review the legacy v4 source-text fallback. No customer or order action exists.',
          classifierSignals: {
            version: 4,
            language: 'en',
            intents: { mutative_request: false },
          },
        },
      ] as const) {
        const customer = await db.customer.create({
          data: {
            organizationId,
            name: fixture.name,
            platformId: `agent-briefing-canary-${fixture.shape}-${runId}@inbound.test`,
          },
        });
        stagedCustomerIds.push(customer.id);
        const thread = await db.thread.create({
          data: { organizationId, customerId: customer.id, channelType: 'email' },
        });
        stagedThreadIds.push(thread.id);
        const source = await db.message.create({
          data: {
            organizationId,
            threadId: thread.id,
            senderType: 'customer',
            contentText: fixture.text,
          },
        });
        await db.thread.update({
          where: { id: thread.id },
          data: {
            escalatedAt: new Date(),
            requestSourceMessageId: source.id,
            classifierSignals: fixture.classifierSignals,
          },
        });
      }
    }

    const result = await inspect(organizationId);
    if (!result?.digest) throw new Error('The organization has no briefing to canary.');
    if (result.current < 1 || result.legacy < 1) {
      throw new Error('Canary refused: the rendered briefing does not contain both actionable current and legacy shapes.');
    }
    if (result.bindings < 1) throw new Error('Canary refused: the organization has no operator binding.');

    console.log(`─── ${result.org.name} · mixed-shape scheduled briefing canary ───\n`);
    console.log(result.digest.message);
    console.log(`\n─── current:${result.current} legacy:${result.legacy} review:${result.review} bindings:${result.bindings} ───`);

    if (process.env.SEND !== '1') {
      console.log('\nDry run. Re-run with SEND=1 to deliver through the scheduled briefing path.');
      return;
    }

    const bindings = await listOperatorBindings(result.org.id);
    let delivered = 0;
    for (const member of bindings) {
      // Every explicit canary invocation is a new send. Omitting the Redis
      // idempotency key also lets this operational script run outside Railway's
      // private network while using deployed Spectrum credentials.
      if (await deliverOrgDigest(result.org.id, member, result.digest)) delivered += 1;
    }
    if (delivered !== bindings.length) {
      throw new Error(`Canary delivery incomplete: ${delivered}/${bindings.length} operator bindings succeeded.`);
    }
    for (const contextKey of contextKeys) {
      const context = await db.operatorContext.findUnique({
        where: { organizationId_memberKey: { organizationId, memberKey: contextKey } },
        select: { pendingDigest: true },
      });
      const serialized = JSON.stringify(context?.pendingDigest ?? null);
      for (const threadId of stagedThreadIds) {
        if (!serialized.includes(threadId)) throw new Error('Canary delivery did not persist both staged thread identities.');
      }
    }
    console.log(`Delivered to ${delivered} operator binding${delivered === 1 ? '' : 's'} and verified pending identity.`);
  } finally {
    if (shouldStage) {
      for (const contextKey of contextKeys) {
        await db.operatorContext.updateMany({
          where: { organizationId, memberKey: contextKey },
          data: { pendingDigest: priorContexts.get(contextKey) ?? Prisma.DbNull },
        });
      }
      if (stagedCustomerIds.length > 0) {
        await db.customer.deleteMany({
          where: { organizationId, id: { in: stagedCustomerIds } },
        });
      }
      console.log(`Restored ${contextKeys.length} pending digest${contextKeys.length === 1 ? '' : 's'} and removed ${stagedCustomerIds.length} synthetic customers.`);
    }
    await stopAllSpectrumApps().catch(() => undefined);
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => undefined);
  process.exit(1);
});
