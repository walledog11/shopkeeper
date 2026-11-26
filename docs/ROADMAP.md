# Roadmap

The only planning doc. Each item says what is left and what closes it. Delete an item
when it closes — git history is the record. No status narratives, evidence logs or
"observe in normal use" lists; anything that blocks nothing does not belong here.
Technical contracts and settled engineering decisions live with the code they govern
([agent-runtime](agent-runtime.md), [runbook](production/runbook.md),
[transport plan](socialapi-transport-plan.md)), not here.

Last updated: 2026-11-26.

## Next — make the app ready to use

In order. Using the app showed it isn't ready for a merchant: requests that end without
an answer, a setup that asks for chores before showing the agent, settings a first-time
owner can't judge, and no way to hear the agent's voice before a customer does. Every
item is checked by using the app in a browser, with screenshots in the PR.

1. **Run the real agent in the cloud dev environment.** The dashboard, gateway and
   simulated Shopify store already run there; the models need an Anthropic key on the
   environment. Closes when a seeded store plans a ticket and answers a merchant request
   with the real models.
2. **No request ends without an answer.** At the step limit or token budget a merchant
   request ends on a canned line ("Reached maximum steps…", "I ran out of room…") or on
   the narration that came with its last tool calls. Closes when a request forced past
   each limit answers from what it already found, and a request that still can't answer
   says so and reaches Sentry.
3. **Cut the compatibility paths and their audits** that exist only for pre-launch data
   (reset the dev workspace instead). Website chat and the Telegram test transport stay;
   direct Meta Instagram stays until SocialAPI's review closes. Closes when they are
   deleted and the full loop still runs.
4. **A Voice page.** Sample customer messages (recent real ones plus where's my order,
   refund, damaged item, product question, angry customer), each with the reply the
   agent would send, rewritten live as tone, length, sign-off or plain feedback ("less
   formal") change. "Which sounds more like you?" puts two versions side by side; picks
   and edits become the examples replies are written from (`VoiceEdit`). Not live A/B on
   customers: a solo store's volume can't tell versions apart. Closes when a merchant sets
   the voice without writing a brief and the next real draft matches it.
5. **Onboarding built on the Voice page.** Install from Shopify; the agent introduces
   itself and asks what a new hire would (what you sell, how returns work, what it must
   never promise); it drafts replies to real recent messages, or ones built from the
   store if no channel is connected; the merchant reacts and picks the voice; link the
   phone; go live in draft-only. Closes when a fresh install reaches its first approved
   draft without typing a store domain or setting up forwarding.
6. **Four plain settings sections and a calmer app.** How it sounds; what it may do
   without asking (with examples, one money limit); when and where it reaches you;
   account and billing. Everything else takes a default. One place per job (Home stops
   duplicating the inbox), one request per page instead of 4–10, and a phone-first pass
   over every screen, text and email the merchant gets. Closes when every remaining
   setting is a question a first-time shop owner can answer.

Alongside, on a deadline: **expiring Shopify offline tokens, before 2027-01-01** (built;
runbook *Shopify access tokens*). Closes when the gateway holds `SHOPIFY_CLIENT_ID` and
`SHOPIFY_CLIENT_SECRET` and the dev store's integration has a refresh token: opening the
app in Shopify admin, or the next daily token-health run, swaps its non-expiring token.

## Paused — the first real merchant

Resumes when *Next* is done, in this order.

1. **Run an unlinked Instagram sender's damage claim with a photo** through order
   confirmation. Closes when the agent asks for the order, then its email or zip, then a
   photo; the SocialAPI gallery photo is stored on the ticket; and the merchant gets one
   card: the confirmation line, photos and the proposed resolution. `simulate:refund
   --damage` checks it while you send the photo from the customer's Instagram account.
2. **Close SocialAPI vendor diligence** before any external merchant's data flows: DPA,
   written retention/deletion answers and the terms §11.4 contradiction. When SocialAPI
   answers, add its retention to `/privacy`. Gates are in [socialapi-s0-diligence](production/socialapi-s0-diligence-2026-09-07.md).
   Direct Meta Instagram is the fallback until this closes; cut it once it passes.
3. **First live SocialAPI merchant connect** (runbook: *Instagram via SocialAPI*). Closes
   when `verify:production:env` passes, a workspace connects from the dashboard, and its
   next DM routes to it. Needs a paid SocialAPI plan: Free allows 50 replies per billing
   period across every workspace, then refuses all of them until the period ends.
4. **Disconnect and reconnect the controlled SocialAPI account** (built: disconnect and
   workspace deletion revoke the remote account). Closes when the account is gone from
   the brand's listing and, after reconnecting, the same sender's next DM lands on the
   same customer and a reply reaches them. If SocialAPI issues new author IDs on
   reconnect, record that in the transport plan (invariant 6) instead.
5. **Re-prove every Shopify write after the GraphQL rewrite.** #254–#256 replaced every
   Shopify read and write, and evals cannot see this layer. Run `canary:shopify-mutations
   -- --validate`, then `-- --execute` on the dev store, and one `simulate:refund`. Closes
   when every write passes and no Shopify write has changed since.
6. **Install the Shopify app on a real, non-dev store.** First check its distribution in
   the Partner dashboard; it can't be changed once chosen. Custom distribution installs on
   one store (or one Plus organization), so it can't serve item 7. Public distribution
   needs Shopify's app review before any non-development install, even unlisted (next
   section). Closes when the install grants every `SHOPIFY_OAUTH_SCOPES` scope and a
   missing scope shows the reconnect path.
7. **Two supervised external merchants** complete real approved loops with no
   wrong-recipient, unauthorized-money, duplicate-action or lost-message incident.

## Paused — Shopify App Store submission

The first publication is the App Store. These block review or a new install's first day.
Resumes with the first real merchant.

1. **Charge through Shopify** (built: Shopify App Pricing, plans read from the Partner API;
   runbook *Shopify install and billing*). Closes when the `starter` and `pro` plans exist in the
   Partner Dashboard, the Partner API client and `SHOPIFY_APP_HANDLE` are set, and a dev-store install
   picks a plan that Usage & billing and the app home show.
2. **Authenticate at install, not at signup** (built: the app home holds the install's
   grant and its links claim it). Closes when, on the dev store, install → app home →
   sign up → inbox asks for no store URL and no second consent.
3. **A customer channel an installer can connect alone.** Instagram connect is gated per
   workspace by SocialAPI brand assignment (`SOCIALAPI_BRAND_ASSIGNMENTS`, at most 8), so
   every App Store install sees Instagram "Coming soon" while the listing and landing page
   lead with DMs. Email is no clean fallback yet: Gmail shows Google's unverified-app
   warning and stops at 100 users until the next item passes, a forwarding merchant's
   domain is verified in Postmark by hand before their replies send, and website chat is
   off (`STOREFRONT_CHAT_ENABLED`). Provision a brand on connect, or lead with email and
   say Instagram opens by invitation. Closes when what the listing promises is what a new
   install can connect.
4. **Submit Gmail restricted-scope verification now**
   ([packet](production/google-gmail-verification-packet.md)). Until it passes, every
   Gmail connect shows Google's unverified-app warning and the app stops at 100 users,
   and the review, with any security assessment Google asks for, runs on Google's
   schedule. Closes when it is submitted.
5. **Tell a merchant with no linked iPhone what is waiting** (built: with no phone bound,
   plan cards, questions, escalations and the briefing are emailed to every member and
   link into the app; runbook *Notice emails*). Closes when the sender's domain is
   verified in Postmark, `NOTICE_EMAIL_FROM` is set on the dashboard, and a workspace with
   no phone gets an email for a new card, an escalation and the briefing. Auto-execution
   reports and the AI-limit and outage notices still reach phones only.
6. **Partner dashboard submission:** protected customer data access (level 2: name,
   email, phone, address); its requirements are built (runbook *Customer data
   protection*: access log and weekly review, the Terms' data processing section, the
   incident response policy), so every answer is Yes except consent, data sale and
   automated decisions (Not applicable). The reason for each requested scope is in the
   Shopify configuration reference (*Access scopes*); release the current
   `shopify.app.toml` and chat extension with `shopify app deploy` before submitting.
   Left: listing copy, icon and screenshots; a screencast; reviewer test credentials.
   Closes when the submission form is complete.
7. **Listing day:** the site's call to action is a waitlist. Point it and the pricing
   cards at the listing, and open sign-ups. Closes when the listing is live.

## Later

- **SocialAPI hardening** (S1–S6 in [the transport plan](socialapi-transport-plan.md)):
  `dm.sent` correlation (a reply typed in the Instagram app never reaches the thread),
  missed-delivery recovery, account health probing, failed-connect compensation, and a
  reconnect that switches accounts, which deletes the old row without revoking it.
- **Instagram reply latency:** about 10s from a DM to the first reply (21s before the
  database driver change). Instagram sends now leave from the gateway, not a cold
  dashboard function. What remains: model time (read about 2.3s, plan 1.6s a call),
  SocialAPI's send (about 1.2s) and the gateway's task bookkeeping (about 80 queries at
  20ms each before the first reply). Every step is timed in *Copy timeline*. SocialAPI
  has no typing or "Seen" for Instagram; ask the vendor.
- **Agent rough edges seen live:** a status question naming the customer uses the full
  order read.
- **Mirrored phone cards reach operator history unwrapped.** A plan card mirrored onto
  the operator thread quotes the customer's message, the draft and each write's values
  (an address, a note), and operator turns read it back as an assistant row without
  `wrapUntrusted`. Wrap the customer-derived spans where cards are mirrored.
- **Concurrency-safe LLM allowances.** Parallel calls can spend the same remainder, and a
  usage write that fails (or names an unpriced model) is logged by `recordSpend` and
  dropped. Reserve before each provider call and reconcile after; keep unknown
  reservations across process loss; keep merchant cap, service allowance and platform
  stop separate; extend `llm_daily_spend` rather than adding a ledger. Closes when
  concurrent calls cannot overspend by more than one in-flight call and a failed usage
  write stays recoverable.
- **Cost envelope, billable unit and entitlements**, before charging anyone. Decide
  whether an unknown price id should stay unbounded (`packages/db/plan-limits.ts`).
- **Prior conversations in planner context**: at most ~3 summaries of the same verified
  customer, newest first, own budget and own catch, never shown to an unverified shopper.
- **A refusal shouldn't outlive the capability.** In a permanent operator thread the
  agent keeps citing its own earlier "I can't" after a tool ships. Decide the mechanism;
  a prompt bullet is not it.
- **Compliance webhooks:** exercise `customers/data_request` and `shop/redact` once
  ([data-deletion](production/data-deletion.md)).
- **Production leftovers:** get `audit:agent-runtime-retirement -- --strict` clean
  (approvable cards without a durable proposal regenerated, open unknown actions
  reconciled). Drop `AGENT_RUNTIME_VERSION` from Railway only once no pre-#165 revision
  can be a rollback target ([agent-runtime](agent-runtime.md), *Deployment and
  rollback*). Retire the identity-less operator queue reader once
  `audit:operator-context-compatibility -- --strict` reports none.
- **Moderate advisories in production dependencies:** fast-uri (pinned at 3.1.8 in the
  root `overrides`, inside the vulnerable range), glob and minimatch. CI's dependency
  audit fails only on high. Closes when `npm audit --omit=dev` is clean.
- **Postmark:** credential canary to an off-domain recipient, then restore the
  forwarding integration and send one reply with an attachment.
- **Storefront chat on the dev store:** browser matrix, episode boundary, the
  router-materialized escalation, one real merchant in approval mode, one
  `chat_assisted` order ([findings](production/storefront-chat-verification-2026-08.md)).
  Decide whether a verified shopper may start a mutation that goes to merchant approval.
- **PostHog:** the privacy policy already discloses it — review staging payloads, then
  set `PRODUCT_ANALYTICS_ENABLED=true`.
- **Orphaned workspaces:** 12 rows stay `active` that Clerk no longer has (April's `org_test_*`
  rows from tests run against production, and abandoned onboarding workspaces). Finish them through
  the deletion ledger ([data-deletion](production/data-deletion.md), *Recovery*).
- **Console residue:** Clerk application name (and delete the unused dev app), Shopify
  privacy URL, Postmark sender branding, the Telegram bot rename to
  `@useshopkeeperbot`, and Stripe product names, statement descriptor and receipts —
  those land on merchants' card statements, so check them before charging anyone.
- **Paid pilot:** decide the SocialAPI admission unit and contracted capacity, instrument
  outcomes and per-org cost, benchmark 1x/10x pilot load on isolated data with stubbed
  providers (warm list/detail p95 ≤ 500 ms, provider-independent failures < 1%, routine
  plans ready ≤ 30 s p95, a 10x burst drained within 5 minutes), then recruit 5–10 owner-run
  brands in one segment. Success: ≥5 paying and ≥3 renewing, ≥2 hours/week saved for ≥3,
  ≥80% of routine plans approved unedited, no unresolved money or wrong-recipient
  incident. Stripe prices only when the pilot tests renewal.

## Parked — reopen on the trigger

| Trigger | Work |
| --- | --- |
| A merchant asks for account binding | Storefront chat Customer Account OAuth (blockers in the storefront doc) |
| A merchant asks to change a line quantity | Quantity edits in `edit_shopify_order` |
| The first merchant chooses email forwarding | Verify their sending domain in Postmark |
| Zero forward-only merchants, and a decision | Remove Postmark inbound (keep the bounce webhook) |
| The first unknown write on a merchant's store | A merchant-facing way to confirm what happened |
| Before changing capability discovery or operator tool sets | Attribute planning cost (`inspect-turn-usage.ts`, `rebuilt`) |
| The next support-prompt bullet for one bad output | Move `SUPPORT_INSTRUCTIONS` invariants into schema or executor |
| The next approval-binding stage added to `planAgent` | Split `planAgent` into stages with typed results (bind provider facts, assess, materialize) instead of one function revising the proposal in place |
| The next task-lifecycle bug, or a fourth plan-producing flow | One owner for claimed attempts (lease, budget, publish, settle) across auto-planning, composer, answers and follow-ups; distinct types for automatic and merchant-approved execution |
| The next change to merchant-answer KB | Typed fields instead of regexes in `merchant-answer-kb.ts` |
| Async recovery exercised | Decide async-only outbound email and retire the sync path |
| The synchronous email rail retired | One outbound envelope in `@shopkeeper/messaging` (pending message, attribution, outcome transitions); hosts supply transport and alerts |
| A few weeks of real merchant traffic | Baseline outcomes from `request_episode_outcomes`/`agent_actions`/`agent_tasks`/`agent_turn_usage` |
| Attributed chat sales look too low | Anonymous-shopper attribution via cart attributes |
| Classifier spend matters | Classify a two-message email burst once |
| Tool-schema cost justifies a re-proof | Consolidate `get_shopify_orders`/`get_order_by_name` into one order read; `get_order_tracking` stays separate. Those two are the whole verified-storefront set (`VERIFIED_ORDER_TOOL_NAMES`), so a by-customer lookup must reach neither storefront state, and the guest/verified matrix is re-proved |
| SocialAPI fails diligence or the cohort nears 100 | Revisit direct Meta (Meta console branding, native-ID mapping) |
| Anything touches the gateway host | Move it to a `useshopkeeper.com` subdomain and re-point every webhook together |
| Google requests a CASA assessment | Backup/log retention checks, a dynamic scan, the unverified requirements |
| Paid beta | Better Stack Level 1 drains and escalation |
| A merchant sees a duplicate over-plan notice | Move the marker off `Organization.settings` |
| Gateway Redis leaves private networking | `REDIS_URL` → `rediss://` |
| First customer launch | Decide `MERCHANT_PREFERENCE_OBSERVED_PROPOSALS` |
| ~50 paying merchants or marketing spend | Revisit the trademark |

## Decisions on record

- **Work serves an item in *Next*.** Cleanups, consistency passes and refactors land only
  as part of one, and a change is done when it has been used in the app, not when its
  tests pass. Two weeks of cleanup PRs closed nothing. (2026-11-26)
- **Make it work before making it certifiable.** A gate or hardening item earns its place
  once the path it guards runs. Money, tenant isolation and truthful outcomes are never
  skipped. (2026-09-10)
- **SocialAPI is the `ig_dm` transport through the first 100 users.** Meta App Review
  gates nothing; direct Meta stays closed to new workspaces. Admission is by
  `SOCIALAPI_BRAND_ASSIGNMENTS`, capped by `SOCIALAPI_MAX_ACTIVE_ORGS` (max 8). (2026-09-09)
- **Gmail working never proves Instagram ready.** Instagram is the core customer
  channel, iMessage the control surface, Telegram internal only. (2026-09-07)
- **Damage claims need a photo before any compensation** (`damageEvidence:
  "photo_required"`, the default; `off` disables it). A missing photo escalates; a
  photographed claim always goes to the merchant; the agent never judges a photo.
  (2026-10-07)
- **Never relax financial approval to cut notifications**; batch, dedupe and use duty
  hours instead.
- **New capabilities need a named merchant job** and stay out of the default support
  turn unless they earn it; gift cards are merchant-directed only. (2026-09-11)
- **Plans sell volume and seats, never features.** (2026-08-19)
- **Paid alerting waits for paid beta**; until then gateway alerts go to the operator
  Telegram chat and the dashboard's to Sentry, and both apps report errors to Sentry.
  (2026-07-31; gateway errors 2026-11-18)
- **Synchronous outbound email stays the rollback rail** until async recovery is
  exercised and an async-only date is set.
- **Don't rename persisted enums or BullMQ queue/job names** for aesthetics — live
  repeatable schedulers depend on them. Retire a compatibility path one per PR, after its
  audit shows no production use. Kept until then: the `whatsapp-digest` queue and jobs and
  the `outbound-email-sweep` names (`apps/gateway/src/constants.ts`;
  `audit:bullmq-compatibility-names`), the synchronous email rail
  (`audit:outbound-email-mode`) and the identity-less operator queue reader
  (`audit:operator-context-compatibility`). Their audits are not finished-migration
  scripts for the cleanup in *Now*.
- **Episode memory stays deferred** (person identity, obligations, prior-episode
  retrieval): it is a ranking problem with no traffic to rank. (2026-08-12)
- **Evals can't see the Shopify layer** — every Shopify tool result is simulated, so the
  dev store is the only test of `packages/agent/src/shopify/*`.
- **Founder and test workspaces never count** as demand, success or renewal evidence.
- **`RequestEpisodeOutcome` stays.** It is the only per-plan record of the classification
  and autonomy verdict a plan was made under (the task ledger keeps neither), the Review
  page's outcome line, and what `audit:request-outcomes` reports for the pilot's
  approved-unedited and auto-resolved rates. Its writes are best-effort, so it costs upkeep,
  not risk. (2026-10-28)
