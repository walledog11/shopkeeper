import { getFixedWindowPeriod, incrementFixedWindowCounter } from '../rate-limit/index.js';

/**
 * Host-injected ops-alert engine. Both apps emit structured `opsAlert: true`
 * Pino logs when thresholds are crossed; they differ only in the config source,
 * the logger, and the default `service` tag — all passed in by the host shim
 * (`apps/gateway/src/ops-alerts.ts`, `apps/dashboard/src/lib/server/ops-alerts.ts`).
 */
export const OPS_ALERT_CATEGORIES = [
  'queue_health',
  'webhook_signature',
  'provider_send',
  'provider_cleanup',
  'agent_failure',
  'gmail_inbound',
] as const;

export type OpsAlertCategory = typeof OPS_ALERT_CATEGORIES[number];
export type OpsAlertSeverity = 'info' | 'warning' | 'error';
export type OpsAlertService = 'gateway' | 'dashboard';
export type OpsAlertTagValue = string | number | boolean | null | undefined;

/** Host configs (Gateway/Dashboard) structurally satisfy this; only `enabled` is read here. */
export interface OpsAlertConfig {
  enabled: boolean;
}

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

export interface OpsAlertLogger {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
}

export interface EmitOpsAlertCoreDeps {
  config: OpsAlertConfig;
  logger: OpsAlertLogger;
  defaultService: OpsAlertService;
}

export interface EmitOpsAlertResult {
  logged: boolean;
  reason: 'logged' | 'disabled';
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

export function emitOpsAlert(input: OpsAlertInput, deps: EmitOpsAlertCoreDeps): EmitOpsAlertResult {
  const { config, logger: alertLogger, defaultService } = deps;
  const scope = buildOpsAlertScope(input, defaultService);
  const service = scope.tags.service ?? defaultService;
  const level = scope.level;

  if (!config.enabled) {
    return { logged: false, reason: 'disabled' };
  }

  const logFields = {
    opsAlert: true,
    category: input.category,
    service,
    tags: scope.tags,
    extra: scope.extra,
    fingerprint: scope.fingerprint,
    ...(input.error !== undefined ? { err: input.error instanceof Error ? input.error.message : String(input.error) } : {}),
  };

  writeAlertLog(alertLogger, level, logFields, input.message);

  return { logged: true, reason: 'logged' };
}

export async function incrementOpsAlertWindow(
  client: OpsAlertCounterClient,
  options: IncrementOpsAlertWindowOptions,
): Promise<IncrementOpsAlertWindowResult> {
  assertPositiveInteger('threshold', options.threshold);
  assertPositiveInteger('windowSecs', options.windowSecs);

  const { windowStart, resetAt } = getFixedWindowPeriod(options.windowSecs, options.nowMs ?? Date.now());
  const key = buildOpsAlertWindowKey(options.keyParts, windowStart, options.prefix);
  const count = await incrementFixedWindowCounter(client, key, options.windowSecs);

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
