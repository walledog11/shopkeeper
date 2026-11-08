export class RequestTimeoutError extends Error {
  constructor(
    readonly provider: string,
    readonly operation: string,
    readonly timeoutMs: number,
    cause: unknown,
  ) {
    super(`${provider} ${operation} timed out after ${timeoutMs}ms`, { cause });
    this.name = 'RequestTimeoutError';
  }
}

interface RequestDeadlineOptions {
  operation: string;
  provider: string;
  timeoutMs?: number;
}

// Keep each host's public error identity while sharing deadline behavior.
export function createFetchWithDeadline(TimeoutError: typeof RequestTimeoutError) {
  return async function fetchWithDeadline(
    input: string | URL | Request,
    init: RequestInit = {},
    options: RequestDeadlineOptions,
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    try {
      return await fetch(input, { ...init, signal });
    } catch (error) {
      // Preserve the hosts' existing classification of caller aborts, too.
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new TimeoutError(options.provider, options.operation, timeoutMs, error);
      }
      throw error;
    }
  };
}
