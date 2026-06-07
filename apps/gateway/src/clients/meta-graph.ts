export const META_GRAPH_VERSION = 'v22.0';

const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface MetaGraphError {
  message: string;
}

export interface MetaGraphResponse<T> {
  data?: T;
  error?: MetaGraphError;
}

async function fetchMetaGraph<T>(url: URL): Promise<MetaGraphResponse<T>> {
  const res = await fetch(url.toString());
  const payload = await res.json() as T & { error?: MetaGraphError };

  if (payload && typeof payload === 'object' && payload.error) {
    return { error: payload.error };
  }

  return { data: payload as T };
}

export async function checkInstagramAccountAccess(
  accountId: string,
  accessToken: string,
): Promise<MetaGraphResponse<{ id: string }>> {
  const url = new URL(`${META_GRAPH_BASE}/${accountId}`);
  url.searchParams.set('fields', 'id');
  url.searchParams.set('access_token', accessToken);
  return fetchMetaGraph<{ id: string }>(url);
}

export async function exchangeFacebookLongLivedToken(
  appId: string,
  appSecret: string,
  shortLivedToken: string,
): Promise<MetaGraphResponse<{ access_token?: string }>> {
  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedToken);
  return fetchMetaGraph<{ access_token?: string }>(url);
}
