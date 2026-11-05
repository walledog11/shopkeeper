import {
  dispatchAcknowledgement,
  dispatchInstagramDirect,
  dispatchInstagramMessage,
  type AgentReplyDispatch,
  type AutoAckSenders,
  type MessagingHost,
} from '@shopkeeper/messaging';
import { getSocialApiApiKey } from '../../config/runtime-config.js';
import { captureOutboundReplySent } from '../../product-analytics.js';
import { recordProviderSendFailureInBackground } from '../../provider-send-alerts.js';

// The gateway sends Instagram itself rather than asking the dashboard to: a
// serverless function idle between customers starts cold, which cost 1.4s a
// send. Without the SocialAPI key this process cannot reach SocialAPI, so the
// dashboard, which holds it, still sends.
export function sendsInstagramInProcess(): boolean {
  return getSocialApiApiKey() !== null;
}

const gatewayMessagingHost: MessagingHost = {
  recordInstagramSendFailure: async (failure) => {
    recordProviderSendFailureInBackground(failure.transport ?? 'meta', 'ig_dm', failure.organizationId, {
      threadId: failure.threadId,
      integrationId: failure.integrationId,
      detail: failure.detail,
    });
  },
  captureReplySent: (event) => captureOutboundReplySent(event),
};

export const dispatchInstagramReply: AgentReplyDispatch = (thread, org, text, options) =>
  dispatchInstagramMessage(thread, org, text, options, gatewayMessagingHost);

export const instagramAutoAckSenders: AutoAckSenders = {
  acknowledge: (thread, org, text) => dispatchAcknowledgement(
    thread,
    text,
    () => dispatchInstagramDirect(thread, org, text, 'auto_ack', gatewayMessagingHost),
  ),
  dispatch: dispatchInstagramReply,
};
