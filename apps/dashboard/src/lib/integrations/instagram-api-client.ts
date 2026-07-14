export const INSTAGRAM_GRAPH_VERSION = 'v25.0';
export const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
] as const;

const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_CODE_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_ORIGIN = 'https://graph.instagram.com';
const INSTAGRAM_GRAPH_BASE_URL = `${INSTAGRAM_GRAPH_ORIGIN}/${INSTAGRAM_GRAPH_VERSION}`;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_TEXT_MESSAGE_BYTES = 1_000;

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

export type InstagramApiResult<T> =
  | { ok: true; data: T; httpStatus: number; requestId: string | null }
  | { ok: false; error: InstagramProviderError };

export interface InstagramShortLivedToken {
  accessToken: string;
  userId: string;
  permissions: string[];
}

export interface InstagramLongLivedToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string | null;
}

export interface InstagramAccount {
  userId: string;
  username: string;
  accountType: string | null;
}

export interface InstagramMessageSubscription {
  fields: string[];
  messagesActive: boolean;
}

export interface InstagramSendResult {
  messageId: string;
  recipientId: string | null;
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

function parsePermissions(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return [...new Set(values.map(readString).filter((item): item is string => item !== null))];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readProviderError(payload: unknown): ProviderErrorDescriptor | null {
  if (!isRecord(payload)) return null;

  if (isRecord(payload.error)) {
    return {
      code: readCode(payload.error.code),
      message: readString(payload.error.message),
      requestId: readString(payload.error.fbtrace_id),
      subcode: readNumber(payload.error.error_subcode),
    };
  }

  const oauthMessage = readString(payload.error_message);
  const oauthType = readString(payload.error_type);
  if (oauthMessage || oauthType) {
    return {
      code: readCode(payload.code),
      message: oauthMessage ?? oauthType,
      requestId: readString(payload.fbtrace_id),
      subcode: readNumber(payload.error_subcode),
    };
  }

  return null;
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

  if (httpStatus === 401 || numericCode === 102 || numericCode === 190) {
    return 'authentication';
  }
  if (httpStatus === 403 || numericCode === 10 || numericCode === 200) {
    return 'permission';
  }
  if (
    httpStatus === 429
    || numericCode === 4
    || numericCode === 17
    || numericCode === 32
    || numericCode === 613
    || numericCode === 80004
  ) {
    return 'rate_limit';
  }
  if (httpStatus >= 500 || numericCode === 1 || numericCode === 2) {
    return 'transient_provider_failure';
  }
  if (httpStatus === 400 || numericCode === 100) {
    return 'validation';
  }
  return 'unknown';
}

function createValidationError(message: string, httpStatus = 0): InstagramProviderError {
  return {
    category: 'validation',
    httpStatus,
    code: null,
    subcode: null,
    message,
    requestId: null,
  };
}

function createResponseError(
  response: Response,
  descriptor: ProviderErrorDescriptor | null,
): InstagramProviderError {
  const requestId = descriptor?.requestId
    ?? response.headers.get('x-fb-trace-id')
    ?? response.headers.get('x-request-id');
  const code = descriptor?.code ?? null;
  return {
    category: classifyProviderError(response.status, code),
    httpStatus: response.status,
    code,
    subcode: descriptor?.subcode ?? null,
    message: descriptor?.message ?? 'Instagram API request failed',
    requestId,
  };
}

async function requestInstagramJson<T>(
  url: string | URL,
  init: RequestInit,
  parse: (payload: unknown) => T | null,
): Promise<InstagramApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    const descriptor = readProviderError(payload);
    if (!response.ok || descriptor) {
      return { ok: false, error: createResponseError(response, descriptor) };
    }

    const data = parse(payload);
    if (data === null) {
      return {
        ok: false,
        error: {
          ...createValidationError('Instagram API returned an invalid response', response.status),
          requestId: response.headers.get('x-fb-trace-id') ?? response.headers.get('x-request-id'),
        },
      };
    }

    return {
      ok: true,
      data,
      httpStatus: response.status,
      requestId: response.headers.get('x-fb-trace-id') ?? response.headers.get('x-request-id'),
    };
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

function bearerHeaders(accessToken: string, contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

function accountPath(accountId: string, suffix: string): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${encodeURIComponent(accountId)}${suffix}`;
}

export function buildInstagramAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  forceReauth?: boolean;
}): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', INSTAGRAM_REQUIRED_SCOPES.join(','));
  url.searchParams.set('state', input.state);
  url.searchParams.set('enable_fb_login', 'false');
  if (input.forceReauth) url.searchParams.set('force_reauth', 'true');
  return url.toString();
}

export function exchangeInstagramAuthorizationCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri: string;
}): Promise<InstagramApiResult<InstagramShortLivedToken>> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });

  return requestInstagramJson(
    INSTAGRAM_CODE_EXCHANGE_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    (payload) => {
      const record = readFirstDataRecord(payload);
      const accessToken = readString(record?.access_token);
      const userId = readString(record?.user_id);
      if (!accessToken || !userId) return null;
      return {
        accessToken,
        userId,
        permissions: parsePermissions(record?.permissions),
      };
    },
  );
}

export function exchangeInstagramLongLivedToken(input: {
  appSecret: string;
  shortLivedToken: string;
}): Promise<InstagramApiResult<InstagramLongLivedToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_ORIGIN}/access_token`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', input.appSecret);
  url.searchParams.set('access_token', input.shortLivedToken);

  return requestInstagramJson(url, { method: 'GET' }, (payload) => {
    if (!isRecord(payload)) return null;
    const accessToken = readString(payload.access_token);
    const expiresIn = readNumber(payload.expires_in);
    if (!accessToken || !expiresIn || expiresIn <= 0) return null;
    return {
      accessToken,
      expiresIn,
      tokenType: readString(payload.token_type),
    };
  });
}

export function fetchInstagramAccount(
  accessToken: string,
): Promise<InstagramApiResult<InstagramAccount>> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'user_id,username,account_type');

  return requestInstagramJson(url, {
    method: 'GET',
    headers: bearerHeaders(accessToken),
  }, (payload) => {
    const record = readFirstDataRecord(payload);
    const userId = readString(record?.user_id);
    const username = readString(record?.username);
    if (!userId || !username) return null;
    return {
      userId,
      username,
      accountType: readString(record?.account_type),
    };
  });
}

export function subscribeInstagramMessages(input: {
  accountId: string;
  accessToken: string;
}): Promise<InstagramApiResult<{ success: true }>> {
  return requestInstagramJson(
    accountPath(input.accountId, '/subscribed_apps'),
    {
      method: 'POST',
      headers: bearerHeaders(input.accessToken, 'application/x-www-form-urlencoded'),
      body: new URLSearchParams({ subscribed_fields: 'messages' }),
    },
    (payload) => isRecord(payload) && payload.success === true ? { success: true } : null,
  );
}

export function unsubscribeInstagramMessages(input: {
  accountId: string;
  accessToken: string;
}): Promise<InstagramApiResult<{ success: true }>> {
  return requestInstagramJson(
    accountPath(input.accountId, '/subscribed_apps'),
    {
      method: 'DELETE',
      headers: bearerHeaders(input.accessToken, 'application/x-www-form-urlencoded'),
      body: new URLSearchParams({ subscribed_fields: 'messages' }),
    },
    (payload) => isRecord(payload) && payload.success === true ? { success: true } : null,
  );
}

export function fetchInstagramMessageSubscription(input: {
  accountId: string;
  accessToken: string;
}): Promise<InstagramApiResult<InstagramMessageSubscription>> {
  return requestInstagramJson(
    accountPath(input.accountId, '/subscribed_apps'),
    {
      method: 'GET',
      headers: bearerHeaders(input.accessToken),
    },
    (payload) => {
      if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
      const fields = [...new Set(payload.data.flatMap((item) => {
        if (!isRecord(item) || !Array.isArray(item.subscribed_fields)) return [];
        return item.subscribed_fields
          .map(readString)
          .filter((field): field is string => field !== null);
      }))];
      return { fields, messagesActive: fields.includes('messages') };
    },
  );
}

export function sendInstagramTextMessage(input: {
  accountId: string;
  accessToken: string;
  recipientIgsid: string;
  text: string;
}): Promise<InstagramApiResult<InstagramSendResult>> {
  if (!input.accountId || !input.accessToken || !input.recipientIgsid || !input.text) {
    return Promise.resolve({
      ok: false,
      error: createValidationError('Instagram message fields are required'),
    });
  }
  if (new TextEncoder().encode(input.text).byteLength > MAX_TEXT_MESSAGE_BYTES) {
    return Promise.resolve({
      ok: false,
      error: createValidationError('Instagram text messages must be 1000 bytes or less'),
    });
  }

  return requestInstagramJson(
    accountPath(input.accountId, '/messages'),
    {
      method: 'POST',
      headers: bearerHeaders(input.accessToken, 'application/json'),
      body: JSON.stringify({
        recipient: { id: input.recipientIgsid },
        message: { text: input.text },
      }),
    },
    (payload) => {
      if (!isRecord(payload)) return null;
      const messageId = readString(payload.message_id);
      if (!messageId) return null;
      return {
        messageId,
        recipientId: readString(payload.recipient_id),
      };
    },
  );
}
