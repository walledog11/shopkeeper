export const CHANNEL = { IG_DM: 'ig_dm', EMAIL: 'email', SMS: 'sms', SHOPIFY: 'shopify' };
export const STATUS = { OPEN: 'open' };
export const MODEL = { CLAUDE: 'claude-haiku-4-5-20251001' };
export const QUEUE = { INBOUND: 'inbound-messages', TOKEN_HEALTH: 'token-health', AI_SUMMARY: 'ai-summary', ARCHIVAL: 'thread-archival', PURGE: 'purge', DIGEST: 'whatsapp-digest', QUEUE_HEALTH: 'queue-health' };
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
};
export const READ_TOOLS = new Set(['get_shopify_customer', 'get_shopify_orders', 'get_order_by_name', 'search_kb']);
