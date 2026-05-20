import type { ErrorEvent, EventHint } from '@sentry/node';

export const REDACTED = '[REDACTED]';
export const REDACTED_EMAIL = '[email]';

export const PINO_REDACT_PATHS = [
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'integration.accessToken',
  'integration.refreshToken',
  'email',
  'customerEmail',
  'fromEmail',
  'toEmail',
  'body',
  'responseBody',
  'rawBody',
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[_-]?key|email|message|body)/i;

function scrubString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED_EMAIL);
}

function scrubValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value == null) return value;
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return typeof value === 'string' ? REDACTED : value;
  }
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, key, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, k, depth + 1);
    }
    return out;
  }
  return value;
}

export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>;
      for (const k of Object.keys(headers)) {
        if (SENSITIVE_KEY_PATTERN.test(k)) headers[k] = REDACTED;
      }
    }
    if (event.request.query_string && typeof event.request.query_string === 'string') {
      event.request.query_string = scrubString(event.request.query_string);
    }
  }
  if (event.user?.email) event.user.email = REDACTED_EMAIL;
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as ErrorEvent['contexts'];
  if (event.tags) event.tags = scrubValue(event.tags) as ErrorEvent['tags'];
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: b.message ? scrubString(b.message) : b.message,
      data: b.data ? (scrubValue(b.data) as Record<string, unknown>) : b.data,
    }));
  }
  if (event.message) event.message = scrubString(event.message);
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((v) => ({
      ...v,
      value: v.value ? scrubString(v.value) : v.value,
    }));
  }
  return event;
}
