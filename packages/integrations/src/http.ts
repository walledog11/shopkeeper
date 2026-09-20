export async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export function isFetchTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function readResponseRequestId(response: Response, extraHeaders: readonly string[] = []): string | null {
  for (const name of ['x-request-id', 'request-id', ...extraHeaders]) {
    const value = response.headers.get(name);
    if (value) return value;
  }
  return null;
}
