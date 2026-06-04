import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { completeEmailOAuth } from '@/app/api/integrations/_lib/email-oauth';
import { OUTLOOK_EMAIL_OAUTH } from '@/app/api/integrations/_lib/email-oauth-providers';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, `Finish ${OUTLOOK_EMAIL_OAUTH.displayName} connection`);
}

export async function POST(request: Request) {
  return completeEmailOAuth(request, OUTLOOK_EMAIL_OAUTH);
}
