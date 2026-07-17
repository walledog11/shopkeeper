# Instagram Decision Memo

> Historical decision record. The migration described here has been implemented. Use
> [`docs/instagram-integration-plan.md`](./instagram-integration-plan.md) for current status,
> acceptance criteria, and rollout work.

## Decision

Use one coherent Instagram implementation path for V1: Instagram API with Instagram Login.

Do not leave the app half Page-based and half Instagram-account-based. The auth flow, stored integration identifiers, webhook resolution, token model, and outbound reply endpoint must all match the same Meta product path.

## Superseded Repository Path: Facebook Login and Page Tokens

Before the migration, the relevant files included:

- `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts`
- `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts`
- `apps/dashboard/src/app/api/integrations/_lib/meta-oauth-client.ts`
- `apps/gateway/src/routes/webhooks-meta.ts`
- `apps/gateway/src/message-handlers/channels.ts`
- `apps/dashboard/src/lib/messaging/instagram-dispatch.ts`
- `apps/gateway/src/maintenance/token-health.ts`

The old implementation used Facebook Login for Business at `facebook.com/dialog/oauth`, exchanged a Facebook user token, listed Pages with linked Instagram Business accounts, subscribed the Page to messaging webhooks, stored the Page token as the integration access token, and stored the Instagram account id as `Integration.externalAccountId`.

This created a mixed model:

- Auth was Facebook/Page based.
- Stored account identity was Instagram-account based.
- Webhooks could arrive under Page-shaped or Instagram-shaped entries.
- Webhook org resolution checked `entry.id` against `Integration.externalAccountId`, which was risky if Meta sent a Page id while the database stored an Instagram id.
- Outbound dispatch posted to a Graph URL using the Instagram account id with a Page token.

That path also added setup friction because the merchant needed a Facebook Page linked to the Instagram account and the right Page/admin permissions.

## Implemented Path: Instagram API with Instagram Login

Current auth and token model:

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

## Completed Repository Changes

The migration updated:

- `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts` to use direct Instagram Login.
- `apps/dashboard/src/app/api/integrations/instagram/callback/route.ts` to exchange Instagram tokens,
  validate identity, subscribe messages, and persist the Instagram account.
- Dashboard and gateway clients to use the coherent Instagram API hosts and token model.
- `apps/gateway/src/routes/webhooks-meta.ts` to isolate and normalize every Instagram event.
- `apps/dashboard/src/lib/messaging/instagram-dispatch.ts` to send through the exact receiving
  Instagram integration.
- `apps/gateway/src/maintenance/token-health.ts` to refresh and check Instagram long-lived tokens.
- Integration copy and tests for the direct Instagram Login model.

The development-only Page-token connect route was removed after the live Standard Access
DM/image/reply path passed.

## Recommendation

The repository now uses Instagram Login and Instagram Graph messaging coherently. Keep this memo as
historical rationale; use the implementation plan for the remaining lifecycle acceptance, Advanced
Access, and controlled-beta work.
