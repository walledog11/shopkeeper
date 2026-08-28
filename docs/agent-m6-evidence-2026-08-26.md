# Milestone 6 evidence — degraded tier — 2026-08-26

Evidence for Milestone 6 slices in
[AGENT_AUDIT.md](../AGENT_AUDIT.md). The degraded tier is
**complete (pre-user close)** as of 2026-08-26. Attachment vision for email and
TikTok (alongside Instagram) is **complete (pre-user close)** as of 2026-08-26.
Full-tier carrier monitoring remains open.

> **Superseded in part, 2026-08-26.** Everything below about shipment and carrier
> tracking — the degraded tier, the full-tier provider seam, the delivery-exception
> monitor, and the `ShipmentWatch` table — describes code that has since been
> **deleted from the product**. It is kept as the dated record of what shipped and
> why, not as a description of the current system. The attachment-vision sections
> remain accurate. See [Removed capabilities](../AGENT_AUDIT.md#3-removed-capabilities).

## Outcome target

USPS and carriers without a validated aggregator use Shopify fulfillment fields
only. Proactive stall and exception detection must never claim carrier scan
history, and merchant-facing approval plans must cite Shopify's fulfillment
record.

## What shipped

### Agent — `@shopkeeper/agent/shopify/shipment-tracking`

| Export | Purpose |
|---|---|
| `DEGRADED_STALL_AFTER_MS` | Six-day stall window for degraded tier |
| `buildShopifyDegradedTrackingSnapshot` | Maps Shopify fulfillment fields into `ShipmentTrackingSnapshot` without inventing carrier events |
| `resolveShipmentTrackingTier` | USPS → degraded; UPS/FedEx → full only when a provider is configured |
| `resolveShipmentTracking` / `createShipmentTrackingResolver` | Routes shipments through degraded or full-tier lookup |

### Agent — order shipment extraction

`listRecentShippedOrderShipments` / `extractShipmentsFromOrders` now return
`shipmentStatus`, `statusUpdatedAt`, and `fulfillmentCreatedAt` for degraded
stall detection.

### Agent — notification copy

`formatDeliveryExceptionNotification` and `classifyShipmentAlert` handle Shopify
`failure` statuses and degraded stall wording.

### Gateway — delivery-exception monitor

- Re-registered hourly maintenance job behind `DELIVERY_EXCEPTION_MONITOR_ENABLED`.
- Uses `createShipmentTrackingResolver(null)` — no paid carrier API on the degraded path.
- Passes `DEGRADED_STALL_AFTER_MS` into `classifyShipmentAlert` for `shopify_degraded` source.
- `buildDeliveryExceptionInstruction` and operator notifications cite Shopify limits when `trackingSource === 'shopify_degraded'`.

### Runtime flag

`DELIVERY_EXCEPTION_MONITOR_ENABLED` (dashboard runtime flags + gateway
`runtime-config.ts`). Rollback: set flag false or omit monitor registration.

## Deterministic coverage

| Suite | What it proves |
|---|---|
| `packages/agent/src/shopify/shipment-tracking.test.ts` | Tier routing, degraded snapshot shape, six-day stall via `classifyShipmentAlert` |
| `packages/agent/src/shopify/shipment-alerts.test.ts` | Shopify failure exceptions, degraded notification copy |
| `packages/agent/src/shopify/orders.shipment-watch.test.ts` | Fulfillment timestamp extraction |
| `apps/gateway/src/maintenance/delivery-exception-monitor.unit.test.ts` | Monitor flag, integration sweep filters, degraded push wiring |
| `apps/gateway/src/maintenance/delivery-exception-plan.test.ts` | Degraded instruction + approval notification copy |
| `apps/gateway/src/maintenance/delivery-exception-degraded.test.ts` | **Acceptance** — real resolver + classifier through monitor → planner instruction + watch row |

Run:

```bash
cd packages/agent && npm run test:unit -- src/shopify/shipment-tracking.test.ts src/shopify/shipment-alerts.test.ts src/shopify/orders.shipment-watch.test.ts
cd apps/gateway && npm run test:unit -- src/maintenance/delivery-exception-monitor.unit.test.ts src/config/runtime-config.unit.test.ts
cd apps/gateway && npm run test:integration -- src/maintenance/delivery-exception-degraded.test.ts src/maintenance/delivery-exception-plan.test.ts
```

## Acceptance status (degraded tier)

| Criterion | Status |
|---|---|
| Six-day degraded USPS stall produces grounded status citing Shopify, not carrier scans | **Met** — `delivery-exception-degraded.test.ts` exercises monitor → instruction → `plan_pushed` watch |
| Degraded acceptance without paid carrier API key | **Met** — resolver uses Shopify fulfillment fields only |
| Delivered-but-disputed stays reactive | **Met** — `buildShopifyDegradedTrackingSnapshot` returns null for `delivered`; monitor does not open proactive plans |
| Deterministic unit/integration coverage for degraded path | **Met** — suites above |

## Completion gate (pre-user, degraded tier)

| Gate | Evidence |
|---|---|
| Outcome | Degraded USPS stall/exception uses Shopify fulfillment only; copy never claims carrier scans |
| Compatibility | No persisted-shape migration; additive watch rows only |
| Deterministic coverage | Agent unit + gateway unit/integration suites (including acceptance test) |
| Model evidence | None owed — no planner prompt, tool schema, or model pin change on this slice |
| Production canary | Deferred pre-user — acceptance integration test substitutes |
| Rollback | `DELIVERY_EXCEPTION_MONITOR_ENABLED=false` or revert monitor registration |
| Documentation | This report and [AGENT_AUDIT.md](../AGENT_AUDIT.md) |

## Still open (Milestone 6)

- Full-tier UPS/FedEx provider behind `FullTierCarrierTrackingProvider` (after API verification).
- Full-tier acceptance criterion (normalized carrier events when provider configured).

## Attachment vision (2026-08-26)

### What shipped

- `@shopkeeper/agent/image-attachments` — `shouldHydrateAgentMessageImages` for `ig_dm`, `email`, and `tiktok`.
- `buildContext` hydrates private blob attachments on all three channels (not only Instagram).
- Gateway `tiktok-shop-media.ts` — bounded download from TikTok-owned HTTPS hosts into private blob via `uploadInboundAttachment`.
- Gateway `channels.ts` — TikTok inbound stores images as `blob:attachments/...` with `[TikTok image attachment]` placeholder text.
- Gateway `delivery-exception-plan.ts` — proactive planner instructions cite active merchant shipping/compensation preferences (preferences also inject via `buildContext`).

### Deterministic coverage

| Suite | What it proves |
|---|---|
| `packages/agent/src/image-attachments.test.ts` | Channel routing for hydration |
| `packages/agent/src/context-images.integration.test.ts` | Email + TikTok + Instagram hydration through `buildContext` |
| `packages/agent/src/prompting.test.ts` | Untrusted boundaries + image blocks for emailed damage photo |
| `packages/agent/src/planner.test.ts` | Hydrated email images reach capture-mode planning |
| `apps/gateway/src/clients/tiktok-shop-media.unit.test.ts` | TikTok CDN allowlist + bounded download |
| `apps/gateway/src/worker-inbound-tiktok-shop.test.ts` | TikTok inbound persists private blob refs |

Run:

```bash
cd packages/agent && npm run test:unit -- src/image-attachments.test.ts src/prompting.test.ts
cd packages/agent && npm run test:unit -- src/planner.test.ts -t hydrated
cd packages/agent && npm run test:integration -- src/context-images.integration.test.ts
cd apps/gateway && npm run test:unit -- src/clients/tiktok-shop-media.unit.test.ts
cd apps/gateway && npm run test:integration -- src/worker-inbound-tiktok-shop.test.ts
```

### Acceptance status (attachment vision)

| Criterion | Status |
|---|---|
| Emailed damage photo reaches the model | **Met** — `context-images.integration.test.ts` + `planner.test.ts` |
| Instruction-shaped text cannot bypass untrusted boundaries beside images | **Met** — `prompting.test.ts` defang + untrusted guidance |
| TikTok images hydrate like Instagram | **Met** — inbound blob persistence + `buildContext` integration test |
| Merchant preferences on proactive delivery remedies | **Met** — instruction text + existing `buildContext` preference injection |
