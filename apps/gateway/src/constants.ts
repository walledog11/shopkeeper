export const CHANNEL = { IG_DM: 'ig_dm', EMAIL: 'email', SMS: 'sms', SHOPIFY: 'shopify' } as const;
export const STATUS = { OPEN: 'open' } as const;
export const MODEL = { CLAUDE: 'claude-haiku-4-5-20251001' } as const;
export const QUEUE = { INBOUND: 'inbound-messages', TOKEN_HEALTH: 'token-health', AI_SUMMARY: 'ai-summary', ARCHIVAL: 'thread-archival' } as const;
export const JOB = {
  IG_DM: 'process-ig-dm',
  EMAIL: 'process-email',
  TOKEN_HEALTH_CHECK: 'check-ig-tokens',
  TOKEN_HEALTH_ID: 'ig-token-health-daily',
  SUMMARIZE_THREAD: 'summarize-thread',
  ARCHIVE_THREADS: 'archive-old-threads',
  ARCHIVE_THREADS_ID: 'thread-archival-daily',
  SHOPIFY: 'process-shopify-order',
} as const;
export const READ_TOOLS = new Set(['get_shopify_customer', 'get_shopify_orders', 'get_order_by_name']);
