# Website chat

Merchants open **Chat** directly in the main navigation at `/dashboard/chat`.
The previous integration URL redirects here. The main form contains a picture,
brand color, and welcome message. **More options** contains the chat name, short
description, button style and text, placement, devices, and suggested questions.
Shopify integration settings link here instead of duplicating configuration.

Spacing and picture sizing are automatic. The preview uses the real widget,
with computer/phone views and its working launcher. On smaller screens, merchants
switch between **Customize** and **Preview**. Preview messages never leave the frame.
The preview fits both the available width and height; editing appearance preserves
its conversation, verification inputs, and open/closed state.

Only workspace admins can upload pictures, save settings, or enable chat.
**Discard** restores saved settings. **Save changes** does not enable the channel;
**Save and turn on** saves the displayed design before enabling it. A failed save
leaves chat off. **Finish setup in Shopify** opens the theme editor. Enabled in
Shopkeeper does not claim that the theme embed is installed or currently visible.
The platform service, Shopify permissions, and saved theme app embed must be
ready before chat can appear on a storefront.

Setup checks load separately from the editor. Saves preserve edits made while a
request is pending. Drafts survive navigation in tab-local session storage scoped
to the workspace and integration; stale drafts require reloading saved settings
before publishing. Save, setup, and upload requests have bounded timeouts.

## Pictures

The file picker and drag/drop accept JPG, PNG, and WebP up to 10 MB. The browser
fits the full image within 512 × 512 before upload; the server independently
validates the image, limits the input, normalizes it to WebP, and strips metadata.
No cropping or size controls are required.

Uploads use the existing Vercel Blob store (`BLOB_READ_WRITE_TOKEN`). Files live
at `attachments/{organizationId}/chat-images/{imageId}.webp`, so workspace deletion
also removes unused chat pictures. Uploading stages a picture; it does not change
the live chat until settings are saved. Removing a picture from a draft does not
break the current published image.

Only these normalized brand pictures are publicly readable through
`/api/storefront-chat/images/{organizationId}/{imageId}`. The route accepts UUIDs
and constructs a fixed storage path; private message attachments remain private.
Settings store a relative image reference scoped to the uploading workspace.
The signed config endpoint resolves it against `APP_URL` so storefront images
load from the dashboard's origin. Existing HTTPS logo references remain valid.

## Settings and storefront delivery

The active Shopify integration stores settings in
`metadata.storefrontChat.configuration`, with `schemaVersion`, `revision`,
`publishedAt`, and a validated `settings` object. Saving compares the revision
and previous metadata to prevent concurrent overwrites. Other metadata and
the enabled flag are preserved. No database migration is required.

The widget fetches `/apps/shopkeeper-chat/config` through Shopify's signed app
proxy before mounting. This returns public presentation and availability only,
without creating a shopper session. Responses are not cached. The widget stays
hidden if configuration cannot be loaded or chat is disabled.

Until the first dashboard save, existing Liquid settings remain the fallback.
The editor starts with defaults and explains that saving replaces theme settings.
Saved dashboard settings then apply across themes. Legacy theme fields keep their
IDs and values but are hidden; the theme editor links to Website chat instead.

## Shared UI and preview

`extensions/shopkeeper-chat/assets/shopkeeper-tokens.css` defines the Paper
colors, typography, radii, and borders used by the dashboard and widget.
Widget styling lives in `shopkeeper-chat.css`. General Sans uses the same
Fontshare stylesheet as the app, with a system-font fallback.

The authenticated preview route serves the exact extension JavaScript and styles
in a sandboxed frame. It uses the middleware script nonce and includes the assets
in Next.js output tracing. Messages, verification, and conversation samples are
local to the frame: no shopper sessions, AI calls, polling, or verification emails.
The frame accepts settings only from its parent window. Its startup handshake
also handles cached frames that load before React. Updates are coalesced per
animation frame. Fonts load after the preview becomes interactive. Local form
events are allowed; CSP blocks form navigation and network calls other than images
and fonts.

## Verification and release

```sh
npm run test:unit -w apps/dashboard -- src/components/storefront-chat/useChatEditor.unit.test.tsx src/lib/storefront-chat/widget-configuration.unit.test.ts src/lib/storefront-chat/widget-conversation-boundary.unit.test.ts src/proxy/path-access-policy.unit.test.ts
npm run test:integration -w apps/dashboard -- src/app/api/integrations/shopify/storefront-chat/configuration/route.test.ts src/app/api/integrations/shopify/storefront-chat/image/route.test.ts src/app/api/integrations/shopify/storefront-chat/route.test.ts
npm run typecheck -w apps/dashboard
npm run build -w apps/dashboard
```

The browser regression in `e2e/chat-preview.spec.ts` uses native form submission
and checks conversation/draft preservation, short desktop windows, and repeated
phone preview switching. Save/reload, activation, upload, and conflict recovery
are also covered by the focused suites and browser walkthroughs.

Deploy the dashboard before releasing the Shopify extension; the launcher needs
the configuration endpoint. Release Liquid, JavaScript, and both CSS assets
together, then verify on a development storefront.
