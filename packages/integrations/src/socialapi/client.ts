import { isRecord } from '../guards.js';
import { isFetchTimeoutError, readResponseJson, readResponseRequestId } from '../http.js';
import { readString } from '../values.js';

export const SOCIALAPI_PRODUCTION_BASE_URL = 'https://api.social-api.ai/v1';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_TEXT_MESSAGE_BYTES = 1_000;

export type SocialApiErrorCategory =
  | 'authentication'
  | 'permission'
  | 'response_window'
  | 'rate_limit'
  | 'transient_provider_failure'
  | 'validation'
  | 'isolation'
  | 'unknown';

export interface SocialApiError {
  category: SocialApiErrorCategory;
  httpStatus: number;
  code: string | number | null;
  message: string;
  requestId: string | null;
}

export type SocialApiResult<T> =
  | { ok: true; data: T; httpStatus: number; requestId: string | null }
  | { ok: false; error: SocialApiError };

export interface SocialApiConnectResult {
  authUrl: string;
  state: string;
}

export interface SocialApiOAuthExchangeResult {
  accountId: string;
  platform: 'instagram';
  username: string;
}

export interface SocialApiAccount {
  id: string;
  brandId: string;
  platform: 'instagram';
  username: string;
  name: string | null;
  status: string;
  reconnectReason: string | null;
}

export interface SocialApiSendResult {
  messageId: string;
  messageIds: string[];
}

export interface SocialApiInstagramConversation {
  id: string;
  accountId: string;
  platformId: string;
  participantId: string;
  participantName: string | null;
  participantPictureUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  status: string;
}

export interface SocialApiInstagramMessage {
  id: string;
  conversationId: string;
  platformId: string;
  senderId: string;
  senderName: string | null;
  direction: string;
  text: string | null;
  attachmentType: string | null;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface SocialApiPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SocialApiWebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface SocialApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface SocialApiClientConfig {
  apiKey: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

function readCode(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('SocialAPI base URL must use HTTPS outside local tests');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function classifyError(httpStatus: number, code: string | number | null): SocialApiErrorCategory {
  const normalized = typeof code === 'string' ? code.toLowerCase() : '';
  if (httpStatus === 401 || normalized.includes('invalid_token') || normalized.includes('unauthorized')) {
    return 'authentication';
  }
  if (httpStatus === 403) {
    if (normalized.includes('window')) return 'response_window';
    if (normalized.includes('brand') || normalized.includes('scope')) return 'isolation';
    return 'permission';
  }
  if (httpStatus === 429) return 'rate_limit';
  if (httpStatus >= 500 || httpStatus === 0) return 'transient_provider_failure';
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 422) return 'validation';
  return 'unknown';
}

function readError(payload: unknown): { code: string | number | null; message: string | null } {
  if (!isRecord(payload)) return { code: null, message: null };
  if (isRecord(payload.error)) {
    return {
      code: readCode(payload.error.code),
      message: readString(payload.error.message),
    };
  }
  return {
    code: readCode(payload.code),
    message: readString(payload.error) ?? readString(payload.message),
  };
}

function validationError(message: string, httpStatus = 0, requestId: string | null = null): SocialApiError {
  return { category: 'validation', httpStatus, code: null, message, requestId };
}

async function requestJson<T>(
  config: SocialApiClientConfig,
  path: string,
  init: RequestInit,
  parse: (payload: unknown) => T | null,
): Promise<SocialApiResult<T>> {
  let response: Response;
  try {
    response = await config.fetchImpl(`${config.baseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    const timedOut = isFetchTimeoutError(error);
    return {
      ok: false,
      error: {
        category: 'transient_provider_failure',
        httpStatus: 0,
        code: null,
        message: timedOut ? 'SocialAPI request timed out' : 'SocialAPI request failed',
        requestId: null,
      },
    };
  }

  const payload = response.status === 204 ? null : await readResponseJson(response);
  if (!response.ok) {
    const descriptor = readError(payload);
    return {
      ok: false,
      error: {
        category: classifyError(response.status, descriptor.code),
        httpStatus: response.status,
        code: descriptor.code,
        message: descriptor.message ?? 'SocialAPI request failed',
        requestId: readResponseRequestId(response),
      },
    };
  }

  const data = parse(payload);
  if (data === null) {
    return {
      ok: false,
      error: validationError('SocialAPI returned an invalid response', response.status, readResponseRequestId(response)),
    };
  }
  return { ok: true, data, httpStatus: response.status, requestId: readResponseRequestId(response) };
}

function parseConnect(payload: unknown): SocialApiConnectResult | null {
  if (!isRecord(payload)) return null;
  const authUrl = readString(payload.auth_url);
  const state = readString(payload.state);
  if (!authUrl || !state) return null;
  try {
    if (new URL(authUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { authUrl, state };
}

function parseOAuthExchange(payload: unknown): SocialApiOAuthExchangeResult | null {
  if (!isRecord(payload)) return null;
  const accountId = readString(payload.account_id);
  const username = readString(payload.username);
  if (!accountId || payload.platform !== 'instagram' || !username) return null;
  return { accountId, platform: 'instagram', username };
}

function parseAccount(value: unknown): SocialApiAccount | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const brandId = readString(value.brand_id);
  const username = readString(value.username);
  const status = readString(value.status);
  if (!id || !brandId || value.platform !== 'instagram' || !username || !status) return null;
  return {
    id,
    brandId,
    platform: 'instagram',
    username,
    name: readString(value.name),
    status,
    reconnectReason: readString(value.reconnect_reason),
  };
}

function parseAccounts(payload: unknown): SocialApiAccount[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const accounts = payload.data.map(parseAccount);
  return accounts.every((account): account is SocialApiAccount => account !== null) ? accounts : null;
}

function parseSend(payload: unknown): SocialApiSendResult | null {
  if (!isRecord(payload) || payload.success !== true) return null;
  const messageId = readString(payload.message_id);
  const messageIds = Array.isArray(payload.message_ids)
    ? payload.message_ids.map(readString).filter((value): value is string => value !== null)
    : [];
  if (!messageId || messageIds.length === 0 || !messageIds.includes(messageId)) return null;
  return { messageId, messageIds };
}

function parsePagination(value: unknown): Pick<SocialApiPage<never>, 'hasMore' | 'nextCursor'> | null {
  if (!isRecord(value) || typeof value.has_more !== 'boolean') return null;
  const nextCursor = value.next_cursor === undefined || value.next_cursor === null || value.next_cursor === ''
    ? null
    : readString(value.next_cursor);
  if (value.next_cursor !== undefined && value.next_cursor !== null && value.next_cursor !== '' && !nextCursor) {
    return null;
  }
  return { hasMore: value.has_more, nextCursor };
}

function parseConversation(value: unknown): SocialApiInstagramConversation | null {
  if (!isRecord(value) || value.platform !== 'instagram') return null;
  const id = readString(value.id);
  const accountId = readString(value.account_id);
  const platformId = readString(value.platform_id);
  const participantId = readString(value.participant_id);
  const lastMessageAt = readString(value.last_message_at);
  const status = readString(value.status);
  if (!id || !accountId || !platformId || !participantId || !lastMessageAt || !status) return null;
  return {
    id,
    accountId,
    platformId,
    participantId,
    participantName: readString(value.participant_name),
    participantPictureUrl: readString(value.participant_picture),
    lastMessage: readString(value.last_message),
    lastMessageAt,
    status,
  };
}

function parseConversationPage(payload: unknown): SocialApiPage<SocialApiInstagramConversation> | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const pagination = parsePagination(payload.pagination);
  if (!pagination) return null;
  const data = payload.data.map(parseConversation);
  return data.every((item): item is SocialApiInstagramConversation => item !== null)
    ? { data, ...pagination }
    : null;
}

function parseMessage(value: unknown): SocialApiInstagramMessage | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const conversationId = readString(value.conversation_id);
  const platformId = readString(value.platform_id);
  const senderId = readString(value.sender_id);
  const direction = readString(value.direction);
  const createdAt = readString(value.created_at);
  if (!id || !conversationId || !platformId || !senderId || !direction || !createdAt) return null;
  return {
    id,
    conversationId,
    platformId,
    senderId,
    senderName: readString(value.sender_name),
    direction,
    text: readString(value.text),
    attachmentType: readString(value.attachment_type),
    attachmentUrl: readString(value.attachment_url),
    createdAt,
  };
}

function parseMessagePage(payload: unknown): SocialApiPage<SocialApiInstagramMessage> | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const pagination = parsePagination(payload.pagination);
  if (!pagination) return null;
  const data = payload.data.map(parseMessage);
  return data.every((item): item is SocialApiInstagramMessage => item !== null)
    ? { data, ...pagination }
    : null;
}

function boundedLimit(value: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : null;
}

function parseWebhookEndpoint(value: unknown): SocialApiWebhookEndpoint | null {
  if (!isRecord(value) || !Array.isArray(value.events) || typeof value.is_active !== 'boolean') {
    return null;
  }
  const id = readString(value.id);
  const url = readString(value.url);
  const createdAt = readString(value.created_at);
  const events = value.events.map(readString);
  if (!id || !url || !createdAt || !events.every((event): event is string => event !== null)) {
    return null;
  }
  return { id, url, events, isActive: value.is_active, createdAt };
}

function parseWebhookEndpoints(payload: unknown): SocialApiWebhookEndpoint[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const endpoints = payload.data.map(parseWebhookEndpoint);
  return endpoints.every((endpoint): endpoint is SocialApiWebhookEndpoint => endpoint !== null)
    ? endpoints
    : null;
}

function createConfig(options: SocialApiClientOptions): SocialApiClientConfig {
  if (!options.apiKey.trim()) throw new Error('SocialAPI API key is required');
  return {
    apiKey: options.apiKey,
    baseUrl: normalizeBaseUrl(options.baseUrl ?? SOCIALAPI_PRODUCTION_BASE_URL),
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

export function createSocialApiClient(options: SocialApiClientOptions) {
  const config = createConfig(options);
  return {
    beginInstagramConnect(input: { brandId: string; redirectUri: string }) {
      return requestJson(config, '/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: input.brandId,
          platform: 'instagram',
          metadata: {},
          redirect_uri: input.redirectUri,
        }),
      }, parseConnect);
    },

    exchangeInstagramCode(input: { code: string; redirectUri: string; state: string }) {
      return requestJson(config, '/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'instagram',
          code: input.code,
          metadata: { redirect_uri: input.redirectUri, state: input.state },
        }),
      }, parseOAuthExchange);
    },

    listInstagramAccounts(brandId: string) {
      const query = new URLSearchParams({ brand_id: brandId });
      return requestJson(config, `/accounts?${query}`, { method: 'GET' }, parseAccounts);
    },

    async getInstagramAccount(input: { accountId: string; brandId: string }): Promise<SocialApiResult<SocialApiAccount>> {
      const result = await this.listInstagramAccounts(input.brandId);
      if (!result.ok) return result;
      const account = result.data.find(candidate => candidate.id === input.accountId);
      if (!account) {
        return { ok: false, error: validationError('SocialAPI Instagram account was not found for the assigned brand') };
      }
      return { ...result, data: account };
    },

    listInstagramConversations(input: { accountId: string; limit?: number; cursor?: string }) {
      const limit = input.limit ?? 25;
      if (!boundedLimit(limit, 100)) {
        return Promise.resolve<SocialApiResult<SocialApiPage<SocialApiInstagramConversation>>>({
          ok: false,
          error: validationError('SocialAPI conversation limit must be an integer from 1 to 100'),
        });
      }
      const query = new URLSearchParams({
        account_id: input.accountId,
        platform: 'instagram',
        limit: String(limit),
      });
      if (input.cursor) query.set('cursor', input.cursor);
      return requestJson(config, `/inbox/conversations?${query}`, { method: 'GET' }, parseConversationPage);
    },

    listConversationMessages(input: { conversationId: string; limit?: number; cursor?: string }) {
      const limit = input.limit ?? 25;
      if (!boundedLimit(limit, 200)) {
        return Promise.resolve<SocialApiResult<SocialApiPage<SocialApiInstagramMessage>>>({
          ok: false,
          error: validationError('SocialAPI message limit must be an integer from 1 to 200'),
        });
      }
      const query = new URLSearchParams({ limit: String(limit) });
      if (input.cursor) query.set('cursor', input.cursor);
      return requestJson(
        config,
        `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages?${query}`,
        { method: 'GET' },
        parseMessagePage,
      );
    },

    listWebhookEndpoints() {
      return requestJson(config, '/webhooks', { method: 'GET' }, parseWebhookEndpoints);
    },

    sendInstagramText(input: { accountId: string; conversationId: string; text: string }) {
      const textBytes = Buffer.byteLength(input.text, 'utf8');
      if (textBytes === 0 || textBytes > MAX_TEXT_MESSAGE_BYTES) {
        return Promise.resolve<SocialApiResult<SocialApiSendResult>>({
          ok: false,
          error: validationError(`SocialAPI Instagram text must be 1-${MAX_TEXT_MESSAGE_BYTES} UTF-8 bytes`),
        });
      }
      return requestJson(config, `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: input.accountId, text: input.text }),
      }, parseSend);
    },

    disconnectInstagramAccount(accountId: string) {
      return requestJson(config, `/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }, payload => (
        payload === null ? { disconnected: true as const } : null
      ));
    },
  };
}
