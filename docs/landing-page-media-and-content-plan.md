# Shopkeeper Landing Page: Media and Content Plan

**Status:** Implementation source of truth

**Last verified against the repository:** 2026-08-21

**Primary audience:** Solo Shopify founders and small ecommerce teams that handle support themselves

**Primary conversion:** Start a 14-day trial

## Product facts this plan is allowed to use

The homepage must stay inside the product behavior verified in this repository.

- Customer support intake exists for Instagram Professional accounts, Gmail, and forwarded email. Shopify storefront chat also exists in the codebase; TikTok Shop is feature-flagged and WhatsApp is marked “Coming soon,” so neither belongs in the primary homepage story.
- Merchants can direct and approve Shopkeeper through iMessage, Telegram, or the dashboard. iMessage is the most distinctive and legible homepage example.
- Shopify supplies order, customer, product, inventory, fulfillment, tracking, and store-policy context.
- Supported Shopify work includes order lookup, fulfillment/tracking lookup, pre-fulfillment address changes, eligible order cancellation, exact full-order refunds within configured limits, order item edits, returns, exchanges, gift cards/store credit, return-label attachment, fulfillment with tracking, customer updates, notes, and replies. Not every action is eligible in every order state.
- The merchant-facing control modes are Draft only, Ask first, and Trusted. Ask first is the default. Mutative work defaults to approval; broad autonomous Shopify mutation is not the launch promise.
- Action history records the proposal, decision, execution status/result, customer-facing output, and approver where applicable.
- Onboarding connects Shopify first, reads available store policies/pages into knowledge, optionally connects Gmail or forwarded email, and leaves additional channels available from Integrations. A merchant starts in approval mode.
- The billing code implements a 14-day Stripe subscription trial. Checkout collects a payment method. The repository does not support a “no credit card required” claim.
- Starter is $19/month, 500 customer conversations per month, and 1 seat. Pro is $49/month, an unbounded customer-conversation allowance, and 2 seats. Both tiers run the full product; the plan ladder sells volume and seats, not action capabilities. The limit code is inert if production Stripe price IDs are not provisioned, which remains an external configuration question.
- Customer message content is not used to train general-purpose AI models. The product also has tenant-scoped access controls, encrypted stored provider credentials, signed webhooks, encryption in transit, action constraints, review history, and export/deletion paths. No external certification or audit may be implied.
- No approved customer testimonials, customer logos, outcome statistics, or case studies were found in the repository.

## 1. Current-state assessment

### What works and should be preserved

- The core headline, **“Customer support that can actually fix the order,”** is concrete, differentiated, and easy to remember.
- The warm cream, ink, muted green, photographic washes, serif display type, and restrained shadows already feel closer to a premium ecommerce brand than an AI template.
- The existing animated Instagram → Shopify check → iMessage approval → customer reply sequence is the strongest asset on the page. It uses behavior the repository supports, fits in a small payload because it is rendered UI rather than video, pauses offscreen, and has a reduced-motion end state.
- The Shopify, Gmail, Instagram, iMessage, Telegram, and Shopkeeper marks are reusable. The old phone-demo component set repeated the primary workflow and is retired by this implementation.
- The approval/action-history composition demonstrates both control and accountability without relying on customer proof.
- The onboarding animation already separates customer channels from the merchant control channel and respects reduced motion.
- The sticky navigation, quiet pill treatment, paper background, and restrained CTA treatment are worth refining rather than replacing.
- Dedicated product pages for Customer support, Order operations, Approvals and controls, Integrations, and Security provide useful depth without forcing every detail onto the homepage.

### Existing assets worth reusing

- `HeroMedia.tsx`: primary end-to-end demo; revise labels/caption and presentation, do not replace.
- `ProductOverview.tsx`: approval plus action-history composition; revise copy and ensure demo disclosure is visible.
- `Onboarding.tsx`: connect/sync/channel setup animation; simplify copy and visual framing.
- `/atmosphere/paper.webp`: brand ground.
- `/atmosphere/hero-light.jpg` and `/atmosphere/footer-dawn.jpg`: atmospheric washes only, not evidentiary photography.
- `/logos/*`: integration identification, never customer proof.
- `/illustrations/dashboard-picture.png`: do **not** use on the refreshed homepage. It is an old product capture with Clerk branding, test identity data, dated UI, and weak mobile legibility.
- `/atmosphere/demo-poster.webp`: retain for the separate demo-film surface, not the homepage’s primary proof.

### Current elements to retire or keep off the homepage

- The architecture-first “four surfaces”/touchpoint framing. It asks the merchant to learn the system instead of showing the outcome.
- Repeated Understand/prepare/ask/execute explanations.
- The morning briefing, sales pulse, low-stock, and general monitoring story. Those features can remain in the product but dilute the customer-support wedge on the homepage.
- Long timelines and decorative paper-card sequences that do not add a new buying answer.
- “Seeded” and “synthetic” as prominent demo terminology. Use the direct, honest label **“Example workflow · Demo data.”**
- Any customer-brand logos already present in `/public/logos` unless explicit public-use approval is documented. They are not evidence merely because the files exist.
- The current claim that Starter only drafts while Pro performs Shopify actions. The product code deliberately gives both plans the full product.

## 2. Conversion problems

1. **The page leads with a mechanism, not the merchant’s day.** It explains a support workflow but does not quickly name the repetitive checking, channel switching, and evening cleanup the product removes.
2. **The deeper differentiation is implicit.** Visitors can see that Shopkeeper takes actions, but not that the operating model is “delegate support and get pulled in only for decisions,” rather than “adopt and manage another ticketing system.”
3. **Product proof is too repetitive and too fictional-feeling.** Several scripted examples repeat the same context/approval language. One end-to-end example plus distinct supporting product views will be more convincing.
4. **The current homepage sequence is incomplete.** It jumps from workflow examples to controls and pricing without a clear pain/outcome moment, capability breadth, setup, security/privacy, or closing CTA.
5. **Pricing currently contradicts the implementation.** The homepage says Pro unlocks actions, while plan-limit code says all plans run the full product and differ by conversations/seats.
6. **FAQ coverage is too thin.** It misses the main purchase objections: whether another helpdesk is required, whether Gmail must be replaced, how approval works, uncertainty/error handling, data training, setup, usage, and trial billing.
7. **Trust is underdeveloped.** There is no customer proof yet, so product specificity, transparent demos, supported privacy claims, and honest commercial terms must carry more weight.
8. **The page still contains internal language.** “Consequential,” “merchant judgment,” “autonomy,” “organization scope,” and similar terms should be translated into actions merchants recognize.
9. **Mobile risks a long sequence of similar phone mockups.** The refreshed page needs fewer repeated devices, shorter copy, horizontal request chips, and product views cropped around the single decision being explained.

## 3. Revised positioning

### Core promise

**Customer support that can actually fix the order.**

Supporting direction:

> Shopkeeper handles routine support where customers already message you. It checks the real order, completes supported Shopify work, and asks you before refunds, cancellations, or order changes when approval is required.

The final copy should remain shorter than this planning language, but it must answer product, audience, action, and control in the first screen.

### Deeper differentiation

Shopkeeper is an AI support operator for Shopify merchants who do not want to operate a traditional helpdesk.

The merchant-facing model is:

> Customers ask. Shopkeeper handles the work. You hear from it when a real decision needs you.

This is a workflow distinction, not a competitor attack. Do not claim other products cannot automate actions. Instead, contrast the merchant’s role:

- Traditional helpdesk: a message becomes a ticket for a person to operate.
- Shopkeeper: a message becomes work Shopkeeper handles; the merchant receives only the decision when approval or missing store guidance is required.

### Tone

- Direct, calm, observant, specific.
- Merchant language: order, inbox, address change, refund, approval, store policy.
- Avoid infrastructure language, generic AI adjectives, fake urgency, and unsupported comparative claims.
- Preserve the occasional sharp personality line only where it advances comprehension.

## 4. Revised page architecture

| Order | Section | Buyer question answered | Purpose |
| --- | --- | --- | --- |
| 1 | Navigation | Where can I go and how do I start? | Keep Product, Security, Pricing, Sign in, and a persistent trial CTA. Add a direct pricing link on desktop rather than hiding it only in a menu. |
| 2 | Hero | What is this, who is it for, and is it safe to try? | Preserve the headline, use merchant-oriented supporting copy, show trial terms accurately, and add “See Shopkeeper work” as the secondary CTA. |
| 3 | End-to-end product demo | Does it really do the work? | Show Instagram request → Shopify facts → iMessage approval → updated order/customer reply. Label it as demo data. This is the primary visual proof. |
| 4 | Merchant pain and outcome | Does this solve my actual day? | Name repetitive questions, manual Shopify checks, and channel switching without melodrama. Land on the outcome: fewer tickets to work, fewer tabs to live in. |
| 5 | Delegation vs. helpdesk | Why is this different? | Explicitly compare “manage every ticket” with “get involved only for decisions.” Feature the phone-native iMessage approval as the centerpiece. |
| 6 | Work Shopkeeper can handle | What can I hand over? | Present real customer requests, not internal feature names. Pair the requests with one product/order context view. |
| 7 | Control and approvals | Will it do something I regret? | Explain Draft only, Ask first, and Trusted in plain language; show the approval and action-history UI; link to full controls. |
| 8 | Trust substitute | Why trust an early product? | Be transparent: example workflow, supported integrations, reviewable actions, and privacy facts. No simulated social proof. |
| 9 | Easy setup | How much work is this to adopt? | Connect Shopify, read policies/pages, connect a customer channel, choose how approval reaches the merchant. Keep this visually compact. |
| 10 | Security/privacy | What happens to store and customer data? | Lead with “Your store. Your customers. Your rules.” Include only verified privacy/control facts and link to Security and Privacy. |
| 11 | Pricing | Which plan is the real product? | Make Pro the recommended plan for growing teams while clearly stating both tiers include the full product. Differentiate on conversations and seats. |
| 12 | FAQ | What objections remain? | Answer fit, channels, access, approval, uncertainty, data training, setup, trial/card, usage, and cancellation-management questions. |
| 13 | Final CTA | Am I ready to try it? | Return to delegation: “Hand off the next support message.” Repeat the trial CTA and honest billing line. |

Sections 4 and 5 may share one visual band. Sections 8–10 may be consolidated into a two-part trust/setup composition to avoid a long page of small cards.

## 5. Section-by-section copy plan

### Navigation

- Wordmark: Shopkeeper.
- Primary links: Product, Security, Pricing.
- Account: Sign in.
- CTA: Start free trial.
- Mobile: a compact sheet with the same hierarchy and 44px minimum touch targets.

### Hero

- Eyebrow: **AI support operator for Shopify stores**.
- H1: **Customer support that can actually fix the order.**
- Body direction: handles routine Instagram/email support, checks live Shopify facts, completes supported work, and asks before sensitive changes.
- Primary CTA: **Start free trial**.
- Secondary CTA: **See Shopkeeper work** → product demo anchor.
- Commercial note: **14 days free · card required when you choose a plan**. Do not use the obsolete no-card asset.
- Small integration line: **Customer messages: Instagram + email · Your approvals: iMessage · Order work: Shopify.** This is integration proof, not customer proof.

### Product demo

- Label: **Example workflow · Demo data**.
- Heading: **One message. The order gets handled.**
- Sequence:
  1. Maya asks on Instagram to swap Medium to Small before shipment.
  2. Shopkeeper finds order #3102, confirms it is unfulfilled, and checks stock.
  3. The proposed swap reaches the merchant in iMessage with the relevant facts.
  4. The merchant approves.
  5. Shopify updates and Maya receives the answer.
- The section must not repeat a prose workflow under the animation. A short caption is enough.

### Pain and outcome

- Headline direction: **Support should not be the tab you keep reopening.**
- Body: the repetitive loop is a customer message, a Shopify lookup, a policy check, a reply, and a reminder to make the promised change.
- Outcome: Shopkeeper closes that loop; the merchant keeps attention for the decisions that actually need them.
- Use three concise before/after statements, not a generic feature grid:
  - Stop checking Shopify for every “where is my order?”
  - Stop copying context between Instagram, email, and the admin.
  - Stop carrying address changes and refunds in your head until later.

### Delegation vs. helpdesk

- Headline: **Do not run another support queue.**
- Two simple flows:
  - Traditional helpdesk: Message → ticket → you work it.
  - Shopkeeper: Message → work handled → you approve only when needed.
- Supporting line: **When Shopkeeper needs a real decision, it messages you.**
- Use the existing iMessage visual language at readable phone scale, not an abstract architecture diagram.

### Capabilities

- Headline: **Hand over the questions that keep repeating.**
- Show supported customer language:
  - “Where is my order?”
  - “Can you change my shipping address?”
  - “Can you swap this for a small?”
  - “Can you cancel before it ships?”
  - “I need to return this.”
  - “What is your return policy?”
- A smaller second line may mention exact full refunds, exchanges, gift cards/store credit, return labels, and tracking where applicable. Avoid implying that every request is always eligible or automatic.
- CTA: **See Shopify order operations**.

### Control

- Headline: **You decide what can happen without you.**
- Plain-language modes:
  - Draft only: prepares the reply and Shopify work; nothing sends or changes.
  - Ask first: routine answers can move; money and order changes wait for approval. This is the default.
  - Trusted: simple replies can send automatically; action permissions, limits, and eligibility checks still apply.
- Visual: iMessage proposal beside action history.
- Copy: refunds, cancellations, address changes, and item swaps can pause with the order facts attached. Do not say every one always requires approval in all configurations.

### Transparent early-stage trust

- Heading: **Specific product, honest proof.** (May be an eyebrow rather than a standalone headline.)
- State that the walkthrough uses demo data.
- Use supported-product proof: explicit integration roles, visible controls, and a record of proposed/approved/completed work.
- Do not say “trusted by,” “most picked,” or “customers save.”

### Setup

- Headline: **From Shopify connection to first reply in a few steps.** Avoid a hard “minutes” claim unless timed evidence is collected.
- Steps:
  1. Connect Shopify; Shopkeeper reads available orders, products, inventory, policies, and pages.
  2. Connect Gmail or forwarded email; add Instagram and other supported channels from Integrations.
  3. Start in Ask first; connect iMessage if approvals should reach the merchant’s phone.
- Do not imply technical implementation, migration, or mandatory helpdesk replacement.

### Security/privacy

- Headline: **Your store. Your customers. Your rules.**
- Lead trust statement: **Customer message content is not used to train general-purpose AI models.**
- Supporting facts:
  - Connected-provider credentials are encrypted before storage.
  - Workspace data access is organization-scoped.
  - Actions are constrained and reviewable.
  - Workspace/customer exports and deletion requests are supported; action history can export as CSV.
- Links: Security, Privacy Policy.
- No SOC 2, audit, certification, “bank-grade,” or encryption-at-rest algorithm claims.

### Pricing

- Heading: **Start small. Keep the whole operator.**
- Intro: both plans include supported channels, Shopify actions, approval controls, and action history.
- Starter: $19/month; 500 customer conversations/month; 1 seat; best for a founder handling a smaller support volume.
- Pro: $49/month; unlimited customer conversations; 2 seats; label **Recommended**, not “Most picked.”
- Both: 14-day trial; card collected at plan checkout.
- No overage claim because no overage behavior is defined. Crossing Starter’s limit pauses planning for new over-limit work while message ingestion continues; this operational detail belongs in the FAQ, phrased carefully.
- External production readiness: confirm `PRICE_ID_STARTER` and `PRICE_ID_PRO` are provisioned in both services before treating plan limits as live in production.

### FAQ

Prioritized questions and repository-supported answer boundaries:

1. **Do I need Gorgias or another helpdesk?** No. Shopkeeper has its own conversation and review surface; Gmail/forwarded mail can stay the customer address.
2. **Do I have to replace Gmail?** No. Connect Gmail/Google Workspace or forward an existing support inbox.
3. **Which customer channels work today?** Primary homepage answer: Instagram Professional accounts, Gmail, and forwarded email; storefront chat exists but requires its Shopify setup. TikTok Shop is not promised while feature-flagged; WhatsApp is coming soon and should not appear as current.
4. **How can Shopkeeper change Shopify?** List the supported categories with eligibility caveats and link to the detailed page.
5. **Can I require approval?** Yes: Draft only or Ask first, plus action permissions and limits.
6. **What happens when it is not sure?** It can ask the merchant for missing guidance, block ineligible work, or escalate rather than inventing policy.
7. **What if an action fails or has an unknown outcome?** The system records execution status and has reconciliation paths; do not promise infallibility.
8. **How much Shopify access does it receive?** Only the scopes required by the connected product functions; describe categories and link to Security/Privacy rather than dumping OAuth scopes.
9. **Is message content used to train AI?** No for general-purpose AI models, per the Privacy Policy.
10. **How long is setup?** A few guided steps; no precise time promise yet.
11. **Is a card required?** Account creation can precede checkout, but a payment method is collected when starting the Stripe plan trial.
12. **What usage is included?** Starter: 500 new customer conversations/month and 1 seat. Pro: unlimited customer conversations and 2 seats. Merchant/operator chats do not count as customer conversations.
13. **Can I cancel?** Billing can be managed through the Stripe customer portal. Do not promise a specific refund or end-of-period cancellation policy until Stripe portal configuration/legal copy is verified.

### Final CTA

- Headline: **Hand off the next support message.**
- Body: Connect Shopify, choose where customers reach you, and keep approval where you want it.
- CTA: **Start free trial**.
- Note: **14 days free · payment method collected at plan checkout**.

## 6. Media plan

| Visual | What it depicts | Existing/new | Target and placement | Desktop treatment | Mobile treatment | Motion |
| --- | --- | --- | --- | --- | --- | --- |
| Hero workflow | Instagram request, Shopify verification, iMessage approval, completed customer reply | Existing `HeroMedia`; modify | Responsive rendered UI, max 560px wide; directly after hero copy | Centered stage with channel labels and a quiet demo-data caption | Full-width stage at roughly 320–360px; preserve 44px controls and do not show tiny multi-column UI | Four short states; pause offscreen; reduced motion shows completed state |
| Delegation comparison | Helpdesk queue versus Shopkeeper handling plus merchant decision | New HTML/CSS composition | 16:9-ish editorial band, max 1120px | Two horizontal flows with one emphasized iMessage decision | Stack as two compact rows; no horizontal overflow | A decision pulse/arrival only; CSS and reduced-motion safe |
| Capability proof | Customer request list beside live order context/result | New rendered composition based on supported fields | 5:4 combined section, max 1120px | Large request typography left; order context/result right | Requests become a horizontal snap row; order view cropped to essential fields | Optional active-request transition; static is fully complete |
| Approval/history | Proposed swap in iMessage plus completed action history | Existing `ProductOverview`; modify | 2:1 desktop / stacked mobile | Side-by-side | Stack proposal above result; maintain readable type | No continuous animation required |
| Setup | Shopify connection/knowledge read and channel enablement | Existing `Onboarding`; modify | 16:10 stage, max 1050px | Visual and two steps side by side | Stage first, then two direct step buttons; shorter stage height | Existing intersection-driven loop; reduced motion final state |
| Security proof | Privacy statement with three concrete control rows | New HTML composition | Wide text-led section; no dashboard screenshot needed | One large statement plus restrained facts | Single column, no cards nested inside cards | Static |
| Final CTA atmosphere | Calm brand close | Existing footer wash | Full-width closing band | Soft photographic color wash behind copy | Crop to keep contrast and low asset cost | Static |

### Media still needed after this implementation

The page can ship intentionally without these; do not fabricate them.

1. **Current dashboard action-history capture**
   - State: the same demo order after an approved size swap, with source request, proposal, approver, completed Shopify result, and customer reply visible.
   - Desktop capture: 1600×1000 minimum, 8:5 aspect ratio, no real PII, product-brand chrome rather than Clerk/test branding.
   - Mobile crop: 750×1000, centered on proposal → approval → completed result.
   - Replacement target: the rendered approval/history composition once product UI stabilizes.
2. **Real iMessage approval capture**
   - State: Shopkeeper sends a concise approval request with order status, stock, proposed change, and approval controls; follow-up confirms Shopify update.
   - Device frame: 1170×2532 source capture, crop safe for 9:16; demo contact and order data only.
   - Placement: delegation/control section.
3. **Current integrations/setup capture**
   - State: Shopify connected, knowledge read complete, Gmail/Instagram listed, iMessage bound.
   - Desktop: 1440×1000; mobile: 750×1000 focused on connection status.
   - Placement: setup section.
4. **Optional 12–16 second real walkthrough video**
   - 1440×1080 master, H.264 MP4 and VP9 WebM, no audio required, under 1.5MB preferred.
   - Steps: inbound message → order context → approval → completed action history.
   - Load only after the poster is visible/in view. Keep the rendered UI as fallback.

## 7. Components

### Reuse

- `Navbar`, `NavLinks`, `AuthNavLinks`, `Footer`, `GlassLink`.
- `HeroMedia` and its motion lifecycle.
- `ProductOverview` approval/history composition.
- `Onboarding` setup animation.

### Modify

- `Hero`: merchant-oriented copy, eyebrow, two CTAs, accurate trial/card note, integration roles, and demo anchor.
- `ProductOverview`: plain-language control copy, three modes, visible demo disclosure, mobile polish.
- `Onboarding`: remove “auto-reads” overstatement, replace developer-like store typing emphasis with guided setup language, and shorten mobile height.
- `Pricing`: correct feature/plan model, include enforced allowances/seats, label Pro “Recommended,” disclose card collection.
- `FAQ`: replace four implementation-oriented answers with buying objections and accessible disclosure behavior.
- `CTA`: outcome-led final conversion block and accurate trial note.
- `NavLinks`: make Pricing directly visible on desktop; preserve deeper product menu.
- Metadata/layout: homepage-specific canonical, structured data, clearer “Shopkeeper for Shopify” naming.

### Create

- `Delegation.tsx`: pain/outcome plus helpdesk-versus-operator flow.
- `Capabilities.tsx`: real customer requests plus supported Shopify work composition.
- `Trust.tsx`: early-stage proof statement and verified security/privacy facts.
- Optional small shared `MarketingSectionHeader` only if it removes repeated markup without forcing every section into the same card pattern.
- `sitemap.ts` and/or route metadata only if they fit current Next.js conventions and do not expose private app routes.

### Remove or consolidate

- Stop rendering `Features` on the homepage; its three scripted phone conversations repeat the hero and include distracting edge-case detail.
- Keep `Touchpoints`, `Channels`, and `Integrations` off the homepage; their best ideas are consolidated into Delegation, Trust, and Setup.
- Do not render the proactive morning-briefing section on the homepage.
- Delete the obsolete landing-only `Features`, `Touchpoints`, `Channels`, `Integrations`, `Reveal`, handwriting-decoration, and `chat-demo` components after confirming no product detail page imports them. This implementation completed that confirmation and removal.

## 8. Responsive behavior

- Hero: target a clean first viewport at 390×844: eyebrow, headline, short body, primary CTA, secondary CTA, trial note, and the top of the demo. Avoid forced `<br>` on narrow widths.
- Product demo: reduce internal padding and type rather than scaling the whole UI into illegibility. Show one state at a time; no desktop multi-panel composite on mobile.
- Delegation: stack the two operating models, but keep each as a single compact row so the section does not become a long card stack.
- Capabilities: customer-request chips use horizontal snap scrolling on mobile with a visible continuation cue; the proof panel follows once.
- Control: proposal and action history stack in narrative order. Modes become three short rows, not full-height cards.
- Setup: keep only two setup states; cap animated stage height and expose direct tap controls.
- Pricing: Pro may appear first visually on mobile only if DOM/heading order remains understandable. Otherwise keep Starter then Pro and make the Recommended marker obvious.
- FAQ: full-width touch targets, visible focus, no content clipped when text size is increased.
- Navigation: 44px touch targets, body scroll lock while open, Escape handling, and focus return are required.
- Across the page: no text below 13px for meaningful content, no important information visible only on hover, and no decorative absolute element may create horizontal overflow.

## 9. Trust and social proof plan

### Trust available now

- Real supported product behavior demonstrated with clearly labeled demo data.
- Specific integration roles: customer messages, merchant approval, Shopify action.
- Default Ask first behavior and visible action history.
- Verified privacy statement about general-purpose model training.
- Organization-scoped access, encrypted stored credentials, signed webhooks, review/export/deletion paths.
- Transparent pricing and trial/card terms.
- Detailed public Security and Privacy pages.

### Social proof to collect

Nothing below should appear until the merchant approves public use and the underlying evidence is retained.

- A merchant quote describing the support task they stopped doing personally.
- A quote about approving a real order change from iMessage instead of opening a helpdesk.
- Before/after weekly count of repetitive customer conversations handled, with date range and definition.
- Number and percentage of conversations resolved without merchant work, with escalation definition.
- Median merchant approval time for refunds/order changes.
- A redacted real approval thread tied to a redacted Shopify result/action-history record.
- A mini case study: channels connected, starting weekly support load, workflows enabled, review period, what still escalated.
- Permissioned merchant logo and exact usage scope/date.

Avoid “hours saved” until time is measured or the quote is explicitly subjective. Avoid “trusted by” until the customer relationship and logo permission are documented.

## 10. Pricing changes

- Replace feature-gated Starter/Pro copy with the implemented volume-and-seat ladder.
- Starter: $19/month, 500 customer conversations/month, 1 seat, full supported product.
- Pro: $49/month, unlimited customer conversations, 2 seats, full supported product, **Recommended**.
- Define a customer conversation as a customer support thread opened in the monthly period; merchant/operator chats do not count.
- State 14-day trial and card collection at plan checkout.
- Do not claim no overages, included overages, automatic upgrades, prorated refunds, or cancellation timing. Those policies are not defined in repository copy/configuration.
- Add a factual question to the FAQ about what happens at the Starter allowance: incoming messages continue to be received, while Shopkeeper pauses planning once the workspace is over the limit. Keep the wording concise and avoid presenting a failure-open infrastructure detail.
- Before launch, verify both Stripe price IDs in Vercel and Railway. Until then, production may resolve plans as “unknown” and not enforce limits.

## 11. SEO improvements

- Homepage title direction: **Shopkeeper for Shopify — AI customer support that fixes the order**.
- Meta description: emphasize routine support, live Shopify work, and merchant approval through familiar channels; include the 14-day trial only if space remains.
- Add homepage canonical `/` using the existing metadata base.
- Keep Open Graph/Twitter metadata aligned; replace `/og.png` later if it shows an outdated interface or claim.
- Add SoftwareApplication structured data with product name, application category, operating system “Web,” and verified Starter/Pro offers. Do not add ratings or review fields.
- Add a sitemap containing only public marketing, legal, and substantive product pages. Keep dashboard/auth/API routes out.
- Existing robots rules already disallow `/dashboard/` and `/api/`; retain them.
- Maintain one H1, descriptive H2s, semantic sections, and real anchor text.
- Natural descriptive phrases: Shopkeeper for Shopify, AI customer support for Shopify stores, Instagram and email support, Shopify order changes, merchant approval. Do not keyword-stuff or insert competitor names into body copy.
- Future focused pages to consider after evidence/search research: Instagram customer support for Shopify; Shopify order-change automation; small-store alternative to managing a traditional helpdesk; Shopify refund approval workflows.

## 12. Performance and accessibility considerations

- Keep the primary demo rendered in HTML/CSS. Do not add a large video or animation dependency.
- Existing `motion` dependency is not needed for the homepage redesign; prefer CSS plus IntersectionObserver already in use.
- Pause loops while offscreen. Respect `prefers-reduced-motion` by showing a complete, understandable final state.
- Lazy-load below-fold photography and noncritical images through `next/image`; give hero media stable dimensions to avoid CLS.
- Keep atmospheric imagery decorative with empty alt text. Product figures need concise captions/labels; integration marks in labeled rows should have empty alt text to avoid duplicate names.
- Use semantic `<section>`, `<figure>`, `<ol>`, `<dl>`, `<details>`/button semantics where appropriate.
- Maintain visible keyboard focus, 44px mobile targets, correct `aria-expanded`/relationships for FAQ and navigation, and logical reading order.
- Ensure cream/stone text contrast remains readable over the textured background. Product screenshots/compositions should use solid surfaces behind text.
- Do not animate every section on entry. The workflow and setup sequences are sufficient.
- Test 320, 390, 768, 1024, and 1440px widths; keyboard-only nav/FAQ; reduced motion; 200% zoom; and no-JavaScript readability for core positioning/pricing.

## 13. Implementation sequence

1. Freeze verified product, plan, privacy, and integration facts in this document.
2. Recompose `page.tsx` around the revised narrative before refining individual styling.
3. Update Hero and HeroMedia presentation/copy; keep the existing reliable animation engine.
4. Build Delegation and Capabilities as large editorial compositions, not grids of interchangeable cards.
5. Revise ControlMoment and add a compact mode explanation.
6. Add Trust and reintroduce a shortened Onboarding section.
7. Correct Pricing and rebuild FAQ from buyer objections.
8. Rewrite the final CTA and refine navigation/footer anchors.
9. Add homepage metadata, canonical, structured data, and public sitemap if current routing permits.
10. Remove only landing components proven unused after the new page compiles.
11. Review at mobile and desktop sizes, reduced motion, keyboard focus, and enlarged text.
12. Run dashboard typecheck/lint/build plus focused unit tests; fix only issues introduced by this work.

## 14. Open questions and factual uncertainties

- Are `PRICE_ID_STARTER` and `PRICE_ID_PRO` provisioned in both the production dashboard and gateway? The code supports plan limits, but documented production setup still lists this as open.
- What exact cancellation timing is configured in the Stripe customer portal: immediate or end of billing period? The page should say “manage billing in the portal” until verified.
- Does the merchant receive any refund when cancelling, or are charges non-refundable? No public claim should be made until legal/billing policy is explicit.
- Is Instagram enabled for every production organization or only an allowlist? The code has a production feature flag and optional beta allowlist.
- Is TikTok Shop approved and enabled for public merchants? It is implemented behind a flag but not validated for the primary story.
- Should Shopify storefront chat be presented publicly now? The code exists, but it is not part of the integration catalog’s primary connection list and has setup constraints.
- Is Telegram intended to be a fully marketed merchant-control alternative or a secondary operational option? The product supports it, but iMessage is strategically clearer.
- Has the current Open Graph image been reviewed against the revised positioning and UI? Replace it only with an approved, current composition.
- Are export and deletion turnaround expectations defined? The product offers paths, but the homepage should not promise a service-level timeline.
- Which customer proof can be published, and who owns permission/evidence collection? None exists in the repository today.
- Should “unlimited” be the public word for Pro’s `null` conversation cap, or should pricing use “No conversation cap”? Both describe the current code; product/legal should choose the final wording.
- Should account creation remain separate from choosing a paid trial plan? The current flow allows signup/onboarding before Stripe checkout, so the page must avoid implying the card is collected at the first signup form.
