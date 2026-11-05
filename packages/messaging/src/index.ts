// Customer message delivery, shared by the dashboard (replies the merchant
// types) and the gateway (the agent's replies and acknowledgements). Each app
// supplies a `MessagingHost` for its own alerting and analytics.
export type { InstagramSendFailure, MessagingHost } from "./host.js"
export type {
  DispatchFailure,
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
} from "./types.js"
export {
  assertCurrentEpisode,
  deliverMessage,
  dispatchAcknowledgement,
  dispatchInstagramMessage,
} from "./deliver.js"
export { dispatchInstagramDirect } from "./instagram.js"
export {
  agentReplySource,
  loadAgentReplyThread,
  sendAgentReply,
  type AgentReplyDispatch,
  type AgentReplyThread,
} from "./agent-reply.js"
export {
  loadAutoAckThread,
  sendAutoAcknowledgement,
  type AutoAckKind,
  type AutoAckSenders,
} from "./auto-ack.js"
export {
  createPendingAgentMessage,
  markAgentMessageSendFailed,
  markLogicalResponseAttempted,
  markLogicalResponseSent,
  markPendingAgentMessageSendUnknown,
} from "./message-rows.js"
export {
  clearOutboundRecords,
  readOutboundRecords,
  recordOutboundCall,
  type OutboundProvider,
  type OutboundRecord,
} from "./outbound-recorder.js"
