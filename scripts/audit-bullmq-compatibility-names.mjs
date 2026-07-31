// P9-02 BullMQ compatibility-name gate (READ-ONLY).
//
// Documents live repeatable jobs that still use legacy queue/job string values.
// Renaming these without a Redis migration orphans production schedulers and can
// break operator digests and async outbound recovery (including iMessage).
//
//   npm run audit:bullmq-compatibility-names
//   npm run audit:bullmq-compatibility-names -- --strict
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './load-local-env.mjs';

const require = createRequire(import.meta.url);
const gatewayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/gateway');
const { Queue } = require(path.join(gatewayRoot, 'node_modules/bullmq'));

loadLocalEnv();

const strict = process.argv.includes('--strict');

const DEFERRED_COMPATIBILITY_NAMES = [
  {
    candidate: 'WhatsApp-named digest queue/job IDs',
    queueName: 'whatsapp-digest',
    jobName: 'send-whatsapp-digest',
    jobId: 'whatsapp-digest-hourly',
    note: 'Serves Telegram/operator digests today; rename only with repeatable-job migration.',
  },
  {
    candidate: 'OUTBOUND_SEND_SWEEP legacy string',
    queueName: 'outbound-email-sweep',
    jobName: 'sweep-outbound-email',
    jobId: 'outbound-email-sweep-5min',
    note: 'Channel-agnostic stale outbound sweep for email and iMessage.',
  },
];

let repeatableJobs = [];
let redisError = null;

if (!process.env.REDIS_URL) {
  redisError = 'REDIS_URL is unset; repeatable-job inventory skipped.';
} else {
  try {
    const connection = { url: process.env.REDIS_URL };
    const seen = new Set();

    for (const entry of DEFERRED_COMPATIBILITY_NAMES) {
      if (seen.has(entry.queueName)) continue;
      seen.add(entry.queueName);
      const queue = new Queue(entry.queueName, { connection });
      try {
        const jobs = await queue.getRepeatableJobs();
        repeatableJobs.push({
          queueName: entry.queueName,
          jobs: jobs.map((job) => ({
            name: job.name,
            id: job.id ?? null,
            pattern: job.pattern ?? null,
            next: job.next ?? null,
          })),
        });
      } finally {
        await queue.close();
      }
    }
  } catch (error) {
    redisError = error instanceof Error ? error.message : String(error);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  deferredCompatibilityNames: DEFERRED_COMPATIBILITY_NAMES,
  repeatableJobs,
  redisError,
  renameBlockedUntilMigration: true,
};

console.log(JSON.stringify(report, null, 2));

if (strict && redisError) {
  process.exitCode = 1;
}
