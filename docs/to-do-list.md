# Shopkeeper To-Do List

Open work only. Completed work is deleted, not archived — git history is the
record. Do not add "recently completed" sections to this file.

Last reviewed: 2026-08-07.

Single source of truth for **actionable** open work. Evidence checklists, console
residue, failure-drill procedures, and standing policies live in the linked docs
below — not duplicated here.

Work is grouped by **what kind of action** it needs, not by when it was filed.

**Guiding principle for pending integrations.** Shopkeeper is still in active
development — channels and features are being added, not finalized. Pending
integrations (Instagram DM, TikTok, WhatsApp) are work to *finish and build*,
not removal candidates. Frame their tasks as "build/finish," and treat
onboarding sequencing as ordering channels behind the v1 wedge — never as
dropping or de-advertising a channel.

Not a removal candidate is not the same as next in line. WhatsApp is
deprioritized as of 2026-08-07 — it is a merchant-control channel, so it adds a
third route alongside Telegram and iMessage rather than new customer reach, and
US penetration is low in the target market. Do not propose it as the next
channel to build. See [product-truth.md](product-truth.md) §2.

---


## Prove in prod

Shipped code that needs a production canary, observation window, or configured
provider. **None of these is a code task.**

- [ ] **Postmark outbound canary.** Send and bounce attribution under real
  traffic. Inbound is proven end to end as of 2026-08-02 (server
  `Shopkeeper-production`, ID 20167846). Account approval, sender setup, and
  smoke steps live in
  [phase-6-external-services.md](phase-6-external-services.md) (Postmark
  section).
- [ ] **Instagram Advanced Access.** Implementation and Standard Access acceptance
  are complete. Launch gated on Meta App Review and a non-role merchant account
  completing the full DM loop (connect → inbound → approve reply →
  disconnect/reconnect). Ops in [runbook.md](production/runbook.md).
- [ ] **Realtime inbox (SSE + Redis pub/sub).** Decision 2026-08-06: finish and
  enable, not delete. `publishThreadEvent` already runs **unflagged** in
  production from 10 call sites — only the SSE serving side is gated, and the
  CSP `connect-src` fix landed 2026-08-06. Remaining is env plus a canary, and
  there are **two** gates: Railway `GATEWAY_REALTIME_ENABLED=true`, then Vercel
  `NEXT_PUBLIC_GATEWAY_EVENTS_URL=https://clerk-production-e37f.up.railway.app`
  followed by a **redeploy** — `NEXT_PUBLIC_*` is inlined at build time, not a
  runtime flip. Verify with `cd apps/gateway && npm run realtime:smoke --
  --org-id=<prod org> --url=<gateway>` (asserts delivery *and* cross-org
  non-delivery), then confirm `[Realtime] Subscribed` in gateway logs with no
  new `/api/security/csp-report` hits. Rollback: unset the Vercel var and
  redeploy; polling returns to 15s. **Failure mode to watch:** if SSE cannot
  connect, `RealtimeProvider` retries silently forever while polling has already
  slowed to 60s/120s — the inbox gets slower with nothing surfaced, so check the
  logs before walking away. Standing cost traps: never hold SSE on Vercel
  functions; never use Postgres `LISTEN/NOTIFY` (pins a Neon connection).
  **Gates M1 of**
  [shopify-storefront-chat-implementation-plan.md](shopify-storefront-chat-implementation-plan.md).
- [x] **Dashboard ops alert → Sentry.** Production round-trip verified
  2026-08-07 via deployed `agent_failure` trigger (`POST /api/agent`, no
  approved plan). Evidence in
  [alerting-evidence.md](production/alerting-evidence.md). Spot-check the
  Sentry issue in the UI if you want a second pair of eyes — local CLI tokens
  are `org:ci` only.

---


## Console / config

External consoles, env vars, and provider dashboards. No application code.

**All brand, domain, OAuth branding, Postmark approval, Clerk/Shopify/Meta
display names, Telegram migration, and Gmail restricted-scope packet work:**
[phase-6-external-services.md](phase-6-external-services.md). Delete that file
when its closing verification passes. Re-verify env presence with
`vercel env ls production` — `vercel env pull` redacts sensitive vars to an
empty string, indistinguishable from unset.

---


## Parked / decide

Built or decided-deferred. No active build work unless you explicitly choose to
resume. Gated-off integrations cost nothing to keep dark.

- [ ] **TikTok Shop disposition.** Wired end to end behind
  `TIKTOK_SHOP_ENABLED=false` with tests; never validated in prod. Decision —
  configure and enable, or cut — not more adapter code. If pursued: TikTok Shop
  app approval, seller authorization, multi-merchant SaaS support, prod config.
  Confirm Customer Service API availability for US merchants and third-party
  SaaS in Partner Center. Keep TikTok Shop buyer messages separate from generic
  TikTok DMs (no generic-DM adapter exists).

**Resume when triggered** (not open checkboxes):

| Trigger | Work | Where |
| --- | --- | --- |
| Privacy policy ships | PostHog Phase 5: staging payload review, then `PRODUCT_ANALYTICS_ENABLED=true` | [posthog-reports.md](production/posthog-reports.md) |
| Two-tier billing ships | Create Stripe `PRICE_ID_STARTER` / `PRICE_ID_PRO` and set in Vercel production | [phase-6-external-services.md](phase-6-external-services.md) (Stripe) |
| Redis TLS migration | Gateway `REDIS_URL` → `rediss://` on both services | [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) |
| Paid beta | Better Stack Level 1 log drains + escalation (free tier done 2026-07-31) | [runbook.md](production/runbook.md), [alerting-evidence.md](production/alerting-evidence.md) |

**Decisions on record** (not tasks): operate "Shopkeeper" unregistered
(2026-08-02); revisit trademark at ~50 paying merchants or before marketing
spend. Sync outbound email remains the rollback rail until async recovery
exercises complete — policy in
[compatibility-retirement-backlog.md](compatibility-retirement-backlog.md), not a
checkbox here. Email stale-claim / manual-retry drills:
[alerting-evidence.md](production/alerting-evidence.md),
[runbook.md](production/runbook.md).

---


## Reference docs

- [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md) —
  read before renaming any BullMQ queue or job string.
- [phase-6-external-services.md](phase-6-external-services.md) — console-only
  brand/domain checklist; delete when closing verification passes.
- [production/pre-release-validation-2026-08-04.md](production/pre-release-validation-2026-08-04.md) —
  2026-08-04 production validation evidence.
- [production/gmail-rollout-evidence-2026-07-29.md](production/gmail-rollout-evidence-2026-07-29.md) —
  Gmail native inbound soak (scheduled observation closed 2026-08-07).
- [production/posthog-reports.md](production/posthog-reports.md) — PostHog report
  definitions and provisioning.
- [production/runbook.md](production/runbook.md) — ops, monitors, channel rollout.
- [production/alerting-evidence.md](production/alerting-evidence.md) — controlled
  alert triggers and verification cheatsheet.
