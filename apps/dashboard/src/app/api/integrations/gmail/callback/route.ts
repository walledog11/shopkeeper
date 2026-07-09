import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { completeEmailOAuth } from '@/app/api/integrations/_lib/email-oauth';
import { GMAIL_EMAIL_OAUTH } from '@/app/api/integrations/_lib/email-oauth-providers';

export async function GET(request: Request) {
  return createPostRedirectResponse(
    request,
    "Finishing up",
    "default",
    "Completing your Gmail connection.",
  );
}

export async function POST(request: Request) {
  return completeEmailOAuth(request, GMAIL_EMAIL_OAUTH);
}
