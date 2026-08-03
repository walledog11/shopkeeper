# External service consoles — brand + domain residue

Everything left of the `useclerk.co` → `useshopkeeper.com` migration that lives in
a third-party console. **No code task remains.** When these boxes are ticked this
file has no reason to exist — delete it, git history is the record.

Architecture (why marketing is on the apex and the app on `app.`, the
canonical-host redirect, the naming rule) is in `.claude/CLAUDE.md`. Trademark
findings, production env gaps, and the Shopify scope trim are in
[to-do-list.md](to-do-list.md) — not duplicated here.

Reconciled against the live deployment 2026-08-02.

## Values to paste into console fields

| Field | Value |
|---|---|
| App / product name | Shopkeeper |
| Homepage | `https://useshopkeeper.com` |
| Privacy policy | `https://useshopkeeper.com/privacy` |
| Terms | `https://useshopkeeper.com/terms` |
| OAuth redirect base | `https://app.useshopkeeper.com` |
| Contact email | `hello@useshopkeeper.com` |
| Inbound email | `inbound.useshopkeeper.com` |
| Telegram bot | `@useshopkeeperbot` |

Note the split: **homepage and legal pages are on the apex, OAuth redirect URIs
are on `app.`** Getting this backwards in a console field is the easiest mistake
here.

## Done

- [x] Apex + `app.` on Vercel, SSL provisioned, both serving 200 (2026-08-02)
- [x] `APP_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel
- [x] Railway `DASHBOARD_URL`
- [x] Shopify / Meta / Google OAuth **redirect URIs**
- [x] Clerk dev → production instance cutover; `pk_live_` confirmed in the bundle
- [x] Five Clerk CNAMEs in Vercel DNS, verified via `clerk deploy status`
- [x] GitHub repo renamed; agent prefix migration run

## Open

### DNS + mail

The apex and the `inbound.` subdomain are two unrelated mail paths. The apex
carries **your** mail; the subdomain carries **merchants' customers'** mail into
the product. Having one does not give you the other.

- [x] `hello@useshopkeeper.com` forwards to a monitored inbox — ImprovMX on the
  apex (`mx1`/`mx2.improvmx.com`, SPF `include:spf.improvmx.com`), verified
  2026-08-02. This is the contact published on `/privacy`, the data-deletion
  intake path (`production/data-deletion.md`), and the address Google's reviewer
  will use.
- [x] MX for `inbound.useshopkeeper.com` → **Postmark** (`inbound.postmarkapp.com`
  priority 10), verified propagated 2026-08-02. Note this is the merchant inbox,
  not branding: the integrations card tells the merchant to forward support mail
  to `${org.id}@${org.inboundEmailDomain}`
  (`components/integrations/EmailForwardingDisclosure.tsx`).
  - The apex ImprovMX records are independent and were not disturbed.
- [ ] Point a gateway subdomain at Railway (only if moving off the
  `*.up.railway.app` host)

**No SPF/DKIM work is needed on `useshopkeeper.com` for outbound.** Replies send
as the merchant's own address — `integration.fromEmail || integration.externalAccountId`
(`apps/gateway/src/message-handlers/outbound-email.ts`) — so the Postmark domain
verification that matters belongs to the merchant's domain and is part of
onboarding them, not a record here. Clerk's auth mail is already covered by the
`clkmail` / `clk._domainkey` / `clk2._domainkey` CNAMEs. Revisit only if
Shopkeeper starts sending mail as itself.

### Google

- [x] `useshopkeeper.com` verified in Google Search Console (2026-08-02)
- [ ] OAuth **Branding** page: app name, homepage, privacy URL, authorized
  domain. Distinct from the redirect URI, and still on the old host. With Search
  Console done this plus the support mailbox is what remains on the Gmail gate —
  see [production/google-gmail-verification-packet.md](production/google-gmail-verification-packet.md).
- [ ] This is a *separate* OAuth client from the Clerk social-login one — do not
  disturb the Clerk client while editing it.

### Postmark

Account rebuilt 2026-08-02 on `useshopkeeper.com`. The original account was
registered under an unrelated business domain with a fragile forwarding alias for
login — an account-recovery risk on the mail path itself. Nothing had been
configured on it, so it was abandoned rather than migrated.

- [x] New account + server **Shopkeeper-production** (ID 20167846), Platform plan
  for unlimited sending domains (Basic has no inbound at all)
- [x] Inbound domain `inbound.useshopkeeper.com` set on the stream, MX live
- [x] Inbound webhook → `POST /webhooks/email/inbound` on the gateway, basic auth
  via `POSTMARK_INBOUND_USERNAME`/`PASSWORD`. Credentials must be **hex**, not
  base64 — `/` and `+` break the userinfo section of the webhook URL.
- [x] `POSTMARK_API_KEY` + `INBOUND_EMAIL_DOMAIN` set in Vercel production and
  verified by pulling the deployed values
- [x] End-to-end inbound proven: mail to the domain appears in Postmark Activity
  and logs `event: unclaimed_recipient` on the gateway
- [x] Removed the unused `POSTMARK_FROM_DOMAIN` (held the dead `mail.clerkapp.com`)
- [x] Bounce webhook (id 25369388) on the **outbound** stream →
  `POST /webhooks/email/bounce`, triggers `Bounce` + `SpamComplaint` only —
  the handler discards every other `RecordType`. Verified 2026-08-02.
  - Verify with `GET https://api.postmarkapp.com/webhooks`, **not** the
    `BounceHookUrl` field on `GET /server` — that is the legacy server-level
    hook and stays empty when a per-stream webhook is used.
  - Attribution is by Postmark's own `MessageID`
    (`PostmarkSender.send()` → `providerMessageId`), so only mail sent through
    this server can be matched; anything else logs unattributed and is acked.
- [x] `useshopkeeper.com` verified for sending — DKIM
  (`20260803015353pm._domainkey`) and the `pm-bounces` Return-Path CNAME both
  resolve publicly. SPF was deliberately left alone: Postmark authenticates via
  DKIM and its own envelope sender, so no `include:` was added to the ImprovMX
  record.
- [ ] **Postmark account approval — this is the live blocker on outbound.** Until
  it clears, every recipient must share the From address's domain: sending from
  `hello@useshopkeeper.com` to an `icloud.com` address fails with *"While your
  account is pending approval…"*. Config is otherwise correct — that error proves
  the From domain, token, and integration all resolved.
  - Describe the use case as transactional support replies sent in response to
    inbound customer email, no marketing or bulk, **on behalf of merchants from
    their own verified domains** — declare the multi-tenant model up front.
  - To test before approval lands, make the test customer an address on
    `useshopkeeper.com` so the same-domain rule is satisfied.
- [ ] Per-merchant sending domains. Replies go out as the *merchant's* address,
  so each merchant verifies their own domain at onboarding — recurring work, not
  a one-time setup.
- [ ] Sender display name → Shopkeeper
- [ ] Smoke test:
  `VERIFY_INBOUND_EMAIL_TO=support@inbound.useshopkeeper.com npm run verify:production`

### Clerk

- [ ] Application display name → Shopkeeper
- [ ] Create the production webhook endpoint at
  `https://app.useshopkeeper.com/api/webhooks/clerk`, then set
  `CLERK_WEBHOOK_SECRET` in Vercel. Absent today, so **deletion propagation is
  dead** — a member removed in Clerk keeps their `OrgMember` row, Telegram
  binding, and operator access. The CLI cannot create webhook endpoints.
- [ ] Delete the leftover dev-only application named `clerk`
  (`app_3B9VBBAVoAaZGLuVuV5Ldw3atCJ`) once confirmed unused

### Shopify Partner Dashboard

- [x] Scopes trimmed to the 15 in `SHOPIFY_OAUTH_SCOPES` (2026-08-02) — done at
  zero connected merchants, so no re-consent was forced
- [x] Connect smoke test passed on the new host, confirming the `034d60e4`
  host-pinning fix and the popup-close fix against the deployed app
- [x] Signup on the apex carries the Clerk session across the redirect to `app.`
  — the seam flagged in `canonical-host.ts` is **not** a defect
- [ ] App display name → Shopkeeper
- [ ] Privacy policy URL

### Meta (Instagram)

- [ ] App display name → Shopkeeper
- [ ] Privacy policy URL

### Stripe

Not cosmetic: product names appear at checkout and the statement descriptor lands
on merchants' card statements.

- [ ] Rename products (Starter, Pro, Scale)
- [ ] Statement descriptor / receipts, if either mentions Clerk
- [ ] Checkout session description, if customized

### Telegram (BotFather)

**Priority: cosmetic. Group this with the other display-name items.** Nothing is
broken — the bot works, bindings work, `TELEGRAM_BOT_USERNAME` is set in
Production and Preview. The only defect is that the name a merchant sees at
connect time is probably pre-rebrand. Telegram is also not the primary operator
surface; **iMessage is**, and iMessage is identified by `IMESSAGE_LINE_HANDLE` —
a phone number, platform-wide, with no username and no brand string in the bind
path. None of this touches it.

An earlier revision of this file called the migration "now or never." That was
overstated and is struck. The re-link cost below scales with the number of bound
merchants, so at zero it is zero, and you will see it coming long before it
matters.

**What the re-link cost actually is, and when it applies.**
`OrgMemberTelegramChat` is keyed on `chatId`
(`apps/gateway/src/routes/telegram/start-binding.ts:64`), and a Telegram `chatId`
is a conversation with *one specific bot*. `operator-notify.ts:68` reads those
rows to decide where to push plans, questions, and the briefing. A **new** bot
has never spoken to those users, so bindings are dead and pushes fail silently.
This applies **only** on the `/newbot` path — if step 0 says the username can be
renamed in place, there is no re-link, now or ever, and the deferral question is
moot.

0. [ ] **Check BotFather first — this forks the whole migration.** If Bot
   Settings lets you change the existing bot's @username, the token and every
   `chatId` survive; only the stale `t.me/` URL breaks, and steps 2 and 7 are
   unnecessary. Only fall through to `/newbot` if it doesn't.
1. [ ] Rename to `@useshopkeeperbot` (or `/newbot` if step 0 says you must),
   display name **Shopkeeper**
2. [ ] New bot only: copy the new `TELEGRAM_BOT_TOKEN` to Railway
3. [ ] Set `TELEGRAM_BOT_USERNAME=useshopkeeperbot` in Vercel (Production +
   Preview — the existing var is set in both, last touched pre-rebrand), then
   redeploy so the value reaches the server components that read it
4. [ ] Re-register the webhook — **required on either path**, since it is bound
   to the token and the host:
   `cd apps/gateway && tsx src/scripts/set-telegram-webhook.ts https://clerk-production-e37f.up.railway.app/webhooks/telegram`
5. [ ] Smoke test: connect Telegram from the dashboard →
   `t.me/useshopkeeperbot?start=<token>`, then send `help` and confirm a reply
6. [ ] Repeat with `@useshopkeeperdevbot` for staging
7. [ ] New bot only: keep the old bot alive until every merchant has re-linked

**Adjacent, not required now:** the Railway gateway host is still
`clerk-production-e37f.up.railway.app` — pre-rebrand, but internal-only and never
seen by merchants. If it is ever renamed, every registered webhook (Telegram,
Postmark inbound, Meta, Shopify) must be re-pointed. Do it in the same sitting as
step 4 or not at all, so the work happens once.

## Closing verification

```bash
npm run verify:production:env

DASHBOARD_URL='https://app.useshopkeeper.com' \
GATEWAY_URL='https://<gateway>' \
VERIFY_INBOUND_EMAIL_TO='support@inbound.useshopkeeper.com' \
npm run verify:production
```

Then by hand:

1. Sign up on the apex and confirm the session survives the redirect to `app.`
2. Connect Shopify (OAuth round trip)
3. Send inbound email → thread appears in the inbox
4. Connect Telegram → bot replies with Shopkeeper branding
5. Stripe checkout → product name shows Shopkeeper
6. Clerk webhook: delete a test org membership, confirm the `OrgMember` row goes

When all six pass, delete this file.
