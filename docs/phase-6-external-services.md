# Phase 6 — External Services Runbook

Rename **Clerk → Shopkeeper** in every service outside the repo. Code changes for this phase are in the same deploy window.

**Prerequisite:** Confirm the primary domain before starting DNS-dependent steps.

| Option | Contact email | Inbound email | Notes |
|---|---|---|---|
| Keep `useclerk.co` | `hello@useclerk.co` | `inbound.useclerk.co` | Branding-only; no DNS migration |
| `shopkeeper.app` | `hello@shopkeeper.app` | `inbound.shopkeeper.app` | Cleanest product match |
| `getshopkeeper.com` | `hello@getshopkeeper.com` | `inbound.getshopkeeper.com` | Marketing-style domain |

Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel when the contact address changes (marketing pages read it at build time).

---

## Deploy order

Do these in sequence to avoid broken OAuth callbacks or webhooks mid-cutover.

1. **Register new assets** (domain, Telegram bot username) without switching production traffic yet.
2. **Update provider consoles** (OAuth apps, Stripe, Postmark, etc.) — add new URLs alongside old ones where supported.
3. **Update Vercel + Railway env vars** (see checklist below).
4. **Deploy dashboard** (Vercel) then **gateway** (Railway).
5. **Run DB prefix migration** if production still has legacy agent prefixes.
6. **Switch DNS** (or confirm domain unchanged).
7. **Remove old OAuth redirect URIs** after smoke tests pass.
8. **Rename GitHub repo** and local folder (optional, last).

---

## Environment variables to update

### Vercel (dashboard)

| Variable | What to change |
|---|---|
| `APP_URL` | New dashboard origin, e.g. `https://app.shopkeeper.app` |
| `NEXT_PUBLIC_APP_URL` | Must match `APP_URL` exactly |
| `NEXT_PUBLIC_CONTACT_EMAIL` | e.g. `hello@shopkeeper.app` |
| `INBOUND_EMAIL_DOMAIN` | e.g. `inbound.shopkeeper.app` |
| `GATEWAY_INTERNAL_URL` | Gateway public URL if it changes |
| `TELEGRAM_BOT_USERNAME` | `ShopkeeperBot` (after BotFather registration) |

**Do not change:** `CLERK_*`, `CLERK_WEBHOOK_SECRET`, or the `/api/webhooks/clerk` route.

### Railway (gateway)

| Variable | What to change |
|---|---|
| `DASHBOARD_URL` | Same as dashboard `APP_URL` |
| `DASHBOARD_INTERNAL_URL` | Vercel deployment URL if used for internal redirects |
| `TELEGRAM_BOT_TOKEN` | New bot token if switching from `@ClerkBot` |
| `TELEGRAM_WEBHOOK_SECRET` | Rotate if compromised during bot migration |

After deploy, re-register the Telegram webhook:

```bash
cd apps/gateway
tsx src/scripts/set-telegram-webhook.ts https://<gateway-host>/webhooks/telegram
```

---

## Service checklists

### Clerk.com (auth vendor)

- [ ] Dashboard → Application → rename display name to **Shopkeeper**
- [ ] Keep existing API keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- [ ] Keep webhook endpoint `https://<dashboard>/api/webhooks/clerk`
- [ ] If domain changes: add new allowed origins / redirect URLs in Clerk dashboard; remove old ones after cutover

### Vercel

- [ ] Rename project `clerk-dashboard` → `shopkeeper-dashboard` (cosmetic)
- [ ] Add custom domain; update `APP_URL` / `NEXT_PUBLIC_APP_URL`
- [ ] Update env vars from table above
- [ ] Confirm build filter still uses `shopkeeper-dashboard` (`vercel.json`)
- [ ] Redeploy and run `npm run verify:production:env`

### Railway

- [ ] Rename gateway service (cosmetic)
- [ ] Update `DASHBOARD_URL` and related env vars
- [ ] Redeploy; confirm `/health/deep` and `/health/queues` pass
- [ ] Re-register Telegram webhook (see above)

### Neon

- [ ] Rename project (cosmetic only — `DATABASE_URL` host stays the same)

### Stripe

- [ ] Rename products (Starter, Pro, Scale) in Stripe Dashboard
- [ ] Update checkout session description if customized
- [ ] Receipt / statement descriptor if it mentions Clerk
- [ ] Webhook endpoint stays `https://<dashboard>/api/billing/webhook` — update only if domain changes

### Postmark

- [ ] Update sender display name to Shopkeeper
- [ ] If inbound domain changes: configure `inbound.<domain>` in Postmark, update `INBOUND_EMAIL_DOMAIN`
- [ ] Update MX records for new inbound subdomain
- [ ] Smoke test: `VERIFY_INBOUND_EMAIL_TO=support@inbound.<domain> npm run verify:production`

### Shopify Partner Dashboard

- [ ] App display name → Shopkeeper
- [ ] Privacy policy URL → `https://<dashboard>/privacy`
- [ ] OAuth redirect URLs if domain changes:
  - `https://<dashboard>/api/integrations/shopify/callback`

### Meta (Instagram)

- [ ] App display name → Shopkeeper
- [ ] Privacy policy URL
- [ ] Valid OAuth redirect URIs if domain changes:
  - `https://<dashboard>/api/integrations/instagram/callback`

### Google (Gmail)

- [ ] OAuth consent screen app name → Shopkeeper
- [ ] Authorized redirect URIs if domain changes:
  - `https://<dashboard>/api/integrations/gmail/callback`

### Microsoft (Outlook)

- [ ] App registration display name → Shopkeeper
- [ ] Redirect URIs if domain changes:
  - `https://<dashboard>/api/integrations/outlook/callback`

### Telegram (BotFather)

Production bot migration (`@ClerkBot` → `@ShopkeeperBot`):

1. [ ] `/newbot` in @BotFather → register `@ShopkeeperBot`, display name **Shopkeeper**
2. [ ] Copy new `TELEGRAM_BOT_TOKEN` to Railway
3. [ ] Set `TELEGRAM_BOT_USERNAME=ShopkeeperBot` in Vercel
4. [ ] Register webhook (script above)
5. [ ] Smoke test: Connect Telegram from dashboard → `t.me/ShopkeeperBot?start=<token>`
6. [ ] Notify existing merchants to re-link if bot username changed (old deep links break)
7. [ ] Dev bot: repeat with `@ShopkeeperBotDev` for staging

### DNS

If migrating off `useclerk.co`:

- [ ] Point new apex / `app.` subdomain to Vercel
- [ ] Point gateway subdomain to Railway (if using custom domain)
- [ ] MX for `inbound.<domain>` → Postmark
- [ ] Update SPF/DKIM if sending domain changes
- [ ] SSL: wait for Vercel/Railway auto-provision

If keeping `useclerk.co`: skip DNS; only update display names in provider consoles.

### GitHub

- [ ] Rename repo `clerk` → `shopkeeper` (Settings → General)
- [ ] Update Vercel Git integration (usually auto-reconnects)
- [ ] Update Railway deploy hook / connected repo
- [ ] Update local remote: `git remote set-url origin git@github.com:<org>/shopkeeper.git`
- [x] Rename local folder `~/dev/clerk` → `~/dev/shopkeeper` (2026-06-06)

### Production DB — agent prefix migration

- [x] Completed. Production messages were migrated off the legacy `__clerk_agent__` /
  `__clerk_agent_note__` prefixes onto `__shopkeeper_agent__` / `__shopkeeper_agent_note__`.
  The one-shot `migrate-agent-prefixes.ts` script and the legacy-prefix runtime
  fallbacks were removed afterward.

---

## Post-deploy verification

```bash
# Env preflight
npm run verify:production:env

# Health + optional inbound email smoke
DASHBOARD_URL='https://<dashboard>' \
GATEWAY_URL='https://<gateway>' \
VERIFY_INBOUND_EMAIL_TO='support@inbound.<domain>' \
npm run verify:production
```

Manual checks:

1. Sign up / sign in (Clerk.com auth still works)
2. Connect Shopify integration (OAuth redirect)
3. Send inbound email → thread appears in inbox
4. Connect Telegram → bot replies with Shopkeeper branding
5. Stripe checkout → product name shows Shopkeeper
6. Clerk.com webhook: create/delete test org membership

---

## Rollback

- Keep old domain DNS alive for 48h after cutover
- Keep old OAuth redirect URIs in provider consoles until smoke tests pass
- Do not delete `@ClerkBot` until all merchants have re-linked to `@ShopkeeperBot`

---

## Phase 6 progress

- [ ] Primary domain confirmed
- [ ] Clerk.com application display name updated
- [ ] Vercel env + domain updated
- [ ] Railway env updated + Telegram webhook registered
- [ ] Neon / Stripe renamed
- [ ] Postmark sender + inbound domain updated
- [ ] Shopify / Meta / Google / Microsoft OAuth consoles updated
- [ ] Telegram bot migrated
- [ ] DNS cutover (if applicable)
- [ ] Agent prefix migration run (if applicable)
- [ ] GitHub repo renamed
- [ ] Post-deploy verification passed
