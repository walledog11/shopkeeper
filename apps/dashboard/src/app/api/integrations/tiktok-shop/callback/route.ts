import { NextResponse } from "next/server";
import { ChannelType } from "@shopkeeper/db";
import logger from "@/lib/server/logger";
import { createPostRedirectResponse } from "@/lib/server/post-redirect-response";
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from "@/lib/server/product-analytics";
import {
  getTikTokShopOAuthCallbackConfig,
  TIKTOK_SHOP_OAUTH_COOKIE_PREFIX,
} from "@/lib/tiktok-shop/config";
import {
  exchangeTikTokShopOAuthCode,
  TikTokShopProviderError,
  type TikTokShopTokenResult,
} from "@/lib/tiktok-shop/client";
import { validateOAuthCallbackSession } from "@/app/api/integrations/_lib/oauth-session";
import { upsertRaceSafeIntegration } from "@/app/api/integrations/_lib/integration-upsert";
import {
  integrationsResponse,
  oauthDestinationResponse,
  resolveOAuthOrganization,
} from "@/app/api/integrations/_lib/oauth-callback";

export async function GET(request: Request) {
  return createPostRedirectResponse(request, "Finish TikTok Shop connection");
}

export async function POST(request: Request) {
  const oauthConfig = getTikTokShopOAuthCallbackConfig();
  if (!oauthConfig) {
    return NextResponse.json({ error: "OAuth callback is not configured" }, { status: 500 });
  }

  const { appUrl } = oauthConfig;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? searchParams.get("auth_code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error && !state) {
    logger.warn({ error }, "[TikTok Shop OAuth] User denied access");
    return integrationsResponse(appUrl, { error: "access_denied" });
  }

  if ((!code && !error) || !state) {
    return integrationsResponse(appUrl, { error: "tiktok_shop_invalid_callback" });
  }

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: "TikTok Shop OAuth",
    prefix: TIKTOK_SHOP_OAUTH_COOKIE_PREFIX,
    state,
    stateMismatchError: "tiktok_shop_state_mismatch",
  });
  if (!callbackSession.ok) {
    await captureOAuthIntegrationConnectionFailed({
      ...callbackSession.analyticsContext,
      failureCategory: "state_mismatch",
      platform: "tiktok",
    });
    return callbackSession.response;
  }

  const { attemptId, clerkOrgId, returnTo } = callbackSession.session;
  const orgResult = await resolveOAuthOrganization(clerkOrgId, "TikTok Shop OAuth");
  if (!orgResult.ok) return integrationsResponse(appUrl, { error: orgResult.error });
  const organizationId = orgResult.org.id;

  if (error) {
    logger.warn({ error }, "[TikTok Shop OAuth] User denied access");
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: "access_denied",
      organizationId,
      platform: "tiktok",
    });
    return integrationsResponse(appUrl, { error: "access_denied" });
  }

  if (!code) {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: "invalid_callback",
      organizationId,
      platform: "tiktok",
    });
    return integrationsResponse(appUrl, { error: "tiktok_shop_invalid_callback" });
  }

  try {
    const tokenResult = await exchangeTikTokShopOAuthCode(oauthConfig, code);
    const externalAccountId = resolveTikTokShopExternalAccountId(tokenResult);
    if (!externalAccountId) {
      logger.error("[TikTok Shop OAuth] Token response did not include a shop or seller id");
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: "validation_failed",
        organizationId,
        platform: "tiktok",
      });
      return integrationsResponse(appUrl, { error: "tiktok_shop_missing_shop" });
    }

    const integration = await upsertRaceSafeIntegration({
      organizationId,
      platform: ChannelType.tiktok,
      externalAccountId,
      data: {
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        tokenExpiresAt: tokenResult.tokenExpiresAt,
        fromEmail: tokenResult.displayName ?? externalAccountId,
        metadata: {
          provider: "tiktok_shop",
          shopId: tokenResult.shopId,
          sellerId: tokenResult.sellerId,
          openId: tokenResult.openId,
          region: tokenResult.region,
          scopes: tokenResult.scopes,
          connectedAt: new Date().toISOString(),
        },
      },
    });

    await captureIntegrationConnectionCompleted({
      integrationId: integration.id,
      organizationId,
      platform: "tiktok",
    });

    logger.info({ externalAccountId, orgId: organizationId }, "[TikTok Shop OAuth] Integration saved");
    return oauthDestinationResponse(appUrl, returnTo, "tiktok-shop");
  } catch (err) {
    logger.error({ err }, "[TikTok Shop OAuth] Unexpected error");
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: err instanceof TikTokShopProviderError && err.category === "rate_limited"
        ? "rate_limited"
        : err instanceof TikTokShopProviderError && err.category === "provider_unavailable"
          ? "provider_unavailable"
          : "invalid_credentials",
      organizationId,
      platform: "tiktok",
    });
    return integrationsResponse(appUrl, { error: "tiktok_shop_token_failed" });
  }
}

function resolveTikTokShopExternalAccountId(tokenResult: TikTokShopTokenResult): string | null {
  return tokenResult.shopId ?? tokenResult.sellerId ?? tokenResult.openId;
}
