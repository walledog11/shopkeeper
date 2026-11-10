"use client";

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { settingsSectionHref } from '@/app/dashboard/_components/nav-items';
import { Button } from '@/components/ui/button';
import StorefrontChatEditor from '@/components/storefront-chat/StorefrontChatEditor';
import { StorefrontChatApiProvider, type StorefrontChatApi } from '@/components/storefront-chat/chat-api';
import { errorMessageFromUnknown } from '@/lib/api/fetcher';
import { cn } from '@/lib/ui/cn';
import type { ShopifyAppHomeState } from '../_lib/app-home';
import { shopifyAppRequest } from './app-bridge';

type LinkedState = Extract<ShopifyAppHomeState, { kind: 'linked' }>;
type Tab = 'overview' | 'chat' | 'settings';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'chat', label: 'Website chat' },
  { id: 'settings', label: 'Settings' },
];

// Shopify admin's own page background, so the cards sit in it like admin cards.
const PAGE = 'min-h-screen bg-[#f1f1f1] text-foreground';
const CARD = 'rounded-xl border border-border bg-background';

// The full app needs a Clerk session, which a third-party iframe cannot hold,
// so every way into it opens a new tab.
function AppLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return <Button asChild size="sm" variant={primary ? 'default' : 'outline'}>
    <a href={href} target="_blank" rel="noopener">{children}<ArrowUpRight /></a>
  </Button>;
}

const NEW_TAB_NOTE = <p className="mt-3 text-xs text-muted-foreground">Opens Shopkeeper in a new tab.</p>;

export function ShopifyAppHome({ state, appUrl }: { state: ShopifyAppHomeState; appUrl: string }) {
  return <div className={PAGE}>
    {state.kind === 'linked' ? <Linked state={state} appUrl={appUrl} /> : <SetUp shop={state.shop} appUrl={appUrl} />}
  </div>;
}

export function SessionProblem({ appUrl }: { appUrl: string }) {
  return <div className={PAGE}>
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <section className={cn(CARD, 'p-6')}>
        <h1 className="text-lg font-semibold">Shopkeeper couldn&apos;t confirm this Shopify session</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reload the page. If it keeps happening, open Shopkeeper directly.</p>
        <div className="mt-5"><AppLink href={`${appUrl}/dashboard`} primary>Open Shopkeeper</AppLink></div>
      </section>
    </main>
  </div>;
}

function SetUp({ shop, appUrl }: { shop: string; appUrl: string }) {
  const onboarding = `${appUrl}/onboarding?shop=${encodeURIComponent(shop)}`;
  return <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
    <section className={cn(CARD, 'p-6')}>
      <h1 className="text-lg font-semibold">Set up Shopkeeper</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Shopkeeper answers your Instagram DMs and emails using this store&apos;s real orders. Routine questions get
        answered on their own. Refunds and order changes wait for your yes, by text.
      </p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
        <li>Create your Shopkeeper account.</li>
        <li>Connect {shop}. The address is filled in for you.</li>
        <li>Add Instagram or email, then link your phone for approvals.</li>
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <AppLink href={`${appUrl}/signup?redirect_url=${encodeURIComponent(onboarding)}`} primary>Set up Shopkeeper</AppLink>
        <AppLink href={`${appUrl}/dashboard/integrations?configure=shopify&shop=${encodeURIComponent(shop)}`}>I already have an account</AppLink>
      </div>
      {NEW_TAB_NOTE}
    </section>
  </main>;
}

function Linked({ state, appUrl }: { state: LinkedState; appUrl: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  const chatApi = useMemo<StorefrontChatApi>(() => ({
    configurationUrl: '/api/shopify/app/storefront-chat/configuration',
    setupUrl: '/api/shopify/app/storefront-chat',
    pictureUrl: '/api/shopify/app/storefront-chat/image',
    previewUrl: `/shopify/chat-preview?shop=${encodeURIComponent(state.shop)}`,
    request: shopifyAppRequest,
    appUrl,
  }), [appUrl, state.shop]);
  // Workspaces are usually named after the store; say the name once.
  const workspace = state.workspaceName.trim().toLowerCase() === state.shopName.trim().toLowerCase()
    ? '' : ` · ${state.workspaceName}`;

  return <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight">{state.shopName}</h1>
        <p className="text-sm text-muted-foreground">Answered by Shopkeeper{workspace}</p>
      </div>
      <AccessBadge access={state.access} />
    </header>

    <div role="tablist" aria-label="Shopkeeper" className="mt-5 flex gap-1 border-b border-border">
      {TABS.map(item => <button key={item.id} id={`tab-${item.id}`} type="button" role="tab"
        aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} onClick={() => setTab(item.id)}
        className={cn('-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
          tab === item.id ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
        {item.label}
      </button>)}
    </div>

    {/* Panels stay mounted, so the chat editor keeps its draft and published
        revision across tabs instead of reloading stale props. */}
    <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== 'overview'} className="pt-5">
      <Overview state={state} appUrl={appUrl} onCustomizeChat={() => setTab('chat')} />
    </div>
    <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== 'chat'} className="pt-5">
      <section className={cn(CARD, 'overflow-hidden')}>
        <StorefrontChatApiProvider value={chatApi}>
          <StorefrontChatEditor initialData={state.chat} canManage themeEditorUrl={state.themeEditorUrl} draftKey={state.chatDraftKey} />
        </StorefrontChatApiProvider>
      </section>
    </div>
    <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== 'settings'} className="pt-5">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <StoreKnowledge />
        <Permissions rows={state.permissions} appUrl={appUrl} />
      </div>
    </div>
  </main>;
}

const BADGE = 'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium';

function AccessBadge({ access }: { access: LinkedState['access'] }) {
  if (access === 'ok') return <span className={cn(BADGE, 'bg-emerald-100 text-emerald-800')}>Connected</span>;
  if (access === 'missing_scopes') return <span className={cn(BADGE, 'bg-amber-100 text-amber-800')}>Needs attention</span>;
  return <span className={cn(BADGE, 'bg-red-100 text-red-800')}>Disconnected</span>;
}

function Overview({ state, appUrl, onCustomizeChat }: { state: LinkedState; appUrl: string; onCustomizeChat: () => void }) {
  const needsYou = state.metrics?.needsYou ?? 0;
  const reconnect = `${appUrl}/dashboard/integrations?configure=shopify`;
  return <div className="space-y-4">
    {state.access !== 'ok' && <section role="status" className={cn('rounded-xl border p-4 text-sm',
      state.access === 'lost' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
      <p className="font-medium">{state.access === 'lost'
        ? "Shopkeeper can't reach this store."
        : 'Some Shopify permissions are missing.'}</p>
      <p className="mt-1">{state.access === 'lost'
        ? 'Order lookups and actions are paused until you reconnect it in Shopkeeper.'
        : "A few actions stay off until this store is reconnected from Shopkeeper's Shopify settings."}</p>
      <div className="mt-3"><AppLink href={reconnect} primary>Reconnect store</AppLink></div>
    </section>}

    <section className={cn(CARD, 'p-5')}>
      {state.metrics && <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for you" value={state.metrics.needsYou} />
        <Stat label="Open conversations" value={state.metrics.open} />
        <Stat label="Replies, last 24 hours" value={state.metrics.repliesSent24h} />
      </dl>}
      <div className={cn('flex flex-wrap items-center gap-2', state.metrics && 'mt-5')}>
        {needsYou > 0 && <AppLink href={`${appUrl}/dashboard/review`} primary>Review {needsYou} waiting</AppLink>}
        <AppLink href={`${appUrl}/dashboard`} primary={needsYou === 0}>Open Shopkeeper</AppLink>
      </div>
      {NEW_TAB_NOTE}
    </section>

    <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-3 p-5')}>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">Website chat</h2>
        <p className="mt-1 text-sm text-muted-foreground">Let shoppers chat on your store, in your brand&apos;s colors and words.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onCustomizeChat}>Customize chat</Button>
    </section>
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-secondary/60 p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
  </div>;
}

function StoreKnowledge() {
  const [state, setState] = useState<{ status: 'idle' | 'syncing' | 'done' | 'failed'; message?: string }>({ status: 'idle' });
  async function sync() {
    setState({ status: 'syncing' });
    try {
      const result = await shopifyAppRequest<{ syncedPolicies: number; syncedPages: number }>(
        '/api/shopify/app/kb-sync', { method: 'POST', signal: AbortSignal.timeout(60_000) }, 'Could not sync your store. Try again.',
      );
      const total = result.syncedPolicies + result.syncedPages;
      setState({ status: 'done', message: `${total} note${total === 1 ? '' : 's'} synced to Memory` });
    } catch (error) {
      setState({ status: 'failed', message: errorMessageFromUnknown(error, 'Could not sync your store. Try again.') });
    }
  }
  return <section className={cn(CARD, 'p-5')}>
    <h2 className="text-sm font-medium">Store policies and pages</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Shopkeeper answers from your published policies and pages. Sync after you change them so answers stay current.
    </p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={state.status === 'syncing'} onClick={() => void sync()}>
        {state.status === 'syncing' ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now
      </Button>
      {state.message && <p role="status" className={cn('text-xs', state.status === 'failed' ? 'text-destructive' : 'text-emerald-700')}>{state.message}</p>}
    </div>
  </section>;
}

function Permissions({ rows, appUrl }: { rows: LinkedState['permissions']; appUrl: string }) {
  return <section className={cn(CARD, 'p-5')}>
    <h2 className="text-sm font-medium">What Shopkeeper can do in this store</h2>
    <ul className="mt-2 divide-y divide-border">
      {rows.map(row => <li key={row.label} className="flex items-start justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm">{row.label}</p>
          {row.detail && <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>}
        </div>
        {row.enabled
          ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-3.5" />On</span>
          : <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"><X className="size-3.5" />Off</span>}
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-muted-foreground">A workspace admin changes these in Shopkeeper.</p>
    <div className="mt-3"><AppLink href={`${appUrl}${settingsSectionHref('approvals')}`}>Approvals & limits</AppLink></div>
  </section>;
}
