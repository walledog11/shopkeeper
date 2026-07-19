export const DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS = 15_000;

export class ExternalRequestTimeoutError extends Error {
  readonly operation: string;
  readonly provider: string;
  readonly timeoutMs: number;

  constructor(
    provider: string,
    operation: string,
    timeoutMs: number,
    cause: unknown,
  ) {
    super(`${provider} ${operation} timed out after ${timeoutMs}ms`, { cause });
    this.name = 'ExternalRequestTimeoutError';
    this.provider = provider;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function isExternalRequestTimeoutError(
  error: unknown,
): error is ExternalRequestTimeoutError {
  return error instanceof ExternalRequestTimeoutError;
}

export async function fetchWithDeadline(
  input: string | URL | Request,
  init: RequestInit = {},
  options: {
    operation: string;
    provider: string;
    timeoutMs?: number;
  },
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (
      error instanceof Error
      && (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new ExternalRequestTimeoutError(
        options.provider,
        options.operation,
        timeoutMs,
        error,
      );
    }
    throw error;
  }
}
