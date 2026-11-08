# Storefront chat source

Edit the modules in this directory, then run `npm run build:storefront-chat` from
the repository root. Commit the generated `assets/shopkeeper-chat.js` alongside
the source changes. `npm run lint:structure` verifies that the asset is current.
Shopify and the dashboard preview load that same single asset.

- `index.js`: widget mounting, presentation settings, composer and delivery UI.
- `messages.js`: message bubbles, avatars and typing indicator.
- `session.js`: session storage, credential refresh, authenticated requests and polling.
- `viewport.js`: mobile layout, keyboard handling, page scroll and Shopify preview bar.
- `verification.js`: order verification form and result presentation.

Session retries keep the original message ID. A refresh that changes the session
must not replay an in-flight send into the new conversation. Preview mode uses
the same UI without starting sessions or making message/verification requests.
