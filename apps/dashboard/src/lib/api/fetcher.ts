type ApiErrorPayload = {
  error?: unknown;
};

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
    return value.map(formatErrorValue).filter(Boolean).join('; ') || null;
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

export async function requestJson<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readJsonResponse<T & ApiErrorPayload>(response);

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, fallbackError));
  }
  if (!payload) {
    throw new Error(fallbackError);
  }

  return payload;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`API error: ${res.status} ${res.statusText}`);
    throw error;
  }
  return res.json();
};
