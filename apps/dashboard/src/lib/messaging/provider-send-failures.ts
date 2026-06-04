import type { OutboundProvider } from '@/lib/server/outbound-recorder';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';

interface SendFailureContext {
  organizationId: string;
  threadId: string;
  integrationId: string | null;
  detail: string;
}

export async function recordInstagramSendFailure(context: SendFailureContext): Promise<void> {
  await recordProviderSendFailure('meta', 'ig_dm', context.organizationId, {
    counterClient: getRedis(),
    threadId: context.threadId,
    integrationId: context.integrationId,
    detail: context.detail,
  });
}

export async function recordEmailSendFailure(
  context: SendFailureContext & {
    provider: Exclude<OutboundProvider, 'meta'>;
    originalChannel?: string;
  },
): Promise<void> {
  await recordProviderSendFailure(context.provider, 'email', context.organizationId, {
    counterClient: getRedis(),
    threadId: context.threadId,
    integrationId: context.integrationId,
    detail: context.detail,
    ...(context.originalChannel && { extra: { originalChannel: context.originalChannel } }),
  });
}
