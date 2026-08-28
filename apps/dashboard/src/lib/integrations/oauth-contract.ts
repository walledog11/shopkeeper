const OAUTH_PROVIDERS = [
  'gmail',
  'instagram',
  'shopify',
  'tiktok-shop',
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type OAuthFlowMode = 'popup' | 'redirect';

export const OAUTH_ERROR_MESSAGES = {
  access_denied: 'Connection cancelled.',
  instagram_not_available: 'This connection is not available for this workspace yet.',
  invalid_callback: 'The provider did not return a valid authorization response. Please try again.',
  long_lived_token_failed: 'Instagram sign-in could not be completed. Please reconnect and try again.',
  missing_instagram_permissions: 'Shopkeeper needs permission to read and reply to Instagram DMs. Please grant both requested permissions.',
  no_email: 'The provider did not return an email address. Please choose an account with an email address and try again.',
  not_professional_account: 'Only Instagram Professional accounts (Business or Creator) can connect.',
  instagram_account_in_use: 'This Instagram account is already connected to another Shopkeeper workspace.',
  webhook_subscription_failed: 'Instagram connected, but DM delivery could not be activated. Please try again.',
  provider_unavailable: 'The provider is temporarily unavailable. Please try again later.',
  no_ig_account: 'No eligible Instagram Professional account was found.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
  tiktok_shop_invalid_callback: 'Invalid callback from TikTok Shop. Please try again.',
  tiktok_shop_missing_shop: 'TikTok Shop did not return a seller or shop id. Please check your app permissions.',
  tiktok_shop_state_mismatch: 'Security check failed. Please try again.',
  tiktok_shop_token_failed: 'Could not obtain a TikTok Shop access token. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Authentication failed. The response from Shopify could not be verified.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
  shopify_shop_mismatch: 'The Shopify store that authorized the app did not match the store you entered. Please try again.',
  shopify_store_in_use: 'This Shopify store is already connected to another Shopkeeper workspace.',
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_MESSAGES;

export type OAuthOutcome =
  | { status: 'connected'; provider: OAuthProvider }
  | { status: 'failed'; provider: OAuthProvider; error: OAuthErrorCode };

export const OAUTH_DONE_MESSAGE_TYPE = 'shopkeeper-oauth-done';

export type OAuthDoneMessage = {
  type: typeof OAUTH_DONE_MESSAGE_TYPE;
  outcome: OAuthOutcome;
};

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isOAuthFlowMode(value: unknown): value is OAuthFlowMode {
  return value === 'popup' || value === 'redirect';
}

function isOAuthErrorCode(value: unknown): value is OAuthErrorCode {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, value);
}

export function isOAuthOutcome(value: unknown): value is OAuthOutcome {
  if (!value || typeof value !== 'object') return false;
  const outcome = value as Partial<OAuthOutcome>;
  if (!isOAuthProvider(outcome.provider)) return false;
  if (outcome.status === 'connected') return !('error' in outcome);
  return outcome.status === 'failed' && isOAuthErrorCode(outcome.error);
}

export function parseOAuthOutcome(searchParams: Pick<URLSearchParams, 'get'>): OAuthOutcome | null {
  const provider = searchParams.get('provider');
  const status = searchParams.get('status');
  if (!isOAuthProvider(provider)) return null;
  if (status === 'connected') return { status, provider };
  if (status !== 'failed') return null;
  const error = searchParams.get('error');
  return isOAuthErrorCode(error) ? { status, provider, error } : null;
}
