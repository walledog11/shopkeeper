import { MESSAGE_CHANNELS, type ActionOutcome, type MessageChannel } from './events.js';

export {
  ACTIVATION_INBOUND_CHANNELS,
  WORKSPACE_ACTIVATION_WINDOW_SECONDS,
  type ActivationInboundChannel,
} from '@shopkeeper/shared/product-analytics';

export function toProductMessageChannel(
  channel: string,
): MessageChannel | null {
  return (MESSAGE_CHANNELS as readonly string[]).includes(channel)
    ? (channel as MessageChannel)
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
