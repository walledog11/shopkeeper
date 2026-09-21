import { MESSAGE_CHANNELS, type ActionOutcome, type MessageChannel } from './events.js';

export {
  ACTIVATION_INBOUND_CHANNELS,
  WORKSPACE_ACTIVATION_WINDOW_SECONDS,
  type ActivationInboundChannel,
} from '@shopkeeper/shared/product-analytics';

/** Historical thread channel values removed from Postgres or renamed in place. */
const LEGACY_MESSAGE_CHANNEL_ALIASES: Record<string, MessageChannel> = {
  sms_agent: 'operator',
  dashboard_agent: 'operator',
};

export function toProductMessageChannel(
  channel: string,
): MessageChannel | null {
  const normalized = LEGACY_MESSAGE_CHANNEL_ALIASES[channel] ?? channel;
  return (MESSAGE_CHANNELS as readonly string[]).includes(normalized)
    ? (normalized as MessageChannel)
    : null;
}

export function agentActionOutcome(
  status: 'success' | 'error' | 'unknown' | 'blocked' | string,
): ActionOutcome {
  if (status === 'success') return 'succeeded';
  if (status === 'unknown') return 'unknown';
  if (status === 'error') return 'failed';
  return 'blocked';
}
