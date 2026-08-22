# Landing Page Media Runbook

**Status:** Active

**Last updated:** 2026-08-21

**Applies to:** The verified product media specified in
[landing-page-media-and-content-plan.md](landing-page-media-and-content-plan.md).

## Non-negotiable source rule

Every product asset starts with a real Shopkeeper path in an owned Shopify
development store. Fictional data is required. A capture is not evidence merely
because it looks like the product: the customer request must enter through the
named intake provider, Ask first must pause the mutation, the shown merchant
approval must resume it, Shopify must change, the customer reply must send, and
the same execution must appear in the action log.

Do not recreate a missing state in a marketing component. Fix or reset the
fixture, run the workflow again, and capture the real surface.

## Fixture

The fixture command has two modes:

```bash
# Read-only inspection. Select the store explicitly whenever more than one
# usable Shopify integration exists.
SHOPKEEPER_DB_TARGET=prod npm run landing:media:fixture -- \
  --shop=owned-development-store.myshopify.com

# Reset. This writes only after both the stored Shopkeeper integration and the
# setup credential independently identify the same development store.
SHOPKEEPER_DB_TARGET=prod npm run landing:media:fixture -- \
  --execute \
  --shop=owned-development-store.myshopify.com \
  --location-id=gid://shopify/Location/REPLACE_ME
```

Execute mode needs a separate development-store setup app with
`read_locations`, `write_customers`, `write_inventory`, `write_orders`, and
`write_products`.
Provide either:

```text
LANDING_MEDIA_SHOPIFY_ACCESS_TOKEN
```

or short-lived client-credentials configuration:

```text
LANDING_MEDIA_SHOPIFY_CLIENT_ID
LANDING_MEDIA_SHOPIFY_CLIENT_SECRET
```

Do not add product or inventory write scopes to Shopkeeper's merchant-facing
OAuth grant for this fixture. The separate setup app exists so fixture
administration cannot broaden production product access.

Load setup credentials from an approved secret manager directly into the
process environment. Do not commit them, paste them into commands, or use a CLI
export command in a recorded terminal: some Shopify CLI versions print the
secret after writing the env file. Rotate a setup-app secret immediately if it
appears in terminal or CI output.

On a successful reset the command:

1. verifies the target is an owned Shopify development store;
2. selects one explicit active fulfillment location;
3. deletes only prior **test** orders carrying both media-fixture ownership
   markers;
4. upserts the dedicated Linen Jumpsuit product and resets Medium / Sand to 8
   and Small / Sand to 12;
5. creates synthetic Maya Chen and paid, unfulfilled test order `#3102`;
6. sets the workspace to Ask first, mutation auto-execution off, and a $50
   refund cap without dropping unrelated settings;
7. writes the same-price, pre-fulfillment swap policy to the workspace;
8. reads the result back through Shopkeeper's ordinary integration; and
9. writes `artifacts/landing-media/fixture-manifest.json` with the current IDs,
   Shopify Admin links, dashboard capture routes, and seeded request.

The reset intentionally does not delete Instagram conversations, iMessages,
plan executions, or action-log rows. Those records are the evidence. Use the
new test order produced by each reset and retain the manifest beside the
capture take.

### Verified baseline (2026-08-21)

The reset was exercised twice against the owned `palette-dev` Shopify
development store using its explicit `Shop location`. The second run removed
only the prior owned test order, recreated order `#3102`, and read the complete
fixture back through Shopkeeper's normal integration. The resulting manifest
reports:

- Linen Jumpsuit, Medium / Sand: 8 available;
- Linen Jumpsuit, Small / Sand: 12 available;
- synthetic order `#3102`: paid, unfulfilled, and `test: true`; and
- workspace: Linen & Loom, Ask first, automatic mutation off, $50 refund cap.

The production readiness audit found the Shopify storefront widget enabled and
one iMessage operator binding for this workspace. It found no Instagram
integration, so the named Instagram intake path and the complete proof loop
remain blocked until a test Instagram account is connected and its webhook is
verified. Do not substitute storefront chat and describe it as Instagram.

## Capture sequence

Create one take directory from the manifest timestamp:

```text
artifacts/landing-media/takes/20260821T184500Z/
  fixture-manifest.json
  provenance.json
  raw/
  edit/
  export/
```

Then run the complete story in this order:

1. Confirm the manifest reports `test: true`, `PAID`, and `UNFULFILLED`.
2. Send the seeded request from the connected Instagram test account.
3. Capture the readable customer message at native mobile scale.
4. Capture the dashboard after order, fulfillment, policy, price, and inventory
   context have resolved.
5. Capture the proposed M → S change with Approval required visible.
6. Capture the native iMessage approval. Crop away unrelated conversations,
   notifications, carrier details, Apple IDs, and contact data.
7. Capture Shopify before approval and after Small / Sand is committed.
8. Capture the sent Instagram response.
9. Capture the completed action-log row and detail. Its approver, order, tool,
   time, and result must match the run.
10. Save the fixture manifest and provenance sidecar before editing.

If any leg fails, discard that take. Do not splice a state from another run
into the proof loop.

## Provenance sidecar

Every take and published workflow gets a `provenance.json` containing:

```json
{
  "workflow": "order-swap",
  "fixtureManifest": "fixture-manifest.json",
  "capturedAt": "2026-08-21T18:45:00Z",
  "sourceCommit": "full-git-sha",
  "dashboardDeployment": "full-git-sha",
  "gatewayDeployment": "full-git-sha",
  "shopifyAppVersion": "shopkeeper-production-N",
  "intake": "instagram-test-account",
  "merchantControl": "imessage-test-line",
  "syntheticDataOnly": true,
  "review": {
    "productAccuracy": null,
    "pii": null,
    "licensing": null,
    "accessibility": null,
    "browser": null,
    "performance": null
  }
}
```

Use fingerprints or role labels for provider accounts, not phone numbers,
emails, access tokens, webhook secrets, or customer identifiers.

## Naming and versions

Published filenames use:

```text
lp-{workflow}-{surface}-{state}-v{NN}-{width}x{height}.{ext}
```

Examples:

```text
lp-order-swap-composite-loop-v01-1440x1080.webm
lp-order-swap-composite-loop-v01-1440x1080.mp4
lp-order-swap-composite-poster-v01-1440x1080.avif
lp-order-swap-dashboard-approved-v01-1440x900.webp
lp-order-swap-imessage-approval-v01-390x844.webp
```

- Increase `vNN` whenever pixels, timing, crop, annotations, or source product
  state change.
- WebM, MP4, posters, and responsive stills from the same edit share a version.
- Never overwrite a published version. Update code to the new URL, verify it,
  and retire the old object only after the release is stable.
- Do not put dates, customer names, mutable order numbers, `final`, or `new` in
  public filenames.

## Storage

- `artifacts/landing-media/` is local scratch and is not committed. Raw captures,
  manifests, edit projects, and review exports live here during production.
- Editable masters must be copied to an access-controlled team archive using
  `landing-media/{workflow}/vNN/` before release. Until that archive copy exists,
  the asset is not release-ready.
- Small posters and stills required for first render may be committed under
  `apps/dashboard/public/marketing/landing-media/{workflow}/vNN/`.
- Video delivery assets go to the `shopkeeper-landing-assets` Blob store under
  `landing-media/{workflow}/vNN/`. Upload versioned object names; do not reuse
  the legacy unversioned `demo-film.mp4` path.
- Only synthetic, PII-reviewed exports may enter the public directory or Blob
  store. Raw device captures never do.

## Master and export settings

Capture desktop at 1440×900 or larger and phone at a current 390 px CSS
viewport. Prefer a 1920 px-or-wider 60 fps master; deliver at 30 fps unless the
extra frames materially improve a state change.

Reference video exports:

```bash
# H.264 fallback
ffmpeg -i master.mov -an -vf "fps=30,scale=1440:-2:flags=lanczos" \
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart \
  lp-order-swap-composite-loop-v01-1440x1080.mp4

# WebM primary
ffmpeg -i master.mov -an -vf "fps=30,scale=1440:-2:flags=lanczos" \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 \
  lp-order-swap-composite-loop-v01-1440x1080.webm
```

Tune CRF or dimensions until the hero is at most 4 MB and each secondary loop
is at most 2 MB. Do not cut required proof merely to meet the byte budget.

Export posters and responsive stills as AVIF and WebP with explicit intrinsic
dimensions. Keep the strongest problem/action/result state readable at 390 px.

## Publication gate

Before changing the homepage media source, confirm all of the following:

- Product: the same run connects intake, approval, mutation, reply, and log.
- Privacy: only the approved synthetic customer and store data remain.
- Licensing: fonts, logos, annotations, and any audio or photography are cleared.
- Accessibility: HTML carries the explanation; the asset has a useful poster and
  accessible name; reduced motion receives a still.
- Playback: muted, inline, no audio dependency, no autoplay dependency, and no
  flashing loop boundary.
- Loading: below-fold video is lazy and pauses offscreen.
- Browsers: Chrome, Safari, Firefox, and iOS Safari pass.
- Layout: desktop 1440 px and mobile 390 px crops pass without hover.
- Performance: hero and secondary byte budgets pass on a mid-range mobile
  device and throttled network.

Record the six review decisions in the provenance sidecar. A blank or `false`
decision blocks publication.
