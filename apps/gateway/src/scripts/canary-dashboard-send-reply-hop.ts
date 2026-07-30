import { pathToFileURL } from 'node:url';
import { loadGatewayEnv } from '../config/load-env.js';

export interface CanaryArgs {
  execute: boolean;
  organizationId: string | null;
  threadId: string | null;
  text: string | null;
}

function readArg(args: string[], prefix: string): string | null {
  const raw = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

export function parseCanaryArgs(args: string[]): CanaryArgs {
  return {
    execute: args.includes('--execute'),
    organizationId: readArg(args, '--org-id='),
    threadId: readArg(args, '--thread-id='),
    text: readArg(args, '--text='),
  };
}

export function assertSafeTestRuntime(
  args: CanaryArgs,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!args.execute || !args.organizationId || !args.threadId || !args.text) {
    throw new Error(
      'Usage: npx tsx apps/gateway/src/scripts/canary-dashboard-send-reply-hop.ts '
      + '--org-id=<uuid> --thread-id=<uuid> --text=<marker> --execute',
    );
  }
  if (env.E2E_TEST_RUN !== 'true' || env.E2E_OUTBOUND_MODE !== 'record') {
    throw new Error('This canary requires E2E_TEST_RUN=true and E2E_OUTBOUND_MODE=record.');
  }
  if (env.OUTBOUND_EMAIL_ASYNC !== 'false') {
    throw new Error('This canary requires OUTBOUND_EMAIL_ASYNC=false so no queue or real provider is used.');
  }
  if (!args.text.startsWith('cross-service send_reply canary ')) {
    throw new Error('The canary text must use the controlled cross-service send_reply marker.');
  }

  const dashboardUrl = new URL(
    env.DASHBOARD_INTERNAL_URL
      ?? env.DASHBOARD_URL
      ?? 'http://127.0.0.1:3100',
  );
  if (
    dashboardUrl.protocol !== 'http:'
    || (dashboardUrl.hostname !== '127.0.0.1' && dashboardUrl.hostname !== 'localhost')
  ) {
    throw new Error('This canary may only target a loopback dashboard URL.');
  }
}

export async function main(args = parseCanaryArgs(process.argv)): Promise<void> {
  loadGatewayEnv();
  assertSafeTestRuntime(args);

  const { db, ChannelType } = await import('@shopkeeper/db');
  const { gatewayThreadSink } = await import('../message-handlers/agent-thread-sink.js');
  const { closeGatewayRedisConnections } = await import('../clients/redis-client.js');

  try {
    const thread = await db.thread.findFirst({
      where: {
        id: args.threadId!,
        organizationId: args.organizationId!,
      },
      select: {
        id: true,
        channelType: true,
        customer: { select: { platformId: true } },
        organization: {
          select: {
            id: true,
            name: true,
            integrations: {
              where: { platform: ChannelType.email },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!thread) {
      throw new Error('Controlled canary thread was not found for the supplied organization.');
    }
    if (
      thread.channelType !== ChannelType.email
      || !thread.customer.platformId.toLowerCase().endsWith('@example.com')
      || thread.organization.integrations.length !== 1
    ) {
      throw new Error('Canary target must be an email thread for example.com with one test email integration.');
    }

    const result = await gatewayThreadSink.sendReply(
      { text: args.text! },
      {
        agentActionMode: 'human_approved',
        threadId: thread.id,
        orgId: thread.organization.id,
        orgName: thread.organization.name,
      },
    );
    console.log(`CANARY_RESULT=${JSON.stringify(result)}`);
    if (result.status !== 'ok') {
      throw new Error(`Cross-service send_reply canary failed: ${result.message}`);
    }
  } finally {
    await closeGatewayRedisConnections().catch(() => {});
    await db.$disconnect().catch(() => {});
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  await main();
}
