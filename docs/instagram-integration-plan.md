# Instagram Integration Plan

**Goal:** make Instagram DM a working, launch-quality channel by migrating from the legacy
"Instagram via Messenger Platform" path (Facebook Login for Business) to the **Instagram API
with Instagram Login** (Business Login for Instagram). Merchants log in with their Instagram
account directly — no Facebook account, no Facebook Page, no Page-admin permissions.

Written 2026-06-09.

---

## Current status (what exists and why it never worked)

The integration was built on Meta's older Messenger Platform path. All the pieces exist
end-to-end, but the chain has structural problems.

### What's there

- **OAuth connect** — `apps/dashboard/src/app/api/integrations/instagram/auth/route.ts` +
  `callback/route.ts`. Facebook Login dialog with `META_CONFIG_ID` → code exchange →
  long-lived **user** token → `/me/accounts` to find a Facebook Page with a linked
  `instagram_business_account` → stores the **Page token** as `Integration.accessToken`,
  user token as `refreshToken`, IG business account ID as `externalAccountId`, IG username
  as `fromEmail` → subscribes the Page to message webhooks.
- **Inbound** — gateway `/webhooks/meta` (`apps/gateway/src/routes/webhooks-meta.ts`):
  handshake + HMAC verify, org resolution by `entry[0].id` against `externalAccountId`,
  BullMQ enqueue → `handleIgDmJob` (`apps/gateway/src/message-handlers/channels.ts`):
  sender profile fetch, attachments, dedupe by `mid`. The dashboard proxies
  `/api/webhooks/meta` to the gateway.
- **Outbound** — `apps/dashboard/src/lib/messaging/dispatch-message.ts` sends via
  `graph.facebook.com/v22.0/{igAccountId}/messages` with the Page token; maps the
  24-hour-window error (`code 10 / subcode 2018278`) and expired-token error (`code 190`).
- **Maintenance** — daily token-health worker (`apps/gateway/src/maintenance/token-health.ts`
  + `apps/gateway/src/clients/meta-graph.ts`) validates tokens and refreshes the long-lived
  user token.
- **UI** — integration card in the catalog, connect body, onboarding step, help content.

### Why it failed

1. **The Facebook Page requirement.** The legacy path requires the IG account to be linked
   to a Facebook Page **and** the connecting user to have *classic* Page admin access
   (acknowledged in the callback's own comments). Users on the newer Business Portfolio
   access model get an empty `/me/accounts` and land on `no_ig_account`. This is the most
   common failure mode for exactly our target user — a solo merchant with an IG-first
   business and no real Facebook Page.
2. **Wrong outbound send endpoint.** Dispatch POSTs to
   `graph.facebook.com/{IG_ACCOUNT_ID}/messages` with a Page token. On the Messenger
   Platform path, sends must go to `/{PAGE_ID}/messages` (or `/me/messages`); the IG account
   ID is the right node only on `graph.instagram.com` with an Instagram user token. The
   current code mixes the two models, so even a successful connect likely couldn't reply.
3. **Telltale workaround:** a dev-only backdoor
   (`apps/dashboard/src/app/api/integrations/instagram/connect/route.ts`) writes an
   integration row straight from `META_PAGE_ACCESS_TOKEN` env vars — testing happened by
   hand-pasting tokens rather than through working OAuth.
4. **Smaller issues:** the webhook handler only processes `entry[0]` / `messaging[0]` and
   silently drops batched events; `object: "page"`-shaped payloads can't resolve an org
   (the DB stores the IG account ID, not the Page ID); the runbook still marks IG as
   "Deferred After V1".

### Why migrate instead of patching

Fixing only the send endpoint is less code, but it preserves the Facebook Page +
classic-admin requirement that sank the first attempt and keeps two token types alive
instead of one. The Instagram Login path removes failure mode #1 entirely. The existing
pipeline shape (webhook → queue → handler → thread; dispatch on reply) survives intact;
what changes is the OAuth flow, the token model, and the Graph host.

---

## Phase 1 — Meta App Dashboard setup (manual; do first, App Review gates everything)

- Add the **Instagram > API with Instagram Login** product to the Meta app.
- Create a Business Login configuration with scopes `instagram_business_basic` +
  `instagram_business_manage_messages`.
- Point the Instagram-object webhook at the gateway's `/webhooks/meta` with
  `META_VERIFY_TOKEN`; subscribe to the `messages` field.
- Record the **Instagram App ID/Secret** — these are distinct from the Facebook App
  ID/Secret, and webhook signatures will be signed with the Instagram app secret.
  - New env vars: `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` (dashboard + gateway).
  - `META_CONFIG_ID` retires.
- Add our own IG account as a tester so the full loop works under Standard Access
  before review.

## Phase 2 — Rewrite OAuth (`instagram/auth` + `callback` routes)

- Authorize URL: `https://www.instagram.com/oauth/authorize` with the two scopes
  (`response_type=code`, existing `state` cookie machinery unchanged).
- Callback:
  1. Exchange code at `https://api.instagram.com/oauth/access_token` (short-lived token).
  2. Upgrade to a 60-day long-lived token:
     `GET graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...`.
  3. Fetch identity: `GET graph.instagram.com/me?fields=user_id,username`.
- Store: IG user token as `accessToken`, IG account ID as `externalAccountId`, username as
  `fromEmail`. No `refreshToken` (long-lived IG tokens self-refresh; see Phase 5).
- Subscribe the account to webhooks:
  `POST graph.instagram.com/{IG_ID}/subscribed_apps?subscribed_fields=messages`.
- Delete the dev backdoor `connect/route.ts`.

## Phase 3 — Fix outbound send (`dispatch-message.ts`)

- `POST graph.instagram.com/v23.0/{IG_ID}/messages` with the stored IG user token,
  body `{ recipient: { id: <IGSID> }, message: { text } }`.
- Keep the existing 24-hour-window / expired-token error mapping — the semantics carry
  over (Meta only allows replies within 24h of the customer's last message).

## Phase 4 — Inbound adjustments (gateway)

- Signature verification switches to the Instagram app secret (`INSTAGRAM_APP_SECRET`).
- Loop over **all** `entry[]` and `messaging[]` items instead of just `[0]`.
- Profile fetch moves to `graph.instagram.com/{IGSID}?fields=name,username,profile_pic`
  with the IG user token (currently `graph.facebook.com` with the Page token).
- Org resolution by `entry.id` = IG account ID already matches what Phase 2 stores —
  no change. Drop the `object: "page"` branch once migrated.

## Phase 5 — Token health (`token-health.ts` + `meta-graph.ts`)

- Replace the Facebook `fb_exchange_token` refresh with
  `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` (refreshes the
  60-day token; must be called while the token is still valid and at least 24h old).
- Keep the daily cadence, validity probe, and expiry-marking behavior.

## Phase 6 — App Review + verification

App Review is required before any Instagram account *without a role on the Meta app* can
connect — i.e., before the first real merchant. Standard Access (tester accounts added in
the App Dashboard) covers all development and dogfooding until then.

1. **Start Business Verification immediately** (can run in parallel with Phases 2–5):
   Meta Business Suite → Settings → Business verification. It is a prerequisite for
   Advanced Access, runs independently of the code, and can take days to weeks.
2. Validate the full loop under Standard Access with the tester account, per the runbook
   checklist: webhook handshake → real DM → thread + plan in dashboard → approved reply
   delivered → 24h-window rejection handled → token-health pass. Do this **before**
   submitting — review requires a screencast of the working flow and at least one
   successful API call per requested permission.
3. Submit for **Advanced Access**: App Dashboard → Products → Instagram → API setup with
   Instagram login → "Complete app review" → Continue to app review. Materials needed:
   - App icon (1024×1024), privacy policy URL, category, business email.
   - Usage description per permission (`instagram_business_basic`,
     `instagram_business_manage_messages`): merchants connect their IG professional
     account so customer DMs appear in their support inbox and they can reply.
   - English screencast per permission showing the complete flow: Connect in the
     dashboard → Instagram OAuth → customer DM arriving as a ticket → approved reply
     delivered in the IG thread. Incomplete screencasts are the #1 rejection reason —
     the reviewer must be able to replicate every step.
   - Test credentials for the reviewer (test merchant dashboard login + connectable
     test IG account).
4. Reviews come back in a few days to ~2 weeks; first-pass rejections are common (almost
   always screencast/reproducibility issues) — budget one resubmission cycle.
5. Update the runbook: IG is no longer "Deferred After V1"; refresh the env tables
   (`INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` in, `META_CONFIG_ID` out).

---

## Sizing

Phases 2–5 touch roughly eight files and are a few days of focused work. The long pole is
Meta's App Review (typically 1–2 weeks), so Phase 1 and the review submission should start
as early as possible.

## References

- [Instagram API with Instagram Login — Messaging](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Instagram API with Instagram Login — overview](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
