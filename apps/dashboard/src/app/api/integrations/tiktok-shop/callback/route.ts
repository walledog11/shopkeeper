import { NextResponse } from "next/server";
import { createPostRedirectResponse } from "@/lib/server/post-redirect-response";
import {
  getTikTokShopOAuthCallbackConfig,
} from "@/lib/tiktok-shop/config";
import { oauthCompleteResponse } from "@/app/api/integrations/_lib/oauth-callback";
import { runOAuthCallback } from "@/app/api/integrations/_lib/oauth-callback-runner";
import { completeTikTokShopOAuth } from "./complete-tiktok-shop-oauth";

export async function GET(request: Request) {
  return createPostRedirectResponse(request, "Finish TikTok Shop connection");
}

export async function POST(request: Request) {
  const oauthConfig = getTikTokShopOAuthCallbackConfig();
  if (!oauthConfig) {
    if (process.env.APP_URL) {
      return oauthCompleteResponse(process.env.APP_URL, {
        outcome: { status: "failed", provider: "tiktok-shop", error: "provider_unavailable" },
      });
    }
    return NextResponse.json({ error: "OAuth callback is not configured" }, { status: 500 });
  }

  const { appUrl } = oauthConfig;
  return runOAuthCallback({
    request,
    descriptor: {
      analyticsPlatform: "tiktok",
      appUrl,
      codeAliases: ["code", "auth_code"],
      invalidCallbackError: "tiktok_shop_invalid_callback",
      logPrefix: "TikTok Shop OAuth",
      provider: "tiktok-shop",
      serverError: "server_error",
      stateMismatchError: "tiktok_shop_state_mismatch",
    },
    complete: ({ code, organizationId }) => completeTikTokShopOAuth({
      code,
      config: oauthConfig,
      organizationId,
    }),
  });
}
