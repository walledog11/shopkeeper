# Website chat

Merchants open **Chat** directly in the main navigation at `/dashboard/chat`.
The previous integration URL redirects here. The page has an enable switch,
**Save changes**, and a live preview alongside two tabs:

- **Appearance:** upload or remove a picture, name, color, button style and text,
  bottom left/right placement, and computers/phones.
- **Messages:** welcome message, subtitle, and up to six individual suggested
  questions with add/remove controls.

Spacing and picture sizing are automatic. The preview uses the real widget,
with computer/phone and open-chat/button views. On smaller screens, merchants
switch between **Edit** and **Preview**. Preview messages never leave the frame.

Only workspace admins can upload pictures, save settings, or enable chat.
**Discard** restores saved settings. Saving does not enable the channel; the
same page provides its enable switch and a link to Shopify's theme editor.
The platform service, Shopify permissions, and saved theme app embed must be
ready before chat can appear on a storefront.

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
Saved dashboard settings then apply across themes.

## Shared UI and preview

`extensions/shopkeeper-chat/assets/shopkeeper-tokens.css` defines the Paper
colors, typography, radii, and borders used by the dashboard and widget.
Widget styling lives in `shopkeeper-chat.css`. General Sans uses the same
Fontshare stylesheet as the app, with a system-font fallback.

The authenticated preview route serves the exact extension JavaScript and styles
in a sandboxed frame. It uses the middleware script nonce and includes the assets
in Next.js output tracing. Messages, verification, and conversation samples are
local to the frame: no shopper sessions, AI calls, polling, or verification emails.
The frame accepts settings only from its parent window. Image and font loads
are allowed; other network calls are blocked.

## Verification and release

```sh
npm run test:unit -w apps/dashboard -- src/lib/storefront-chat/widget-configuration.test.ts src/lib/storefront-chat/widget-conversation-boundary.test.ts src/proxy/path-access-policy.test.ts
npm run test:integration -w apps/dashboard -- src/app/api/integrations/shopify/storefront-chat/configuration/route.integration.test.ts src/app/api/integrations/shopify/storefront-chat/image/route.integration.test.ts src/app/api/integrations/shopify/storefront-chat/route.integration.test.ts
npm run typecheck -w apps/dashboard
npm run build -w apps/dashboard
```

Browser checks exercise a real picture upload and public delivery, live preview,
save/reload, enable/disable, picture removal/discard, questions, placement, device
visibility, mobile layouts, and the old URL redirect. Current screenshots and
results are in `artifacts/chat-editor-rework/`.

Deploy the dashboard before releasing the Shopify extension; the launcher needs
the configuration endpoint. Release Liquid, JavaScript, and both CSS assets
together, then verify on a development storefront.
