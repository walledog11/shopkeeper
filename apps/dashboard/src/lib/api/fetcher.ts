type ApiErrorPayload = {
  error?: unknown;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function formatErrorValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const text = formatErrorValue(item);
      return text ? [text] : [];
    }).join('; ') || null;
  }
  if (value && typeof value === 'object') {
    const messages = Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const text = formatErrorValue(nested);
      return text ? [`${key}: ${text}`] : [];
    });
    return messages.join('; ') || null;
  }
  return null;
}

export function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const message = formatErrorValue((payload as ApiErrorPayload).error);
    if (message) return message;
  }
  return fallback;
}

export function errorMessageFromUnknown(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isApiRequestError(error: unknown, status?: number): error is ApiRequestError {
  return error instanceof ApiRequestError && (status === undefined || error.status === status);
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  fallbackError?: string,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readJsonResponse<T & ApiErrorPayload>(response);
  const fallback = fallbackError ?? `API error: ${response.status} ${response.statusText}`.trim();

  if (!response.ok) {
    throw new ApiRequestError(errorMessageFromPayload(payload, fallback), response.status, payload);
  }
  if (!payload) {
    throw new ApiRequestError(fallbackError ?? 'API response was not valid JSON.', response.status, payload);
  }

  return payload;
}

export async function requestOk(
  url: string,
  init: RequestInit = {},
  fallbackError?: string,
): Promise<void> {
  const response = await fetch(url, init);
  if (response.ok) return;

  const payload = await readJsonResponse<ApiErrorPayload>(response);
  const fallback = fallbackError ?? `API error: ${response.status} ${response.statusText}`.trim();
  throw new ApiRequestError(errorMessageFromPayload(payload, fallback), response.status, payload);
}

export const fetcher = <T>(url: string) => requestJson<T>(url);
