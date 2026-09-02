# Landing Page Marketing Plan

**Status:** In progress

**Last updated:** 2026-09-01

**Owner:** Marketing and product

**Source of product status:** [product-truth.md](product-truth.md) and
[to-do-list.md](to-do-list.md)

## Goal

Launch a marketing site that makes a Shopify merchant understand, within the
first screen, that Shopkeeper is an AI support operator that can complete real
Shopify work while keeping the merchant in control.

The site must prove that promise with a real, repeatable product workflow—not a
marketing-only simulation—and describe every capability, integration, price,
and integration role accurately.

## Done when

- A new visitor can identify the product, audience, and core difference without
  playing a video.
- The hero shows a real customer request in the first second and a completed
  Shopify outcome within ten seconds.
- The page shows Shopify action breadth before optional features such as the
  morning briefing.
- Customer channels, merchant-control channels, Shopify, and the dashboard have
  distinct roles everywhere they appear.
- Integration labels, pricing, trial terms, FAQ answers, metadata, and media all
  match the shipped product and a tested checkout.
- Every video has a useful poster, mobile treatment, and reduced-motion fallback
  and meets the performance budgets below.
- The Order operations page gives interested buyers a substantive next step
  beyond the homepage.
- No fictional result is presented as customer evidence.

## Decisions that govern the work

### Positioning

- **Category:** AI support operator for Shopify stores.
- **Primary promise:** Customer support that can actually fix the order.
- **Explanation:** Shopkeeper answers routine questions, prepares and completes
  Shopify order work, and asks the merchant before consequential actions.
- Keep the paper identity—warm paper, grain, restrained handwriting, and torn
  edges—as the frame. Keep product captures crisp, square, and high contrast.
- Show state changes and outcomes, not typing indicators, floating cards, or
  feature-label animations.
- Use real product paths with fictional demo data. Do not recreate the product
  in landing-page-only components to make a capture look better.

### Product model

Keep these four layers distinct in copy, diagrams, and navigation:

1. **Customer channels:** Instagram, Gmail, and forwarded support email.
2. **Merchant controls:** iMessage for phone-native review, approval, and
   direction.
3. **System of action:** Shopify, where order and customer changes happen.
4. **Control surface:** The dashboard for configuration, review, and audit.

Do not describe iMessage as a customer inbox, or imply that the dashboard is the
only place a merchant must work.

### Launch integration set

| Surface | Role | Landing-page treatment |
| --- | --- | --- |
| Shopify | System of action | Lead with real actions. |
| Gmail | Customer support intake | Include in the customer-channel group. |
| Forwarded email/Postmark | Customer support intake | Include in the customer-channel group and explain setup simply. |
| Instagram | Customer support intake | Include without a release-state badge; complete Advanced Access and a non-role merchant loop before launch. |
| iMessage | Merchant control | Present as an approval and direction surface. |
| Storefront chat | Customer support intake | May remain in the future-state onboarding animation; verify it in a real merchant workspace before launch. |
| TikTok Shop and WhatsApp | Not in the launch integration set | Omit from active marketing. |

Recheck this table against the canonical product docs before every marketing
release.

### Claims

Market these implemented capabilities:

- Order, fulfillment, and tracking lookup.
- Shipping-address correction before fulfillment.
- Adding, removing, and swapping order items.
- Exact full-order refunds within configured limits.
- Eligible unfulfilled-order cancellation.
- Returns, exchanges, gift cards, return labels, and fulfillment with tracking.
- Customer updates, Shopify notes, and drafted or sent customer replies.
- Merchant approval for consequential work under the default **Ask first** mode.
- Action history showing proposed, approved, and executed work.
- Support-volume and resolution analytics.

Use these qualifiers:

- Routine, structurally safe replies may send automatically unless the workspace
  uses **Draft only**. Mutative actions default to approval and need explicit
  rollout configuration for automatic execution.
- Brand voice learns from approved edits or merchant examples, proposes an
  update after enough examples, and changes only after merchant approval.
- The morning briefing is optional and needs a configured operator channel.
  Sales-pulse and low-stock sections are optional.
- **Do not claim delivery or carrier monitoring of any kind.** Carrier tracking was
  removed on 2026-08-26 for every carrier. Shopkeeper answers "where is my order"
  from Shopify order and fulfillment data when a customer asks; it makes no carrier
  call, has no scan history, and detects no stalls or exceptions on its own. Do not
  claim proactive delivery alerts, carrier-level exception detail, or carrier claims.
- Shopkeeper uses available conversation, customer, and Shopify context. Do not
  imply perfect cross-channel identity resolution.
- A merchant can elect to save an answer to a policy-gap question as reusable
  knowledge. Do not imply every merchant reply becomes policy.

Do not claim these until they ship or have the required evidence:

- Supplier operations or carrier-claim creation.
- Automatic restock outreach to every prior requester.
- TikTok Shop or WhatsApp as part of the launch integration set.
- Storefront chat as production-proven.
- Broad autonomous Shopify mutation.
- Perfect cross-channel customer identity matching.
- Customer logos, ratings, time savings, resolution rates, or other performance
  numbers without documented permission and source data.

### Pricing and conversion copy

- Publish only plans, prices, and trial terms that can be purchased and verified
  through checkout.
- Until enforcement exists, omit Scale, team-seat counts, conversation limits,
  and “no credit card required.”
- Keep the verified 14-day trial.
- Treat “in minutes” as a pre-release setup target and verify it from a new
  account through a successful first message before launch.
- Run a real checkout, trial, upgrade, downgrade, and cancellation test before
  pricing sign-off.

## Target homepage

Each section must answer a buyer question and lead naturally to the next one.

| Order | Section | Required content and proof |
| --- | --- | --- |
| 1 | Navigation | Product, Integrations, Security, Pricing, Sign in, and Start trial. Link only to substantive pages. |
| 2 | Hero | Category, outcome, grounded body copy, trial CTA, “See an order change” CTA, integration roles, and the real order-swap loop. |
| 3 | One request resolved | Understand request → prepare action → ask when needed → execute, reply, and log. Use one annotated real composition. |
| 4 | Shopify work | A compact action map: resolve the order, handle the exception, finish the work. Link to Order operations. |
| 5 | Controls | Three states—routine/safe, consequential/exceptional, outside policy—paired with an approval card and matching action-log row. |
| 6 | Four surfaces | Customer channel → Shopkeeper context/plan → merchant control when needed → Shopify execution, with dashboard below for review/audit. |
| 7 | Context and rules | Order, customer, product, inventory, policy, instructions, and approved voice sources in one annotated product view. |
| 8 | Proactive work | One real morning briefing. Clearly label optional modules and approval states. |
| 9 | Setup | Three actual screens: connect Shopify, add policies and autonomy limits, connect channels. |
| 10 | Integrations | Compact role grid that distinguishes intake, control, execution, and review. |
| 11 | Trust | Verified facts about data handling, isolation, access, exports, limits, and audit behavior. Link to Security. |
| 12 | Pricing | Only purchasable, enforced plans and verified trial conditions. |
| 13 | FAQ | Automatic sending, required approvals, supported channels, voice learning, exports, uncertainty, Shopify requirement, and data protection. |
| 14 | Final CTA | “Give support the ability to finish the job.” Keep the torn-paper brand moment and grounded trial copy. |

Suggested hero copy:

- **Eyebrow:** AI support operator for Shopify
- **Headline:** Customer support that can actually fix the order.
- **Body:** Shopkeeper answers routine questions, prepares and completes Shopify
  order work, and asks you before consequential actions.
- **Primary CTA:** Start 14-day trial
- **Secondary CTA:** See an order change

## Core demo and media specification

### Seed scenario

Use a resettable, fictional Shopify development store. Never include real PII,
credentials, merchant assets, or customer identifiers.

| Field | Seed value |
| --- | --- |
| Store | Linen & Loom; apparel; America/Los_Angeles |
| Policy | Unfulfilled orders may swap size when the replacement is in stock and the price is unchanged; ask before changing the order. |
| Product | Linen Jumpsuit; Medium / Sand → Small / Sand; equal price |
| Inventory | Medium: 8; Small: 12 |
| Customer | Maya Chen, synthetic contact details |
| Order | #3102; paid; unfulfilled; San Francisco, California |
| Customer intake | Instagram test account |
| Merchant control | iMessage |
| Settings | Ask first; mutative auto-execution off; $50 refund cap; action logging on |

Seeded request:

> hey! I ordered the linen jumpsuit in M but need S — can you switch it before
> it ships? order #3102

The real flow must receive the request, resolve the customer and order, verify
inventory and equal pricing, prepare the M → S edit, pause for approval, receive
approval through the shown operator channel, mutate the development-store order,
send the response, and record the matching approver and result in the action log.

If the generated response is weak, improve the real product context, policy, or
voice setup and rerun the flow. Do not hard-code a perfect reply for the asset.

### Hero loop

Target: 8–10 seconds, silent, seamless, and understandable without narration.

| Time | Beat |
| --- | --- |
| 0.0–1.4 s | Readable customer request. |
| 1.4–3.0 s | Order #3102, unfulfilled state, and Small in stock. |
| 3.0–4.8 s | “Swap M → S” with **Approval required**. |
| 4.8–6.1 s | Merchant approves in iMessage. |
| 6.1–8.0 s | Shopify changes to Small and the reply shows Sent. |
| 8.0–9.2 s | Action log shows Approved by merchant · Completed. |

Required captures:

- Customer intake and its role in the workflow.
- Order and inventory context.
- Proposed swap and approval-required state.
- Native-scale merchant approval.
- Shopify order before and after execution.
- Sent customer response.
- Completed action-log row and detail.
- Desktop action detail before and after execution.
- Mobile customer conversation.
- Ask first and action/refund-control settings.

### Additional media

After the hero works, produce short modular loops in this order:

1. Delivery exception → update drafted → merchant approval.
2. Address correction before fulfillment → approval → Shopify update.
3. Policy gap → merchant answer → reusable knowledge saved.
4. Morning briefing → merchant opens one support or low-stock item.

Use only three media patterns across the site: short verified workflow loops,
annotated product stills, and simple system diagrams/matrices. Do not add generic
lifestyle photography; commission one coherent merchant-environment set later or
use product compositions.

### Media delivery requirements

- Capture masters at 1920 px wide or greater and at 60 fps when practical;
  record a desktop master at 1440×900 or larger and a mobile master at a current
  390 px CSS viewport.
- Export WebM plus H.264 MP4 at 30 fps unless 60 fps materially helps.
- Keep the hero video at 4 MB or less and secondary loops at 2 MB or less.
- Supply responsive WebP/AVIF posters and stills with explicit dimensions.
- Videos must be muted, inline, looping, lazy-loaded below the fold, and paused
  offscreen. Essential explanation stays in HTML.
- Reduced-motion mode receives the poster or an equivalent still sequence.
- Verify Chrome, Safari, Firefox, iOS Safari, keyboard use, mobile crops, and a
  mid-range mobile device before publishing.

### Reset and truth gate

Provide an idempotent fixture or a minimal documented reset procedure that
recreates the synthetic customer, inventory, paid unfulfilled order,
conversation, and action records without printing secrets. Use a stable display
order number or update the composition after each reset.

No capture passes unless the intake used the real test path, Ask first stopped
execution, the shown merchant approval resumed it, Shopify changed from M to S,
the response sent, and the action log contains the same action and result.

## Public-site scope

Build deeper pages only when each has a distinct buyer question, unique product
asset, supported workflow and limitations, setup requirements, FAQ, and CTA.

Build in this order:

1. **Order operations:** Actions, eligibility, approval behavior, and real
   workflows.
2. **Approvals and controls:** Autonomy modes, limits, operator channels, and
   audit trail.
3. **Integrations:** Roles and setup expectations.
4. **Customer support:** Replies, context, escalation, policy knowledge, and
   voice learning.
5. **Security:** Verified handling, isolation, permissions, and exports.

Do not create thin routes to make the navigation look larger. The homepage may
link to a strong section until a full page is ready.

The five pages above are the buyer-education track. There is no acquisition
track, and that is currently a choice by omission rather than a decision. Two
candidates, neither scheduled:

- **Comparison pages**, starting with Gorgias and Shopify Inbox. Intent-driven
  organic search, and the angle is sharp — a helpdesk is something you staff, an
  employee is something you supervise from your phone. Each still owes the
  substantive-page bar above; a comparison page is the easiest kind of thin
  route to write.
- **A public changelog.** Git history is already the record, and for a
  solo-founder product a dated shipping trail is evidence the thing is alive.

Section 4 of **Target homepage** — the Shopify action map — can be generated
from `TOOL_LABELS` and `TOOL_CATEGORIES` in `packages/agent/src/tools/registry/`
rather than hand-written, which makes it provably complete and permanently
current. If that route is taken, note the client-boundary landmine: the registry
is in the client bundle, so a `@shopkeeper/db` import on that path breaks
`next build`.

## To-do list

### Phase 0 — reconcile product truth

- [x] Inventory homepage claims, integrations, pricing, media, and navigation.
- [x] Approve the positioning and four-layer product model.
- [x] Classify active, gated, pending, and unsupported claims.
- [ ] Finish claim and integration verification before launch. The onboarding
  animation intentionally retains the planned storefront-chat and “in minutes”
  future state; all other identified high-risk copy has been corrected.
- [ ] **Provision `PRICE_ID_STARTER` and `PRICE_ID_PRO`, then verify the displayed
  Starter and Pro prices against a live Stripe checkout.** The repository supports
  these two tiers and a 14-day trial. Until the price IDs exist every org resolves to
  `unknown` in `resolvePlanTier` and both limits fail open by design, so the page
  would print two numbers nothing enforces. The `PLAN_LIMITS` values were recovered
  from the pre-`c558c788` page precisely so enforcement and the page agree when the
  page carries them again; this is the step that closes that loop.
- [ ] Decide whether the conversation and seat numbers return to `Pricing.tsx`. The
  condition the **Pricing and conversion copy** rule waits on — "until enforcement
  exists" — has been met. `PLAN_LIMITS` in `packages/db/plan-limits.ts` carries the
  counts (Starter 500/mo and 1 seat, Pro unlimited and 2 seats), and both are
  enforced: `degradeForConversationLimit` on the gateway planning path in
  `apps/gateway/src/message-handlers/planning.ts`, and the seat check in
  `apps/dashboard/src/app/api/team/route.ts`, which refuses the invite. The two
  behave differently and the copy has to say which — seats refuse, conversations
  degrade rather than stop. Scale stays omitted regardless: `PlanTier` has no such
  tier and there is no checkout behind it. Blocked on the same Stripe verification
  as the item above; `plan-limits.ts` records `PRICE_ID_STARTER` and `PRICE_ID_PRO`
  as unprovisioned in production, which is why every live org currently resolves to
  the deliberately unbounded `unknown` tier.
- [x] Update metadata, footer copy, FAQ, and navigation terminology to match the
  approved positioning.

**Exit gate:** Every public claim maps to an implementation intended for launch;
pricing and trial copy match a completed checkout test.

### Phase 1 — build the media foundation

- [ ] Create the resettable Linen & Loom development-store fixture.
- [ ] Connect and verify the test customer-intake and merchant-control paths.
- [ ] Execute the full order-swap flow and verify provider events, Shopify state,
  the customer reply, and action-log records.
- [ ] Capture all required desktop, mobile, Shopify, and operator-channel states.
- [ ] Edit the hero loop, poster, reduced-motion stills, and mobile crop.
- [ ] Produce the four secondary workflow loops and supporting static
  compositions.
- [ ] Define asset naming, storage, source, versioning, reset, and compression
  conventions.
- [ ] Pass product-accuracy, PII, licensing, visual-quality, browser,
  accessibility, and performance review.

**Exit gate:** The hero and supporting assets prove real product behavior and
meet every truth and delivery requirement in this document.

### Phase 2 — reconstruct the homepage

- [x] **Apply the copy deck.** [landing-page-copy.md](landing-page-copy.md) is applied
  as of 2026-09-01 across `Hero.tsx`, `HeroMedia.tsx`, `ProductOverview.tsx`,
  `Onboarding.tsx`, `Pricing.tsx`, `FAQ.tsx` and `CTA.tsx`. Its "Load-bearing hedges"
  table remains the list of phrases a later editing pass must not polish away, and
  `Pricing.tsx` carries a comment recording why its bullets are thin — the feature-gate
  framing has now been removed twice.
- [ ] **Rename workspace → store in the app**, per the deck's decision 3. Until then
  the site and the settings tab use different words for the same thing, deliberately.
  Two apparent collisions are not collisions and must not be "fixed": the app's
  control is **Trust level** with modes **Draft only** / **Ask first** / **Trusted**,
  and there is no *custom instructions* field — the nearest real one is **About your
  store**.
- [x] **Drop the website-chat hedge on `/product/integrations`.** Done 2026-09-01:
  the capability list, the intake card in the system map, and the iMessage FAQ answer
  all name chat as a present channel. Note that the storefront-chat production canary
  is still open in [to-do-list.md](to-do-list.md) — putting the channel on the
  homepage raised the cost of leaving it open, but did not change what the code does.
- [ ] Replace the simulated hero film with the verified order-swap loop.
- [x] Reorder the homepage to match the target structure above.
- [x] Add the Shopify action map, approval states, and four-surface system
  diagram.
- [ ] Pair the approval state with matching real action-log proof after the
  capture workflow is complete.
- [x] Separate customer channels from merchant-control channels in every section.
- [x] Move the briefing and other optional features below the core workflow.
- [x] Replace repeated simulations with concise static content while preserving
  the planned setup animation.
- [x] Preserve paper styling at the edges without reducing product readability.
- [ ] Settle the two atmosphere photographs still marked placeholder in source:
  `hero-light.jpg` (`Hero.tsx`) and `footer-dawn.jpg` (`Footer.tsx`, and
  `OnboardingExperience.tsx` in the onboarding route), each carrying a "swap for
  the final shot" comment. Check the premise before commissioning anything:
  `hero-light.jpg` renders blurred, de-saturated, and radially masked — an
  atmosphere wash, not an image a visitor reads as an image — so the swap may
  change nothing anyone can see, and the honest resolution is deleting the
  comments. **Additional media** above already rules out generic lifestyle
  photography, so replacement means a product composition. Confirm both at real
  viewing size, then either accept them or replace them; do not leave the
  comments standing.
- [ ] Decide the display typeface. Every H1 and H2 on the marketing surfaces —
  `CTA.tsx`, `FAQ.tsx`, `Footer.tsx`, `Onboarding.tsx`, `Pricing.tsx`,
  `ProductDetailTemplate.tsx` — sets `--m-hand`, which resolves to Just Another
  Hand, a condensed marker face, at display sizes. `--m-serif` in
  `apps/dashboard/src/app/styles/marketing.css` is still bare Georgia: a
  fallback, never a chosen face. The open question is whether "restrained
  handwriting" in **Positioning** means handwriting carries the display type or
  only the annotations, margin notes, and timeline stamps. Answer it once and
  apply it; a real display serif on H1/H2 is the alternative if the answer is
  the latter.
- [x] Replace the stale hosted film with a responsive, meaningful seeded
  walkthrough that works without autoplay.
- [ ] Add responsive video sources, a verified poster, offscreen pause, and
  reduced-motion treatment when the real hero loop is captured.
- [x] Validate the complete mobile explanation without hover or autoplay at
  390 px and desktop behavior at 1440 px.

**Exit gate:** After the hero and next two sections, a new visitor can explain
what Shopkeeper does, how it differs from a chatbot, and when the merchant stays
in control.

### Phase 3 — add site depth

- [x] Build and link the Order operations page.
- [x] Build Approvals and controls, Integrations, Customer support, and Security
  pages as each meets the substantive-page requirements.
- [x] Route Order operations through the product navigation while retaining
  homepage anchors for sections that do not yet have substantive pages.
- [x] Replace the remaining homepage-anchor navigation only as substantive pages
  become ready. Every anchor with a page behind it now resolves to that page, in
  the navbar and in a new footer product column. Pricing and FAQ stay anchors
  deliberately — neither has a page in the build order above. One residue: this
  file's navigation row wants Integrations top-level, and it currently sits
  inside the Product menu.
- [x] Add unique metadata, canonical URL, Open Graph asset, internal links, and
  a page-specific FAQ to Order operations.
- [x] Add unique metadata, canonical URLs, Open Graph assets, internal links, and
  page-specific FAQs to each remaining page when built.
- [x] Verify the Order operations route has accurate limitations, integration
  roles, seeded proof, and a trial CTA.

**Exit gate:** Every navigation destination is complete, useful, accurate, and
deeper than the homepage section that links to it.

### Phase 4 — graduate from product proof to customer proof

- [ ] Recruit consenting design partners without blocking Phases 1–3.
- [ ] Record written permission for names, logos, screenshots, and final quotes.
- [ ] Define each metric's window, sample size, calculation, and source query.
- [ ] Collect support volume, response/resolution time, action outcomes,
  escalations, and documented merchant time saved.
- [ ] Publish anonymized workflows only after PII removal and merchant approval.
- [ ] Publish named case studies only with written permission and reproducible
  evidence; publish aggregate claims only across multiple stores with a stable
  query and stated observation window.
- [ ] Use search and conversion data to prioritize additional channel and use-case
  pages.

**Exit gate:** Every public customer quote, logo, workflow, and metric has
documented consent and traceable evidence.

## Release checklist

- [ ] Recheck every capability and integration against the canonical status docs.
- [ ] Confirm customer and merchant-control surfaces are never conflated.
- [ ] Confirm optional behavior is labeled optional and autonomy copy states what
  sends, pauses, or blocks.
- [ ] Confirm every screenshot and video matches the exact product path and
  integration role described beside it.
- [ ] Confirm fictional demo data is not presented as a customer result.
- [ ] Confirm every number has a source, definition, sample, and time window.
- [ ] Complete pricing and checkout QA.
- [ ] Complete PII, permissions, licensing, accessibility, browser, mobile,
  reduced-motion, and performance QA.
- [ ] Confirm metadata, navigation, hero, pricing, FAQ, and footer tell the same
  story.
