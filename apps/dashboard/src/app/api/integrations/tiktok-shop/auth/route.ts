import { NextResponse } from "next/server";
import { createPostRedirectResponse } from "@/lib/server/post-redirect-response";
import {
  getTikTokShopOAuthAuthorizeConfig,
} from "@/lib/tiktok-shop/config";
import { buildTikTokShopAuthorizeUrl } from "@/lib/tiktok-shop/client";
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from "@/app/api/integrations/_lib/oauth-session";
import { oauthProviderRedirect } from "@/app/api/integrations/_lib/oauth-callback";

export async function GET(request: Request) {
  return createPostRedirectResponse(request, "Connect TikTok Shop");
}

export async function POST(request: Request) {
  const sessionResult = await requireAuthenticatedOAuthSession();
  if (!sessionResult.ok) return sessionResult.response;
  const session = sessionResult.session;

  const oauthConfig = getTikTokShopOAuthAuthorizeConfig();
  if (!oauthConfig) {
    return NextResponse.json(
      { error: "TikTok Shop OAuth is not configured" },
      { status: 500 },
    );
  }

  const { state } = await createOAuthSessionCookies(
    request,
    { provider: "tiktok-shop" },
    session,
  );

  return oauthProviderRedirect(buildTikTokShopAuthorizeUrl(oauthConfig, state));
}
