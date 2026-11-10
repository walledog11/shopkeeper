import { escapeHtml } from '@/lib/security/escape-html';
import type { ShopifyAppHomeMetrics, ShopifyAppHomeState } from './app-home';

const APP_BRIDGE_SRC = 'https://cdn.shopify.com/shopifycloud/app-bridge.js';

interface PageShell {
  clientId: string;
  nonce: string;
}

interface Link {
  href: string;
  label: string;
}

// Shopify requires App Bridge as the first script in <head>, with the app's
// client id in the meta tag it reads.
function renderPage({ clientId, nonce }: PageShell, body: string, script = ''): string {
  const nonceAttr = ` nonce="${escapeHtml(nonce)}"`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="shopify-api-key" content="${escapeHtml(clientId)}">
  <script src="${APP_BRIDGE_SRC}"${nonceAttr}></script>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Shopkeeper</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #f1f1f1; color: #303030; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
    main { max-width: 720px; margin: 0 auto; display: grid; gap: 16px; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 0 rgba(26,26,26,.07), 0 1px 2px rgba(26,26,26,.15); }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h1 { margin: 0; font-size: 16px; font-weight: 650; }
    p { margin: 4px 0 0; }
    .subdued { color: #616161; }
    .badge { flex-shrink: 0; border-radius: 8px; padding: 2px 8px; font-size: 12px; font-weight: 550; }
    .badge.success { background: #cdfee1; color: #0c5132; }
    .badge.warning { background: #ffeb78; color: #4f4700; }
    .badge.critical { background: #fedad9; color: #8e1f0b; }
    .banner { margin-top: 16px; border-radius: 8px; padding: 12px; }
    .banner.warning { background: #fff8db; }
    .banner.critical { background: #fff0ef; }
    .banner strong { display: block; }
    .stats { margin: 16px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .stats div { border-radius: 8px; background: #f7f7f7; padding: 12px; }
    .stats dt { color: #616161; }
    .stats dd { margin: 4px 0 0; font-size: 20px; font-weight: 650; }
    ol { margin: 12px 0 0; padding-left: 20px; }
    li + li { margin-top: 4px; }
    .actions { margin-top: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .button { display: inline-flex; align-items: center; min-height: 32px; border-radius: 8px; padding: 6px 12px; font-weight: 550; text-decoration: none; color: #303030; background: #fff; box-shadow: inset 0 0 0 1px #d4d4d4; }
    .button.primary { color: #fff; background: #303030; box-shadow: none; }
    .button:hover { filter: brightness(.95); }
    .note { margin-top: 12px; color: #616161; font-size: 12px; }
    @media (max-width: 480px) { .stats { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
${body}
${script ? `<script${nonceAttr}>${script}</script>` : ''}
</body>
</html>`;
}

// The full app needs a Clerk session, which a third-party iframe cannot hold,
// so every way into it opens a new tab.
function renderActions(primary: Link, secondary?: Link): string {
  const link = (item: Link, className: string) =>
    `<a class="${className}" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>`;
  return `<div class="actions">${link(primary, 'button primary')}${secondary ? link(secondary, 'button') : ''}</div>
    <p class="note">Opens Shopkeeper in a new tab.</p>`;
}

function renderMetrics(metrics: ShopifyAppHomeMetrics): string {
  const stat = (label: string, value: number) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<dl class="stats">
      ${stat('Waiting for you', metrics.needsYou)}
      ${stat('Open conversations', metrics.open)}
      ${stat('Replies, last 24 hours', metrics.repliesSent24h)}
    </dl>`;
}

const ACCESS_BADGE = {
  ok: '<span class="badge success">Connected</span>',
  missing_scopes: '<span class="badge warning">Needs attention</span>',
  lost: '<span class="badge critical">Disconnected</span>',
} as const;

const ACCESS_BANNER = {
  ok: '',
  missing_scopes: `<div class="banner warning"><strong>Some Shopify permissions are missing.</strong>
      <p>A few actions stay off until this store is reconnected from Shopkeeper's Shopify settings.</p></div>`,
  lost: `<div class="banner critical"><strong>Shopkeeper can't reach this store.</strong>
      <p>Order lookups and actions are paused until you reconnect it in Shopkeeper.</p></div>`,
} as const;

function renderLinked(state: Extract<ShopifyAppHomeState, { kind: 'linked' }>, appUrl: string): string {
  const settings = { href: `${appUrl}/dashboard/integrations?configure=shopify`, label: 'Reconnect store' };
  const open = { href: `${appUrl}/dashboard`, label: 'Open Shopkeeper' };
  const needsYou = state.metrics?.needsYou ?? 0;
  const [primary, secondary] = state.access !== 'ok'
    ? [settings, open]
    : needsYou > 0
      ? [{ href: `${appUrl}/dashboard/review`, label: `Review ${needsYou} waiting` }, open]
      : [open, undefined];

  // Workspaces are usually named after the store; say the name once.
  const workspace = state.workspaceName.trim().toLowerCase() === state.shopName.trim().toLowerCase()
    ? ''
    : ` · ${escapeHtml(state.workspaceName)}`;

  return `<main>
  <section class="card">
    <div class="header">
      <div>
        <h1>${escapeHtml(state.shopName)}</h1>
        <p class="subdued">Answered by Shopkeeper${workspace}</p>
      </div>
      ${ACCESS_BADGE[state.access]}
    </div>
    ${ACCESS_BANNER[state.access]}
    ${state.metrics ? renderMetrics(state.metrics) : ''}
    ${renderActions(primary, secondary)}
  </section>
</main>`;
}

function renderUnlinked(shop: string, appUrl: string): string {
  const onboarding = `${appUrl}/onboarding?shop=${encodeURIComponent(shop)}`;
  const signup = `${appUrl}/signup?redirect_url=${encodeURIComponent(onboarding)}`;
  const existing = `${appUrl}/dashboard/integrations?configure=shopify&shop=${encodeURIComponent(shop)}`;
  return `<main>
  <section class="card">
    <h1>Set up Shopkeeper</h1>
    <p class="subdued">Shopkeeper answers your Instagram DMs and emails using this store's real orders. Routine questions get answered on their own. Refunds and order changes wait for your yes, by text.</p>
    <ol>
      <li>Create your Shopkeeper account.</li>
      <li>Connect ${escapeHtml(shop)}. The address is filled in for you.</li>
      <li>Add Instagram or email, then link your phone for approvals.</li>
    </ol>
    ${renderActions({ href: signup, label: 'Set up Shopkeeper' }, { href: existing, label: 'I already have an account' })}
  </section>
</main>`;
}

export function renderShopifyAppHome(
  shell: PageShell & { appUrl: string },
  state: ShopifyAppHomeState,
): string {
  const body = state.kind === 'linked'
    ? renderLinked(state, shell.appUrl)
    : renderUnlinked(state.shop, shell.appUrl);
  return renderPage(shell, body);
}

/**
 * Served when the request carries no valid ID token: App Bridge mints a fresh
 * one and the page reloads with it once, marked by `reloadParam` so a token
 * that still fails verification shows the error instead of looping.
 */
export function renderShopifySessionBounce(shell: PageShell, reloadParam: string): string {
  const script = `shopify.idToken().then(function (token) {
  var url = new URL(window.location.href);
  url.searchParams.set('id_token', token);
  url.searchParams.set(${JSON.stringify(reloadParam)}, '1');
  window.location.replace(url.toString());
});`;
  return renderPage(shell, '<main><section class="card"><p class="subdued">Loading Shopkeeper…</p></section></main>', script);
}

export function renderShopifySessionError(shell: PageShell & { appUrl: string }): string {
  return renderPage(shell, `<main>
  <section class="card">
    <h1>Shopkeeper couldn't confirm this Shopify session</h1>
    <p class="subdued">Reload the page. If it keeps happening, open Shopkeeper directly.</p>
    ${renderActions({ href: `${shell.appUrl}/dashboard`, label: 'Open Shopkeeper' })}
  </section>
</main>`);
}
