import { EmailNotConfiguredError } from '../types.js';

export type GmailWatchErrorCategory =
  | 'watch_authentication'
  | 'watch_configuration'
  | 'watch_invalid_response'
  | 'watch_quota'
  | 'watch_request'
  | 'watch_retryable'
  | 'watch_stale_history'
  | 'watch_timeout'
  | 'watch_unknown';

export type GmailApiErrorKind =
  | 'authentication'
  | 'quota'
  | 'stale_history'
  | 'retryable'
  | 'timeout'
  | 'invalid_response'
  | 'request';

export interface GmailApiErrorOptions {
  kind: GmailApiErrorKind;
  status: number | null;
  operation: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class GmailApiError extends Error {
  readonly kind: GmailApiErrorKind;
  readonly status: number | null;
  readonly operation: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(message: string, options: GmailApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'GmailApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.operation = options.operation;
    this.retryable = options.kind === 'retryable' || options.kind === 'quota';
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isGmailApiError(error: unknown): error is GmailApiError {
  return error instanceof GmailApiError;
}

export function classifyWatchError(error: unknown): GmailWatchErrorCategory {
  if (error instanceof EmailNotConfiguredError) return 'watch_configuration';
  if (isGmailApiError(error)) return `watch_${error.kind}`;
  return 'watch_unknown';
}
