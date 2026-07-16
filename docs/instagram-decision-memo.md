# Instagram Decision Memo

> Historical decision record. The migration described here has been implemented. Use
> [`docs/instagram-integration-plan.md`](./instagram-integration-plan.md) for current status,
> acceptance criteria, and rollout work.

## Decision

Use one coherent Instagram implementation path for V1: Instagram API with Instagram Login.

Do not leave the app half Page-based and half Instagram-account-based. The auth flow, stored integration identifiers, webhook resolution, token model, and outbound reply endpoint must all match the same Meta product path.

## Current Repository Path: Facebook Login and Page Tokens

Current files:

- `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts`
- `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts`
- `apps/dashboard/src/app/api/integrations/_lib/meta-oauth-client.ts`
- `apps/gateway/src/routes/webhooks-meta.ts`
- `apps/gateway/src/message-handlers/channels.ts`
- `apps/dashboard/src/lib/messaging/instagram-dispatch.ts`
- `apps/gateway/src/maintenance/token-health.ts`

The current implementation uses Facebook Login for Business at `facebook.com/dialog/oauth`, exchanges a Facebook user token, lists Pages with linked Instagram Business accounts, subscribes the Page to messaging webhooks, stores the Page token as the integration access token, and stores the Instagram account id as `Integration.externalAccountId`.

This creates a mixed model:

- Auth is Facebook/Page based.
- Stored account identity is Instagram-account based.
- Webhooks may arrive under Page-shaped or Instagram-shaped entries.
- Current webhook org resolution checks `entry.id` against `Integration.externalAccountId`, which is risky if Meta sends a Page id while the database stores an Instagram id.
- Outbound dispatch posts to a Graph URL using the Instagram account id with a Page token, which should not be trusted as the final model until verified end to end.

This path also adds setup friction because the merchant must have a Facebook Page linked to the Instagram account and the right Page/admin permissions.

## Recommended Path: Instagram API with Instagram Login

Target auth and token model:

- Auth URL: `https://www.instagram.com/oauth/authorize`
- Token exchange: `https://api.instagram.com/oauth/access_token`
- Long-lived token exchange: `https://graph.instagram.com/access_token`
- Token refresh: `https://graph.instagram.com/refresh_access_token`
- Stored account id: Instagram business/professional account id
- Stored access token: long-lived Instagram user token
- Stored display identity: Instagram username

Required scopes to verify and request:

- `instagram_business_basic`
- `instagram_business_manage_messages`

Webhook model:

- Subscribe the Instagram account using the Instagram Graph API.
- Subscribe to message events, at minimum `messages`.
- Verify webhook signatures with the Meta/Instagram app secret used for that Instagram app.
- Process every `entry[]` and every message event, not just the first entry/message.
- Resolve the organization by the subscribed Instagram account id stored in `Integration.externalAccountId`.
- Store the sender IGSID as the customer platform id.

Outbound reply model:

- Send replies with the Instagram Graph messaging endpoint for the connected Instagram account.
- Use the stored Instagram long-lived token.
- Address the customer by IGSID.
- Preserve 24-hour window and token-expiration error handling.

App review requirements:

- Standard access may be enough only for test users/assets.
- External beta merchants will likely require Advanced Access and Meta app review.
- Expect Business Verification, screencast, privacy policy, data deletion instructions, and a clear demonstration of connect, receive DM, merchant approval, and reply.

## Required Repository Changes

Replace or update:

- `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts`: move from Facebook OAuth URL/config id to Instagram Login.
- `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts`: exchange Instagram auth code, store Instagram id/username/token, subscribe the Instagram account.
- `apps/dashboard/src/app/api/integrations/_lib/meta-oauth-client.ts`: split Page/Facebook helpers from Instagram Login helpers or rename to a coherent Instagram client.
- `apps/gateway/src/routes/webhooks-meta.ts`: resolve Instagram webhooks by Instagram account id, loop all entries/events, and remove Page-id assumptions.
- `apps/gateway/src/clients/meta-graph.ts`: add Instagram token/profile/subscription helpers against the correct API host.
- `apps/dashboard/src/lib/messaging/instagram-dispatch.ts`: send through the Instagram Graph endpoint that matches the selected auth path.
- `apps/gateway/src/maintenance/token-health.ts`: refresh/check Instagram long-lived tokens, not Facebook/Page tokens.
- `apps/dashboard/src/app/api/integrations/instagram/connect/route.ts`: remove or clearly isolate the dev-only Page-token backdoor.
- `apps/dashboard/src/components/integrations/connect-bodies/InstagramConnectBody.tsx`: replace Facebook Page setup copy with the actual Instagram Login requirements.
- Tests around Instagram auth, callback, webhooks, dispatch, and token health.

## Recommendation

For V1 beta, migrate fully to Instagram Login and Instagram Graph messaging. Keep the current Page-token implementation only as historical reference until the new path passes a real Meta test user flow. Do not ship a hybrid implementation to beta merchants because webhook resolution, token refresh, and outbound dispatch will be hard to reason about and hard to support.
