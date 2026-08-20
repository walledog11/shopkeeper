# Landing Page Media and Content Expansion Plan

**Status:** Proposed.
**Decision date:** 2026-08-19.
**Scope:** Marketing media, homepage messaging, and public-site information
architecture. This plan does not redesign the authenticated dashboard or change
the product roadmap.

## Objective

Make Shopkeeper look as capable as the product actually is.

The current landing page has a distinctive paper identity, but its visual proof
is slow, heavily simulated, and too small in scope. The public site describes a
helpful AI support assistant while the product is closer to a social-first
Shopify operator: it understands customer messages, builds auditable plans,
executes real Shopify work, asks the merchant when judgment is required, and
continues monitoring the outcome.

The finished marketing site should let a merchant understand that difference in
the first screen, see it happen within seconds, and explore the relevant workflow
in depth without forcing every buyer through one long homepage.

## Product and design decisions

1. **Keep the paper identity as a frame, not as the proof.** Warm paper, subtle
   grain, and sparse handwritten annotations remain recognizable brand elements.
   Product media itself should be crisp, high-contrast, and based on the real UI.
2. **Show actions, not feature labels.** A real order change followed by a real
   customer reply communicates more than an animated list of capabilities.
3. **Start with the outcome.** Every loop must show meaningful product behavior
   immediately and finish one story in eight seconds or less where practical.
4. **Use the real product.** Marketing captures come from a seeded demo workspace,
   not a parallel React recreation of chat and dashboard interfaces.
5. **Separate the four product layers.** Follow [product-truth.md](product-truth.md):
   customer-origin channels, merchant-control channels, Shopify as the system of
   action, and the dashboard as the setup/review/audit surface.
6. **Advertise product status honestly.** Live, private-beta, and pending
   integrations may all appear, but their state must be explicit. Pending
   channels remain roadmap work; they must not be presented as already available.
7. **Do not manufacture proof.** Customer logos, ratings, savings, resolution
   rates, and ticket-volume claims appear only after there is verifiable evidence.

## Current-state findings

### Media

- The hero film is 38.5 seconds long.
- Its icon introduction occupies roughly the first 4.7 seconds.
- The customer problem appears around 4.5 seconds, the approval sequence begins
  around 9 seconds, and the capability summary does not appear until 24 seconds.
- The film is a bespoke React reconstruction rather than a capture of the product.
- Several atmospheric images are documented in the components as placeholders.
- The film's channel montage includes channels whose launch state is not made
  clear in the asset.
- Below-the-fold demos rely on repeated chat bubbles, typing animations,
  IntersectionObserver reveals, and decorative timelines. They make the page
  longer without increasing confidence proportionally.

### Messaging

The homepage currently communicates these ideas reasonably well:

- after-hours replies;
- approval before consequential actions;
- a morning briefing;
- memory and Shopify context; and
- availability across multiple surfaces.

It does not clearly communicate the product's strongest implemented depth:

- Shopify address corrections;
- detailed fulfillment and tracking checks;
- refunds and cancellations;
- adding, removing, and swapping order items;
- returns and exchanges;
- gift cards and return labels;
- fulfillment with tracking;
- proactive delivery-exception monitoring;
- post-resolution follow-up;
- configurable autonomy, action limits, and audit trails;
- sales, support, and low-stock briefing data; and
- support analytics available through the operator.

The existing “Product” menu contains four homepage anchor links. It gives the
appearance of a large menu without providing the depth, search surface, or
buyer-specific explanation of real product pages.

## Message hierarchy

### Primary promise

**Shopkeeper is the AI operator that resolves customer requests by doing the
work in Shopify, with the merchant in control.**

This should replace “AI that answers messages” as the dominant mental model.

### Tier 1: differentiators

These deserve the homepage's strongest media and their own public pages.

1. **Shopify actions:** Shopkeeper does not merely draft an answer. It can update
   the order, create the return or exchange, issue approved compensation, attach
   the label, and send the confirmation.
2. **Phone-native control:** The merchant can approve, redirect, or instruct the
   operator through iMessage or Telegram without living in another inbox.
3. **Safe autonomy:** Plans, limits, approval tiers, escalation, and an audit
   trail make consequential automation understandable and controllable.
4. **Proactive operations:** Delivery exceptions, follow-up reminders, sales
   pulse, low-stock alerts, and morning briefings surface work before the merchant
   goes looking for it.

### Tier 2: supporting advantages

- Social-first customer intake, with Instagram strategically central.
- Gmail/email and storefront chat as customer-origin paths.
- Shopify-synced store knowledge and durable customer context.
- Brand voice learned from merchant instructions and examples.
- One support history across intake, action, approval, and review.
- Conversational support analytics for questions about volume, topics, channels,
  and resolution time.

### Tier 3: confidence and administration

- Review queue and activity history.
- Team access and presence.
- Integration health and reconnect states.
- Data export, retention, and workspace controls.
- Spam filtering and business hours.

These support conversion but should not displace the action story above the
fold.

## Media system

### Asset 1: hero proof loop

**Purpose:** Demonstrate the complete product loop before the visitor scrolls.

**Target length:** 8–10 seconds, silent and looping.

**Storyboard:**

| Time | Beat | Visual |
| --- | --- | --- |
| 0.0–1.0s | Customer request | Instagram or email: “I ordered M but need S.” |
| 1.0–2.5s | Context | Shopkeeper finds the customer and unfulfilled Shopify order. |
| 2.5–4.0s | Plan | “Swap M to S and confirm with Maya.” The exact affected order is visible. |
| 4.0–5.0s | Control | Merchant approves once from an iMessage card. |
| 5.0–7.5s | Execution | Shopify order updates; the customer confirmation is sent. |
| 7.5–9.0s | Outcome | Stable end frame: “One request. The order fixed. You approved once.” |

Requirements:

- The first frame already contains a recognizable customer request.
- A meaningful Shopify action is visible by 2.5 seconds.
- The result is visible by 7.5 seconds.
- The loop transition does not flash or jump.
- The asset uses actual product surfaces or captures, not a marketing-only UI.
- The story remains understandable with no audio.
- A static poster shows the strongest combined problem/action/result frame.

### Assets 2–5: workflow loops

Produce four modular 5–8 second loops. Each should demonstrate one job and be
usable on both the homepage and a dedicated page.

| Asset | Story | Product proof |
| --- | --- | --- |
| Resolve | Customer asks where an order is | Live tracking and a channel-native reply |
| Act | Customer requests an exchange or address correction | Real Shopify mutation and action log |
| Approve | A consequential action needs judgment | Phone approval, revision, or merchant answer |
| Monitor | A shipment stalls or the morning digest arrives | Proactive alert, proposed response, and follow-through |

Optional later assets:

- a return-label continuation after the merchant supplies the file;
- a conversational analytics question and answer;
- memory/brand-voice setup followed by a generated reply; and
- a multi-channel history resolving to one customer context.

### Static product compositions

Create still compositions for visitors with reduced motion and for sections
where animation does not add information. A composition may layer:

- the customer message;
- the action plan;
- the Shopify order context;
- the phone approval; and
- the completed activity-log entry.

Use one focal element at full contrast. Secondary surfaces should support it
through crop, scale, or depth rather than competing equally.

### Photography

Do not add more generic atmosphere photography. Choose one of these paths:

1. Commission one coherent, reusable set showing a real merchant environment:
   packing table, Shopify workspace, and phone-native control; or
2. Omit lifestyle photography until that set exists and use premium product
   compositions instead.

If photography is produced, establish a single art direction for lighting,
color temperature, wardrobe, props, and crop. One strong image can act as a
visual reset; repeated hazy washes cannot substitute for product proof.

### Capture and production workflow

1. Create a deterministic demo workspace with fictional customers, products,
   orders, policies, conversations, and action outcomes.
2. Write and approve the storyboard before recording.
3. Record the real product at high resolution with no production customer data.
4. Capture phone-control surfaces separately at native device scale.
5. Edit camera movement, zooms, timing, masks, and annotations in a motion/video
   editing workflow.
6. Review each asset once for product accuracy and once for visual quality.
7. Export web variants and posters.
8. Verify the encoded files in Chrome, Safari, Firefox, iOS Safari, and reduced
   motion mode before publishing.

Do not solve capture defects by rebuilding the product inside the marketing
page. Fix the seeded product state or the recording setup.

### Technical delivery targets

- Capture master: at least 1920 px wide; capture at 60 fps when possible.
- Web export: 30 fps unless 60 fps materially improves a specific interaction.
- Formats: WebM plus H.264 MP4 fallback.
- Hero transfer target: 4 MB or less, excluding the poster.
- Secondary-loop transfer target: 2 MB or less per loop.
- Posters and stills: responsive WebP/AVIF with explicit dimensions.
- Videos: `muted`, `playsInline`, looping, and free of audio dependency.
- Below-fold media: lazy-loaded and paused while offscreen.
- Reduced motion: show the poster or a static product composition.
- Product explanation and labels remain HTML; do not bake essential text into
  the video.

## Homepage structure

The homepage remains an overview. Its job is to establish the product category,
prove the core loop, expose breadth, and route visitors to deeper pages.

### 1. Hero

- Category line: “AI operator for Shopify merchants.”
- Headline focused on work completed, not messages generated.
- One concise subhead covering customer intake, Shopify action, and merchant
  control.
- Primary trial CTA and secondary product-demo CTA.
- New 8–10 second hero proof loop.

### 2. Evidence strip

Use only evidence available at launch:

- live integration marks;
- trial/setup facts;
- security or data-control facts that can be substantiated; and
- verified customer proof when it exists.

Do not fill this section with invented metrics or placeholder logos.

### 3. The complete operating loop

Explain one system in four steps:

`Customer asks → Shopkeeper understands → Merchant controls risk → Shopify work is completed`

Visually distinguish customer-origin, merchant-control, system-of-action, and
review surfaces.

### 4. Shopify action library

Replace generic capability prose with a compact, scannable grid:

- Track an order
- Correct an address
- Edit or swap an item
- Open a return
- Set up an exchange
- Issue an approved refund or gift card
- Attach a return label
- Fulfill an order

Each item links to the relevant product or use-case page. Only active actions
are presented as available.

### 5. Approval and autonomy

Use the phone-control loop. Explain trust levels, exact action previews, caps,
escalation, revision, and the audit trail. Avoid framing iMessage and Telegram
as customer-support inboxes.

### 6. Proactive operations

Use the monitoring loop. Cover delivery exceptions, post-resolution follow-up,
sales pulse, low stock, and morning briefing behavior. Make clear which messages
are drafts awaiting approval and which actions can run autonomously under the
merchant's rules.

### 7. Customer-origin channels

Show customer intake separately:

- Instagram;
- Gmail/email; and
- storefront chat.

Give each channel an accurate status label. Pending customer-origin channels may
be previewed as roadmap items, but should not be mixed into the live list.

### 8. Merchant-control channels

Show how the owner operates Shopkeeper:

- iMessage;
- Telegram; and
- dashboard review/fallback.

This is a differentiated product concept and should receive its own heading,
not be folded into a generic “every touchpoint” carousel.

### 9. Memory and voice

Explain Shopify knowledge sync, policies, customer history, brand voice, and
sample replies. Use a static before/after response or short product capture.

### 10. Pricing, FAQ, and CTA

Retain these conversion sections, but shorten decorative lead-ins and connect
FAQs to dedicated pages where a buyer needs deeper proof.

## Public-site information architecture

Do not copy a competitor's number of pages. Create pages when Shopkeeper has a
real workflow to explain, a useful media asset to show, and an accurate CTA.

### Initial release

| Navigation | Route | Page responsibility |
| --- | --- | --- |
| Product | `/product` | Full system overview and the four product layers |
| Product | `/product/shopify-actions` | Action library, safety rules, and workflow media |
| Product | `/product/approvals-and-autonomy` | Trust levels, phone approval, limits, escalation, audit |
| Product | `/product/proactive-monitoring` | Delivery watch, follow-ups, morning briefing, sales/stock pulse |
| Product | `/product/memory-and-voice` | Shopify sync, policies, customer context, and brand voice |
| Channels | `/channels` | Customer-origin versus merchant-control overview |
| Integrations | `/integrations` | Availability and setup expectations for each integration |
| Use cases | `/use-cases` | Index of concrete merchant jobs |
| Pricing | `/pricing` | Dedicated pricing, limits, and plan comparison |

The existing homepage pricing section may remain, but `/pricing` becomes the
canonical destination once the page exists.

### Second release

Add pages only as the corresponding capability and media are ready:

**Customer-origin channels**

- `/channels/instagram`
- `/channels/email`
- `/channels/storefront-chat`

**Merchant-control channels**

- `/control/imessage`
- `/control/telegram`

**Use cases**

- `/use-cases/order-tracking`
- `/use-cases/returns-and-exchanges`
- `/use-cases/order-changes`
- `/use-cases/after-hours-support`
- `/use-cases/delivery-exceptions`

**Supporting trust pages**

- `/security`
- `/changelog`
- documentation or help-center entry point when public documentation exists.

### Page template

Every product, channel, and use-case page should contain:

1. A job-specific promise.
2. One polished, unique product asset above the fold.
3. A three- to five-step workflow using real product behavior.
4. Exact supported actions and limitations.
5. Guardrails or merchant controls relevant to the workflow.
6. Integration/setup requirements.
7. An FAQ specific to the buyer's concern.
8. A trial CTA and a route to the broader product overview.

No navigation item should point to an empty, generic, or homepage-duplicated
page merely to make the site appear larger.

## Navigation model

Replace the anchor-only Product menu after the initial public pages exist.

Suggested desktop groups:

- **Product:** Shopify Actions, Approvals & Autonomy, Proactive Monitoring,
  Memory & Voice.
- **Channels:** Customer Channels, iMessage Control, Telegram Control,
  Integrations.
- **Use Cases:** Order Tracking, Returns & Exchanges, Order Changes, After-Hours
  Support.
- **Resources:** Security and Changelog when ready.
- **Pricing:** direct link.

On mobile, preserve the same conceptual grouping rather than flattening all
items into one undifferentiated list.

## Delivery phases

### Phase 0 — product-truth reconciliation

- Inventory every claim, channel, action, number, and integration on the current
  marketing site.
- Assign each a status: active, gated/private beta, pending, retired, or
  unsupported.
- Remove contradictions between the hero film, homepage copy, pricing copy,
  integration UI, and [product-truth.md](product-truth.md).
- Approve the primary promise and terminology for customer-origin versus
  merchant-control channels.

**Exit gate:** Every public claim maps to a product owner, implementation, and
accurate availability state.

### Phase 1 — media foundation

- Build the seeded demo workspace and reset procedure.
- Produce the hero proof loop, poster, and mobile crop.
- Produce Resolve, Act, Approve, and Monitor loops.
- Create a small set of static product compositions.
- Define asset naming, storage, versioning, and compression conventions.

**Exit gate:** The five core assets pass product-accuracy, visual-quality,
browser, performance, mobile-crop, and reduced-motion review.

### Phase 2 — homepage reconstruction

- Replace the current hero film.
- Reorder the homepage around the complete operating loop and Shopify actions.
- Separate customer channels from merchant-control channels.
- Add the action library and proactive-operations section.
- Remove repeated or decorative animations that do not add proof.
- Keep paper styling restrained around the new media.

**Exit gate:** A new visitor can state what Shopkeeper does, how it differs from
an AI helpdesk, and when the merchant stays in control after reviewing the hero
and next two sections.

### Phase 3 — initial public pages and navigation

- Ship `/product` and the four initial product detail pages.
- Ship `/channels`, `/integrations`, `/use-cases`, and `/pricing`.
- Convert the Product mega-menu from hash links to real routes.
- Add page-specific metadata, canonical URLs, Open Graph images, and internal
  links.

**Exit gate:** Every navigation link resolves to a complete page with unique
content, at least one relevant product asset, accurate availability, and a CTA.

### Phase 4 — channel and use-case depth

- Produce channel-specific and use-case-specific assets.
- Ship second-release pages only when the corresponding product path is ready.
- Add real merchant proof as evidence becomes available.
- Use search and conversion data to decide which additional pages deserve
  investment.

**Exit gate:** New pages exist because they answer a distinct buyer question,
not because a competitor has a larger menu.

## Acceptance criteria

### Product comprehension

- The hero describes Shopkeeper as an operator that completes Shopify work.
- The first product result appears within three seconds of hero playback.
- Customer-origin and merchant-control channels are never conflated.
- Shopify is visibly the system of action, not a logo in an integration row.
- The site demonstrates at least one read, one write, one approval, and one
  proactive-monitoring workflow.

### Media quality

- Core assets use real product captures from fictional demo data.
- No core proof depends on typing dots, emoji capability cards, or a simulated
  chat interface built only for marketing.
- Motion has one focal point and consistent timing.
- Every video has a deliberate poster and a reduced-motion fallback.
- Mobile crops preserve the action, approval, and result rather than shrinking a
  desktop composition until it is unreadable.

### Accuracy

- Availability labels match product/runtime status.
- Pending integrations are framed as planned work, not silently removed and not
  represented as live.
- Retired actions do not appear as current capabilities.
- No unverified customer logo, rating, compliance label, performance number, or
  ROI claim appears.

### Performance and accessibility

- The hero poster is available immediately and the video does not block the
  page's largest-contentful render.
- Below-the-fold videos do not download eagerly.
- All essential meaning exists in adjacent HTML copy.
- Videos are understandable without sound.
- Reduced-motion visitors receive an equivalent static explanation.
- Media controls and links remain keyboard accessible.

### Information architecture

- The Product menu no longer consists only of homepage anchors.
- Every indexed page has a unique buyer question, media asset, workflow,
  limitations, and CTA.
- Homepage sections route visitors to deeper pages instead of duplicating their
  full contents.
- Page and navigation terminology follows the four-layer product model in
  [product-truth.md](product-truth.md).

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Recorded UI becomes stale | Keep assets short and modular; store the seed scenario and capture instructions with the asset source. |
| Marketing gets ahead of rollout state | Require product-status review before every export and release. |
| More pages create thin content | Do not publish a route until it has a distinct workflow, asset, limitations, and CTA. |
| Video hurts page speed | Use posters, transfer budgets, responsive sources, lazy loading, and offscreen pause. |
| Paper styling still competes with proof | Apply grain and handwriting to framing/annotations only; keep product media clean. |
| Captures expose real data | Use a dedicated fictional workspace and include a PII review in the export checklist. |
| One long asset becomes expensive to update | Prefer four to eight-second workflow modules over a monolithic brand film. |

## Definition of done

This plan is complete when:

- the original 38.5-second simulated hero film is no longer the primary product
  proof;
- the homepage shows the real intake → plan → approval → Shopify action → reply
  loop above the fold;
- real product media demonstrates the action, approval, and proactive-monitoring
  differentiators;
- customer-origin and merchant-control channels are clearly separated;
- the implemented Shopify action breadth is visible and accurately scoped;
- the initial public product, channel, integration, use-case, and pricing pages
  are live with route-based navigation; and
- all published media and claims pass accuracy, performance, accessibility, and
  responsive review.
