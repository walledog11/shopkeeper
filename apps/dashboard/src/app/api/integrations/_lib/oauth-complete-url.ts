import type { OAuthFlowMode, OAuthOutcome } from '@/lib/integrations/oauth-contract';
import { safeReturnTo } from '@/lib/security/safe-return-to';

export function buildOAuthCompleteUrl(
  appUrl: string,
  params: {
    outcome: OAuthOutcome;
    mode?: OAuthFlowMode;
    returnTo?: string | null;
  },
): string {
  const url = new URL('/dashboard/integrations/oauth/complete', appUrl);
  url.searchParams.set('provider', params.outcome.provider);
  url.searchParams.set('status', params.outcome.status);
  if (params.outcome.status === 'failed') url.searchParams.set('error', params.outcome.error);
  if (params.mode) url.searchParams.set('mode', params.mode);
  const returnTo = safeReturnTo(params.returnTo);
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
