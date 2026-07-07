# TikTok Shop Customer Service API Spike

## Summary

TikTok is strategically important for Shopkeeper, but generic TikTok DMs and TikTok Shop buyer messages must be treated as different products.

The current repository does not contain a real TikTok customer-message adapter. TikTok appears in enums, labels, tests, and help/strategy content, but no production OAuth flow, webhook handler, sync worker, or outbound dispatcher was found.

## Current Repository State

Relevant files:

- `packages/db/prisma/schema.prisma`: `ChannelType` includes `tiktok`.
- `packages/agent/src/thread-constants.ts`: `CHANNEL_TYPE.TIKTOK` exists.
- `apps/dashboard/src/lib/messaging/channels.ts`: TikTok appears as a dashboard channel type.
- `apps/dashboard/src/lib/messaging/dispatch-message.ts`: dispatch only supports Instagram, email, and Shopify email fallback; unsupported channels throw.
- `apps/dashboard/src/app/api/messages/route.test.ts`: includes an unsupported TikTok dispatch test.
- `apps/dashboard/src/app/dashboard/_components/help/content/tips.ts`: contains TikTok strategy/help content, but this is not an implementation.

## Official TikTok Shop Docs Check

The public TikTok Shop Partner docs entry point is:

- `https://partner.tiktokshop.com/docv2`

The public docs shell loads a dynamic JavaScript application. The public bundle references documentation APIs such as document tree/search/detail, API metadata, open scopes, authorization packages, app review, and app authorization flows. Direct unauthenticated attempts to retrieve specific Customer Service API documentation did not return stable public API documentation.

Conclusion: exact Customer Service API endpoint names, scopes, webhook event names, regions, and approval requirements must be verified manually inside TikTok Shop Partner Center or through an approved partner account.

## What Must Be Verified

Customer Service API overview:

- Confirm that the TikTok Shop Customer Service API is available for the target region, especially US merchants.
- Confirm whether it is generally available to third-party SaaS apps or limited to approved partners.

Conversation APIs:

- Whether there is an API to list buyer conversations.
- Whether there is an API to fetch conversation metadata and unread state.
- Whether conversations are scoped per seller, shop, region, or app authorization.

Get conversation messages:

- Whether an API exists to fetch message history for a buyer conversation.
- Pagination, retention windows, attachment support, and rate limits.
- Whether message payloads include order, product, buyer, and seller identifiers.

Send message:

- Whether third-party apps can send buyer-service replies.
- Whether replies support text only or also images/files/product cards/order cards.
- Whether there are response-window or policy limits.

Webhook/event support:

- Whether new buyer messages are delivered by webhook.
- Event names, retry semantics, signature verification, and payload shape.
- Whether polling is required if no webhook exists.

Seller authorization:

- OAuth/authorization flow for each seller.
- Required scopes or authorization packages.
- Token expiry and refresh behavior.
- Whether multi-shop merchants need multiple authorizations.

Partner/app approval:

- App review requirements.
- Partner approval requirements.
- Whether a multi-merchant SaaS can request the required messaging scopes.
- Sandbox availability and test-buyer tooling.

## Difference From Generic TikTok DMs

Generic TikTok DMs are creator/account-level social messages. TikTok Shop buyer messages are commerce-support conversations tied to a seller/shop context. Shopkeeper should not assume that access to one implies access to the other.

For V1/V1.5, TikTok Shop buyer messaging is the more relevant commerce support target. Generic TikTok DMs should remain deferred until public API feasibility is proven.

## Recommended Integration Shape If Feasible

- Add a dedicated integration identity for TikTok Shop buyer messaging rather than overloading generic `tiktok` semantics.
- Seller authorizes Shopkeeper through TikTok Shop Partner authorization.
- New buyer message webhook or polling worker normalizes the event into `Thread` and `Message`.
- Customer platform id should represent the buyer/conversation id, not a generic social handle unless the API guarantees it.
- Dispatch adapter sends approved replies through the TikTok Shop Customer Service send-message API.
- Shopify context remains the system-of-action context unless TikTok Shop order context is also available and explicitly modeled.

## Recommended Fallback

If TikTok Shop messaging access is unavailable or approval is too slow:

- Do not market TikTok as an automated customer-origin channel.
- Label TikTok as a feasibility/beta channel.
- Let merchants use Instagram and Gmail for reliable beta intake.
- Provide TikTok strategy guidance and manual reply drafts in dashboard only if the merchant supplies the TikTok context.
- Consider routing TikTok traffic toward Instagram/Gmail through profile links or platform-native tools, subject to TikTok policy.
