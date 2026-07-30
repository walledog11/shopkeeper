import { pathToFileURL } from 'node:url';
import { loadGatewayEnv } from '../config/load-env.js';

const CANARY_SUBJECT_PREFIX = 'Shopkeeper outbound Gmail canary';
const CANARY_BODY = [
  'This is a controlled Shopkeeper delivery canary sent to the connected Gmail account.',
  'No reply is required.',
].join('\n\n');

export interface OutboundGmailCanaryArgs {
  acknowledgeSelfEmail: boolean;
  execute: boolean;
  integrationId: string | null;
}

function readArg(args: string[], prefix: string): string | null {
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return value || null;
}

export function parseOutboundGmailCanaryArgs(args: string[]): OutboundGmailCanaryArgs {
  return {
    acknowledgeSelfEmail: args.includes('--acknowledge-self-email'),
    execute: args.includes('--execute'),
    integrationId: readArg(args, '--integration-id='),
  };
}

export function assertOutboundGmailCanaryRuntime(
  args: OutboundGmailCanaryArgs,
  env: NodeJS.ProcessEnv = process.env,
): URL {
  if (!args.execute || !args.acknowledgeSelfEmail || !args.integrationId) {
    throw new Error(
      'Usage: npx tsx apps/gateway/src/scripts/canary-outbound-gmail.ts '
      + '--integration-id=<uuid> --acknowledge-self-email --execute',
    );
  }
  if (!env.INTERNAL_API_SECRET?.trim()) {
    throw new Error('INTERNAL_API_SECRET is required.');
  }
  const gatewayUrl = new URL(env.GATEWAY_URL ?? '');
  const isLoopback = gatewayUrl.protocol === 'http:'
    && (gatewayUrl.hostname === '127.0.0.1' || gatewayUrl.hostname === 'localhost');
  const isProductionRailway = gatewayUrl.protocol === 'https:'
    && gatewayUrl.hostname.endsWith('.up.railway.app');
  if (!isLoopback && !isProductionRailway) {
    throw new Error('GATEWAY_URL must target loopback or an HTTPS Railway deployment.');
  }
  return gatewayUrl;
}

export function buildSelfCanaryAddress(accountAddress: string, marker: string): string {
  const separator = accountAddress.lastIndexOf('@');
  if (separator <= 0 || separator === accountAddress.length - 1) {
    throw new Error('The Gmail integration account is not a valid email address.');
  }
  const localPart = accountAddress.slice(0, separator).split('+', 1)[0];
  const domain = accountAddress.slice(separator + 1);
  if (!localPart || !domain) {
    throw new Error('The Gmail integration account is not a valid email address.');
  }
  const safeMarker = marker.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (!safeMarker) throw new Error('The canary marker must contain letters or numbers.');
  return `${localPart}+shopkeeper-canary-${safeMarker}@${domain}`;
}

async function waitForTerminalStatus(
  messageId: string,
  timeoutMs = 30_000,
): Promise<{ providerMessageId: string | null; sendError: string | null; sendStatus: string | null }> {
  const { db } = await import('@shopkeeper/db');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { providerMessageId: true, sendError: true, sendStatus: true },
    });
    if (!message) throw new Error('The canary message disappeared.');
    if (message.sendStatus === 'sent' || message.sendStatus === 'failed' || message.sendStatus === 'unknown') {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for the outbound Gmail canary.');
}

export async function main(
  args = parseOutboundGmailCanaryArgs(process.argv),
): Promise<void> {
  loadGatewayEnv();
  const gatewayUrl = assertOutboundGmailCanaryRuntime(args);
  const { db } = await import('@shopkeeper/db');
  const marker = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

  try {
    const integration = await db.integration.findUnique({
      where: { id: args.integrationId! },
      select: {
        emailProvider: true,
        externalAccountId: true,
        id: true,
        organizationId: true,
      },
    });
    if (!integration || integration.emailProvider !== 'gmail') {
      throw new Error('The selected integration is not Gmail.');
    }

    const target = buildSelfCanaryAddress(integration.externalAccountId, marker);
    const staged = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: {
          organizationId_platformId: {
            organizationId: integration.organizationId,
            platformId: target,
          },
        },
        update: {},
        create: {
          organizationId: integration.organizationId,
          name: 'Shopkeeper Gmail canary',
          platformId: target,
        },
        select: { id: true },
      });
      const thread = await tx.thread.create({
        data: {
          channelType: 'email',
          customerId: customer.id,
          organizationId: integration.organizationId,
          replyIntegrationId: integration.id,
          status: 'open',
          subject: `${CANARY_SUBJECT_PREFIX} ${marker}`,
          tag: 'Canary',
        },
        select: { id: true },
      });
      const message = await tx.message.create({
        data: {
          contentText: CANARY_BODY,
          integrationId: integration.id,
          organizationId: integration.organizationId,
          senderType: 'agent',
          sendStatus: 'pending',
          threadId: thread.id,
        },
        select: { id: true },
      });
      return { messageId: message.id, threadId: thread.id };
    });

    const requestBody = {
      integrationId: integration.id,
      messageId: staged.messageId,
      organizationId: integration.organizationId,
      source: 'agent_send_email',
      threadId: staged.threadId,
      traceId: `gmail-self-canary-${marker}`,
    };
    const enqueue = async () => {
      const response = await fetch(new URL('/internal/queue/outbound-email', gatewayUrl), {
        body: JSON.stringify(requestBody),
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET!,
        },
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json() as { deduplicated?: boolean; enqueued?: boolean };
      if (response.status !== 202 || body.enqueued !== true) {
        throw new Error(`Queue admission failed with status ${response.status}.`);
      }
      return body;
    };

    await enqueue();
    const result = await waitForTerminalStatus(staged.messageId);
    if (result.sendStatus !== 'sent' || !result.providerMessageId) {
      throw new Error(`Gmail canary finished with status ${result.sendStatus ?? 'unset'}.`);
    }
    const duplicate = await enqueue();
    await db.thread.update({
      where: { id: staged.threadId },
      data: { status: 'closed' },
    });

    console.log(JSON.stringify({
      deduplicated: duplicate.deduplicated === true,
      hasProviderMessageId: true,
      integrationId: integration.id,
      messageId: staged.messageId,
      organizationId: integration.organizationId,
      sendStatus: result.sendStatus,
      threadId: staged.threadId,
    }, null, 2));
    if (duplicate.deduplicated !== true) {
      throw new Error('The duplicate queue admission did not report deduplication.');
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  await main();
}
