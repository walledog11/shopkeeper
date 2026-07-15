export const INSTAGRAM_GRAPH_VERSION = 'v25.0';

const INSTAGRAM_GRAPH_ORIGIN = 'https://graph.instagram.com';
const INSTAGRAM_GRAPH_BASE_URL = `${INSTAGRAM_GRAPH_ORIGIN}/${INSTAGRAM_GRAPH_VERSION}`;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export type InstagramProviderErrorCategory =
  | 'authentication'
  | 'permission'
  | 'rate_limit'
  | 'transient_provider_failure'
  | 'validation'
  | 'unknown';

export interface InstagramProviderError {
  category: InstagramProviderErrorCategory;
  httpStatus: number;
  code: string | number | null;
  subcode: number | null;
  message: string;
  requestId: string | null;
}

export type InstagramGraphResult<T> =
  | { ok: true; data: T; httpStatus: number; requestId: string | null }
  | { ok: false; error: InstagramProviderError };

export interface InstagramConnectedAccount {
  userId: string;
  username: string | null;
  accountType: string | null;
}

export interface InstagramRefreshedToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string | null;
}

export interface InstagramMessagingUserProfile {
  name: string | null;
  username: string | null;
  profilePictureUrl: string | null;
}

export interface InstagramMessageSubscription {
  fields: string[];
  messagesActive: boolean;
}

interface ProviderErrorDescriptor {
  code: string | number | null;
  message: string | null;
  requestId: string | null;
  subcode: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCode(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function readFirstDataRecord(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (!Array.isArray(payload.data)) return payload;
  return isRecord(payload.data[0]) ? payload.data[0] : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readProviderError(payload: unknown): ProviderErrorDescriptor | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  return {
    code: readCode(payload.error.code),
    message: readString(payload.error.message),
    requestId: readString(payload.error.fbtrace_id),
    subcode: readNumber(payload.error.error_subcode),
  };
}

function normalizeNumericCode(code: string | number | null): number | null {
  if (typeof code === 'number') return code;
  if (!code) return null;
  const parsed = Number(code);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyProviderError(
  httpStatus: number,
  code: string | number | null,
): InstagramProviderErrorCategory {
  const numericCode = normalizeNumericCode(code);
  if (httpStatus === 401 || numericCode === 102 || numericCode === 190) return 'authentication';
  if (httpStatus === 403 || numericCode === 10 || numericCode === 200) return 'permission';
  if (
    httpStatus === 429
    || numericCode === 4
    || numericCode === 17
    || numericCode === 32
    || numericCode === 613
    || numericCode === 80004
  ) return 'rate_limit';
  if (httpStatus >= 500 || numericCode === 1 || numericCode === 2) {
    return 'transient_provider_failure';
  }
  if (httpStatus === 400 || numericCode === 100) return 'validation';
  return 'unknown';
}

async function requestInstagramJson<T>(
  url: string | URL,
  init: RequestInit,
  parse: (payload: unknown) => T | null,
): Promise<InstagramGraphResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    const descriptor = readProviderError(payload);
    const requestId = descriptor?.requestId
      ?? response.headers.get('x-fb-trace-id')
      ?? response.headers.get('x-request-id');

    if (!response.ok || descriptor) {
      const code = descriptor?.code ?? null;
      return {
        ok: false,
        error: {
          category: classifyProviderError(response.status, code),
          httpStatus: response.status,
          code,
          subcode: descriptor?.subcode ?? null,
          message: descriptor?.message ?? 'Instagram API request failed',
          requestId,
        },
      };
    }

    const data = parse(payload);
    if (data === null) {
      return {
        ok: false,
        error: {
          category: 'validation',
          httpStatus: response.status,
          code: null,
          subcode: null,
          message: 'Instagram API returned an invalid response',
          requestId,
        },
      };
    }

    return { ok: true, data, httpStatus: response.status, requestId };
  } catch (error) {
    const timedOut = error instanceof Error
      && (error.name === 'AbortError' || error.name === 'TimeoutError');
    return {
      ok: false,
      error: {
        category: 'transient_provider_failure',
        httpStatus: 0,
        code: null,
        subcode: null,
        message: timedOut ? 'Instagram API request timed out' : 'Instagram API request failed',
        requestId: null,
      },
    };
  }
}

function bearerHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function fetchConnectedInstagramAccount(
  accessToken: string,
): Promise<InstagramGraphResult<InstagramConnectedAccount>> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'user_id,username,account_type');
  return requestInstagramJson(url, {
    method: 'GET',
    headers: bearerHeaders(accessToken),
  }, (payload) => {
    const record = readFirstDataRecord(payload);
    const userId = readString(record?.user_id);
    if (!userId) return null;
    return {
      userId,
      username: readString(record?.username),
      accountType: readString(record?.account_type),
    };
  });
}

export function refreshInstagramAccessToken(
  accessToken: string,
): Promise<InstagramGraphResult<InstagramRefreshedToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_ORIGIN}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  return requestInstagramJson(url, { method: 'GET' }, (payload) => {
    if (!isRecord(payload)) return null;
    const refreshedAccessToken = readString(payload.access_token);
    const expiresIn = readNumber(payload.expires_in);
    if (!refreshedAccessToken || !expiresIn || expiresIn <= 0) return null;
    return {
      accessToken: refreshedAccessToken,
      expiresIn,
      tokenType: readString(payload.token_type),
    };
  });
}

export function fetchInstagramMessageSubscription(
  instagramAccountId: string,
  accessToken: string,
): Promise<InstagramGraphResult<InstagramMessageSubscription>> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE_URL}/${encodeURIComponent(instagramAccountId)}/subscribed_apps`,
  );
  return requestInstagramJson(url, {
    method: 'GET',
    headers: bearerHeaders(accessToken),
  }, (payload) => {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
    const fields = [...new Set(payload.data.flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.subscribed_fields)) return [];
      return item.subscribed_fields
        .map(readString)
        .filter((field): field is string => field !== null);
    }))];
    return { fields, messagesActive: fields.includes('messages') };
  });
}

export function fetchInstagramMessagingUserProfile(
  igsid: string,
  accessToken: string,
): Promise<InstagramGraphResult<InstagramMessagingUserProfile>> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${encodeURIComponent(igsid)}`);
  url.searchParams.set('fields', 'name,username,profile_pic');
  return requestInstagramJson(url, {
    method: 'GET',
    headers: bearerHeaders(accessToken),
  }, (payload) => {
    const record = readFirstDataRecord(payload);
    if (!record) return null;
    const name = readString(record.name);
    const username = readString(record.username);
    const profilePictureUrl = readString(record.profile_pic);
    if (!name && !username && !profilePictureUrl) return null;
    return { name, username, profilePictureUrl };
  });
}
