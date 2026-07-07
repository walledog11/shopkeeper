import { NextResponse } from "next/server";
import { createPostRedirectResponse } from "@/lib/server/post-redirect-response";
import {
  getTikTokShopOAuthAuthorizeConfig,
  TIKTOK_SHOP_OAUTH_COOKIE_PREFIX,
} from "@/lib/tiktok-shop/config";
import { buildTikTokShopAuthorizeUrl } from "@/lib/tiktok-shop/client";
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from "@/app/api/integrations/_lib/oauth-session";

export async function GET(request: Request) {
  return createPostRedirectResponse(request, "Connect TikTok Shop");
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oauthConfig = getTikTokShopOAuthAuthorizeConfig();
  if (!oauthConfig) {
    return NextResponse.json(
      { error: "TikTok Shop OAuth is not configured" },
      { status: 500 },
    );
  }

  const { state } = await createOAuthSessionCookies(
    request,
    { prefix: TIKTOK_SHOP_OAUTH_COOKIE_PREFIX },
    session,
  );

  return NextResponse.redirect(buildTikTokShopAuthorizeUrl(oauthConfig, state).toString());
}
