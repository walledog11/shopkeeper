# Production Checklist

Things that must be done before deploying to production.

---

## WhatsApp Integration

### Twilio Account
- [ ] Upgrade from Twilio trial to a paid account, or ensure a full WhatsApp Business account is set up
- [ ] Switch from the WhatsApp Sandbox to a WhatsApp Business number — the sandbox requires every recipient to manually opt in and cannot send first messages, making it unsuitable for production notifications
- [ ] Verify all destination phone numbers are reachable (sandbox restriction gone on paid accounts)

### Environment Variables

**Gateway (`.env`)**
- [ ] `TWILIO_ACCOUNT_SID` — production Twilio account SID
- [ ] `TWILIO_AUTH_TOKEN` — production Twilio auth token
- [ ] `TWILIO_WHATSAPP_NUMBER` — WhatsApp Business number in `whatsapp:+1xxxxxxxxxx` format (replace sandbox `whatsapp:+14155238886`)
- [ ] `TWILIO_WEBHOOK_URL` — production domain URL of the Twilio webhook endpoint (e.g. `https://yourdomain.com/api/webhooks/twilio`)
- [ ] `DASHBOARD_INTERNAL_URL` — internal URL of the dashboard service (e.g. `https://yourdomain.com` or internal service URL)
- [ ] `INTERNAL_API_SECRET` — long random secret shared with the dashboard; rotate from any dev value

**Dashboard (`.env.local` / production env)**
- [ ] `TWILIO_ACCOUNT_SID` — same as gateway
- [ ] `TWILIO_AUTH_TOKEN` — same as gateway
- [ ] `TWILIO_FROM_NUMBER` — E.164 number used to send OTP SMS for phone verification (e.g. `+1xxxxxxxxxx`)
- [ ] `TWILIO_WEBHOOK_URL` — must match the value in gateway (used for signature validation in the proxy)
- [ ] `GATEWAY_INTERNAL_URL` — internal URL of the gateway service
- [ ] `INTERNAL_API_SECRET` — must match gateway value

### Webhook URL
- [ ] Point Twilio WhatsApp Business webhook to `https://yourdomain.com/api/webhooks/twilio`
- [ ] Remove the ngrok-based proxy setup — in production the dashboard and gateway each have stable public URLs, so the dashboard Twilio proxy route (`/api/webhooks/twilio`) may no longer be needed if the gateway is directly reachable

### Dev-Only Code to Remove
- [ ] `apps/dashboard/src/app/api/phone/send-code/route.ts` — remove the `isDev` branch that skips Twilio and uses hardcoded code `000000`
- [ ] `apps/dashboard/src/app/api/phone/verify-code/route.ts` — remove the `NODE_ENV !== "development"` guard around the rate limiter
- [ ] `apps/dashboard/src/app/api/phone/send-code/route.ts` — remove the `NODE_ENV !== "development"` guard around the send rate limiter

---

## Meta (Instagram) Webhook

- [ ] Update the Meta webhook callback URL in the Meta developer console from `/webhooks/meta` to `/api/webhooks/meta` — the route was moved during the project restructure

---

## General Infrastructure

- [ ] Replace all ngrok tunnel URLs with stable production domain URLs
- [ ] Rotate `INTERNAL_API_SECRET` to a new value not used during development
- [ ] Ensure Redis is production-grade (persistent, backed up) — conversation context and pending plans are stored there
- [ ] Confirm `DATABASE_URL` points to the production Neon PostgreSQL instance

---

## Feature Backlog

Features missing from the current implementation that are needed for a competitive helpdesk product.


### Image / Video Attachments
- [ ] Handle inbound email attachments from Postmark (`Attachments` array in the inbound JSON)

### Webhook / Zapier Outbound
- [ ] Document the payload schema for Zapier/Make integration

### Real-Time Indicators
- [ ] Optionally show typing indicators in outbound composer before send

---

## TikTok Integration

> **API**: TikTok Business Messaging API (Open Beta — available in North America). Only TikTok **Business Accounts** can connect on the brand side; any TikTok user can send DMs to them.

### Phase 0 — External Setup (no code — must be done before implementation)
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal` using a TikTok Business Account
- [ ] Apply for **Business Messaging API** Open Beta access — requires TikTok data security and privacy review
- [ ] Add OAuth callback URL `{APP_URL}/api/integrations/tiktok/callback` to the app in the portal
- [ ] Register gateway webhook URL `{GATEWAY_URL}/webhooks/tiktok` in the portal and subscribe to `direct_message` events
- [ ] Collect credentials: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`

### Environment Variables

**Dashboard (`.env.local` / production env)**
- [ ] `TIKTOK_APP_ID` — TikTok for Business app ID
- [ ] `TIKTOK_APP_SECRET` — TikTok for Business app secret

**Gateway (`.env`)**
- [ ] `TIKTOK_APP_SECRET` — same as dashboard
- [ ] `TIKTOK_WEBHOOK_SECRET` — secret used for HMAC-SHA256 webhook signature verification (`X-TikTok-Signature` header)

### Phase 1 — Constants (no DB migration needed — `tiktok` enum value already in schema)
- [ ] `apps/gateway/src/constants.ts` — add `TIKTOK: 'tiktok'` to `CHANNEL` and `TIKTOK: 'process-tiktok-dm'` to `JOB`

### Phase 2 — OAuth Routes (dashboard)
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` — CSRF state cookie, redirect to `https://business-api.tiktok.com/portal/auth` with `app_id`, `state`, `redirect_uri`, `scope=business.dm`
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts`:
  - Validate CSRF state cookie
  - Exchange `auth_code` → `bc_access_token` via `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/`
  - Fetch business display name via `GET https://business-api.tiktok.com/open_api/v1.3/business/get/`
  - Subscribe to DM webhooks via `POST https://business-api.tiktok.com/open_api/v1.3/business/messaging/webhook/subscribe/`
  - `db.integration.upsert` with `platform: 'tiktok'`, `externalAccountId: business_id`, `accessToken: bc_access_token`, `tokenExpiresAt: +30d`
  - Redirect to `?connected=tiktok`

### Phase 3 — Gateway Webhook Handler
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `GET /tiktok` handler: echo back `challenge` query param for TikTok webhook URL verification
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `POST /tiktok` handler:
  - Verify `X-TikTok-Signature` (HMAC-SHA256 of raw body) via `timingSafeEqual`
  - Extract `business_id`, check for real message presence
  - `resolveOrganizationId(CHANNEL.TIKTOK, business_id)`
  - Enqueue `JOB.TIKTOK`; always return HTTP 200

### Phase 4 — Worker Branch
- [ ] `apps/gateway/src/worker.ts` — add `CHANNEL.TIKTOK` branch:
  - Extract `from_user_id`, `message_content.text`, `message_id` from webhook payload
  - Skip own-account echo messages (`from_user_id === business_id`)
  - Optionally fetch sender profile via `GET https://business-api.tiktok.com/open_api/v1.3/user/info/`
  - Call `processInboundMessage(organizationId, from_user_id, CHANNEL.TIKTOK, text, { externalMessageId: message_id })`

### Phase 5 — Outbound Dispatch
- [ ] `apps/dashboard/src/app/api/messages/route.ts` — add `CHANNEL_TYPE.TIKTOK` block:
  - Fetch integration by `platform: CHANNEL_TYPE.TIKTOK` for the org
  - `POST https://business-api.tiktok.com/open_api/v1.3/business/message/send/` with `Access-Token` header and `{ business_id, to_user_id, message: { text } }`
  - On non-2xx: return 502

### Phase 6 — UI
- [ ] `apps/dashboard/src/app/dashboard/integrations/_components/IntegrationCard.tsx` — add `'tiktok'` to `ConnectType` union and a connect button branch linking to `/api/integrations/tiktok/auth`
- [ ] `apps/dashboard/src/app/dashboard/settings/_components/IntegrationsTab.tsx` — change TikTok entry `connectType` from `'coming-soon'` to `'tiktok'`; add `connected=tiktok` banner case

### Notes
- Exact OAuth parameter names and payload field names must be confirmed against the live API spec once Open Beta access is granted — endpoints above match published docs patterns
- TikTok `bc_access_token` expires after ~30 days; store `refresh_token` in `Integration.metadata` if the API returns one, then add a token-health cron job (same pattern as IG)
- DMs only — video comments via the Organic API are out of scope for this integration

