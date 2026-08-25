import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { CHANNEL, JOB, PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import { toGatewayBullMqConnection } from '../clients/redis-client.js';
import type { InboundJobData } from '../types.js';
// The repository-level loader, not loadGatewayEnv: this targets production and
// SHOPKEEPER_DB_TARGET=prod is what selects it, the same way the other canaries
// and audits do.
// @ts-expect-error no declaration file for the repository-level env loader
import { loadLocalEnv } from '../../../../scripts/load-local-env.mjs';

// Milestone 2 production canary for the classification write contract.
//
// Two live behavior changes shipped without production exercise: the
// post-persistence classifier became schema-enforced (`output_config` with
// CLASSIFIER_OUTPUT_SCHEMA) and its budget moved from 400 to 700 tokens. Every
// gateway test mocks Anthropic, so that call had never been made against the
// real API. The stale-write telemetry shipped unexercised beside it.
//
// A two-message email sequence covers both paths on the deployed worker, because
// channels.ts classifies pre-persistence only when the email opens a thread:
//   1. new thread  -> pre-persistence  -> outcome=committed
//   2. reply       -> post-persistence -> outcome=committed  (the changed call)
//
//   SHOPKEEPER_DB_TARGET=prod npm run canary:classification -- discover
//   SHOPKEEPER_DB_TARGET=prod ORG_ID=<uuid> npm run canary:classification -- run
//   SHOPKEEPER_DB_TARGET=prod ORG_ID=<uuid> npm run canary:classification -- cleanup
//
// `run` writes to production: it creates one customer and one thread in the
// named organization and spends two Haiku classifier calls plus one plan
// precompute. The sender is on example.com (RFC 2606), which cannot receive
// mail, so an auto-executed reply would go nowhere. `cleanup` deletes the
// synthetic customer, and Customer -> Thread -> Message cascades.

loadLocalEnv();

const CANARY_SENDER_DOMAIN = 'example.com';
const CANARY_SENDER_PREFIX = 'shopkeeper-classification-canary';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 180_000;

const OPENING_SUBJECT = 'Where is order #1024?';
const OPENING_BODY = 'Hi, I ordered last week and I still have no tracking. Can you tell me where order #1024 is?';
const REPLY_BODY = 'Actually please just cancel order #1024 instead — I need it before Friday or not at all.';

type Command = 'discover' | 'run' | 'cleanup';

function readCommand(): Command {
  const args = process.argv.slice(2);
  const command = args.find((arg): arg is Command =>
    arg === 'discover' || arg === 'run' || arg === 'cleanup');
  if (!command) {
    throw new Error(
      'Usage: npm run canary:classification -- <discover|run|cleanup>',
    );
  }
  return command;
}

function requireOrgId(): string {
  const organizationId = process.env.ORG_ID;
  if (!organizationId) throw new Error('ORG_ID is required for this command');
  return organizationId;
}

function getRedisUrl(): string {
  const raw = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL;
  if (!raw) throw new Error('REDIS_PUBLIC_URL or REDIS_URL is required');
  return raw;
}

function print(value: Record<string, unknown>): void {
  console.log(JSON.stringify(value, null, 2));
}

function canarySender(runId: string): string {
  return `${CANARY_SENDER_PREFIX}+${runId}@${CANARY_SENDER_DOMAIN}`;
}

async function main(): Promise<void> {
  const command = readCommand();
  const { db } = await import('@shopkeeper/db');

  if (command === 'discover') {
    const orgs = await db.organization.findMany({
      select: { id: true, name: true, settings: true },
    });
    print({
      command,
      organizations: orgs.map((org) => {
        const settings = (org.settings as Record<string, unknown> | null) ?? {};
        return {
          id: org.id,
          name: org.name,
          // Reported because a live tier could auto-send a reply to the canary
          // address. It goes to example.com either way, so this is disclosure
          // rather than a blocker.
          autoExecuteMode: settings.autoExecuteMode ?? null,
          autonomyTier: settings.autonomyTier ?? null,
          spamFilterEnabled: settings.spamFilterEnabled ?? true,
        };
      }),
    });
    await db.$disconnect();
    return;
  }

  const organizationId = requireOrgId();

  if (command === 'cleanup') {
    const customers = await db.customer.findMany({
      where: {
        organizationId,
        platformId: { startsWith: `${CANARY_SENDER_PREFIX}+` },
      },
      select: { id: true, platformId: true },
    });
    const deleted = await db.customer.deleteMany({
      where: { id: { in: customers.map((customer) => customer.id) } },
    });
    print({ command, organizationId, deletedCustomers: deleted.count, platformIds: customers.map((c) => c.platformId) });
    await db.$disconnect();
    return;
  }

  const runId = randomUUID().slice(0, 8);
  const senderEmail = canarySender(runId);
  const connection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const inbound = new Queue<InboundJobData>(QUEUE.INBOUND, {
    connection: toGatewayBullMqConnection(connection),
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });

  async function enqueue(data: Partial<InboundJobData>, label: string): Promise<void> {
    await inbound.add(JOB.EMAIL, {
      platform: CHANNEL.EMAIL,
      organizationId,
      senderEmail,
      senderName: 'Classification Canary',
      receivedAt: new Date().toISOString(),
      // Dedupe key, so a BullMQ retry cannot create a second message.
      inboundMessageId: `classification-canary-${runId}-${label}`,
      traceId: `classification-canary-${runId}-${label}`,
      ...data,
    } as InboundJobData);
  }

  async function pollThread<T>(
    describe: () => Promise<T | null>,
    what: string,
  ): Promise<T> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      const found = await describe();
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
      await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
    }
  }

  function threadContract(threadId: string) {
    return db.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        classifierSignals: true,
        requestSummary: true,
        requestDisposition: true,
        requestSourceMessageId: true,
        filterStatus: true,
        aiTitle: true,
        lastMessageAt: true,
      },
    });
  }

  try {
    await enqueue({ subject: OPENING_SUBJECT, body: OPENING_BODY }, 'open');

    const opened = await pollThread(async () => {
      const customer = await db.customer.findFirst({
        where: { organizationId, platformId: senderEmail },
        select: { id: true },
      });
      if (!customer) return null;
      const thread = await db.thread.findFirst({
        where: { organizationId, customerId: customer.id },
        select: { id: true, classifierSignals: true },
      });
      return thread?.classifierSignals ? thread : null;
    }, 'the pre-persistence classification');

    const prePersistence = await threadContract(opened.id);

    await enqueue({ subject: `Re: ${OPENING_SUBJECT}`, body: REPLY_BODY }, 'reply');

    const settled = await pollThread(async () => {
      const thread = await threadContract(opened.id);
      if (!thread?.requestSourceMessageId) return null;
      // The reply's own id becomes the source once the post-persistence write
      // lands; until then the opening message still owns the request.
      return thread.requestSourceMessageId === prePersistence?.requestSourceMessageId
        ? null
        : thread;
    }, 'the post-persistence classification');

    const messages = await db.message.findMany({
      where: { threadId: opened.id },
      orderBy: { sentAt: 'asc' },
      select: { id: true, senderType: true, sentAt: true },
    });

    print({
      command,
      organizationId,
      runId,
      senderEmail,
      threadId: opened.id,
      messageCount: messages.length,
      prePersistence,
      postPersistence: settled,
      grepDeployedWorkerLogsFor: `traceId classification-canary-${runId}`,
      expectedEvents: [
        'Classification request write path=pre_persistence outcome=committed',
        'Classification request write path=post_persistence outcome=committed',
      ],
      cleanup: `SHOPKEEPER_DB_TARGET=prod ORG_ID=${organizationId} npm run canary:classification -- cleanup`,
    });
  } finally {
    await inbound.close();
    connection.disconnect();
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
