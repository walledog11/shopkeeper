export const CHANNEL = { IG_DM: 'ig_dm', EMAIL: 'email', SHOPIFY: 'shopify', IMESSAGE: 'imessage', TIKTOK: 'tiktok' } as const;
export const STATUS = { OPEN: 'open' } as const;
export const MODEL = {
  CLAUDE: 'claude-haiku-4-5-20251001',
  // Brand-voice synthesis rewrites a setting that shapes every future reply and
  // is human-approved before taking effect — judgment-grade, low-frequency.
  VOICE_SYNTHESIS: 'claude-sonnet-5',
} as const;
// Operator digests now route through Telegram, but BullMQ queue/job names below
// still use the legacy `whatsapp-*` prefix. Renaming live repeatable jobs needs a
// one-time deploy: remove the old repeatable entries from Redis, deploy with new
// names, and let registration re-schedule. Deferred until a digest deploy already
// touches the worker.
export const QUEUE = {
  INBOUND: 'inbound-messages',
  TOKEN_HEALTH: 'token-health',
  EMAIL_TOKEN_HEALTH: 'email-token-health',
  AI_SUMMARY: 'ai-summary',
  ARCHIVAL: 'thread-archival',
  PURGE: 'purge',
  DIGEST: 'whatsapp-digest',
  QUEUE_HEALTH: 'queue-health',
  VOICE_SYNTHESIS: 'voice-synthesis',
  ORDER_RISK: 'order-risk-monitor',
  RETURN_LIFECYCLE: 'return-lifecycle-monitor',
  DELIVERY_EXCEPTION: 'delivery-exception-monitor',
  ORDER_REVIEW: 'order-review',
  OUTBOUND_EMAIL: 'outbound-email',
  GMAIL_SYNC: 'gmail-sync',
  GMAIL_WATCH: 'gmail-watch-maintenance',
  // Channel-agnostic sweep for stale `pending` async outbound (email + iMessage).
  // String value stays email-legacy so the live BullMQ repeatable job isn't orphaned.
  OUTBOUND_SEND_SWEEP: 'outbound-email-sweep',
  // Durable operator-channel message ingestion (P4-03). Webhook persists an
  // OperatorEvent + enqueues here before acknowledging; the worker claims and
  // runs the turn asynchronously.
  OPERATOR_EVENT: 'operator-event',
  // Recovery sweep for stuck operator events (P4-03): reconciles a claim whose
  // worker died mid-turn to `unknown` and re-sends committed-but-undelivered
  // confirmations. Backstop, not the primary path.
  OPERATOR_EVENT_SWEEP: 'operator-event-sweep',
} as const;
export const JOB = {
  IG_DM: 'process-ig-dm',
  TIKTOK_SHOP: 'process-tiktok-shop-message',
  EMAIL: 'process-email',
  TOKEN_HEALTH_CHECK: 'check-ig-tokens',
  TOKEN_HEALTH_ID: 'ig-token-health-daily',
  EMAIL_TOKEN_HEALTH_CHECK: 'check-email-tokens',
  EMAIL_TOKEN_HEALTH_ID: 'email-token-health-daily',
  SUMMARIZE_THREAD: 'summarize-thread',
  ARCHIVE_THREADS: 'archive-old-threads',
  ARCHIVE_THREADS_ID: 'thread-archival-daily',
  SHOPIFY: 'process-shopify-order',
  PURGE_DELETED: 'purge-deleted-records',
  PURGE_DELETED_ID: 'purge-deleted-records-daily',
  DIGEST: 'send-whatsapp-digest',
  DIGEST_ID: 'whatsapp-digest-hourly',
  QUEUE_HEALTH_CHECK: 'check-queue-health',
  QUEUE_HEALTH_ID: 'queue-health-5min',
  VOICE_SYNTHESIS: 'run-voice-synthesis',
  VOICE_SYNTHESIS_ID: 'voice-synthesis-daily',
  ORDER_RISK_SCAN: 'scan-order-risk',
  ORDER_RISK_ID: 'order-risk-monitor-hourly',
  RETURN_LIFECYCLE_SCAN: 'scan-return-lifecycle',
  RETURN_LIFECYCLE_ID: 'return-lifecycle-monitor-hourly',
  DELIVERY_EXCEPTION_SCAN: 'scan-delivery-exception',
  DELIVERY_EXCEPTION_ID: 'delivery-exception-monitor-hourly',
  ORDER_REVIEW: 'process-order-review',
  SEND_EMAIL: 'send-email',
  GMAIL_SYNC: 'sync-gmail-mailbox',
  GMAIL_WATCH_MAINTENANCE: 'maintain-gmail-watches',
  GMAIL_WATCH_MAINTENANCE_ID: 'gmail-watch-maintenance-12h',
  OUTBOUND_SEND_SWEEP: 'sweep-outbound-email',
  OUTBOUND_SEND_SWEEP_ID: 'outbound-email-sweep-5min',
  OPERATOR_EVENT: 'process-operator-event',
  OPERATOR_EVENT_SWEEP: 'sweep-operator-events',
  OPERATOR_EVENT_SWEEP_ID: 'operator-event-sweep-15min',
} as const;
// 7-day failed retention keeps post-mortems possible; 1-day completed retention bounds Redis.
export const PROCESSING_QUEUE_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7, count: 5000 },
} as const;
