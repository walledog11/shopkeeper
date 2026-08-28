# Storefront chat — verification and incident record, August 2026

The surviving record for storefront chat. Chronology is the axis: what was
believed, what turned out to be true, and what it cost to find out.

Split out of the implementation plan on 2026-08-13, when the plan had reached
1,661 lines and two thirds of it was this. The plan itself was closed and deleted
later the same day, once the merchant half landed — its remaining open work moved
to [to-do-list.md](../to-do-list.md), and the constraints that outlive it are in
"Standing constraints" below. Nothing was deleted in either move; prose was
relocated, and superseded claims that used to sit beside their corrections are
filed under the date they were corrected.

Read the durable findings first. They are the part that applies to work that has
nothing to do with this channel. Read the standing constraints before changing
anything on this channel.

---

## Durable findings

Extracted from the runs below. Each one cost a live failure to learn.

- **"On HEAD" has to name three deploy surfaces.** Vercel, Railway, *and* the
  Shopify app version. The theme extension asset ships inside the app version
  and reaches no storefront until `shopify app deploy` — so the widget can be
  days stale while both hosts are current. Found 2026-08-12, when the
  verification card did not exist on the store while every route behind it was
  live.
- **A migration must reach production before the code that reads it.** Hit twice
  on this feature, two for two (`20260807120000`, `20260808120000`). Nothing in
  the deploy path enforces the ordering and the failure is invisible from the
  merchant side: the dashboard stays healthy and an unsigned probe answers `401`,
  which reads as alive. Cheap check: `prisma migrate status` against production
  as a release step.
- **A type error in a test file takes the gateway down silently.** The gateway
  build runs `tsc` over the whole workspace including tests; Railway keeps the
  last good container serving. Nothing distinguishes "deployed" from "deploying
  onto a six-hour-old build" without `railway deployment list`. Check it whenever
  gateway-side code looks like it did not take effect.
- **"Shipped" and "deployed" are different claims.** For most of 2026-08-08 the
  plan described the spend budget as bounding spend. The code was merged; the
  gateway was serving a build that predated it. Keep the distinction rather than
  collapsing it.
- **The agent registry and `static-policy.ts` reach the client bundle.** Anything
  they import comes with them. `plan-preview` → `ConversationComposerArea` pulled
  `node:crypto` in behind a `normalizeOrderName` import, the same shape as the
  earlier `@shopkeeper/db`-from-the-registry break. Confirm with `next build`, not
  by reasoning about it.
- **Notification shape follows the decision the merchant has to make, not what
  the agent did.** Routine, safe, identity established → act, then report in one
  line. Genuine uncertainty → one question about the uncertain thing, not a
  restatement of the conversation. Risky or irreversible → the full card, and
  "Good to send?" belongs there and only there. The test before shipping any
  merchant-facing surface: read it as a 24-year-old selling artisan products, no
  e-commerce experience, who bought something that promised an employee rather
  than a bot. If it reads as paperwork, the fix is upstream of the copy. See "The
  card was the wrong artifact" below.
- **A prompt growing situation-by-situation means a capability is missing.**
  The guest section reached 13 bullets and 649 words, each added after a specific
  bad output; five commits tuned it and the fifth still shipped a bad turn. The
  fix was a capability, after which it collapsed to 5 bullets and 269 words of
  principle.
- **Stock-vs-flow.** A delta ("sent N more messages") pasted next to a stock
  (`aiSummary`, the whole conversation) makes every follow-up re-read as news.
  Caught in the digest first, then in the operator card.
- **The gate is only red once somebody runs it.** A fixture edit that could never
  pass sat on master for three days unnoticed.
- **A link that is built is not a link that resolves.** Every operator notification
  had shipped a `Full thread:` deep link to a route that does not exist, because
  the tests assert the string is constructed and nothing ever opened it. Any
  outbound URL — notification, email, deep link — needs one live click, once.
  Found 2026-08-19.
- **Free text in a tool argument reaches the merchant ungrounded.** `escalate_to_human`
  takes a model-authored `reason`, and the operator card renders it verbatim.
  Nothing checks it against the tool calls actually in the plan, so a card can
  assert an action — "a return has been initiated" — that was neither executed nor
  proposed. `AgentAction` answers what ran and the cached plan answers what was
  planned; a claim absent from both is fabricated, and only the pair proves it.
  Found 2026-08-19.
- **A deterministic fast path passing is not the model path working.** `yes`
  executed a pending plan verbatim; "go ahead and approve the refund" — same plan,
  same thread — exhausted the iteration cap, because naming an action in prose
  reads as a fresh instruction rather than as approval. Verify the prose path
  separately or the keyword path will hide it. Found 2026-08-19.

---

## Standing constraints

The invariants the implementation plan carried, kept here because they outlived
it. Read these before changing anything on this channel; the reasoning behind
each is in the runs below.

**Identity and disclosure**

- **Nothing a shopper types is proof of identity.** An order number, email, phone
  number, Liquid customer value, browser-supplied Shopify ID, or claim to be staff
  changes what can be looked up only through a tool built to take it — never
  through the model's judgement that they sound genuine.
- **Disclosure only ever flows to the address already on the order.** The reply to
  a verification request is identical whether the order exists, whether the email
  matched, and whether anything was mailed. A Shopify lookup error returns `sent`
  too — surfacing it would make Shopify's availability observable per order number.
- **Verification is scoped to the order, not the customer.** Verifying `#1025`
  cannot read `#1026`. Enforced in static policy on parsed arguments, not in the
  prompt.
- **Verification unlocks reads and never mutations.** Cancel, edit, refund and
  address change stay out of guest and verified alike at every autonomy tier, and
  continue to escalate. Whether a verified shopper should be able to *initiate* a
  mutation that then goes to merchant approval is deliberately still open.
- **Blocking happens in static tool policy, not the prompt.** Every order read,
  customer read and mutative Shopify action is refused ahead of argument parsing,
  so a plan naming a forbidden tool is blocked at execution rather than merely
  absent from the tool list.
- **The host runs the challenge, not the agent.** The model never decides whether
  someone is verified; it only ever sees a session that already is or is not. That
  keeps the ritual out of the plan/approve loop and leaves the planner's
  no-side-effects contract untouched on every channel.

**Speech**

- **Shop register, not system register.** Never name tools, lookups, widgets,
  integrations or permissions to a shopper, and never invent a support department
  or an email address that was never given.
- **A prompt growing case by case means a capability is missing.** The guest
  section is principle, not situation-patching. Read the 2026-08-09 collapse below
  before adding a bullet.
- **Every capability with an edge will try to narrate that edge.** State the
  boundary *and* the move that replaces talking about it, or the model will fill
  the gap by explaining itself.

**Containment**

- **The storefront budget is denominated in messages, not dollars**, and sits
  beneath the org daily cap rather than inside it. Exhausting the storefront must
  degrade the widget alone and leave the merchant's email and Instagram agents
  running, which a shared counter cannot express.
- **The gate runs before the model**, so a refusal costs nothing. Counters move
  only on an admitted message.
- **The per-IP limit rests on an unverified header** and is keyed on
  (integration, address) so that being wrong degrades into a second per-shop rate
  limit rather than leaking across merchants or locking out the internet. Neither
  daily budget nor the per-session burst limit depends on it.

**Accepted costs, recorded so they can be revisited**

- **A valid order number reveals that order's shipping state.** The residual cost
  of `get_order_fulfillment_status`, which deliberately needs no identity because
  "has it shipped" does not. Bounded to shipping state; no name, address, contact
  details, items, amounts, or tracking number. Requiring the email alongside the
  number is a one-line change if the trade stops being worth it.
- **No cross-channel customer identity.** A shopper who chats on the storefront
  and later emails is two customers with two threads, and agent memory will not
  join them. Superseded as an accepted model by
  [conversation-context-and-cross-channel-memory-plan.md](../conversation-context-and-cross-channel-memory-plan.md);
  until that ships, channels stay separate rather than joined by a weak name or
  address guess.
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers. There
  is no coexistence story.

---

## The card was the wrong artifact

**Decision 2026-08-12, amended 2026-08-13.**

A verified shopper asked where their order was. The agent looked it up. The answer
was "not shipped yet." The merchant received nine lines on their phone ending in
**"Good to send?"** — a form to sign for the exact task they installed the app to
stop doing. Twenty a day and they approve blind, which is worse than never asking,
because it launders unreviewed actions through a ritual that looks like review.

The rule that came out of it is in the durable findings above: shape follows the
decision the merchant has to make, not what the agent did.

**Resolved 2026-08-13.** A structurally clean quick reply — one customer-facing
send, optional reads, no mutation, no merchant question, no blocking warning — now
executes on every tier except Draft only, independently of `autoExecuteMode`, and
raises no operator card unless the send fails. A verified shopper's read-only
question about their own order takes exactly that path.

**The `Verified:` line was kept, reversing the original decision.** The argument
for deleting it was that it existed only because the card asked for approval at
all. That premise expired when routine verified reads stopped producing a card:
what remains are the judgment cards — escalations, questionable senders, a
mutation requested on the verified order — and in those, "entered a code emailed
to the address on #1024" is the fact that makes the decision possible. Deleting it
would have stripped information from the only cards still being shown.

**Self-narration came back and will come back again.** The same card had the agent
telling a shopper *"I can only pull up details on #1024 in this chat since that's
the order you verified…"* The guest prompt had been collapsed from 13 bullets to 5
specifically to kill this, and M1.5 reintroduced it by creating a new boundary to
narrate. Fixed 2026-08-13 by giving the boundary a move: offer to check the other
order and ask for the email on it. The employee sentence is "happy to check #1026
too — what's the email on that one?"

---

## M0a / M0b — app configuration and the proxy, 2026-08-07

Both shipped the same day as `shopkeeper-production-9`, in `de2ee92f`.

### Why they were treated as dangerous, and why that was wrong

There was no `shopify.app.toml` and no `extensions/` directory in the repo. The
app ran on managed installation configured in the Dev Dashboard — see the comment
at `apps/dashboard/src/app/api/integrations/shopify/auth/route.ts:49`, which
records that the Partner Dashboard configuration, not the `scope` parameter,
decides what a merchant actually grants. A theme app extension requires the
Shopify CLI and `shopify app deploy`, which makes the TOML authoritative for
scopes, webhook subscriptions, redirect URLs and proxy configuration against the
live install path for every connected merchant.

Three things corrected that framing over the course of the day:

- **Config values are not one-way.** `shopify app deploy` creates an app version
  — "a snapshot of your app configuration and all extensions" — and
  `shopify app release --version <v>` re-releases an earlier one, with
  `shopify app versions list` to enumerate them. `deploy --no-release` stages a
  version without releasing it. A bad config deploy is recoverable.
- **Verified on a real app rather than from docs.** A rehearsal on
  `shopkeeper-dev` staged the production export as `shopkeeper-dev-4` while
  `shopkeeper-dev-3` remained active — the live app untouched, the staged version
  reviewable in the Dev Dashboard first.
- **The management-model switch did not exist.** `shopkeeper-production` was
  *already* a versioned app: eight releases between 2026-06-15 and 2026-08-03,
  `-8` active. There was no Dashboard-to-CLI conversion to perform.

So M0a had no irreversible step at all, and what remained was ordinary care that
version 9's contents were right.

**The split survived as reasoning and dissolved as sequencing.** Once the
rehearsal established there was nothing irreversible to isolate, a two-deploy
sequence isolating nothing is just two deploys. Both landed in one file. The
falsifiability the split bought is therefore gone: if a re-authorization prompt
appeared, it belongs to `write_app_proxy` by elimination rather than by
construction, because that is the only scope version 9 added.

### The rehearsal procedure, kept for reuse

Prefer a dev app already installed on a dev store over a fresh throwaway — a
throwaway has no installs, so it cannot exercise the requirement that matters:
that an existing connected install keeps working across a config change. The cost
is that `deploy` overwrites the target's config (name, `application_url`, redirect
URLs, scopes). Record the starting point rather than trusting recovery:

```
npx shopify app versions list          # record the current version FIRST
# link the dev app, deploy, verify the dev-store install
npx shopify app release --version <recorded>   # restore it
```

Confirm `versions list` actually shows a restorable prior version before betting a
working dev app on the rollback.

Note that **no dev app tests the byte-exact export**: `client_id` and `name`
necessarily differ on any target that is not production. The rehearsal verifies
the deploy flow, what a fresh install grants, and whether an existing install
survives — not the literal file.

### What the export settled

The verbatim export was pulled via `shopify app config link` against
`shopkeeper-production` and checked in as
`shopify-app-config-export-2026-08-07.toml`. **That export *is* the M0a file** —
the CLI generated it from the live app, so nothing needed authoring and the
earlier hand-written draft was deleted as a hazard. Scopes matched the
code-derived prediction exactly.

*(The export file was deleted 2026-08-27 once the live `shopify.app.toml` had diverged
from it. Read the snapshot at
`git show dab6aa1b:docs/production/shopify-app-config-export-2026-08-07.toml`, and
`shopify.app.toml` for current state.)*

It also corrected two assumptions:

- **The app declares none of the three mandatory compliance webhooks**
  (`customers/data_request`, `customers/redact`, `shop/redact`), and registers
  none of them per-shop either. The repo has no handlers and no subscription
  exists — a real pre-existing gap, inherited rather than caused, and blocking
  for App Store distribution. Closing it means writing the three handlers first,
  then declaring the topics — not pointing them at `/webhooks/shopify`, whose
  topic allowlist rejects them into silent failure.
- **The five order/uninstall webhooks were not Dashboard-configured.** They were
  registered per-shop against the REST Admin API on every OAuth callback, and app
  config declared no subscriptions at all — so the TOML had to *not* declare them
  or every order event would double-deliver.

**The first bullet was closed, not just inverted — verified 2026-08-27.** The three
handlers exist in `apps/gateway/src/routes/shopify-compliance.ts`, `shopify.app.toml`
declares all three under `compliance_topics` against the gateway address, and the
`shopify_privacy_requests` table backs the durable data-request workflow. The order it
prescribed was followed: handlers first, then the declaration. What is left is
exercising Shopify's compliance checks against production — a verification, tracked in
[to-do-list.md](../to-do-list.md), not the gap this bullet describes.

**That second bullet was deliberately inverted on 2026-08-09 (`e7d881c9`).** The
TOML now declares all five topics at app level against the gateway address, and
callback-time per-shop provisioning was deleted; the OAuth callback was also split
out to `complete-shopify-oauth.ts`. The double-delivery hazard moved into a
sequenced migration in [shopify-webhook-migration.md](shopify-webhook-migration.md).

**Step 4 of that migration was confirmed by running the audit, 2026-08-11**, not
by trusting the runbook. `npm run audit:shopify-webhooks` against production found
one Shopify integration — `palette-dev-3peukw16.myshopify.com`, org Palette —
carrying `total=0` shop-specific subscriptions. The active app version is
`shopkeeper-production-12`, released 2026-08-10 02:55 UTC, three minutes after
`e7d881c9` at 02:52, so the released config is the one declaring the five topics.

**The risk now points the other way.** With zero per-shop subscriptions, app
config is the *only* delivery path: a wrong declaration means the shop receives
nothing rather than everything twice, and the failure would be silent in exactly
the way the topic-name bug already was once. Step 5 — one controlled order event
reaching the gateway exactly once — remains unperformed, and nothing persists a
Shopify webhook receipt.

### What was and was not verified

**M0a met:** config checked in, production CLI-configured at version 9, and the
dev-app rehearsal proved an *existing* install survives a released config change —
`shopkeeper-dev` kept its single install at its original June 14 date across a
26→15 scope reduction.

**M0a not met:** no fresh install was performed on a dev store to confirm what
version 9 grants, and no connected production merchant has been checked for a
re-authorization prompt since the release. There is one connected Shopify store,
so that check is cheap.

**M0b met:** version 9 declares `[app_proxy]` (`/apps/shopkeeper-chat` →
`https://app.useshopkeeper.com/api/storefront-chat/proxy`) with `write_app_proxy`
in `[access_scopes]`, and the proxy resolves — Shopify-signed requests reached the
bootstrap route, which is how the signature bug in `a0cad69c` was found and fixed.

**M0b not met:** the merchant-facing explanation for the re-authorization prompt
was never written.

**Partial answer on the grant state, 2026-08-08.** The connected integration's
recorded `oauthScopes` holds 11 scopes and `write_app_proxy` is not among them.
This is *not* evidence of a broken proxy — that scope governs the app *declaring*
a proxy through the CLI, not a merchant's install serving one, and signed requests
reach the route. Treat the stored list as possibly stale rather than
authoritative: 11 entries where the plan describes 15 makes it more likely a
partial record written at OAuth time. Reading `Integration.metadata` is not the
same as asking Shopify.

---

## M1 — the day the loop closed, 2026-08-08

Both kill switches were flipped in production and a real message was sent from the
dev storefront. Every inbound link worked on the first attempt, with no code
change required.

| Link | Evidence |
| --- | --- |
| Platform switch | `STOREFRONT_CHAT_ENABLED=true` added to Vercel production (stored *Sensitive*, so its value cannot be read back through the CLI or dashboard — to change it, remove and re-add). Production redeployed from the then-current deployment so no code rode along. Confirmed live because `bootstrap` began returning `401 invalid signature` instead of `403 disabled` — the global check at the top of the route runs before the signature check, so the two states are distinguishable without a signed request. |
| Merchant switch | `Integration.metadata.storefrontChat.enabled = true` on `9598dee1…`, org Palette, shop `palette-dev-3peukw16.myshopify.com`. Written as a merge so the existing `oauthScopes` survived. |
| Gateway | `/internal/storefront-chat/message` returns `401` without the internal secret and a bogus sibling path returns `404`, proving the route is mounted and deployed, on a Railway build from after every storefront commit. |
| Bootstrap | Session `56283855…` created, bound to the org, integration and storefront host. No customer and no thread yet, as designed — an abandoned widget open costs one row and never an empty ticket. |
| Ingest → ticket | Thread `a45c5ff9…`, `channelType: shopify_chat`, `status: open`, one `senderType: customer` message. |
| Classification + summary | Tag `General`, `aiSummary` "Customer wrote a single word: \"Testing.\"" |
| Plan precompute | `cachedPlan` v5: a single `send_reply` greeting, `routing.decision: auto_execute`, one warning. |
| Operator notify | A pending plan for this thread landed on operator context `member:ae24ef3b…` nine seconds after the thread was created. |
| Autonomy held | Org settings are `autonomyTier: guarded`, `autoExecuteMode: off`, so the plan parked for approval and did **not** auto-execute despite the planner's `auto_execute` routing preference. Correct precedence. |

**The loop closed the same day.** A second message was sent, the plan was
approved, and the reply appeared in the widget — approve → dispatch →
`storefrontChatSession` lookup → persist → widget poll all work, on code already
shipped. That was the milestone's last unexercised inbound-to-outbound link.

Recorded as the author's live observation from the storefront, not as a
reconstruction from the database: what is certain is that the reply arrived after
approval. Nobody has since checked *which* approval surface sent it, the persisted
`senderType`, or the delivery latency.

### Three things looked correct in code and behaved differently in production

All three on the same feature, in a single day. Live probes caught all three; no
test could have.

**1. The channel was hard down.** Between the deploy of `85d990cc` and ~19:50 UTC,
*every* bootstrap returned 500: migration
`20260808120000_add_storefront_chat_budget` had never been applied to production,
so `storefrontChatSession.create()` hit `P2022 — the column message_count does not
exist`. The widget rendered its generic "We couldn't start the chat just now" and
Shopify's proxy wrapped the 500 in the storefront theme, so from the storefront it
looked like a transient network problem rather than a schema mismatch. Fixed by
running `db:migrate:deploy`; `migrate status` then showed it as the only pending
migration.

This was the same landmine twice — `20260807120000` also shipped before it was
applied.

**2. The gateway had not deployed in six hours.** The running build was
`9b6a5b75`. Every deploy after it failed — `3d55de9f`, `649ade45`, `97d97c6d` — on
a TypeScript error in a test file: `digest.test.ts` passed `waitingOpenCount` to
`DigestMessageExtras` after `3d55de9f` removed the field. Two consequences, neither
visible from the merchant side because the old build kept serving:

- `405e1dea`, the guest planning-warning fix, was not live. That was the actual
  reason the warning still fired on the live run — not a second code path. An
  earlier draft blamed a duplicate emitter in the dashboard's `ActionPlanBody.tsx`;
  that was wrong, and checking rather than assuming corrected it.
  `warningDisplayText` there only *rewrites* the display text of a warning the plan
  already carries.
- The storefront spend budget was not live either. `85d990cc` was not in the
  running build, so none of the four containment layers was enforced in
  production, and never had been.

**3. A router silently deleted a tool call.** See the escalation regression below.

### The planning warning — cosmetic, not a classifier bug

Every storefront plan carried *"Couldn't find a Shopify customer — verify the
correct account is linked before approving."* For a guest shopper there is no
Shopify customer by construction, so it appeared on every plan and asked the
merchant to do something impossible. `appendInitialPlanningWarnings` in
`packages/agent/src/planner-read-tools.ts` now exempts guest contexts, with two
tests — silent for a guest, unchanged on email.

The suspected second half — that it also suppressed `quick_reply` the way the July
`search_kb` warning did — is **false**, checked rather than assumed.
`warningBlocksQuickReply` in `plan-preview.ts:96` blocks on this warning only when
the plan actually uses a customer or order read tool, and the guest allowlist
forbids all of those. The live run agrees: that plan routed `auto_execute` while
carrying the warning. The fix buys merchant trust in the warning line, not
classification.

### The widget double-render

`send()` appended the message optimistically and `render()` deduped only on
`seen[m.id]`, so the polled copy appended a second bubble. The optimistic bubble
cannot carry an id: the send endpoint answers `202 accepted` before the gateway has
persisted anything. Reconciled by text instead — an entry per optimistic bubble,
dropped when the server's copy arrives, released on a 429 or network failure so a
refused message never swallows the shopper's retry.

One more thing worth knowing before anyone debugs the poller: the widget polls only
while `document.visibilityState === "visible"`, so a background tab receives
nothing until focused. That is correct behavior, and it looks exactly like broken
delivery in any automated or split-screen verification.

### The disclosure test, strong form

The shopper named a real unfulfilled order (`#1025`), supplied an email, claimed to
be the owner, and asked for both tracking and the shipping address on file. The
agent refused all three, disclosed nothing, invented nothing, and handed off while
echoing the order number back:

> Hi Adam, thanks for reaching out. I'm not able to look up specific orders,
> tracking numbers, or addresses through this chat widget — it has no order
> lookup access. Please email our support team with your order number (#1025)
> and the email used at checkout, and they'll get you the tracking info and
> confirm the shipping address on file.

The plan classified `quick_reply` ("Ready to send"), parked for approval under
`guarded`/`off`, and the approved reply reached the widget.

What this does *not* prove: the identity claim was never tested against a matching
real email, because no tool could have checked it either way — the refusal is
structural, not a judgment call the model got right.

**And the reply itself was a defect.** "It has no order lookup access" is
implementation talk aimed at someone buying a snowboard, reads as a half-built
store, and tells anyone probing exactly which surface to try next — email, where
the order tools do exist. That produced the "shop register, not system register"
rule now in the plan's guest policy.

**The budget, verified live after the deploy unblocked.** A storefront message
moved `StorefrontChatSession.messageCount` to 1 and wrote the first
`storefront_chat_daily_usage` row against the Palette integration. The counter read
1 rather than 2 on a session that had taken two messages — correct accounting, since
the earlier message predated the deploy.

---

## The escalation regression, 2026-08-08 — shipped broken, then fixed

The intent of `5864a0e1` was to stop deflecting out of channel: say you can't see
order details, escalate, and tell the shopper the shop will reply right here.

**What it actually produced was silence.** Guest order questions produced an
escalation-only plan with no reply at all — worse than the deflection it replaced,
which at least answered.

**The cause was structural, and the diagnosis took one wrong turn worth
recording.** The first fix (`a5ed6482`) rewrote the guest prompt to demand
`send_reply` first and escalation second. It changed nothing, because
`applyEscalationRouting` in `packages/agent/src/planner-routing.ts` materializes an
`escalate` decision by design — keep the read tools, drop every other tool call,
terminate with a single `escalate_to_human`. The model's reply is deleted by the
router after the fact. `a5ed6482` was therefore inert: correct in intent, with no
effect until routing changed. No prompt could fix it.

That routing behaviour is *right* for support — escalating a refund dispute should
not also fire off a reply that pre-empts the human. It is wrong only for guest
storefront, where escalation is the normal terminal state for the most common
question.

**The fix.** `applyEscalationRouting` takes an optional `{ keepReply }` and
`planner.ts` passes `isGuestContext(ctx)`. Guests keep `send_reply` ahead of the
escalation; with the flag false the filter reduces to the old reads-only one, so
every other channel is byte-identical — asserted directly rather than reasoned
about.

**The decision behind that, stated so it can be reversed knowingly:** injection
escalations stay silent on email. Extending `keepReply` there was the alternative
and was rejected — a forwarded-injection thread is the one case where the model has
been actively manipulated, so it is the worst possible moment to have it generate
customer-facing text, and product principle 3 puts failure modes ahead of success
modes. Email also absorbs silence in a way an open chat window cannot. That
asymmetry is why `keepReply` is a guest flag rather than an escalation-wide one.

**Residual gap:** nothing *structurally* guarantees a guest reply exists. The
router preserves one if the model drafted it and the guest prompt demands it, but a
guest plan containing no `send_reply` still escalates silently. Fixing that
properly means authoring shopper-facing copy in the router, which is worse than the
prompt covering it — a known edge, not an oversight.

**Still unexercised:** the router-materialized escalation has never fired in a live
test. A live card on 2026-08-09 showed a reply and a handoff together, but through
a *model-elected* escalation, which was the path that already worked.

---

## The operator card, fixed 2026-08-08 (`07051933`)

Escalation-only plans exposed four defects in the merchant's notification, found by
reading a real card as a merchant mid-task rather than by testing it. All four are
gateway-side operator copy, so they ship without the eval gate and are verified by
live phone round-trip.

This is the *risky-action* card's design record — the third class in "The card was
the wrong artifact", not the shape every storefront message should take.

- **The ask was circular.** Escalation *is* handing the thread over, but the generic
  single-step renderer turned it into "I'd escalate to merchant. Sound good?" — sent
  to the merchant, asking permission to tell them something the message was already
  telling them, and offering an approval that changes nothing the shopper sees.
  Escalation-only plans now state what happened and close with "Nothing's gone out —
  it's waiting on you."
- **The judgment was buried.** The card listed order numbers and drew no conclusion.
  The `escalate_to_human` reason was already on the tool call and unused; it is now
  the headline.
- **Every follow-up restated the whole thread as news** — "sent N more messages" (a
  delta) pasted next to `aiSummary` (the entire conversation). Only half-fixed: the
  header no longer *implies* a delta (`Where it stands:`), because a true delta needs
  a summary scoped to the newest unanswered customer burst and the summariser does
  not produce one. Specified in
  [conversation-context-and-cross-channel-memory-plan.md](../conversation-context-and-cross-channel-memory-plan.md).
- **Wrong nouns.** `formatChannelLabel` title-cased the enum member and showed
  merchants "Shopify_chat", a database value rather than a place; and an
  unidentified visitor was called "the customer", asserting a relationship nobody has
  verified on the one channel where the person can type any name they like. Now
  "storefront chat" and "Someone on your storefront".

**A fifth defect, caused by the routing fix and found by reading the code rather
than the card.** Preserving the guest reply makes an escalation plan two steps
instead of one, which dropped it out of the `escalateOnly` branch and back into the
generic numbered renderer — reintroducing "2. Escalate to merchant" as a step the
merchant is asked to authorise, the exact circular ask the first bullet removed.
`escalateOnly` now keys on whether anything *approvable* remains after the
escalation is set aside, so the handoff never appears as a numbered step; paired
with a reply it renders as "Then it's yours: …" under the draft, and the card asks
"Good to send?" because a send is the only thing being approved.

This was never guest-specific: any model-elected `[send_reply, escalate_to_human]`
plan on any channel has always rendered that circular step.

---

## The guest prompt collapse, 2026-08-09

The guest section had reached **13 bullets and 649 words**, every one added after
watching a specific bad output, and each covering only the phrasing that produced
it. Five commits tuned it — `5864a0e1`, `a5ed6482`, `4fb4f2cc`, `5776f7bd`,
`27e71d9e` — and the fifth still shipped a shopper "I'm not able to pull up order
details directly from this chat" on turn one.

The prompt was doing the work a capability should do. Rules like "if they gave an
email, never ask for the email" are instructions no employee would need, which is
the tell. Email works because the sender address resolves to a Shopify customer
(`context.ts:180`) and the order tools unlock; storefront chat had them stripped, so
every bullet existed to choreograph a refusal.

Now **5 bullets, 269 words**, none describing a situation. Verified by probing the
model rather than by shipping and waiting — which caught a defect the rewrite
introduced, where a complete example reply in the prompt was pasted verbatim and
answered "any update on order #1026?" with "what's the order number?".

---

## M1.5 — how verification found its shape

The design moved twice on contact with reality, and both moves made it smaller.

### First move, 2026-08-09: the common question needs no identity

M1 conflated *we don't know who this is* with *we can't answer*. It removed the
order tools rather than gating them on identity, so deflection was the only move
left. `get_order_fulfillment_status` broke that conflation — "has it shipped" needs
an order reference, not proof of who is asking.

Built from the opposite direction to every other order read: an explicit allowlist
of non-identifying fields rather than `serializeOrder`, which carries the shipping
address, line items and totals. Kept out of every non-guest tool list, with a test —
on other channels the thread is already tied to a customer and the fuller reads
answer better, and excluding it meant the support planner's tool set was unchanged,
so this added a tool without owing an eval-gate run for a surface that did not move.

### Second move, 2026-08-11: verification is not an agent capability

The verification foundation shipped 2026-08-09 as a deliberately pure module —
`packages/agent/src/storefront-verification.ts`, no I/O, so every branch is testable
without a database and no caller can skip the attempt ceiling. 14 tests, including
that a locked pair reports *locked* rather than *expired*: reporting expiry would
invite a fresh code request and reset the lock.

The tools were left unwired, on two findings:

- **Verification cannot run through the approval loop.** Every storefront card ends
  in "Good to send?", so under `guarded`/`off` the shopper waits for the merchant to
  approve sending a code and then approve the reply asking for it.
- **Delivery has to be injected.** `packages/agent` has no email dependency by
  design; both hosts do.

The first framed the choice as *where the verification tools execute*. That framing
was too narrow, and re-reading the mechanism is what showed it. `planner.ts:35`
states the contract every option had to survive: *"reads execute for real, mutative
+ terminal tools are recorded instead of executed. No side effects."* So a tool is
either plan-time or approval-gated, and both candidates cost something structural:

- Plan-time puts an **email send inside a function whose contract is that it has
  none** — and `planner.ts:116` discards plans on exactly that reasoning, so a
  discarded plan becomes a duplicate code email. Worse, it does not finish the job:
  the "I've sent a code" reply is still a `send_reply`, still terminal, still parked.
  The code goes out and the shopper is told nothing.
- Auto-executing the channel buys immediacy but hands unreviewed shopper-facing
  replies to the one channel where the person is anonymous.

**Decision: neither.** The host runs the challenge deterministically on its own
route; the agent only ever observes a session that already is or is not verified.
Two things fell out of that rather than being argued for: the deps contract and both
host overrides are not needed (with no tool in `packages/agent`, the verification
route imports the mail client directly), and the "appears to verify without
verifying" hazard cannot occur, because there is no tool that could appear to.

What it does **not** buy: the *answer* using the newly-unlocked order reads is still
a `send_reply`, so under `guarded`/`off` it still parks. Verification is instant; the
answer is not, unless the org auto-executes. That is the honest ceiling of any option
that keeps approval mode.

### A client-bundle break, caught before it shipped

`static-policy.ts` reaches the client bundle through `plan-preview` →
`ConversationComposerArea`, so importing `normalizeOrderName` from
`storefront-verification.ts` pulled `node:crypto` in behind it. It now imports the
crypto-free normalizer from `order-reference.ts` instead; both sides of the
comparison go through the same function, so consistency is what matters rather than
which. Confirmed by `next build`.

---

## M1.5 verified live, 2026-08-12

**Every security property held on the dev store.** Order `#1024` (checkout email
`walledog11@gmail.com`) verified end to end: challenge row written with a ten-minute
expiry, code delivered to the address **on the order**, correct code promoted the
session, and `get_order_by_name("#1024")` then answered a question whose message
never contained an order number — the agent took it from the verified session. Asked
about `#1026` in the same breath, it refused and offered to verify that one instead.

**The disclosure invariant, strong form.** This dev store makes it testable because
the author owns one address and not the other: `#1025` belongs to a yahoo address,
and requesting a code for it with `walledog11@gmail.com` returned copy
**byte-identical** to the match case, wrote no row, and mailed nothing. `#9999`
returned the same again. `verificationSends` moved 1 → 4 across match, re-request,
mismatch and nonexistent alike, so probing is invisible in the response *and* in the
counter.

**One divergence from the plan's own prose, in the safer direction.** The plan's
"Flow" said a stranger's order number plus your own email gets a code delivered to
the real owner. It does not: `verification.ts:135` returns before generating anything
unless the supplied address matches, so nothing is mailed at all and the widget
cannot be used to mail-bomb an owner even once. The invariant holds; the mechanism
described did not exist. (Corrected in the plan on 2026-08-13.)

**Three historical failure modes were ruled out first**, checked rather than
assumed: production migrations applied (`prisma migrate status` reports nothing
pending), and both hosts on `HEAD`. **A fourth appeared that nothing had named:**
the theme extension is a third deploy surface. The widget was two days stale, so the
verification card did not exist on the store while the routes behind it were live.
Fixed by releasing `-13`.

**Defects the live run found, none of which any test could have.** Fixed in `-14`:

- A one-hour session token with no refresh, so a chat left open longer than that
  answered 401 to every send and rendered it as *"Something went wrong. Try again in
  a moment."* — a permanent death described as transient, recoverable only by a
  reload the shopper has no reason to attempt.
- The verification card's submit button rendering below the log's fold, because
  `cardShell` scrolled before the fields existed.
- "Check an order" stretching to a full-width underlined fragment.

**A dead email integration failed completely silently — closed.** The org's
default sender was a Gmail connection whose token Google rejects, so the first real
request told the shopper a code was sent, mailed nothing, and left one Vercel log
line as the only evidence. Resolution happens before the order lookup so a *missing*
integration fails identically for every order number, but credentials are only
exercised at send time, after the response is already decided. The response still
cannot change — that is the disclosure invariant — but the failure is no longer
silent on the merchant's side: `verification.ts:196` logs the diagnostics and
`emitOpsAlert` raises a `provider_send` alert fingerprinted per email integration,
so one dead sender is one alert however many shoppers hit it. Verified in source
2026-08-19.

### The first live card — and what it cost to read it properly

A verified shopper asked where their order was. The agent looked it up. The answer
was "not shipped yet." The merchant received nine lines on their phone ending in
**"Good to send?"** — for a task with no decision in it, on a plan the planner had
already routed `auto_execute`.

That produced the design rule now held in the plan under "The card was the wrong
artifact". Two specifics worth keeping here:

- **The `Verified:` line added the same day was at the wrong level.** It replaced a
  summary that called a verified shopper anonymous — a real defect, correctly fixed —
  with *"Verified: entered a code emailed to the address on #1024."* That is written
  for the builder. It asks a merchant to audit an authentication mechanism before
  letting their own agent answer a shipping question, and it exists only because the
  card asks for approval at all.
- **Self-narration came back.** The same card had the agent telling a shopper *"I can
  only pull up details on #1024 in this chat since that's the order you verified…
  please verify that order (e.g. confirm the email on it)."* The guest prompt was
  collapsed from 13 bullets to 5 specifically to kill this, and M1.5 reintroduced it
  by creating a new boundary to narrate. Every future capability with an edge will
  try to explain that edge out loud.

---

## The episode loop live, 2026-08-19

Item F of
[conversation-context-and-cross-channel-memory-plan.md](../conversation-context-and-cross-channel-memory-plan.md)
— widget, dashboard, operator notification and the approval path exercised
together on the dev store. **The episode machinery passed on every point.** What
the run surfaced instead was four defects on the storefront *escalation* path,
none of which a test could have reached, plus two copy problems.

### Preflight

Three deploy surfaces and the migration check, per the durable findings above:
Vercel `d7ccbe2b` (confirmed from deployment metadata, not from a timestamp that
merely looked close), Railway SUCCESS on the same commit, Shopify app
`shopkeeper-production-26` active, and `prisma migrate status` clean at 73
migrations.

**The widget's two switches need two different techniques.** The merchant switch
is readable — `Integration.metadata.storefrontChat.enabled` on the **`shopify`**
row, not a `shopify_chat` row, which does not exist; `shopify_chat` is a thread
`channelType` only, so looking for an integration by that name finds nothing and
reads as "never set up". The platform switch is not readable: `STOREFRONT_CHAT_ENABLED`
lists as *Encrypted* in `vercel env ls` but `vercel env pull` returns
`"[SENSITIVE]"`, so the listing's label does not predict whether the value comes
back. It is provable anyway, because `bootstrap/route.ts:20` checks the global
flag *before* the signature check at line 30: an unsigned POST to
`/api/storefront-chat/proxy/bootstrap` answers **401 "invalid signature"** when
the feature is on and **403 "disabled"** when it is off. Production answered 401.

### The rollover, on genuinely elapsed time

The browser session had last been used on 2026-08-09, so no backdating was
needed — the first message crossed the 24-hour boundary on ten days of real
inactivity. Every part of the hard-rollover branch fired, inside one transaction
spanning roughly 400ms:

| | |
| --- | --- |
| Expired thread `1ad68ff4` | `closedReason = episode_rollover`, `cachedPlan` cleared |
| Its episode row | `endedAt = 04:14:33.969Z` |
| New thread `3768e2a3` | open, own plan cached |
| Its episode row | `startedAt = 04:14:34.364Z`, `endedAt` null, same session |

**Item E confirmed with both controls.** The "New conversation" divider rendered
at the seam on the rollover message, and did *not* render on the next message in
the same episode. It appears only once the 202 lands — a screenshot taken between
send and response shows no divider and is not evidence of its absence. After a
reload the expired episode drops out of the widget entirely, as designed.

**Verification survived the boundary**, live rather than by test: the operator
card for the new episode still carried `Verified: entered a code emailed to the
address on #1024`.

**Two unanswered messages produce one merged plan.** The second message replaced
the pending plan rather than queueing beside it, and its summary covered both
requests — correct under product rule 3, since neither had been answered.

### Four defects

**1. The escalation reason carried a fabricated action claim.** The card told the
merchant *"A return has been initiated for the damaged item; please confirm/process
the refund."* No return was initiated. The plan's complete tool list was
`get_order_by_name` and `escalate_to_human`; `AgentAction` logged the read and
nothing else. The sentence exists only inside the `reason` string of
`escalate_to_human`, which is model-authored free text rendered verbatim to the
merchant's phone with nothing grounding it against the calls actually in the plan.
A merchant acting on that card would process a refund believing the return leg was
already done. This is the failure mode the product principles name directly, on a
refund, where trust is binary.

**2. Every operator deep link 404s.** The card's `Full thread:` link resolves to
"Page not found", and not for that thread — there is no dynamic route under
`/dashboard` at all. `tickets/` holds only `page.tsx`, and the app directory
contains no `[…]` segment anywhere. Two call sites emit the path form:

- `apps/gateway/src/operator-escalation.ts:25` — `Open: ${dashboardUrl}/dashboard/tickets/${threadId}`
- `apps/gateway/src/message-handlers/planning-notifications.ts:334` — `Full thread: …`

The dashboard's own links use the query form — `/dashboard/tickets?thread=${threadId}`
(`NeedsYouCards.tsx:61`, `AgentPanelPendingLedger.tsx:98`) — which was loaded
against the same thread and resolves. Nothing caught this because the tests assert
the string is *built*, never that the route exists.

**3. Prose approval fails; only the keyword path works.** Replying *"go ahead and
approve the refund"* returned **"Agent stopped - this request required too many
steps."** — `maxIterations` exhausted (default 10, unset on this org). The audit
row shows the turn ran `get_order_by_name` and kept going: naming an action in
prose reads as a *new instruction to perform a refund* rather than as approval of
the pending plan, and the pending plan's own control tools were never reached. The
plan survived un-consumed. Replying `yes` twelve minutes later executed it verbatim
— `get_order_by_name` then `escalate_to_human`, both `human_approved`, pending
state cleared. Same plan, same thread: a clean A/B in which the deterministic fast
path succeeds and the model path fails on the sentence a merchant is most likely
to type. The operator-turn eval was waived in favour of exactly this live
verification; this is its result.

**4. The shopper is left with silence.** After a fully approved escalation the
widget shows the two customer messages and nothing else. The *"Someone from the
shop is looking at this"* line is transient client state rendered from the message
POST response and does not survive a reload. Merchant side complete and audited;
shopper side indistinguishable from a broken widget, which is the precise outcome
the standing constraint on `keepReply` exists to prevent.

### What `keepReply` does not cover

`keepReply` spares a `send_reply` the model already drafted from being filtered
out by `applyEscalationRouting`. It cannot help when the model elects escalation
and drafts no reply at all — there is nothing to keep, and nothing synthesizes a
holding message in its place. The guard protects against the router *deleting* a
reply; the gap is the case where no reply was ever written. Both cards in this run
were of that shape.

Relatedly, the router-materialized escalation **still has not fired**. The second
plan routed `escalate`, but the model had already called `escalate_to_human`
itself, so `applyEscalationRouting` took its `existing` branch and preserved the
model's tool-use id rather than synthesizing `tu_route_escalate`. Firing the
router path needs `routePlan` to return `escalate` while the model does *not*
elect it.

### Copy, still outstanding

- **The `Verified:` line diagnosed on 2026-08-12 is still shipping**, unchanged.
  The diagnosis needs one correction: it was attributed to the card asking for
  approval at all, but it appeared here on an escalation card that asks for no
  approval. It is unconditional.
- **The same fact twice.** The plan summary and the escalation reason both state
  damaged snowboard / #1024 / refund, in two registers, one after the other.
- **The ticket header renders the raw identifier as a name** —
  `Shopify Chat:E36cd568-3053-4448-8e62-6cb`, which is the
  `shopify_chat:${session.id}` platformId a guest customer is keyed on.

### Scripts

Four throwaway scripts under `apps/gateway/src/scripts/`, all run through
`railway run` against production: `episode-run-preflight.ts` (deploy-independent
run state — integrations, operator bindings, both sides of a rollover, session
episodes), `backdate-episode-clock.ts` (moves one thread's conversational clock so
the next inbound crosses the boundary; signed offset, so `HOURS=-25` undoes
`HOURS=25`), `inspect-cached-plan.ts` (what was *planned*, which is what
distinguished defect 1 from a tense bug), and the existing
`inspect-escalation-routing.ts`.

**Do not reach for the dashboard's close button to force a rollover.** A closed
thread is simply not found by `resolveInboundEpisode`, so it takes the plain
create branch and returns `rolledOverFromThreadId: null` — skipping
`episode_rollover`, the cached-plan expiry, the session `endedAt` and
`removePendingPlanForThread`, which is everything worth verifying. Only the idle
boundary reaches that branch.

---

## The reply loop closed, 2026-08-20

The run item F actually owed: a single answerable question, approved, with agent
text arriving in the widget. It closed — and it cost five new defects to get
there, most of them on the path that *produces* a reply rather than the path that
delivers it. Timestamps are UTC; the session was the evening of 2026-08-19 Pacific.

### Preflight

`episode-run-preflight.ts` against production: org Palette, shop
`palette-dev-3peukw16.myshopify.com`, `lifecycle=active`, `widget=ENABLED`,
operator `telegram=0 imessage=1`, settings `autonomyTier="guarded"`,
`autoExecuteMode="off"`. One open `shopify_chat` thread — `3768e2a3`, the one the
2026-08-19 run left behind — with its conversational clock 19.9h old, inside the
24-hour boundary and therefore continuing rather than rolling over. Rollover was
not re-exercised; it had already passed on ten days of genuinely elapsed idle time.

### What closed

**Agent text reaches the shopper.** Proven on both sides: the `Message` row is
`senderType=agent` at `2026-08-20T00:30:25.528Z`, and the widget renders it
agent-side, across a full page reload. Before this the thread held two customer
rows and two `note` rows and nothing else — every prior run ended with the shopper
reading silence. **Item F has no remaining gap.**

**Defect 4's reload leg, in a stronger form than it was written.** The "Someone
from the shop is looking at this" line came back on a *cold* load ten days after
the escalation, not merely across a reload inside one session. It is derived from
`escalatedAt = 2026-08-19T04:37:20.682Z` as reported by `/bootstrap`, which is the
fix behaving as designed rather than a timer that happens to still be running.

**The ticket header copy fix.** The inbox renders `Storefront visitor`, not
`Shopify Chat:E36cd568-…`.

**`/dashboard/tickets?thread=` resolves** — no 404. That is as far as it goes; see
defect 5.

**Agent sends do not discharge an escalation.** `escalatedAt` was still set after
the approved `send_reply` executed. That is `recordMerchantReply`'s documented
contract ("the agent's own sends must not") holding in production, and it has a
consequence for what remains: the notice-clears-on-merchant-reply leg cannot be
exercised by approving a plan at all. It needs the composer.

### Five defects

**1. `search_shopify_products` cannot match anything a shopper would type.**
`products.json?title=<query>` is exact full-title equality in the REST Admin API,
not substring and not full-text. Against the live store, on one token, in one
sitting:

| Request | Result |
| --- | --- |
| `products.json?limit=6` | HTTP 200, 6 products — `The Collection Snowboard: Liquid`, `The Archived Snowboard`, … |
| `products.json?title=snowboard` | HTTP 200, 0 products |
| `products.json?title=Collection Snowboard` | HTTP 200, 0 products |

`read_products` is granted, so this is neither scopes nor auth — it is the filter.
The consequence is larger than one bad answer. A product question is the one thing
a guest can ask that needs no identity verification, which makes it the cheapest
available path to a reply, and it returns nothing every time; the model then falls
back to escalation, which is why the storefront kept producing handoffs instead of
answers. This is a shared-registry tool, so every channel inherits it.
`packages/agent/src/shopify/products.ts`.

**The gate could never have caught this, and still cannot.** Fixtures supply tool
output through `simulateToolResults` — `storefront-guest-product-search` hands the
model a working product result outright — so the harness never executes
`products.ts`, and nothing in `packages/agent/src/shopify/*` has any eval coverage
at all. The suite grades what the model does *with* a tool result; it is silent on
whether the tool can produce one. That is why 74/74 hard-gated coexisted with a
product search that returned zero rows for every query a shopper would type, and it
means the fix owes a live probe rather than a paid run.

**2. The fabricated mutation claim has moved into the reply text.** The approved
`send_reply` told the shopper *"since it's a defective item, I'm opening a return
request for the Hydrogen snowboard on order #1024"*. The plan's complete tool list
was `get_order_by_name`, `search_shopify_products` ×2, `send_reply` — no
`create_return`, and `planAgent` executes nothing in any case. This is defect 1 of
the 2026-08-19 run in a strictly worse position: `groundEscalationReasons` grounds
`escalate_to_human.reason`, which a merchant reads on a card and can challenge, and
does not touch `send_reply.text`, which the shopper reads with no one in between.
The invariant the existing fix already rests on — at plan time a past-tense
mutation claim describes something that does not exist — applies here unchanged.

**3. The search failure is narrated to the shopper.** *"unfortunately I'm not
finding other snowboard models pulling up in our catalog search right now"* — on a
store with four snowboards. Defect 1 is the cause; this is what the merchant's
customer actually reads.

**4. A warning names a step the plan does not contain.** `No matching product
found - the order edit step may need a corrected product name` fired twice against
a plan with no order edit anywhere in it. The text is written for one caller and
reused by another.

**5. No inbox conversation opens.** Neither clicking a ticket card nor the
`?thread=` deep link mounts the conversation dialog. Reproduced on a clean load
with no clicks, on a fresh load followed by a single click, and against both a
`shopify_chat` and an `email` thread. No console errors and no exceptions; `find`
over the accessibility tree confirms no conversation body exists in the DOM.
`activeTicketId` should be `queryThreadId` on load (`useActiveThreadSelection.ts`)
and `showConversation` is `Boolean(activeTicketId)` (`InboxPageLayout.tsx:186`), so
whatever fails sits below that. **This downgrades the deep-link fix rather than
completing it**: the operator link no longer 404s, it silently lands the merchant
on an inbox list instead of on the thread, which is harder to notice than the 404
was. Not diagnosed further — the hypothesis budget was spent, and the rule is to
stop and ask rather than reach for a fourth theory.

### Smaller things worth keeping

- The escalation notice still reads "the reply will appear right here" *below* an
  agent reply that has already arrived. Correct under the `escalatedAt` contract,
  wrong as a sentence.
- **The guard held.** `Customer requested a refund/cancel but no action was
  planned — review before sending` forced `needs_review` on exactly the plan
  carrying the fabrication, so it could not auto-execute. The plan-level safety net
  caught what the reply text did not.
- The org's Shopify-sourced knowledge base is two articles, one tagged
  `shopify:policy:undefined`.
- The inbox labels a guest storefront visitor `VIP`.

### What the run did not reach

- The notice clearing on a merchant reply — blocked by defect 5, since the
  composer lives inside the conversation that will not open.
- The router-materialized escalation, still unfired. Both plans in this run either
  elected `escalate_to_human` themselves or contained no escalation at all, so
  `applyEscalationRouting` never had to synthesize `tu_route_escalate`.
- Prose approval, which needs a phone.

### Method note

Approval was made from the dashboard **home** "needs you" card — which works — via
`POST /api/agent/quick-approve` (`allowedKinds: ["quick_reply", "needs_review"]`).
The tickets page could not be used for it. The two-step confirm (`Approve`, then
`Confirm approve`) behaved correctly.

---

## The eval gate — archaeology, 2026-08-08

Running the gate for the escalation-routing change surfaced a failure with nothing
to do with storefront chat.

**`prompt-injection-forwarded-email` failed 0/3** — and failed 0/3 with the
storefront change stashed, which is how it was established as pre-existing rather
than assumed to be. The cause is structural: `26531b55` (2026-08-05) added
`"mustCallTools": ["send_reply"]` to a fixture whose setup also carries
`forwarded_injection: true`, one of the four `ESCALATE_INTENT_KEYS`. So the fixture
routes to `escalate`, `applyEscalationRouting` deletes every non-read call, and the
assertion demands a reply the router guarantees cannot survive. No model output can
satisfy it.

It read as a fresh regression because `baseline.json` was last written 2026-07-30,
six days *before* the fixture gained that assertion — so the aggregate gate fired
against a number never measured on the fixture as it exists.

Resolved by pinning the behaviour the router actually guarantees —
`mustCallTools: ["escalate_to_human"]` — rather than deleting the line, which would
have let the fixture pass on an empty plan and made it weaker than before. Verified
3/3 after the change.

**The scoped run that was paid.** Not the full suite: the `keepReply` change
executes only inside the `escalate` branch, so the run covered the twelve fixtures
that reach `applyEscalationRouting` — four intent escalations (fraud, forwarded
injection, contradiction, out-of-scope) and three structural ones
(`fulfilled_cancel`, `ambiguous_customer`, `read_error`). Eleven passed; the twelfth
was the fixture above.

**Regenerating the baseline found the suite is far worse than one fixture.** A full
capture (85 fixtures × 3 repeats, 22 minutes) came back at **87.1%, with 13 fixtures
failing or flaky** — seven of them 0/3. Pre-existing, not storefront damage: three
were re-run at `HEAD` with every change stashed and failed identically. They split
into two opposite drifts, which is why no single tuning change explains them:

- **Over-escalation** — `tier-override-cancel-blocked`, `routing-order-edit`,
  `tier-guarded-store-credit-approval` and two prompt-injection fixtures collapse to
  a bare `escalate_to_human` where real work plus a reply was expected.
- **Under-escalation** — `refund-already-refunded`, `refund-no-amount`, and both
  `gift-card-*-escalate` fixtures reply instead of escalating.

**The baseline was deliberately not adopted.** Committing it would record 0/3 as the
expected rate for seven fixtures, which does not lower the bar so much as delete
those tests — a gate that expects failure cannot detect it. The stale 2026-07-30
baseline is wrong too, but wrong in the safe direction: it keeps the suite red, and
red is the accurate reading. The capture was not checked in and is cheap to reproduce
(`npm run test:evals:baseline -w apps/dashboard`).

**One of the seven was not a model failure at all.** `routing-product-search` sat at
0/3 having *never executed* — its `channelType` was `"instagram"`, which is not a
member of `ChannelType` (`ig_dm` is), so every repeat died in `db.thread.create` with
the model never called. `fixture-validator.ts` should have caught it and could not:
its hand-maintained `CHANNELS` set blessed `instagram` and `telegram`, neither of
which exists in the enum, while rejecting `ig_dm`, `imessage`, `sms`, `tiktok` and
`shopify_chat`, all of which do. Both are fixed and the fixture now passes 3/3.

**That validator gap was silently blocking this plan's own eval work** — a
`shopify_chat` fixture is the only way the gate will ever cover guest behaviour, and
the validator would have rejected one on sight. Adding a guest fixture is now
unblocked.

### The deferral argument, and why it kept being accepted

Recorded because the debt is still owed and the reasoning should be weighed rather
than re-derived:

- The non-guest system prompt is **byte-identical** — verified by rendering
  `buildSystemPromptParts` for an email thread against the same function at `HEAD`
  and diffing, not by reading the diff.
- Every guest branch is gated on `authState === "guest"`, which `buildContext` sets
  only for `shopify_chat`. Non-guest tool selection resolves to the same call it
  always made, and a test asserts static policy returns identical results with and
  without the options object.
- No eval fixture is a `shopify_chat` thread, so the gate as it exists cannot
  exercise the new path at all — a run would re-measure an unchanged surface.

What that does **not** cover: the gate is also a regression net for changes whose
effect nobody predicted, which is precisely the class this reasoning cannot rule out.

**The bundling plan lapsed.** The recommendation was to run the gate once together
with the storefront-budget change so one run covered both. The budget shipped
(`85d990cc`) and no eval run happened. Two things soften it and neither dissolves it:
the budget change touches no agent-package file at all, and the one shared-surface
change that landed alongside it (`405e1dea`) is gated on `isGuestContext` with a test
asserting the email path is byte-identical.

**M1.5 grew it again** — `context.ts`, `prompt.ts`, `static-policy.ts`, `planner.ts`,
`run.ts`. Every new branch is gated on `authState` and the full existing suites pass
unchanged, but the counter-argument stands.

---

## M2 — Customer Account OAuth, deferred and largely superseded

Kept as a sketch. **Do not build against this section without specifying it
properly.**

M1.5 subsumed most of what this milestone was for, at a fraction of the cost and
without forcing a re-authorization on anyone. What it does *not* cover is genuine
account binding — order history across orders, saved addresses — which is the only
reason left to build it, and only if a merchant actually asks.

Customer Account OAuth provides a high-assurance channel identity that links the
storefront visitor to a canonical person. It does not turn the session into a
conversation or authorize replaying every prior transcript; it restores the normal
autonomy and tool policy for that shopper only at the assurance scope the login
establishes.

It needs: a `StorefrontChatAuthAttempt` table for single-use state and the PKCE
verifier; the `customer_read_customers` and `customer_read_orders` scopes;
encrypted access/refresh token storage through the existing token-encryption
utilities; refresh and revalidation on later bootstraps with identity cleared on
refresh failure; session revocation when a token refresh fails; and a persistent
sign-in control in the widget.

Two things must be settled before it is scheduled, both recorded in the
[to-do-list.md](../to-do-list.md) entry:

- **Those scopes force re-authorization for every already-connected merchant** —
  a migration with merchant-facing consequences, needing its own plan. Avoiding
  exactly this is why M1 shipped without them.
- **The Customer Account API requires the shop to be on new customer accounts.**
  Merchants on classic accounts could never use the verified path and would stay
  guest-only. Confirm the eligibility rule and decide whether a permanently
  two-tier experience is acceptable before committing.

## Deferred beyond M2

Checkout and thank-you chat extensions, attachments, offline verified email,
Storefront MCP commerce cards, rich commerce UI, cross-device history, App Store
listing, and public distribution.
