export type GatewayRuntimeRole = 'all' | 'server' | 'worker';

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
  const rawRole = process.env.GATEWAY_RUNTIME_ROLE?.trim().toLowerCase();
  if (!rawRole) {
    return 'all';
  }

  if (rawRole === 'all' || rawRole === 'server' || rawRole === 'worker') {
    return rawRole;
  }

  throw new Error('[Gateway] GATEWAY_RUNTIME_ROLE must be one of: all, server, worker');
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
  windowSecs: number;
  queueFailedThreshold: number;
  queueWaitingThreshold: number;
  queueActiveStuckMs: number;
  webhookSignatureThreshold: number;
  providerSendThreshold: number;
  agentFailureThreshold: number;
}

export function getGatewayWorkerRedisConfig(): GatewayWorkerRedisConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const heartbeatIntervalMs = parsePositiveIntEnv(
    'GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS',
    isProduction ? 300_000 : 15_000,
  );
  const heartbeatTtlSecs = parsePositiveIntEnv(
    'GATEWAY_WORKER_HEARTBEAT_TTL_SECS',
    Math.max(Math.ceil((heartbeatIntervalMs * 3) / 1000), 60),
  );
  const heartbeatStaleMs = Math.min(
    parsePositiveIntEnv(
      'GATEWAY_WORKER_HEARTBEAT_STALE_MS',
      Math.max(heartbeatIntervalMs * 2, 60_000),
    ),
    heartbeatTtlSecs * 1000,
  );

  return {
    drainDelaySeconds: parsePositiveIntEnv(
      'GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS',
      isProduction ? 60 : 5,
    ),
    stalledIntervalMs: parsePositiveIntEnv(
      'GATEWAY_BULLMQ_STALLED_INTERVAL_MS',
      isProduction ? 300_000 : 30_000,
    ),
    heartbeatIntervalMs,
    heartbeatTtlSecs,
    heartbeatStaleMs,
    queueDiagnosticsCacheMs: parsePositiveIntEnv(
      'GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS',
      isProduction ? 30_000 : 5_000,
    ),
    maintenanceWorkersEnabled: parseBooleanEnv('GATEWAY_ENABLE_MAINTENANCE_WORKERS', true),
  };
}

export function getGatewayOpsAlertConfig(): GatewayOpsAlertConfig {
  return {
    enabled: parseBooleanEnv('OPS_ALERTS_ENABLED', true),
    windowSecs: parsePositiveIntEnv('OPS_ALERT_WINDOW_SECS', 300),
    queueFailedThreshold: parsePositiveIntEnv('QUEUE_ALERT_FAILED_THRESHOLD', 10),
    queueWaitingThreshold: parsePositiveIntEnv('QUEUE_ALERT_WAITING_THRESHOLD', 100),
    queueActiveStuckMs: parsePositiveIntEnv('QUEUE_ALERT_ACTIVE_STUCK_MS', 900_000),
    webhookSignatureThreshold: parsePositiveIntEnv('WEBHOOK_SIGNATURE_ALERT_THRESHOLD', 5),
    providerSendThreshold: parsePositiveIntEnv('PROVIDER_SEND_ALERT_THRESHOLD', 3),
    agentFailureThreshold: parsePositiveIntEnv('AGENT_FAILURE_ALERT_THRESHOLD', 3),
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

// Max pending plans held per operator context (A6-step-2 queue). Default 1
// reproduces the pre-queue single-slot overwrite exactly; raise it (bounded 1–5)
// to let plans stack and be individually approved. Enablement is gated on P1
// execution-ledger rollout — see docs/agent-behavior-and-expansion-plan.md.
export function getOperatorPlanQueueMax(): number {
  const parsed = parsePositiveIntEnv('OPERATOR_PLAN_QUEUE_MAX', 1);
  return Math.min(parsed, 5);
}

export function isGmailNativeInboundEnabled(): boolean {
  return parseBooleanEnv('GMAIL_NATIVE_INBOUND', false);
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
