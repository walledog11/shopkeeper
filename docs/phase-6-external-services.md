# Phase 6 — External Services Runbook

Rename **Clerk → Shopkeeper** in every service outside the repo. Code changes for this phase are in the same deploy window.

**Primary domain: `useshopkeeper.com` — REGISTERED 2026-08-02 and attached to Vercel.**

| Setting | Value |
|---|---|
| Marketing origin (apex) | `https://useshopkeeper.com` |
| Dashboard origin | `https://app.useshopkeeper.com` |
| Contact email | `hello@useshopkeeper.com` |
| Inbound email | `inbound.useshopkeeper.com` |

Both hostnames are served by the **same Vercel project**. Marketing and dashboard
are one Next.js app — `src/app/(marketing)/page.tsx` is `/`, `src/app/dashboard/`
is `/dashboard/*` — so nothing is split at the code level and no host-based
routing exists (the proxy at `src/proxy.ts` is Clerk auth + CSP only).

**Why the app lives on `app.` and not the apex:** the app origin is pinned into
Google OAuth + restricted-scope verification, Shopify, Meta, Clerk,
`DASHBOARD_URL`/`GATEWAY_INTERNAL_URL`, and Telegram deep links. The marketing
origin is pinned into nothing. Putting the app on a subdomain means marketing can
later move to a CMS without any of those being touched. `APP_URL` and
`NEXT_PUBLIC_APP_URL` must both be `https://app.useshopkeeper.com` — they are
equality-checked in production at `apps/dashboard/src/lib/env/index.ts`.

Initially both hostnames serve every route (duplicate content on the marketing
pages). Tighten later with a canonical tag or a host redirect in `src/proxy.ts`;
do not add new routing before the Google submission clears.

Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel. The code fallback in
`apps/dashboard/src/lib/brand.ts` is now `hello@useshopkeeper.com` — **that
address must forward somewhere monitored before deploy**, or the app advertises a
bouncing contact on its legal pages and Google's reviewer will hit it.

The earlier option table listed `shopkeeper.app` and `getshopkeeper.com`; both are registered and were never available. `shopkeeper.support`, `.ai`, `.io`, `.shop`, `.store`, `.co`, `.dev` are all taken too (checked 2026-08-02); only `.help`, `.one`, `.inc` were free, and `.help` was rejected because it welds the brand to the support wedge that the core is explicitly not supposed to couple to. The `use` prefix is the brand system, not a fallback — `@useshopkeeper` is already held on X and Instagram, so the domain matches the handles rather than the other way round. Register `@useshopkeeperbot` on Telegram for the same reason; `@ShopkeeperBot` is almost certainly taken and would break the pattern even if free.

**Trademark status — proceeding knowingly.** `SHOPKEEPER` is not registrable in
software classes (see `to-do-list.md` for the Lightspeed `SHOPKEEP` findings).
This domain is being used as a working brand pre-revenue, accepting that the mark
can never be owned and that a forced rename is possible. Mitigation: no paid
acquisition and no press launch under the name; revisit at ~50 paying merchants.
A domain change after Gmail verification means redoing restricted-scope review
and the CASA assessment, so that revisit is a real decision point, not a formality.

**Never write "ShopKeep" (no trailing `-er`) in any user-facing surface, bot username, or logo lockup.** `shopkeep.com` is ShopKeep POS, owned by Lightspeed, and live registered marks exist in that family for point-of-sale software. The `-er` is what distinguishes this product from that mark. Separately, `shopkeeper.com` is unrelated Amazon-seller software — expect no organic ranking on the bare word and optimize for brand terms instead.

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
| `APP_URL` | `https://app.useshopkeeper.com` |
| `NEXT_PUBLIC_APP_URL` | `https://app.useshopkeeper.com` — equality-enforced against `APP_URL` in production |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `hello@useshopkeeper.com` |
| `INBOUND_EMAIL_DOMAIN` | `inbound.useshopkeeper.com` |
| `GATEWAY_INTERNAL_URL` | Gateway public URL if it changes |
| `TELEGRAM_BOT_USERNAME` | `useshopkeeperbot` (after BotFather registration) |

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

### Telegram (BotFather)

Production bot migration (`@ClerkBot` → `@useshopkeeperbot`):

1. [ ] `/newbot` in @BotFather → register `@useshopkeeperbot`, display name **Shopkeeper**
2. [ ] Copy new `TELEGRAM_BOT_TOKEN` to Railway
3. [ ] Set `TELEGRAM_BOT_USERNAME=useshopkeeperbot` in Vercel
4. [ ] Register webhook (script above)
5. [ ] Smoke test: Connect Telegram from dashboard → `t.me/useshopkeeperbot?start=<token>`
6. [ ] Notify existing merchants to re-link if bot username changed (old deep links break)
7. [ ] Dev bot: repeat with `@useshopkeeperdevbot` for staging

### DNS

Migrating off `useclerk.co` to `useshopkeeper.com`:

- [ ] Point apex `useshopkeeper.com` and `app.useshopkeeper.com` to Vercel
- [ ] Point gateway subdomain to Railway (if using custom domain)
- [ ] MX for `inbound.useshopkeeper.com` → Postmark
- [ ] Update SPF/DKIM for the new sending domain
- [ ] SSL: wait for Vercel/Railway auto-provision
- [ ] Verify `useshopkeeper.com` in Google Search Console — this is the gate on Gmail
  restricted-scope verification (see `production/google-gmail-verification-packet.md`)

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

- [x] Primary domain confirmed — `useshopkeeper.com` (2026-08-01)
- [x] `useshopkeeper.com` registered + attached to Vercel (2026-08-02)
- [ ] `app.useshopkeeper.com` added to the same Vercel project
- [ ] `useshopkeeper.com` verified in Google Search Console (gates Gmail)
- [ ] `hello@useshopkeeper.com` forwarding to a monitored inbox
- [ ] Clerk.com application display name updated
- [ ] Vercel env + domain updated
- [ ] Railway env updated + Telegram webhook registered
- [ ] Neon / Stripe renamed
- [ ] Postmark sender + inbound domain updated
- [ ] Shopify / Meta / Google OAuth consoles updated
- [ ] Telegram bot migrated
- [ ] DNS cutover (if applicable)
- [ ] Agent prefix migration run (if applicable)
- [ ] GitHub repo renamed
- [ ] Post-deploy verification passed
