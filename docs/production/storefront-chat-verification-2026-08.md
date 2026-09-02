# Storefront chat — findings and standing constraints

What survives from the August 2026 verification record: the findings that apply
to work outside this channel, the invariants to read before changing anything
inside it, and the M2 sketch.

The incident chronology this was extracted from — the dated runs covering
M0a/M0b, the escalation regression, the operator card, the guest-prompt collapse,
M1.5, the episode loop, the reply loop, and the eval-gate archaeology — was
deleted on 2026-09-01, once every finding it produced had been lifted into the two
sections below. Read it in full at
`git show c06be3b4:docs/production/storefront-chat-verification-2026-08.md`.
That is the file to open when a finding below is too compressed to act on.

## Durable findings

Each one cost a live failure to learn.

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
  than a bot. If it reads as paperwork, the fix is upstream of the copy. The
  decision that produced this is "The card was the wrong artifact" in the
  deleted chronology.
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
each is in the deleted chronology named above.

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
  section is principle, not situation-patching. Read the 2026-08-09 guest-prompt
  collapse in the deleted chronology before adding a bullet.
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
  join them. Superseded as an accepted model by conversation episodes, which
  shipped; until cross-channel identity itself is built, channels stay separate
  rather than joined by a weak name or address guess. The deferred identity tables
  and their reasons are in [to-do-list.md](../to-do-list.md) under Parked.
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers. There
  is no coexistence story.

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
