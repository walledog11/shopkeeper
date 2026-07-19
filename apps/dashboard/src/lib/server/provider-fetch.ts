const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

export class ProviderRequestTimeoutError extends Error {
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
    this.name = 'ProviderRequestTimeoutError';
    this.provider = provider;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function isProviderRequestTimeoutError(
  error: unknown,
): error is ProviderRequestTimeoutError {
  return error instanceof ProviderRequestTimeoutError;
}

export async function fetchProviderWithDeadline(
  input: string | URL | Request,
  init: RequestInit,
  options: {
    operation: string;
    provider: string;
    timeoutMs?: number;
  },
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
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
      throw new ProviderRequestTimeoutError(
        options.provider,
        options.operation,
        timeoutMs,
        error,
      );
    }
    throw error;
  }
}
