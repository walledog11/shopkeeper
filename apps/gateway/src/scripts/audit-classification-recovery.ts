import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { QUEUE } from '../constants.js';
import { toGatewayBullMqConnection } from '../clients/redis-client.js';
// @ts-expect-error no declaration file for the repository-level env loader
import { loadLocalEnv } from '../../../../scripts/load-local-env.mjs';

// READ-ONLY assessment of what the 0f396f50 classifier-schema outage left behind.
//
// Two populations, and they are not the same set:
//   1. Failed ai-summary jobs. removeOnFail retains 7 days, so nothing from the
//      outage has aged out and the queue holds the complete list. Their payloads
//      are intact, so BullMQ can retry them now that the schema is fixed.
//   2. Threads carrying a customer message but no request contract. The request
//      contract landed 2026-08-14, so anything older never had one and is not
//      damage — the window that matters starts there.
//
// The pre-persistence path failed from 2026-08-21 but caught its own error and
// fell through to SUMMARIZE_THREAD, which worked until 933019d5 deployed at
// 2026-08-25T20:48Z. So the window where a thread could end up with no contract
// at all is that deploy to the fix at 21:38Z, not the whole four days.
//
//   SHOPKEEPER_DB_TARGET=prod REDIS_PUBLIC_URL=... npm run audit:classification-recovery

loadLocalEnv();

const REQUEST_CONTRACT_LANDED_AT = new Date('2026-08-14T00:00:00Z');
const FAILED_JOB_SAMPLE = 50;

function getRedisUrl(): string {
  const raw = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL;
  if (!raw) throw new Error('REDIS_PUBLIC_URL or REDIS_URL is required');
  return raw;
}

async function main(): Promise<void> {
  const { db, Prisma } = await import('@shopkeeper/db');
  const connection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  try {
    const queues = [QUEUE.AI_SUMMARY, QUEUE.INBOUND].map((name) => new Queue(name, {
      connection: toGatewayBullMqConnection(connection),
    }));

    const queueReports = [];
    for (const queue of queues) {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
      const failed = await queue.getJobs(['failed'], 0, FAILED_JOB_SAMPLE - 1, false);
      const bySchemaError = failed.filter((job) =>
        (job.failedReason ?? '').includes('output_config.format.schema'));
      queueReports.push({
        queue: queue.name,
        counts,
        failedSampled: failed.length,
        failedFromClassifierSchema: bySchemaError.length,
        oldestSampledFailureAt: failed.at(-1)?.timestamp
          ? new Date(failed.at(-1)!.timestamp).toISOString()
          : null,
        newestSampledFailureAt: failed[0]?.timestamp
          ? new Date(failed[0]!.timestamp).toISOString()
          : null,
        reasons: [...new Set(failed.map((job) =>
          (job.failedReason ?? 'unknown').split('\n')[0]!.slice(0, 140)))],
      });
      await queue.close();
    }

    const candidates = await db.thread.findMany({
      where: {
        deletedAt: null,
        // DbNull, not JsonNull: the column is nullable, so an unclassified
        // thread holds SQL NULL rather than a JSON `null` literal.
        classifierSignals: { equals: Prisma.DbNull },
        createdAt: { gte: REQUEST_CONTRACT_LANDED_AT },
        channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
        messages: { some: { senderType: 'customer', deletedAt: null } },
      },
      select: {
        id: true,
        organizationId: true,
        channelType: true,
        status: true,
        createdAt: true,
        filterStatus: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      requestContractLandedAt: REQUEST_CONTRACT_LANDED_AT.toISOString(),
      queues: queueReports,
      threadsMissingContract: {
        total: candidates.length,
        // Thread ids are included because acting on them requires the id; no
        // message text or customer identifier is read.
        rows: candidates,
      },
    }, null, 2));
  } finally {
    connection.disconnect();
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
