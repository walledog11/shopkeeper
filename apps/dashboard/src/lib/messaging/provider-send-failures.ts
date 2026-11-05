import type { OutboundProvider } from '@shopkeeper/messaging';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';

interface SendFailureContext {
  organizationId: string;
  threadId: string;
  integrationId: string | null;
  detail: string;
}

// The alert names the transport that actually failed. A SocialAPI outage must not
// read as a Meta outage: the two have different owners and different recovery paths.
export async function recordInstagramSendFailure(
  context: SendFailureContext & { transport?: 'meta' | 'socialapi' },
): Promise<void> {
  await recordProviderSendFailure(context.transport ?? 'meta', 'ig_dm', context.organizationId, {
    counterClient: getRedis(),
    threadId: context.threadId,
    integrationId: context.integrationId,
    detail: context.detail,
  });
}

export async function recordTikTokShopSendFailure(context: SendFailureContext): Promise<void> {
  await recordProviderSendFailure('tiktok_shop', 'tiktok', context.organizationId, {
    counterClient: getRedis(),
    threadId: context.threadId,
    integrationId: context.integrationId,
    detail: context.detail,
  });
}

export async function recordEmailSendFailure(
  context: SendFailureContext & {
    // 'meta' and 'socialapi' are both ig_dm transports and never send email.
    provider: Exclude<OutboundProvider, 'meta' | 'socialapi'>;
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
