import * as Sentry from '@sentry/nextjs';
import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';
import logger from '@/lib/server/logger';

export const OPS_ALERT_CATEGORIES = [
  'queue_health',
  'webhook_signature',
  'provider_send',
  'agent_failure',
] as const;

export type OpsAlertCategory = typeof OPS_ALERT_CATEGORIES[number];
export type OpsAlertSeverity = 'info' | 'warning' | 'error';
export type OpsAlertService = 'gateway' | 'dashboard';
export type OpsAlertTagValue = string | number | boolean | null | undefined;

export interface OpsAlertInput {
  category: OpsAlertCategory;
  message: string;
  level?: OpsAlertSeverity;
  service?: OpsAlertService;
  tags?: Record<string, OpsAlertTagValue>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  error?: unknown;
}

export interface OpsAlertCaptureContext {
  level: OpsAlertSeverity;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  fingerprint: string[];
}

export interface OpsAlertSentryClient {
  captureMessage: (message: string, context?: OpsAlertCaptureContext) => string;
  captureException: (error: unknown, context?: OpsAlertCaptureContext) => string;
  isEnabled?: () => boolean;
}

export interface OpsAlertLogger {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
}

export interface EmitOpsAlertDependencies {
  config?: DashboardOpsAlertConfig;
  env?: NodeJS.ProcessEnv;
  logger?: OpsAlertLogger;
  sentry?: OpsAlertSentryClient;
}

export interface EmitOpsAlertResult {
  logged: boolean;
  captured: boolean;
  eventId: string | null;
  reason: 'captured' | 'disabled' | 'missing_dsn' | 'sentry_disabled';
}

export interface OpsAlertCounterClient {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
}

export interface IncrementOpsAlertWindowOptions {
  keyParts: readonly OpsAlertTagValue[];
  threshold: number;
  windowSecs: number;
  nowMs?: number;
  prefix?: string;
}

export interface IncrementOpsAlertWindowResult {
  key: string;
  count: number;
  threshold: number;
  thresholdCrossed: boolean;
  overThreshold: boolean;
  resetAt: number;
}

const DEFAULT_FINGERPRINT_TAGS = ['queue', 'provider', 'channel', 'tool'] as const;

export function buildOpsAlertScope(input: OpsAlertInput, defaultService: OpsAlertService): OpsAlertCaptureContext {
  const service = input.service ?? defaultService;
  const tags = normalizeTags({
    category: input.category,
    service,
    ...(input.tags ?? {}),
  });
  const extra = input.extra ?? {};

  return {
    level: input.level ?? 'warning',
    tags,
    extra,
    fingerprint: input.fingerprint ?? buildDefaultFingerprint(input.category, service, tags),
  };
}

export function emitOpsAlert(input: OpsAlertInput, dependencies: EmitOpsAlertDependencies = {}): EmitOpsAlertResult {
  const config = dependencies.config ?? getDashboardOpsAlertConfig();
  const env = dependencies.env ?? process.env;
  const alertLogger = dependencies.logger ?? logger;
  const sentry = dependencies.sentry ?? (Sentry as OpsAlertSentryClient);
  const scope = buildOpsAlertScope(input, 'dashboard');
  const service = scope.tags.service ?? 'dashboard';
  const level = scope.level;

  const logFields = {
    opsAlert: true,
    category: input.category,
    service,
    tags: scope.tags,
    extra: scope.extra,
    fingerprint: scope.fingerprint,
  };

  writeAlertLog(alertLogger, level, logFields, input.message);

  if (!config.enabled) {
    return { logged: true, captured: false, eventId: null, reason: 'disabled' };
  }

  if (!hasSentryDsn(env)) {
    return { logged: true, captured: false, eventId: null, reason: 'missing_dsn' };
  }

  if (sentry.isEnabled && !sentry.isEnabled()) {
    return { logged: true, captured: false, eventId: null, reason: 'sentry_disabled' };
  }

  const eventId = input.error === undefined
    ? sentry.captureMessage(input.message, scope)
    : sentry.captureException(input.error, scope);

  return { logged: true, captured: true, eventId, reason: 'captured' };
}

export async function incrementOpsAlertWindow(
  client: OpsAlertCounterClient,
  options: IncrementOpsAlertWindowOptions,
): Promise<IncrementOpsAlertWindowResult> {
  assertPositiveInteger('threshold', options.threshold);
  assertPositiveInteger('windowSecs', options.windowSecs);

  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const windowStart = Math.floor(now / options.windowSecs);
  const resetAt = (windowStart + 1) * options.windowSecs;
  const key = buildOpsAlertWindowKey(options.keyParts, windowStart, options.prefix);
  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, options.windowSecs);
  }

  return {
    key,
    count,
    threshold: options.threshold,
    thresholdCrossed: count === options.threshold,
    overThreshold: count >= options.threshold,
    resetAt,
  };
}

export function buildOpsAlertWindowKey(
  keyParts: readonly OpsAlertTagValue[],
  windowStart: number,
  prefix = 'ops-alert',
): string {
  assertNonNegativeInteger('windowStart', windowStart);

  return [
    prefix,
    ...keyParts.map(normalizeCounterKeyPart),
    String(windowStart),
  ].join(':');
}

function normalizeTags(tags: Record<string, OpsAlertTagValue>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(tags)) {
    if (value === null || value === undefined) continue;

    const normalizedValue = String(value).trim();
    if (normalizedValue.length === 0) continue;

    normalized[key] = normalizedValue;
  }

  return normalized;
}

function buildDefaultFingerprint(
  category: OpsAlertCategory,
  service: OpsAlertService,
  tags: Record<string, string>,
): string[] {
  const parts = ['ops-alert', category, service];

  for (const tagName of DEFAULT_FINGERPRINT_TAGS) {
    const value = tags[tagName];
    if (value) {
      parts.push(`${tagName}:${value}`);
    }
  }

  return parts;
}

function writeAlertLog(
  alertLogger: OpsAlertLogger,
  level: OpsAlertSeverity,
  fields: Record<string, unknown>,
  message: string,
): void {
  if (level === 'error') {
    alertLogger.error(fields, message);
    return;
  }
  if (level === 'info') {
    alertLogger.info(fields, message);
    return;
  }
  alertLogger.warn(fields, message);
}

function hasSentryDsn(env: NodeJS.ProcessEnv): boolean {
  const dsn = env.SENTRY_DSN;
  return typeof dsn === 'string' && dsn.trim().length > 0;
}

function normalizeCounterKeyPart(part: OpsAlertTagValue): string {
  const value = part === null || part === undefined ? 'unknown' : String(part).trim();
  return encodeURIComponent(value.length > 0 ? value : 'unknown');
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[OpsAlert] ${name} must be a positive integer`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[OpsAlert] ${name} must be a non-negative integer`);
  }
}
