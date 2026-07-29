import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

const EXECUTE = process.argv.includes('--execute');
const TURN_DURATION_MS = 36_000;
const OBSERVE_AFTER_MS = 32_000;
const DEFAULT_TTL_SECONDS = 90;

async function main(): Promise<void> {
  const { executeAgentTurn } = await import('@shopkeeper/agent/turn');
  const { createGatewayLockProvider } = await import('../clients/agent-lock.js');
  const {
    getGatewayRedis,
    closeGatewayRedisConnections,
  } = await import('../clients/redis-client.js');

  const redis = getGatewayRedis();
  try {
    const ping = await redis.ping();
    console.log(JSON.stringify({
      phase: 'preflight',
      redis: ping,
      turnDurationMs: TURN_DURATION_MS,
      observeAfterMs: OBSERVE_AFTER_MS,
      expectedRenewalIntervalMs: DEFAULT_TTL_SECONDS * 1_000 / 3,
    }, null, 2));
    if (!EXECUTE) {
      console.log('Inspect-only. Re-run with --execute to hold one synthetic production lock through its renewal interval.');
      return;
    }

    const provider = createGatewayLockProvider(redis);
    const threadId = randomUUID();
    const lockKey = `agent:lock:${threadId}`;
    let enteredRunAgent = false;
    const startedAt = Date.now();
    const turnPromise = executeAgentTurn({
      orgId: randomUUID(),
      threadId,
      instruction: 'Controlled P1-04 lock-renewal observation',
      auditMode: 'human_approved',
      persistAuditNote: false,
      persistUserMessage: false,
      persistAgentMessage: false,
    }, {
      lock: provider,
      buildContext: async () => ({} as never),
      runAgent: async () => {
        enteredRunAgent = true;
        await delay(TURN_DURATION_MS);
        return {
          summary: 'Controlled long turn completed',
          actionsPerformed: [],
        };
      },
    });

    const entryDeadline = Date.now() + 5_000;
    while (!enteredRunAgent && Date.now() < entryDeadline) {
      await delay(25);
    }
    if (!enteredRunAgent) {
      throw new Error('P1-04 canary failed: synthetic turn did not enter runAgent.');
    }

    const ttlAtStart = await redis.ttl(lockKey);
    await delay(Math.max(0, OBSERVE_AFTER_MS - (Date.now() - startedAt)));
    const ttlAfterRenewal = await redis.ttl(lockKey);
    const contender = await provider.acquire(threadId, { failClosed: true });
    const contenderBlocked = contender === null;
    await contender?.release();

    const result = await turnPromise;
    const existsAfterRelease = await redis.exists(lockKey);
    const successor = await provider.acquire(threadId, { failClosed: true });
    const successorAcquired = successor !== null;
    await successor?.release();

    const evidence = {
      phase: 'evidence',
      threadId,
      elapsedMs: Date.now() - startedAt,
      ttlAtStart,
      ttlAfterRenewal,
      contenderBlocked,
      existsAfterRelease,
      successorAcquired,
      turnSummary: result.summary,
    };
    console.log(JSON.stringify(evidence, null, 2));

    const passed = ttlAtStart >= DEFAULT_TTL_SECONDS - 2
      && ttlAfterRenewal >= DEFAULT_TTL_SECONDS - 10
      && contenderBlocked
      && existsAfterRelease === 0
      && successorAcquired
      && result.summary === 'Controlled long turn completed';
    if (!passed) {
      throw new Error('P1-04 canary failed: renewed TTL, exclusivity, or successor-safe release evidence did not agree.');
    }

    console.log('P1-04 canary passed: the production Redis lease renewed during a long turn, blocked overlap, and released cleanly.');
  } finally {
    await closeGatewayRedisConnections().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
