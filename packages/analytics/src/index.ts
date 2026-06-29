import {
  parseProductAnalyticsConfig,
  type AnalyticsEnvironment,
} from './config.js';
import type { ProductEvent } from './events.js';
import { BatchedPostHogSink } from './posthog-batched.js';
import { ImmediatePostHogSink } from './posthog-immediate.js';
import { getEventProperties, sanitizeProductEvent } from './sanitize.js';
import {
  NoopAnalyticsSink,
  type AnalyticsPayload,
  type AnalyticsSink,
} from './sink.js';

export * from './config.js';
export * from './events.js';
export * from './insert-id.js';
export * from './posthog-batched.js';
export * from './posthog-immediate.js';
export * from './sink.js';

export interface AnalyticsLogger {
  warn(
    fields: {
      event?: string;
      source?: string;
      organizationId?: string;
      errorClass: string;
    },
    message: string,
  ): void;
}

interface AnalyticsRuntime {
  sink: AnalyticsSink;
  environment: AnalyticsEnvironment;
  logger: AnalyticsLogger;
}

export interface InstallProductAnalyticsOptions {
  sink: AnalyticsSink;
  environment: AnalyticsEnvironment;
  logger?: AnalyticsLogger;
}

export interface InitializeProductAnalyticsOptions {
  delivery: 'immediate' | 'batched';
  env?: NodeJS.ProcessEnv;
  logger?: AnalyticsLogger;
}

const defaultLogger: AnalyticsLogger = {
  warn(fields, message) {
    console.warn(message, fields);
  },
};

const runtime: AnalyticsRuntime = {
  sink: new NoopAnalyticsSink(),
  environment: process.env.NODE_ENV === 'test' ? 'test' : 'development',
  logger: defaultLogger,
};

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 100 ? value : undefined;
}

function captureContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    event: safeString(input.event),
    source: safeString(input.source),
    organizationId: safeString(input.organizationId),
  };
}

function warn(
  fields: Parameters<AnalyticsLogger['warn']>[0],
  message: string,
): void {
  try {
    runtime.logger.warn(fields, message);
  } catch {
    // Analytics observability must not affect the product path.
  }
}

export function installProductAnalytics(options: InstallProductAnalyticsOptions): void {
  runtime.sink = options.sink;
  runtime.environment = options.environment;
  runtime.logger = options.logger ?? defaultLogger;
}

export function initializeProductAnalytics(options: InitializeProductAnalyticsOptions): void {
  const config = parseProductAnalyticsConfig(options.env);
  const sink = config.enabled
    ? options.delivery === 'immediate'
      ? new ImmediatePostHogSink(config)
      : new BatchedPostHogSink(config)
    : new NoopAnalyticsSink();

  installProductAnalytics({
    sink,
    environment: config.environment,
    logger: options.logger,
  });
}

export async function captureProductEvent(event: ProductEvent): Promise<void> {
  let sanitized: ProductEvent;
  try {
    sanitized = sanitizeProductEvent(event);
  } catch (error) {
    warn(
      { ...captureContext(event), errorClass: errorClass(error) },
      '[ProductAnalytics] Event validation failed',
    );
    return;
  }

  const payload: AnalyticsPayload = {
    event: sanitized.event,
    distinctId: sanitized.organizationId,
    properties: {
      organization_id: sanitized.organizationId,
      schema_version: 1,
      environment: runtime.environment,
      source: sanitized.source,
      '$process_person_profile': false,
      ...getEventProperties(sanitized),
      ...(sanitized.insertId ? { '$insert_id': sanitized.insertId } : {}),
    },
  };

  try {
    await runtime.sink.capture(payload);
  } catch (error) {
    warn(
      {
        event: sanitized.event,
        source: sanitized.source,
        organizationId: sanitized.organizationId,
        errorClass: errorClass(error),
      },
      '[ProductAnalytics] Event capture failed',
    );
  }
}

export async function shutdownProductAnalytics(timeoutMs = 2_000): Promise<void> {
  const sink = runtime.sink;
  runtime.sink = new NoopAnalyticsSink();
  if (!sink.shutdown) return;

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sink.shutdown(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Product analytics shutdown timed out')),
          timeoutMs,
        );
        timeout.unref();
      }),
    ]);
  } catch (error) {
    warn(
      { errorClass: errorClass(error) },
      '[ProductAnalytics] Shutdown flush failed',
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
