import { loadGatewayEnv } from '../config/load-env.js';

// Load env BEFORE importing anything that constructs the Redis client at module
// load. publish.js + redis-client.js capture process.env when they build the
// connection, so they are dynamically imported inside main() below.
loadGatewayEnv();

import { createHmac } from 'node:crypto';

// Tier 2 plumbing smoke test for the live-inbox SSE path. Run against a gateway
// `server` already booted with GATEWAY_REALTIME_ENABLED=true. It mints a realtime
// token, opens /events, then publishes through the real publishThreadEvent helper
// and asserts the frame arrives — and that an event for a DIFFERENT org does not
// (proves the in-process org filtering). Replaces the manual curl + redis-cli
// recipe with one command.
//
//   npm run realtime:smoke -- --org-id=<orgId> [--url=http://localhost:8080] [--timeout=5000]

interface Args {
  orgId: string;
  baseUrl: string;
  threadId: string;
  timeoutMs: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined =>
    args.find((a) => a.startsWith(`${flag}=`))?.split('=', 2)[1];

  const orgId = get('--org-id');
  if (!orgId) {
    console.error('Missing required --org-id=<orgId>');
    process.exit(2);
  }

  const port = process.env.PORT || '8080';
  return {
    orgId,
    baseUrl: (get('--url') || `http://localhost:${port}`).replace(/\/$/, ''),
    threadId: get('--thread-id') || `realtime-smoke-${Date.now()}`,
    timeoutMs: Number(get('--timeout') || '5000'),
  };
}

// Mirrors apps/gateway/src/realtime/token.ts: base64url(JSON {orgId, exp}) + "." + hex HMAC.
function mintToken(orgId: string, secret: string): string {
  const encoded = Buffer.from(JSON.stringify({ orgId, exp: Date.now() + 5 * 60_000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

// Parse the SSE byte stream into \n\n-delimited records; surface the ": connected"
// preamble and any { threadId } data payloads to the caller.
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onConnected: () => void,
  onThreadId: (threadId: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let split: number;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const record = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        if (record.includes(': connected')) onConnected();

        const dataLine = record.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice('data:'.length).trim()) as { threadId?: string };
          if (payload.threadId) onThreadId(payload.threadId);
        } catch {
          // ignore non-JSON data frames
        }
      }
    }
  } catch {
    // reader.read() rejects when the fetch is aborted during teardown — expected.
  }
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 50);
  });
}

async function main(): Promise<void> {
  const { orgId, baseUrl, threadId, timeoutMs } = parseArgs();
  const { getInternalApiSecret } = await import('../config/env.js');
  const { publishThreadEvent } = await import('../realtime/publish.js');
  const { closeGatewayRedisConnections } = await import('../clients/redis-client.js');

  const token = mintToken(orgId, getInternalApiSecret());
  const controller = new AbortController();
  const received = new Set<string>();
  let connected = false;

  console.log(`Realtime smoke → ${baseUrl}/events  (org=${orgId}, thread=${threadId})`);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/events?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
  } catch (err) {
    console.error(`✗ Could not reach ${baseUrl}/events — is the gateway server running? (${(err as Error).message})`);
    await closeGatewayRedisConnections();
    process.exit(1);
  }

  if (!res.ok) {
    const hint =
      res.status === 401 ? 'token rejected — INTERNAL_API_SECRET differs from the gateway, or token expired'
      : res.status === 404 ? 'endpoint absent — set GATEWAY_REALTIME_ENABLED=true and restart the gateway'
      : 'unexpected status';
    console.error(`✗ GET /events → ${res.status} (${hint})`);
    controller.abort();
    await closeGatewayRedisConnections();
    process.exit(1);
  }
  if (!res.body) {
    console.error('✗ /events returned no body stream');
    controller.abort();
    await closeGatewayRedisConnections();
    process.exit(1);
  }

  void consumeStream(res.body, () => { connected = true; }, (id) => received.add(id));

  if (!(await waitUntil(() => connected, 5000))) {
    console.error('✗ Never received the ": connected" preamble');
    controller.abort();
    await closeGatewayRedisConnections();
    process.exit(1);
  }
  console.log('✓ Connected (": connected" received)');

  // Negative: an event for a different org must NOT reach this connection.
  const wrongOrgThread = `${threadId}-WRONGORG`;
  await publishThreadEvent(`${orgId}__other`, wrongOrgThread);
  const leaked = await waitUntil(() => received.has(wrongOrgThread), 800);
  if (leaked) {
    console.error('✗ Org filtering broken — received an event published for a different org');
    controller.abort();
    await closeGatewayRedisConnections();
    process.exit(1);
  }
  console.log('✓ Org filtering holds (cross-org event not delivered)');

  // Positive: the real publish helper round-trips to this connection.
  await publishThreadEvent(orgId, threadId);
  const delivered = await waitUntil(() => received.has(threadId), timeoutMs);

  controller.abort();
  await closeGatewayRedisConnections();

  if (!delivered) {
    console.error(`✗ Event not delivered within ${timeoutMs}ms — publish → subscribe → SSE path is broken`);
    process.exit(1);
  }
  console.log(`✓ Event delivered (threadId=${threadId})`);
  console.log('\nPASS — publish → Redis → subscriber → SSE → client is wired correctly.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
