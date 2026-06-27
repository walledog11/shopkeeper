const META_GRAPH_BASE_URL = 'https://graph.facebook.com/v22.0';

interface MetaErrorPayload {
  type?: string;
  code?: string | number;
}

export interface MetaTokenExchangeResult {
  accessToken: string | null;
  error: MetaErrorPayload;
  status: number;
}

export interface MetaInstagramPage {
  id: string;
  name: string;
  accessToken: string;
  instagramBusinessAccount?: {
    id: string;
    username?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readError(payload: unknown): MetaErrorPayload {
  if (!isRecord(payload) || !isRecord(payload.error)) return {};
  return {
    ...(readString(payload.error.type) ? { type: payload.error.type as string } : {}),
    ...(
      typeof payload.error.code === 'string' || typeof payload.error.code === 'number'
        ? { code: payload.error.code }
        : {}
    ),
  };
}

export async function exchangeMetaOAuthCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri: string;
}): Promise<MetaTokenExchangeResult> {
  const query = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const response = await fetch(`${META_GRAPH_BASE_URL}/oauth/access_token?${query}`, {
    cache: 'no-store',
  });
  const payload = await readJson(response);
  return {
    accessToken: isRecord(payload) ? readString(payload.access_token) : null,
    error: readError(payload),
    status: response.status,
  };
}

export async function exchangeLongLivedMetaToken(input: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<string | null> {
  const query = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.shortLivedToken,
  });
  const response = await fetch(`${META_GRAPH_BASE_URL}/oauth/access_token?${query}`, {
    cache: 'no-store',
  });
  const payload = await readJson(response);
  return isRecord(payload) ? readString(payload.access_token) : null;
}

function parseInstagramBusinessAccount(
  value: unknown,
): MetaInstagramPage['instagramBusinessAccount'] {
  if (!isRecord(value)) return undefined;
  const id = readString(value.id);
  if (!id) return undefined;
  const username = readString(value.username);
  return {
    id,
    ...(username ? { username } : {}),
  };
}

function parseMetaPage(value: unknown): MetaInstagramPage | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  const accessToken = readString(value.access_token);
  if (!id || !name || !accessToken) return null;
  const instagramBusinessAccount = parseInstagramBusinessAccount(
    value.instagram_business_account,
  );
  return {
    id,
    name,
    accessToken,
    ...(instagramBusinessAccount ? { instagramBusinessAccount } : {}),
  };
}

export async function listMetaInstagramPages(userToken: string): Promise<MetaInstagramPage[]> {
  const query = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: userToken,
  });
  const response = await fetch(`${META_GRAPH_BASE_URL}/me/accounts?${query}`, {
    cache: 'no-store',
  });
  const payload = await readJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  return payload.data
    .map(parseMetaPage)
    .filter((page): page is MetaInstagramPage => page !== null);
}

export async function subscribeMetaInstagramMessaging(input: {
  pageId: string;
  pageToken: string;
}): Promise<{ status: number; success: boolean }> {
  const response = await fetch(`${META_GRAPH_BASE_URL}/${input.pageId}/subscribed_apps`, {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: ['messages', 'messaging_postbacks'],
      access_token: input.pageToken,
    }),
  });
  const payload = await readJson(response);
  return {
    status: response.status,
    success: isRecord(payload) && payload.success === true,
  };
}
