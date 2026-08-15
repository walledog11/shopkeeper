import {
  parseGatewayProductionConfig,
  type GatewayRuntimeRole,
} from '../../../../scripts/lib/production-config-schema.mjs';

export type { GatewayRuntimeRole } from '../../../../scripts/lib/production-config-schema.mjs';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`[Gateway] ${name} must be a positive integer`);
  }

  return parsedValue;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  throw new Error(`[Gateway] ${name} must be a boolean`);
}

export function getGatewayRuntimeRole(): GatewayRuntimeRole {
  return parseGatewayProductionConfig(process.env).runtimeRole;
}

export function shouldRunGatewayServer(role = getGatewayRuntimeRole()): boolean {
  return role === 'all' || role === 'server';
}

export function shouldRunGatewayWorker(role = getGatewayRuntimeRole()): boolean {
  return role === 'all' || role === 'worker';
}

export interface GatewayWorkerRedisConfig {
  drainDelaySeconds: number;
  stalledIntervalMs: number;
  heartbeatIntervalMs: number;
  heartbeatTtlSecs: number;
  heartbeatStaleMs: number;
  queueDiagnosticsCacheMs: number;
  maintenanceWorkersEnabled: boolean;
}

export interface GatewayOpsAlertConfig {
  enabled: boolean;
  /** Operator chat for ops-alert pushes. Absent or null leaves alerts log-only. */
  telegramChatId?: string | null;
  windowSecs: number;
  queueFailedThreshold: number;
  queueWaitingThreshold: number;
  queueActiveStuckMs: number;
  webhookSignatureThreshold: number;
  providerSendThreshold: number;
  agentFailureThreshold: number;
}

export function getGatewayWorkerRedisConfig(): GatewayWorkerRedisConfig {
  return parseGatewayProductionConfig(process.env).workerRedis;
}

export function getGatewayOpsAlertConfig(): GatewayOpsAlertConfig {
  return {
    enabled: parseBooleanEnv('OPS_ALERTS_ENABLED', true),
    telegramChatId: process.env.OPS_ALERT_TELEGRAM_CHAT_ID?.trim() || null,
    windowSecs: parsePositiveIntEnv('OPS_ALERT_WINDOW_SECS', 300),
    queueFailedThreshold: parsePositiveIntEnv('QUEUE_ALERT_FAILED_THRESHOLD', 10),
    queueWaitingThreshold: parsePositiveIntEnv('QUEUE_ALERT_WAITING_THRESHOLD', 100),
    queueActiveStuckMs: parsePositiveIntEnv('QUEUE_ALERT_ACTIVE_STUCK_MS', 900_000),
    webhookSignatureThreshold: parsePositiveIntEnv('WEBHOOK_SIGNATURE_ALERT_THRESHOLD', 5),
    providerSendThreshold: parsePositiveIntEnv('PROVIDER_SEND_ALERT_THRESHOLD', 3),
    agentFailureThreshold: parsePositiveIntEnv('AGENT_FAILURE_ALERT_THRESHOLD', 3),
  };
}

export interface GatewayBodyLimits {
  webhookBytes: number;
  emailInboundBytes: number;
  internalBytes: number;
}

// P4-05: signed provider webhooks carry kilobyte payloads but were parsed under
// the same 50 MB ceiling as Postmark inbound email, so an unauthenticated
// request could allocate and parse 50 MB before any HMAC/auth check ran. Only
// the email route keeps the attachment-sized budget. Overridable so an
// unexpected provider payload can be unblocked without a deploy.
export function getGatewayBodyLimits(): GatewayBodyLimits {
  return {
    webhookBytes: parsePositiveIntEnv('GATEWAY_BODY_LIMIT_WEBHOOK_BYTES', 2_097_152),
    emailInboundBytes: parsePositiveIntEnv('GATEWAY_BODY_LIMIT_EMAIL_BYTES', 52_428_800),
    internalBytes: parsePositiveIntEnv('GATEWAY_BODY_LIMIT_INTERNAL_BYTES', 1_048_576),
  };
}

export interface InboundAttachmentLimits {
  maxCount: number;
  maxBytesEach: number;
  maxTotalBytes: number;
  uploadConcurrency: number;
}

// P4-05: the per-attachment size cap and executable denylist already lived in
// the blob helper, but nothing bounded how many attachments one message could
// carry, their combined size, or how many uploads fanned out at once.
export function getInboundAttachmentLimits(): InboundAttachmentLimits {
  return {
    maxCount: parsePositiveIntEnv('GATEWAY_ATTACHMENT_MAX_COUNT', 10),
    maxBytesEach: parsePositiveIntEnv('GATEWAY_ATTACHMENT_MAX_BYTES', 10_485_760),
    maxTotalBytes: parsePositiveIntEnv('GATEWAY_ATTACHMENT_MAX_TOTAL_BYTES', 26_214_400),
    uploadConcurrency: parsePositiveIntEnv('GATEWAY_ATTACHMENT_UPLOAD_CONCURRENCY', 3),
  };
}

export function isOrderRiskMonitorEnabled(): boolean {
  return parseBooleanEnv('ORDER_RISK_MONITOR_ENABLED', false);
}

export function isReturnLifecycleMonitorEnabled(): boolean {
  return parseBooleanEnv('RETURN_LIFECYCLE_MONITOR_ENABLED', false);
}

export function isDeliveryExceptionMonitorEnabled(): boolean {
  return parseBooleanEnv('DELIVERY_EXCEPTION_MONITOR_ENABLED', false);
}

export function isPostResolutionFollowUpMonitorEnabled(): boolean {
  return parseBooleanEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', false);
}

export interface GatewayRuntimeFlags {
  monitors: {
    orderRisk: boolean;
    returnLifecycle: boolean;
    deliveryException: boolean;
    postResolutionFollowUp: boolean;
  };
}

export function getGatewayRuntimeFlags(): GatewayRuntimeFlags {
  return {
    monitors: {
      orderRisk: isOrderRiskMonitorEnabled(),
      returnLifecycle: isReturnLifecycleMonitorEnabled(),
      deliveryException: isDeliveryExceptionMonitorEnabled(),
      postResolutionFollowUp: isPostResolutionFollowUpMonitorEnabled(),
    },
  };
}

// Max pending plans held per operator context (A6-step-2 queue). Default 1
// reproduces the pre-queue single-slot overwrite exactly; raise it (bounded 1–5)
// to let plans stack and be individually approved. Enablement is gated on P1
// execution-ledger rollout — see docs/agent-behavior-and-expansion-plan.md.
export function getOperatorPlanQueueMax(): number {
  const parsed = parsePositiveIntEnv('OPERATOR_PLAN_QUEUE_MAX', 1);
  return Math.min(parsed, 5);
}

export function isGmailNativeInboundEnabled(): boolean {
  return parseGatewayProductionConfig(process.env).gmailNativeInbound;
}

export interface StorefrontChatMessageBudgets {
  perSession: number;
  perShopPerDay: number;
}

// Storefront chat's own containment, counted in shopper messages because the
// gate runs before the model and the spend of the message being admitted is not
// yet known. The defaults are sized for a real conversation and against a bot:
// 30 messages is a long support exchange and a short scrape, and 200 per shop
// per day is more storefront chat than a solo merchant's store will see while
// still bounding a bad day to a known multiple of one message's LLM cost.
export function getStorefrontChatMessageBudgets(): StorefrontChatMessageBudgets {
  return {
    perSession: parsePositiveIntEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SESSION', 30),
    perShopPerDay: parsePositiveIntEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY', 200),
  };
}

export interface StorefrontChatBurstLimits {
  perSession: number;
  perIp: number;
  windowSecs: number;
}

// The burst layer, above the daily budgets. A person types a handful of messages
// a minute; the per-IP allowance is higher than the per-session one so that a
// shared address — an office, a campus, mobile carrier NAT — does not lock out
// real shoppers who happen to arrive together.
export function getStorefrontChatBurstLimits(): StorefrontChatBurstLimits {
  return {
    perSession: parsePositiveIntEnv('STOREFRONT_CHAT_BURST_PER_SESSION', 5),
    perIp: parsePositiveIntEnv('STOREFRONT_CHAT_BURST_PER_IP', 20),
    windowSecs: parsePositiveIntEnv('STOREFRONT_CHAT_BURST_WINDOW_SECS', 60),
  };
}

function readOptionalTrimmedEnv(name: string): string | null {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string') {
    return null;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export interface InstagramWebhookConfig {
  verifyToken: string | null;
  appSecret: string | null;
}

export function getInstagramWebhookConfig(): InstagramWebhookConfig {
  return {
    verifyToken: readOptionalTrimmedEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN'),
    appSecret:
      readOptionalTrimmedEnv('INSTAGRAM_WEBHOOK_APP_SECRET')
      ?? readOptionalTrimmedEnv('INSTAGRAM_APP_SECRET'),
  };
}

export interface MetaWebhookConfig {
  verifyToken: string | null;
  appSecret: string | null;
  appId: string | null;
}

export function getMetaWebhookConfig(): MetaWebhookConfig {
  return {
    verifyToken: readOptionalTrimmedEnv('META_VERIFY_TOKEN'),
    appSecret: readOptionalTrimmedEnv('META_APP_SECRET'),
    appId: readOptionalTrimmedEnv('META_APP_ID'),
  };
}

export interface TelegramConfig {
  botToken: string | null;
  webhookSecret: string | null;
}

export function getTelegramConfig(): TelegramConfig {
  return {
    botToken: readOptionalTrimmedEnv('TELEGRAM_BOT_TOKEN'),
    webhookSecret: readOptionalTrimmedEnv('TELEGRAM_WEBHOOK_SECRET'),
  };
}

export interface SpectrumConfig {
  projectId: string;
  projectSecret: string;
  webhookSecret: string;
}

// Shopkeeper owns one platform-wide Spectrum project for iMessage (not per-org).
// Returns null unless all three credentials are present, so callers can treat a
// partially-configured deployment as "iMessage off".
export function getSpectrumConfig(): SpectrumConfig | null {
  const projectId = readOptionalTrimmedEnv('SPECTRUM_PROJECT_ID');
  const projectSecret = readOptionalTrimmedEnv('SPECTRUM_PROJECT_SECRET');
  const webhookSecret = readOptionalTrimmedEnv('SPECTRUM_WEBHOOK_SECRET');

  if (!projectId || !projectSecret || !webhookSecret) {
    return null;
  }

  return { projectId, projectSecret, webhookSecret };
}

export interface PostmarkWebhookConfig {
  inboundUsername: string | null;
  inboundPassword: string | null;
}

export function getPostmarkWebhookConfig(): PostmarkWebhookConfig {
  return {
    inboundUsername: readOptionalTrimmedEnv('POSTMARK_INBOUND_USERNAME'),
    inboundPassword: readOptionalTrimmedEnv('POSTMARK_INBOUND_PASSWORD'),
  };
}

export interface GmailPubSubPushConfig {
  audience: string;
  serviceAccountEmail: string;
}

export function getGmailPubSubPushConfig(): GmailPubSubPushConfig | null {
  const audience = readOptionalTrimmedEnv('GMAIL_PUBSUB_AUDIENCE');
  const serviceAccountEmail = readOptionalTrimmedEnv('GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT');
  if (!audience || !serviceAccountEmail) return null;
  return { audience, serviceAccountEmail };
}

export type TikTokShopHttpMethod = 'GET' | 'POST';
export type TikTokShopSignatureEncoding = 'hex' | 'base64';

export interface TikTokShopWebhookConfig {
  enabled: boolean;
  secret: string | null;
  signatureAlgorithm: string;
  signatureEncoding: TikTokShopSignatureEncoding;
  signatureHeader: string;
  signaturePrefix: string | null;
  messageEventNames: Set<string>;
}

export interface TikTokShopApiConfig {
  apiBaseUrl: string | null;
  appKey: string | null;
  appSecret: string | null;
  enabled: boolean;
  refreshTokenMethod: TikTokShopHttpMethod;
  refreshTokenUrl: string | null;
}

function parseTikTokShopMethodEnv(name: string, fallback: TikTokShopHttpMethod): TikTokShopHttpMethod {
  const rawValue = readOptionalTrimmedEnv(name);
  if (!rawValue) return fallback;

  const normalizedValue = rawValue.toUpperCase();
  if (normalizedValue === 'GET' || normalizedValue === 'POST') return normalizedValue;

  throw new Error(`[Gateway] ${name} must be GET or POST`);
}

function parseTikTokShopSignatureEncoding(): TikTokShopSignatureEncoding {
  const rawValue = readOptionalTrimmedEnv('TIKTOK_SHOP_WEBHOOK_SIGNATURE_ENCODING');
  if (!rawValue) return 'hex';

  const normalizedValue = rawValue.toLowerCase();
  if (normalizedValue === 'hex' || normalizedValue === 'base64') return normalizedValue;

  throw new Error('[Gateway] TIKTOK_SHOP_WEBHOOK_SIGNATURE_ENCODING must be hex or base64');
}

function parseCsvEnv(name: string): Set<string> {
  return new Set(
    (readOptionalTrimmedEnv(name) ?? '')
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean),
  );
}

export function getTikTokShopWebhookConfig(): TikTokShopWebhookConfig {
  return {
    enabled: parseBooleanEnv('TIKTOK_SHOP_ENABLED', false),
    secret: readOptionalTrimmedEnv('TIKTOK_SHOP_WEBHOOK_SECRET'),
    signatureAlgorithm: readOptionalTrimmedEnv('TIKTOK_SHOP_WEBHOOK_SIGNATURE_ALGORITHM') ?? 'sha256',
    signatureEncoding: parseTikTokShopSignatureEncoding(),
    signatureHeader: (readOptionalTrimmedEnv('TIKTOK_SHOP_WEBHOOK_SIGNATURE_HEADER') ?? 'x-tts-signature').toLowerCase(),
    signaturePrefix: readOptionalTrimmedEnv('TIKTOK_SHOP_WEBHOOK_SIGNATURE_PREFIX'),
    messageEventNames: parseCsvEnv('TIKTOK_SHOP_MESSAGE_EVENT_NAMES'),
  };
}

export function getTikTokShopApiConfig(): TikTokShopApiConfig {
  return {
    apiBaseUrl: readOptionalTrimmedEnv('TIKTOK_SHOP_API_BASE_URL'),
    appKey: readOptionalTrimmedEnv('TIKTOK_SHOP_APP_KEY') ?? readOptionalTrimmedEnv('TIKTOK_SHOP_CLIENT_KEY'),
    appSecret: readOptionalTrimmedEnv('TIKTOK_SHOP_APP_SECRET') ?? readOptionalTrimmedEnv('TIKTOK_SHOP_CLIENT_SECRET'),
    enabled: parseBooleanEnv('TIKTOK_SHOP_ENABLED', false),
    refreshTokenMethod: parseTikTokShopMethodEnv(
      'TIKTOK_SHOP_REFRESH_TOKEN_METHOD',
      parseTikTokShopMethodEnv('TIKTOK_SHOP_TOKEN_METHOD', 'POST'),
    ),
    refreshTokenUrl: readOptionalTrimmedEnv('TIKTOK_SHOP_REFRESH_TOKEN_URL') ?? readOptionalTrimmedEnv('TIKTOK_SHOP_TOKEN_URL'),
  };
}
