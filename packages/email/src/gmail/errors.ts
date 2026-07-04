export type GmailApiErrorKind =
  | 'authentication'
  | 'quota'
  | 'stale_history'
  | 'retryable'
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
