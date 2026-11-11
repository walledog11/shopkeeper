"use client";

import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { ArrowUpRight, Check, CircleAlert, Loader2, RefreshCw, X } from 'lucide-react';
import { settingsSectionHref } from '@/app/dashboard/_components/nav-items';
import { Button } from '@/components/ui/button';
import StorefrontChatEditor from '@/components/storefront-chat/StorefrontChatEditor';
import { StorefrontChatApiProvider, type StorefrontChatApi } from '@/components/storefront-chat/chat-api';
import { errorMessageFromUnknown } from '@/lib/api/fetcher';
import { cn } from '@/lib/ui/cn';
import type { ShopifyAppHomeState, ShopifyAppHomeSummary } from '@/lib/shopify/app-home';
import { reloadWithFreshToken, shopifyAppRequest } from './app-bridge';

type LinkedState = Extract<ShopifyAppHomeState, { kind: 'linked' }>;
type Tab = 'home' | 'chat' | 'settings';

// Every way into the full app opens a new tab, so whatever the merchant changes
// there is loaded again when they come back to this one: SWR revalidates on focus.
const SUMMARY_URL = '/api/shopify/app/home';
const SUMMARY_REFRESH = { revalidateOnMount: false, shouldRetryOnError: false } as const;
const loadSummary = (url: string) => shopifyAppRequest<ShopifyAppHomeSummary>(url);

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'chat', label: 'Website chat' },
  { id: 'settings', label: 'Settings' },
];

// Shopify admin's page background and card edge, so the app reads as one of
// the admin's own pages rather than a site framed inside it.
const PAGE = 'min-h-screen bg-[#f1f1f1] text-foreground';
const CARD = 'rounded-xl bg-white shadow-[0_1px_0_rgba(26,26,26,0.07),0_0_0_1px_rgba(26,26,26,0.06)]';

// The full app needs a Clerk session, which a third-party iframe cannot hold,
// so every way into it opens a new tab; the arrow says so.
function AppLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return <Button asChild size="sm" variant={primary ? 'default' : 'outline'}>
    <a href={href} target="_blank" rel="noopener">{children}<ArrowUpRight /></a>
  </Button>;
}

export function ShopifyAppHome({ state, appUrl }: { state: ShopifyAppHomeState; appUrl: string }) {
  return <div className={PAGE}>
    {state.kind === 'linked' ? <Linked state={state} appUrl={appUrl} /> : <SetUp shop={state.shop} claim={state.claim} appUrl={appUrl} />}
  </div>;
}

export function SessionProblem({ appUrl }: { appUrl: string }) {
  return <ProblemPage appUrl={appUrl} title="Shopkeeper couldn't confirm this Shopify session"
    detail="Reload the page. If it keeps happening, open Shopkeeper directly." />;
}

/** `appUrl` may be left out: the page is served from the app's own origin. */
export function ProblemPage({ title, detail, action, appUrl = '' }: {
  title: string; detail: string; action?: ReactNode; appUrl?: string;
}) {
  return <div className={PAGE}>
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <section className={cn(CARD, 'p-6')}>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {action}
          <AppLink href={`${appUrl}/dashboard`} primary={!action}>Open Shopkeeper</AppLink>
        </div>
      </section>
    </main>
  </div>;
}

function SetUp({ shop, claim, appUrl }: { shop: string; claim: string | null; appUrl: string }) {
  // The summary loads only once this store is connected: then load the connected page.
  useSWR(SUMMARY_URL, loadSummary, { ...SUMMARY_REFRESH, onSuccess: () => { reloadWithFreshToken().catch(() => {}); } });
  // The claim lets the new tab connect this store without asking for it or for
  // Shopify's approval a second time.
  const storeParams = new URLSearchParams({ shop, ...(claim ? { claim } : {}) }).toString();
  const onboarding = `${appUrl}/onboarding?${storeParams}`;
  const steps = ['Create your account', `Connect ${shop} in one click`, 'Add Instagram or email, and your phone'];
  return <main className="mx-auto w-full max-w-xl px-4 py-8">
    <section className={cn(CARD, 'p-6')}>
      <h1 className="text-base font-semibold">Set up Shopkeeper</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Shopkeeper answers your Instagram DMs and emails using this store&apos;s orders, and texts you before it
        refunds or changes anything.
      </p>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => <li key={step} className="flex items-center gap-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums">{index + 1}</span>
          {step}
        </li>)}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <AppLink href={`${appUrl}/signup?redirect_url=${encodeURIComponent(onboarding)}`} primary>Create account</AppLink>
        <AppLink href={`${appUrl}/dashboard/integrations?configure=shopify&${storeParams}`}>Sign in</AppLink>
      </div>
    </section>
  </main>;
}

function Linked({ state, appUrl }: { state: LinkedState; appUrl: string }) {
  const [tab, setTab] = useState<Tab>('home');
  const [chatEnabled, setChatEnabled] = useState(state.chat.enabled);
  const { data: summary = state } = useSWR(SUMMARY_URL, loadSummary, { ...SUMMARY_REFRESH, fallbackData: state });
  const chatApi = useMemo<StorefrontChatApi>(() => ({
    configurationUrl: '/api/shopify/app/storefront-chat/configuration',
    setupUrl: '/api/shopify/app/storefront-chat',
    pictureUrl: '/api/shopify/app/storefront-chat/image',
    previewUrl: `/shopify/chat-preview?shop=${encodeURIComponent(state.shop)}`,
    request: shopifyAppRequest,
    appUrl,
  }), [appUrl, state.shop]);

  return <main className="mx-auto w-full max-w-[1000px] px-4 pb-10 pt-4 sm:px-6">
    {summary.access !== 'ok' && <AccessBanner access={summary.access} appUrl={appUrl} />}
    {summary.plan?.status === 'inactive' && <PlanBanner plan={summary.plan} />}

    <div role="tablist" aria-label="Shopkeeper" className="flex gap-1">
      {TABS.map(item => <button key={item.id} id={`tab-${item.id}`} type="button" role="tab"
        aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} onClick={() => setTab(item.id)}
        className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
          tab === item.id ? 'bg-black/[0.08]' : 'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground')}>
        {item.label}
      </button>)}
    </div>

    {/* Panels stay mounted, so the chat editor keeps its draft and published
        revision across tabs instead of reloading stale props. */}
    <div role="tabpanel" id="panel-home" aria-labelledby="tab-home" hidden={tab !== 'home'} className="mt-4">
      <Home summary={summary} appUrl={appUrl} chatEnabled={chatEnabled} onOpenChat={() => setTab('chat')} />
    </div>
    <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== 'chat'} className="mt-4">
      <section className={cn(CARD, 'overflow-hidden')}>
        <StorefrontChatApiProvider value={chatApi}>
          <StorefrontChatEditor initialData={state.chat} canManage themeEditorUrl={state.themeEditorUrl}
            draftKey={state.chatDraftKey} showHeading={false} onEnabledChange={setChatEnabled} />
        </StorefrontChatApiProvider>
      </section>
    </div>
    <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== 'settings'} className="mt-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {summary.plan && <PlanCard plan={summary.plan} />}
        <StoreKnowledge />
        <Permissions rows={summary.permissions} appUrl={appUrl} />
      </div>
    </div>
  </main>;
}

function AccessBanner({ access, appUrl }: { access: Exclude<ShopifyAppHomeSummary['access'], 'ok'>; appUrl: string }) {
  const lost = access === 'lost';
  return <div role="status" className={cn('mb-4 flex flex-wrap items-start gap-3 rounded-xl p-4 text-sm',
    lost ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900')}>
    <CircleAlert className="mt-0.5 size-4 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{lost ? "Shopkeeper can't reach this store" : 'Shopify permissions need updating'}</p>
      <p className="mt-0.5">{lost ? 'Order lookups and actions are paused until you reconnect.' : 'A few actions stay off until you reconnect.'}</p>
    </div>
    <AppLink href={`${appUrl}/dashboard/integrations?configure=shopify`}>Reconnect</AppLink>
  </div>;
}

// Shopify's plan page is part of the admin, so it opens in the admin's own tab.
function PlanLink({ href, children }: { href: string; children: ReactNode }) {
  return <Button asChild size="sm" variant="outline">
    <a href={href} target="_top">{children}</a>
  </Button>;
}

type Plan = NonNullable<ShopifyAppHomeSummary['plan']>;

function PlanBanner({ plan }: { plan: Plan }) {
  return <div role="status" className="mb-4 flex flex-wrap items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
    <CircleAlert className="mt-0.5 size-4 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">Your Shopkeeper plan has ended</p>
      <p className="mt-0.5">Replies and actions are paused. Choose a plan to resume.</p>
    </div>
    <PlanLink href={plan.planPageUrl}>Choose a plan</PlanLink>
  </div>;
}

function PlanCard({ plan }: { plan: Plan }) {
  const trialDaysLeft = plan.status === 'active' && plan.trialEndsAt
    ? Math.ceil((Date.parse(plan.trialEndsAt) - Date.now()) / 86_400_000)
    : 0;
  const detail = trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in the free trial`
    : plan.status === 'active' ? 'Billed on your Shopify bill'
        : plan.status === 'inactive' ? 'Ended'
          : 'No plan chosen yet';
  return <section className={cn(CARD, 'p-5')}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{plan.planName ? `${plan.planName} plan` : 'Plan'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <PlanLink href={plan.planPageUrl}>{plan.status === 'active' ? 'Change plan' : 'Choose a plan'}</PlanLink>
    </div>
  </section>;
}

function Home({ summary, appUrl, chatEnabled, onOpenChat }: {
  summary: ShopifyAppHomeSummary; appUrl: string; chatEnabled: boolean; onOpenChat: () => void;
}) {
  const { metrics, setup, plan } = summary;
  const needsYou = metrics?.needsYou ?? 0;
  const steps = [
    ...(plan && plan.status === null ? [{ label: 'Choose a plan', done: false,
      action: <PlanLink href={plan.planPageUrl}>Choose</PlanLink> }] : []),
    ...(setup ? [
    { label: 'Connect Instagram or email', done: setup.customerChannel,
      action: <AppLink href={`${appUrl}/dashboard/integrations`}>Connect</AppLink> },
    { label: 'Connect your phone for approvals', done: setup.phone,
      action: <AppLink href={`${appUrl}${settingsSectionHref('briefing')}`}>Connect</AppLink> },
    ...(setup.chatAvailable ? [{ label: 'Turn on website chat', done: chatEnabled,
      action: <Button type="button" size="sm" variant="outline" onClick={onOpenChat}>Set up</Button> }] : []),
    ] : []),
  ];
  const stepsDone = steps.filter(step => step.done).length;

  return <div className="space-y-4">
    <section className={cn(CARD, 'p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{!metrics ? 'Counts are unavailable right now'
            : needsYou > 0 ? `${needsYou} ticket${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} you`
              : 'Nothing needs you right now'}</h2>
          {needsYou > 0 && <p className="mt-0.5 text-sm text-muted-foreground">Approve, edit or answer them in Shopkeeper.</p>}
        </div>
        {needsYou > 0
          ? <AppLink href={`${appUrl}/dashboard/review`} primary>Review</AppLink>
          : <AppLink href={`${appUrl}/dashboard`}>Open Shopkeeper</AppLink>}
      </div>
      {metrics && <dl className="mt-5 grid grid-cols-2 divide-x divide-border border-t border-border pt-4">
        <Stat label="Open tickets" value={metrics.open} />
        <Stat label="Replies in 24 hours" value={metrics.repliesSent24h} />
      </dl>}
    </section>

    {stepsDone < steps.length && <section className={CARD}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-sm font-semibold">Finish setting up</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{stepsDone} of {steps.length} done</span>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {steps.map(step => <li key={step.label} className="flex min-h-14 items-center gap-3 px-5 py-2.5">
          {step.done
            ? <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>
            : <span className="size-5 shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/60" />}
          <span className={cn('flex-1 text-sm', step.done && 'text-muted-foreground')}>{step.label}</span>
          {!step.done && step.action}
        </li>)}
      </ul>
    </section>}
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="px-4 first:pl-0 last:pr-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
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
    <h2 className="text-sm font-semibold">Policies and pages</h2>
    <p className="mt-1 text-sm text-muted-foreground">Shopkeeper answers from your store&apos;s policies and pages. Sync after you edit them.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={state.status === 'syncing'} onClick={() => void sync()}>
        {state.status === 'syncing' ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now
      </Button>
      {state.message && <p role="status" className={cn('text-xs', state.status === 'failed' ? 'text-destructive' : 'text-emerald-700')}>{state.message}</p>}
    </div>
  </section>;
}

function Permissions({ rows, appUrl }: { rows: ShopifyAppHomeSummary['permissions']; appUrl: string }) {
  return <section className={CARD}>
    <div className="flex items-center justify-between gap-3 px-5 pt-4">
      <h2 className="text-sm font-semibold">What Shopkeeper can do</h2>
      <a href={`${appUrl}${settingsSectionHref('approvals')}`} target="_blank" rel="noopener"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        Change<ArrowUpRight className="size-3.5" />
      </a>
    </div>
    <ul className="mt-2 divide-y divide-border">
      {rows.map(row => <li key={row.label} className="flex items-start justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm">{row.label}</p>
          {row.detail && <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>}
        </div>
        {row.enabled
          ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-3.5" />On</span>
          : <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"><X className="size-3.5" />Off</span>}
      </li>)}
    </ul>
  </section>;
}
