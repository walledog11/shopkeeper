/**
 * The next page of a Shopify list, as the dashboard hands it to the browser:
 * the GraphQL cursor together with the search it continues, because a GraphQL
 * cursor does not carry its filters the way REST's `page_info` did. The browser
 * sends it back unchanged.
 */
interface ShopifyPageToken {
  query: string;
  after: string;
}

export function encodeShopifyPageToken(page: ShopifyPageToken): string {
  return Buffer.from(JSON.stringify(page)).toString('base64url');
}

/** Null for anything this API did not issue. */
export function decodeShopifyPageToken(token: string): ShopifyPageToken | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const { query, after } = value as Record<string, unknown>;
    return typeof query === 'string' && typeof after === 'string' && after ? { query, after } : null;
  } catch {
    return null;
  }
}
