import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { NextFunction, Request, Response } from 'express';
import type { ShutdownResource } from './shutdown.js';

const FLUSH_TIMEOUT_MS = 2_000;
const REPEAT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_ERRORS = 1_000;

/**
 * Error reports from one gateway process: a crash, a 5xx route error, and a job
 * BullMQ has given up on. Unset `SENTRY_DSN` leaves them in the logs only.
 *
 * Nothing is captured implicitly. The SDK's default integrations would attach
 * inbound request headers (`x-internal-secret`, webhook signatures), record
 * outgoing URLs (the Telegram bot token is in the path) and add Sentry trace
 * headers to every provider call. An event carries only what its capture site
 * passes: the exception, a queue or route tag, and identifiers.
 *
 * No unhandled-rejection integration, on purpose: Node's default raises the
 * rejection as an uncaught exception, which is captured and still exits. By
 * default Sentry's own handler keeps the process running, and even in strict
 * mode it ignores an `AbortError` and keeps running.
 */
export function initializeGatewaySentry(role: 'server' | 'worker'): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    registerEsmLoaderHooks: false,
    initialScope: { tags: { service: 'gateway', role } },
    beforeSend: event => (isRepeatWithinWindow(event, Date.now()) ? null : event),
  });
}

/**
 * A job BullMQ has given up on. `extra` is the worker's identifiers, never
 * `job.data`, which can hold customer text.
 */
export function captureJobFailure(queue: string, error: Error, extra: Record<string, unknown>): void {
  Sentry.captureException(error, { tags: { queue }, extra });
}

// Express 5 hands thrown and rejected route errors here. A 4xx is the caller's
// mistake; anything else is ours. The tag is the route template, never the URL:
// a path or query string can carry a token.
export function captureRouteError(error: unknown, req: Request, _res: Response, next: NextFunction): void {
  if (responseStatus(error) >= 500) {
    Sentry.captureException(error, {
      tags: { route: `${req.baseUrl}${req.route?.path ?? ''}` || 'unmatched', method: req.method },
    });
  }
  next(error);
}

export function createSentryShutdownResource(): ShutdownResource {
  return {
    label: 'sentry',
    close: async () => {
      await Sentry.flush(FLUSH_TIMEOUT_MS);
    },
  };
}

// The status Express's final handler answers an error with.
function responseStatus(error: unknown): number {
  const { status, statusCode } = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  for (const candidate of [status, statusCode]) {
    if (typeof candidate === 'number' && candidate >= 400 && candidate < 600) return candidate;
  }
  return 500;
}

// A sweep runs every minute, so one broken by an outage fails about 1,400 times
// a day and would spend the month's event quota before anyone looked. The same
// error from the same queue or route is reported once an hour per process; the
// logs keep every occurrence. A crash is always reported.
const lastReportedAt = new Map<string, number>();

function isRepeatWithinWindow(event: ErrorEvent, now: number): boolean {
  const exception = event.exception?.values?.at(-1);
  if (event.level === 'fatal' || !exception) return false;

  const key = [event.tags?.queue, event.tags?.route, exception.type, exception.value].join('\n');
  const reportedAt = lastReportedAt.get(key);
  if (reportedAt !== undefined && now - reportedAt < REPEAT_WINDOW_MS) return true;

  if (lastReportedAt.size >= MAX_TRACKED_ERRORS) lastReportedAt.clear();
  lastReportedAt.set(key, now);
  return false;
}
