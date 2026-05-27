export const CHANNEL = { IG_DM: 'ig_dm', EMAIL: 'email', SMS: 'sms', SHOPIFY: 'shopify' } as const;
export const STATUS = { OPEN: 'open' } as const;
export const MODEL = {
  CLAUDE: 'claude-haiku-4-5-20251001',
  CUSTOMER_MEMORY: 'claude-sonnet-4-6',
} as const;
export const QUEUE = { INBOUND: 'inbound-messages', TOKEN_HEALTH: 'token-health', AI_SUMMARY: 'ai-summary', ARCHIVAL: 'thread-archival', PURGE: 'purge', DIGEST: 'whatsapp-digest', QUEUE_HEALTH: 'queue-health' } as const;
export const JOB = {
  IG_DM: 'process-ig-dm',
  EMAIL: 'process-email',
  TOKEN_HEALTH_CHECK: 'check-ig-tokens',
  TOKEN_HEALTH_ID: 'ig-token-health-daily',
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
} as const;
export const READ_TOOLS = new Set(['get_shopify_customer', 'get_shopify_orders', 'get_order_by_name', 'search_kb']);

// 7-day failed retention keeps post-mortems possible; 1-day completed retention bounds Redis.
export const PROCESSING_QUEUE_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7, count: 5000 },
} as const;
