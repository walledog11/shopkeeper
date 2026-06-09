import { safeReturnTo } from '@/lib/security/safe-return-to';

export function buildOAuthCompleteUrl(
  appUrl: string,
  params: {
    connected?: string;
    error?: string;
    returnTo?: string | null;
  },
): string {
  const url = new URL('/dashboard/integrations/oauth/complete', appUrl);
  if (params.connected) url.searchParams.set('connected', params.connected);
  if (params.error) url.searchParams.set('error', params.error);
  const returnTo = safeReturnTo(params.returnTo);
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
