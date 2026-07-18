import {
  getEmailOAuthClient,
  persistRefreshedToken,
  requestTokenRefresh,
  type EmailOAuthClient,
  type RefreshedToken,
  type TokenRefreshResult,
} from '../token.js';
import { EmailNotConfiguredError } from '../types.js';
import { decodeGmailBase64Url } from './base64url.js';
import { GmailApiError, type GmailApiErrorKind } from './errors.js';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const REFRESH_LEEWAY_MS = 60_000;
const MAX_GMAIL_PAGE_SIZE = 500;
const MAX_HISTORY_PAGES = 1_000;
// Bound every authenticated Gmail request so a stalled socket can't hold a sync
// worker past the queue/agent lock window (AUD-015). Well under the 90s lock TTL.
const GMAIL_REQUEST_TIMEOUT_MS = 15_000;

export interface GmailApiIntegration {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface GmailApiClientOptions {
  fetch?: typeof fetch;
  oauthClient?: EmailOAuthClient;
  persistToken?: (integrationId: string, token: RefreshedToken) => Promise<void>;
  refreshToken?: (
    refreshToken: string,
    client: EmailOAuthClient,
  ) => Promise<TokenRefreshResult>;
  now?: () => number;
  baseUrl?: string;
  requestTimeoutMs?: number;
}

export type GmailLabelFilterBehavior = 'include' | 'exclude';

export interface GmailWatchRequest {
  topicName: string;
  labelIds?: string[];
  labelFilterBehavior?: GmailLabelFilterBehavior;
}

export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

export type GmailHistoryType =
  | 'messageAdded'
  | 'messageDeleted'
  | 'labelAdded'
  | 'labelRemoved';

export interface GmailMessageReference {
  id: string;
  threadId?: string;
  labelIds?: string[];
}

export interface GmailMessageAdded {
  message: GmailMessageReference;
}

export interface GmailHistoryRecord {
  id: string;
  messages?: GmailMessageReference[];
  messagesAdded?: GmailMessageAdded[];
}

export interface GmailHistoryListRequest {
  startHistoryId: string;
  historyTypes?: GmailHistoryType[];
  labelId?: string;
  pageSize?: number;
}

export interface GmailHistoryListResponse {
  history: GmailHistoryRecord[];
  historyId: string;
}

export interface GmailRawMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  historyId?: string;
  internalDate?: string;
  sizeEstimate?: number;
  raw: Buffer;
}

export interface GmailMessageListRequest {
  maxResults: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GmailMessageListResponse {
  messages: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  staleHistoryOnNotFound?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// AbortSignal.timeout rejects fetch with a DOMException named 'TimeoutError';
// a manual abort surfaces as 'AbortError'. The only signal here is the deadline.
function isAbortError(cause: unknown): boolean {
  const name = (cause as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  field: string,
  operation: string,
): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidResponse(operation);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  operation: string,
): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw invalidResponse(operation);
  return value;
}

function optionalStringArray(
  record: Record<string, unknown>,
  field: string,
  operation: string,
): string[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalidResponse(operation);
  }
  return value;
}

function optionalNonNegativeInteger(
  record: Record<string, unknown>,
  field: string,
  operation: string,
): number | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidResponse(operation);
  return value as number;
}

function invalidResponse(operation: string, cause?: unknown): GmailApiError {
  return new GmailApiError(`Gmail returned a malformed response for ${operation}`, {
    kind: 'invalid_response',
    status: null,
    operation,
    cause,
  });
}

function parseMessageReference(value: unknown, operation: string): GmailMessageReference {
  if (!isRecord(value)) throw invalidResponse(operation);
  return {
    id: requireNonEmptyString(value, 'id', operation),
    ...optionalProperty('threadId', optionalString(value, 'threadId', operation)),
    ...optionalProperty('labelIds', optionalStringArray(value, 'labelIds', operation)),
  };
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [Property in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: Value };
}

function parseHistoryRecord(value: unknown, operation: string): GmailHistoryRecord {
  if (!isRecord(value)) throw invalidResponse(operation);
  const messages = value.messages;
  const messagesAdded = value.messagesAdded;

  if (messages !== undefined && !Array.isArray(messages)) throw invalidResponse(operation);
  if (messagesAdded !== undefined && !Array.isArray(messagesAdded)) throw invalidResponse(operation);

  return {
    id: requireNonEmptyString(value, 'id', operation),
    ...(messages === undefined
      ? {}
      : { messages: messages.map((message) => parseMessageReference(message, operation)) }),
    ...(messagesAdded === undefined
      ? {}
      : {
          messagesAdded: messagesAdded.map((entry) => {
            if (!isRecord(entry)) throw invalidResponse(operation);
            return { message: parseMessageReference(entry.message, operation) };
          }),
        }),
  };
}

function getGoogleErrorReasons(value: unknown): string[] {
  if (!isRecord(value) || !isRecord(value.error) || !Array.isArray(value.error.errors)) return [];
  return value.error.errors.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.reason !== 'string') return [];
    return [entry.reason];
  });
}

function classifyHttpError(
  status: number,
  reasons: string[],
  staleHistoryOnNotFound: boolean,
): GmailApiErrorKind {
  if (status === 401) return 'authentication';
  if (status === 404 && staleHistoryOnNotFound) return 'stale_history';
  if (
    status === 429
    || reasons.some((reason) => [
      'dailyLimitExceeded',
      'quotaExceeded',
      'rateLimitExceeded',
      'userRateLimitExceeded',
    ].includes(reason))
  ) {
    return 'quota';
  }
  if (status === 403) return 'authentication';
  if (status === 408 || status === 425 || status >= 500) return 'retryable';
  return 'request';
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - now);
}

function assertPageSize(value: number | undefined, name: string): void {
  if (
    value !== undefined
    && (!Number.isInteger(value) || value < 1 || value > MAX_GMAIL_PAGE_SIZE)
  ) {
    throw new RangeError(`${name} must be an integer between 1 and ${MAX_GMAIL_PAGE_SIZE}`);
  }
}

export class GmailApiClient {
  private accessToken: string | null;
  private tokenExpiresAt: Date | null;
  private readonly fetch: typeof fetch;
  private readonly persistToken: NonNullable<GmailApiClientOptions['persistToken']>;
  private readonly refreshTokenRequest: NonNullable<GmailApiClientOptions['refreshToken']>;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly integration: GmailApiIntegration,
    private readonly options: GmailApiClientOptions = {},
  ) {
    this.accessToken = integration.accessToken;
    this.tokenExpiresAt = integration.tokenExpiresAt;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? GMAIL_REQUEST_TIMEOUT_MS;
    this.persistToken = options.persistToken ?? persistRefreshedToken;
    this.refreshTokenRequest = options.refreshToken
      ?? ((refreshToken, client) => requestTokenRefresh('gmail', refreshToken, client, this.requestTimeoutMs));
    this.now = options.now ?? Date.now;
    this.baseUrl = (options.baseUrl ?? GMAIL_API_BASE_URL).replace(/\/+$/, '');
  }

  async watch(request: GmailWatchRequest): Promise<GmailWatchResponse> {
    const operation = 'users.watch';
    const value = await this.requestJson('/users/me/watch', operation, {
      method: 'POST',
      body: request,
    });
    if (!isRecord(value)) throw invalidResponse(operation);
    return {
      historyId: requireNonEmptyString(value, 'historyId', operation),
      expiration: requireNonEmptyString(value, 'expiration', operation),
    };
  }

  async stop(): Promise<void> {
    await this.request('/users/me/stop', 'users.stop', { method: 'POST' });
  }

  async listHistory(request: GmailHistoryListRequest): Promise<GmailHistoryListResponse> {
    assertPageSize(request.pageSize, 'pageSize');
    if (!request.startHistoryId) throw new TypeError('startHistoryId is required');

    const operation = 'users.history.list';
    const history: GmailHistoryRecord[] = [];
    const seenPageTokens = new Set<string>();
    let pageToken: string | undefined;
    let historyId: string | undefined;

    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      const params = new URLSearchParams({ startHistoryId: request.startHistoryId });
      for (const historyType of request.historyTypes ?? []) {
        params.append('historyTypes', historyType);
      }
      if (request.labelId) params.set('labelId', request.labelId);
      if (request.pageSize) params.set('maxResults', String(request.pageSize));
      if (pageToken) params.set('pageToken', pageToken);

      const value = await this.requestJson(
        `/users/me/history?${params.toString()}`,
        operation,
        { staleHistoryOnNotFound: true },
      );
      if (!isRecord(value)) throw invalidResponse(operation);
      if (value.history !== undefined && !Array.isArray(value.history)) {
        throw invalidResponse(operation);
      }

      history.push(
        ...(value.history ?? []).map((entry) => parseHistoryRecord(entry, operation)),
      );
      historyId = requireNonEmptyString(value, 'historyId', operation);
      pageToken = optionalString(value, 'nextPageToken', operation);
      if (!pageToken) return { history, historyId };
      if (seenPageTokens.has(pageToken)) throw invalidResponse(operation);
      seenPageTokens.add(pageToken);
    }

    throw invalidResponse(operation);
  }

  async getMessageRaw(messageId: string): Promise<GmailRawMessage> {
    if (!messageId) throw new TypeError('messageId is required');
    const operation = 'users.messages.get';
    const value = await this.requestJson(
      `/users/me/messages/${encodeURIComponent(messageId)}?format=raw`,
      operation,
    );
    if (!isRecord(value)) throw invalidResponse(operation);

    return {
      id: requireNonEmptyString(value, 'id', operation),
      ...optionalProperty('threadId', optionalString(value, 'threadId', operation)),
      ...optionalProperty('labelIds', optionalStringArray(value, 'labelIds', operation)),
      ...optionalProperty('historyId', optionalString(value, 'historyId', operation)),
      ...optionalProperty('internalDate', optionalString(value, 'internalDate', operation)),
      ...optionalProperty(
        'sizeEstimate',
        optionalNonNegativeInteger(value, 'sizeEstimate', operation),
      ),
      raw: decodeGmailBase64Url(requireNonEmptyString(value, 'raw', operation)),
    };
  }

  async listMessages(request: GmailMessageListRequest): Promise<GmailMessageListResponse> {
    assertPageSize(request.maxResults, 'maxResults');
    const operation = 'users.messages.list';
    const params = new URLSearchParams({ maxResults: String(request.maxResults) });
    if (request.pageToken) params.set('pageToken', request.pageToken);
    if (request.query) params.set('q', request.query);
    for (const labelId of request.labelIds ?? []) params.append('labelIds', labelId);
    if (request.includeSpamTrash !== undefined) {
      params.set('includeSpamTrash', String(request.includeSpamTrash));
    }

    const value = await this.requestJson(
      `/users/me/messages?${params.toString()}`,
      operation,
    );
    if (!isRecord(value)) throw invalidResponse(operation);
    if (value.messages !== undefined && !Array.isArray(value.messages)) {
      throw invalidResponse(operation);
    }

    return {
      messages: (value.messages ?? []).map((message) => (
        parseMessageReference(message, operation)
      )),
      ...optionalProperty(
        'nextPageToken',
        optionalString(value, 'nextPageToken', operation),
      ),
      ...optionalProperty(
        'resultSizeEstimate',
        optionalNonNegativeInteger(value, 'resultSizeEstimate', operation),
      ),
    };
  }

  private async requestJson(
    path: string,
    operation: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const response = await this.request(path, operation, options);
    try {
      return await response.json();
    } catch (cause) {
      throw invalidResponse(operation, cause);
    }
  }

  private async request(
    path: string,
    operation: string,
    options: RequestOptions,
  ): Promise<Response> {
    if (this.shouldRefreshProactively()) await this.refresh(operation);
    if (!this.accessToken) await this.refresh(operation);

    let response = await this.fetchAuthenticated(path, operation, options);
    if (response.status === 401) {
      await this.refresh(operation);
      response = await this.fetchAuthenticated(path, operation, options);
    }
    if (!response.ok) await this.throwResponseError(response, operation, options);
    return response;
  }

  private async fetchAuthenticated(
    path: string,
    operation: string,
    options: RequestOptions,
  ): Promise<Response> {
    try {
      return await this.fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw new GmailApiError(`Gmail request failed for ${operation}`, {
        kind: isAbortError(cause) ? 'timeout' : 'retryable',
        status: null,
        operation,
        cause,
      });
    }
  }

  private async throwResponseError(
    response: Response,
    operation: string,
    options: RequestOptions,
  ): Promise<never> {
    const body = await response.json().catch(() => null) as unknown;
    const reasons = getGoogleErrorReasons(body);
    const kind = classifyHttpError(
      response.status,
      reasons,
      options.staleHistoryOnNotFound === true,
    );
    throw new GmailApiError(`Gmail request failed for ${operation} (${response.status})`, {
      kind,
      status: response.status,
      operation,
      retryAfterMs: parseRetryAfter(response.headers.get('Retry-After'), this.now()),
    });
  }

  private shouldRefreshProactively(): boolean {
    return !!this.tokenExpiresAt
      && this.tokenExpiresAt.getTime() - REFRESH_LEEWAY_MS < this.now();
  }

  private async refresh(operation: string): Promise<void> {
    if (!this.integration.refreshToken) {
      throw new EmailNotConfiguredError('Gmail refresh token missing');
    }
    const client = this.options.oauthClient ?? getEmailOAuthClient();
    if (!client) throw new EmailNotConfiguredError('Gmail OAuth credentials missing');

    const result = await this.refreshTokenRequest(this.integration.refreshToken, client);
    if (!result.ok) {
      const kind: GmailApiErrorKind = result.transient
        ? 'retryable'
        : result.status === 429
          ? 'quota'
          : 'authentication';
      throw new GmailApiError(`Gmail token refresh failed for ${operation}`, {
        kind,
        status: result.status,
        operation,
      });
    }

    this.accessToken = result.token.accessToken;
    this.tokenExpiresAt = result.token.expiresAt;
    await this.persistToken(this.integration.id, result.token);
  }
}
