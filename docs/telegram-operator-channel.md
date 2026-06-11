# Telegram operator channel

Implements §2a of `docs/production/checklist.md`. Replaces Twilio (WhatsApp/SMS) as the operator channel a merchant uses to talk to their own agent.

## Goal

Merchant clicks "Connect Telegram" in the dashboard → opens `t.me/ShopkeeperBot?start=<token>` → bot binds that chat to their `OrgMember`. From then on, plan approvals (`yes` / `no` / `skip N`), digest review, free-form instructions, and order lookups all work over Telegram with the same semantics as today's Twilio path.

Out of scope for this doc: WhatsApp Cloud API (§2b), web-push PWA (§2d), customer-facing SMS, Twilio deletion (handled in §2c after this lands).

## Why Telegram first

- Single Shopkeeper-owned bot — no per-merchant Meta App Review, no Twilio sandbox approval.
- Free, no per-message billing.
- Bot API is a plain HTTPS webhook + REST send — no SDK lock-in, no TwiML.
- `start=<payload>` deep-link is the exact primitive we need for binding.

## Surface area

### New
- `apps/gateway/src/routes/webhooks-telegram.ts` — webhook receiver (port of `webhooks-twilio.ts`).
- `apps/gateway/src/clients/telegram-client.ts` — thin `sendMessage` / `setWebhook` wrapper around `https://api.telegram.org/bot<token>/...`.
- `apps/gateway/src/operator-context.ts` — generalization of `sms-context.ts`, keyed by `(orgId, chatId, channel)`.
- `apps/dashboard/src/app/api/integrations/telegram/route.ts` — issues a short-lived bind token, returns the deep-link URL.
- `apps/dashboard/src/app/dashboard/settings/_components/TelegramConnect.tsx` (or extension of existing phone tab) — QR + deep-link button, lists currently bound chat, disconnect.

### Modified
- `packages/db/prisma/schema.prisma` — rename `SmsContext` → `OperatorContext`, add `channel` + `chatId` columns; add `OrgMember.telegramChatId` (nullable). Migration is data-preserving for existing Twilio rows (set `channel = 'whatsapp'`, copy `phoneNumber` → `chatId`).
- `apps/dashboard/src/lib/agent/intent.ts`, `prompt.ts`, `context.ts` — anywhere that branches on `sms_agent` should accept a new `telegram_agent` channelType (or, better, a single `operator_agent` — see §"Open questions").
- `apps/dashboard/src/lib/messaging/dispatch-message.ts` — add a Telegram branch parallel to the Twilio one for outbound from the operator side. (Customer-facing dispatch doesn't change.)

### Untouched
- `/api/agent/internal` and `/api/messages/internal` — the gateway already calls these with an `INTERNAL_API_SECRET`; Telegram webhook will call them the same way.
- All agent core (`run.ts`, `planner.ts`, `tools/*`) — no changes.

## Phased plan

### Phase 1 — schema + context generalization (no behavior change) [COMPLETED]
1. Prisma migration: add `OperatorContext` table with the same shape as `SmsContext` plus `channel` (`'whatsapp' | 'telegram'`) and `chatId` (string). Backfill existing rows with `channel = 'whatsapp'`, `chatId = phoneNumber`. Drop `SmsContext` in a follow-up migration once Twilio is deleted (§2c) — not in this PR.
2. Add `OrgMember.telegramChatId String? @unique` and an index. Keep `phoneNumber` for now.
3. Rename `apps/gateway/src/sms-context.ts` → `operator-context.ts`. Functions take `(organizationId, channel, chatId)` instead of `(organizationId, phone)`. Update the one call site (`webhooks-twilio.ts`) to pass `'whatsapp'` + `phoneNumber`.

Verify: existing Twilio path still works end-to-end against staging.

### Phase 2 — Telegram bot setup + webhook plumbing [COMPLETED]
1. Create `@ShopkeeperBot` (production) and `@ShopkeeperBotDev` (dev) via @BotFather. Store `TELEGRAM_BOT_TOKEN` (and `_DEV` variant) in Railway/Vercel envs. Add to `.env.example` and the env list in `CLAUDE.md`. See [phase-6-external-services.md](./phase-6-external-services.md) for migration from `@ClerkBot`.
2. `clients/telegram-client.ts`:
   - `sendMessage(chatId, text, opts?)` → `POST /bot<token>/sendMessage`.
   - `setWebhook(url, secretToken)` → one-time setup; document running it via `apps/gateway/src/scripts/`.
3. `routes/webhooks-telegram.ts`:
   - Verify `X-Telegram-Bot-Api-Secret-Token` header (set when registering the webhook). Reject otherwise. Reuse the same `recordWebhookSignatureFailure` pattern as Twilio.
   - Parse `update.message.chat.id`, `update.message.text`, `update.message.from.id`.
   - Resolve `OrgMember` by `telegramChatId === chat.id`. If unbound, see Phase 3.
   - Otherwise: same control flow as `webhooks-twilio.ts:140-410` — `yes`/`no`/`skip N`, `review`/`open N`/`spam N`/`reply N`, `#1234` lookup, free-form. The only differences from the Twilio path are the reply transport (Telegram REST instead of TwiML) and that there is no inbound/outbound number — chat ID is symmetric.
4. Mount the route in `apps/gateway/src/start.ts` (or wherever `registerTwilioWebhookRoutes` is mounted).

### Phase 3 — bind flow (deep-link) [COMPLETED]
1. `POST /api/integrations/telegram` (dashboard, authed): issue a single-use bind token (24h TTL, store in Redis: `telegram:bind:<token>` → `{ orgId, clerkUserId }`). Return `{ url: "https://t.me/ShopkeeperBot?start=<token>" }` (username from `TELEGRAM_BOT_USERNAME` env).
2. Settings UI: button + QR code (`qrcode.react` is already a dep, confirm). Show current binding (chat title + "Disconnect").
3. In `webhooks-telegram.ts`, when the message text starts with `/start <token>`:
   - Look up the token in Redis. If missing/expired → reply "This link has expired. Generate a new one in your Shopkeeper dashboard."
   - Set `OrgMember.telegramChatId = chat.id` for the resolved `clerkUserId`. Delete the token.
   - Reply "Connected. Reply to ticket digests here, or send free-form instructions like 'refund #1234'."
4. `DELETE /api/integrations/telegram` clears `telegramChatId`.

### Phase 4 — outbound from agent → operator [COMPLETED]
1. `dispatch-message.ts`: add a `telegram` branch alongside the Twilio one. Routes by `OrgMember.telegramChatId` (or by an Integration row — see §"Open questions"). Same `recordProviderSendFailure('telegram', ...)` pattern.
2. Anywhere the gateway proactively notifies the merchant (new ticket digest, plan ready) needs to choose Telegram-over-WhatsApp when both are bound. Simple rule: prefer Telegram if `telegramChatId` is set.

### Phase 5 — surfacing in the integrations page [COMPLETED]
1. Add Telegram card to `apps/dashboard/src/app/dashboard/integrations/_components/IntegrationsPageClient.tsx`. Connected state shows the bound chat title; disconnected state opens the bind flow.
2. Twilio card stays — gets a "Legacy" badge until §2c removes it. (Doing the removal in this PR violates the doc's "ship operator channel before deleting Twilio" sequencing.)

### Phase 6 — tests [COMPLETED]
1. `apps/gateway/src/routes/webhooks-telegram.test.ts` — signature reject, `/start` bind, `yes`/`skip N`/`no`, `review`/`spam N`/`reply N`, `#N` order lookup, free-form forwarding. Real DB via `@shopkeeper/db/test-helpers`; ioredis + telegram-client + global `fetch` mocked.
2. `apps/gateway/src/operator-context.test.ts` — get/update/clear round-trip per channel, history truncation, `extractOrderNumber` table-driven.
3. Manual E2E checklist below (run once against staging after bot is created).

#### Manual E2E checklist

CI can't talk to a real Telegram bot. Run this once end-to-end against staging after `@ShopkeeperBotDev` is created and `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` are set in Railway, and `TELEGRAM_BOT_USERNAME` is set in Vercel. Run `tsx apps/gateway/src/scripts/set-telegram-webhook.ts <gateway-url>/webhooks/telegram` first.

- [ ] **Connect.** Dashboard → Integrations → Telegram → "Connect Telegram". Tap the deep link, send `/start`. Bot replies "Connected.". Re-open the integrations page; card shows the bound chat.
- [ ] **Plan-ready ping.** Send a customer inbound (email or IG) that triggers an auto-plan. Telegram receives a digest with the plan + `yes / no / skip N` options.
- [ ] **Approve.** Reply `yes`. Bot reacts 👀 to your message and shows typing; the agent's summary arrives when the run finishes (no filler ack). Verify the action ran in the dashboard ticket (action log row, message sent if applicable).
- [ ] **Digest review.** Wait for the next daily digest (or trigger manually). Reply `review`. List of flagged tickets arrives. Reply `spam 1` — the thread becomes `filtered` in the dashboard. Reply `reply 1 hello` on another flagged thread — the message is sent to the customer.
- [ ] **Order lookup.** Reply `#1234` (a real order). Bot returns thread summary + tag + last message.
- [ ] **Free-form.** Send `refund order #1234 for $5`. Plan arrives; approve to execute.
- [ ] **Disconnect.** Dashboard → Integrations → Telegram → Disconnect. Send another message — bot replies "isn't connected".

## Cutover

- Phase 1 ships behind no flag (refactor only).
- Phases 2–5 ship behind `TELEGRAM_BOT_TOKEN` presence — if the env var is absent, the route 404s and the integration card is hidden. Keeps staging clean before the bot is created.
- Twilio path is untouched throughout. §2c (Twilio removal) is a separate PR after this is in production for a real merchant's full week.

## Open questions to resolve before coding

1. **Single channelType or one per provider?** Today there's `sms_agent`. Cleanest is a single `operator_agent` channelType plus a `provider` column on the thread, but renaming an enum mid-flight is ugly. Pragmatic call: add `telegram_agent` next to `sms_agent`, plan to consolidate later. Confirm with the user before generalizing.
2. **Per-org bot vs single Shopkeeper bot?** Doc says single Shopkeeper bot. That's correct for now (no per-merchant infra). Revisit if a merchant ever wants their own brand on the bot.
3. **Where does the binding live — `OrgMember.telegramChatId` or an `Integration` row?** Today the equivalent for WhatsApp is split: `OrgMember.phoneNumber` (per-user) and `Integration` rows (per-org for customer-facing SMS). Telegram is operator-only, so `OrgMember.telegramChatId` is the right home. Don't add an `Integration` row.
4. **Group chats?** Telegram allows the bot in groups. Initial version: ignore non-`private` chats. Note in the welcome message.

## Risk notes

- Telegram webhook delivery has no retries on non-2xx. Treat the handler as fire-and-forget for the agent run (already the pattern in Twilio code: respond 200, do work via `proactiveSend`).
- `chat.id` is a stable signed int64. Store as string to avoid JS number precision issues (Twilio path stores `phoneNumber` as string already — same treatment).
- Bot token leak = full impersonation of the bot. Treat with the same care as `INTERNAL_API_SECRET`. Add to the rotation list in the SOC2 plan if applicable.
