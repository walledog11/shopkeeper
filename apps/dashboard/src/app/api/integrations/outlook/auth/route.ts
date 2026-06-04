import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { createEmailOAuthAuthorizationResponse } from '@/app/api/integrations/_lib/email-oauth';
import { OUTLOOK_EMAIL_OAUTH } from '@/app/api/integrations/_lib/email-oauth-providers';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, `Connect ${OUTLOOK_EMAIL_OAUTH.displayName}`);
}

export async function POST(request: Request) {
  return createEmailOAuthAuthorizationResponse(request, OUTLOOK_EMAIL_OAUTH);
}
