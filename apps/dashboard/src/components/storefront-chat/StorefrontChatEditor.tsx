"use client";

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowUpRight, Check, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/api/fetcher';
import type { ChatConfigurationResponse } from '@/lib/storefront-chat/configuration';
import type { StorefrontChatReadiness } from '@/lib/storefront-chat/readiness';
import { dashboardChromeColumnClassName } from '@/app/dashboard/_components/sidebar/sidebar-helpers';
import { cn } from '@/lib/ui/cn';
import { ChatSettingsFields } from './ChatSettingsFields';
import { ChatPreview } from './ChatPreview';
import { useChatEditor } from './useChatEditor';
import { settingsSectionHref } from '@/app/dashboard/_components/nav-items';

export default function StorefrontChatEditor({ initialData, canManage, themeEditorUrl, draftKey }: {
  initialData: ChatConfigurationResponse;
  canManage: boolean;
  themeEditorUrl: string | null;
  draftKey: string;
}) {
  const editor = useChatEditor(initialData, draftKey, canManage);
  const { data, settings, busy, dirty, uploading, conflict, validation } = editor;
  const [mobilePanel, setMobilePanel] = useState<'settings' | 'preview'>('settings');
  const { data: setup, error: setupError, mutate: refreshSetup } = useSWR<StorefrontChatReadiness>(
    ['/api/integrations/shopify/storefront-chat', draftKey],
    ([url]: [string, string]) => requestJson(url, { signal: AbortSignal.timeout(15_000) }),
    { revalidateOnFocus: true, errorRetryCount: 1 },
  );
  const needsShopify = setup && !setup.checks.find(check => check.id === 'shopify')?.ready;
  const needsAttention = data.enabled && setup && !setup.canEnable;
  const canSave = canManage && editor.hydrated && !busy && !uploading && !validation.error && !conflict;
  const frozen = !canManage || !editor.hydrated || (busy && editor.action !== 'save');
  const status = conflict ? 'Saved settings changed. Reloading will replace your draft.'
    : editor.error || validation.error || (uploading ? 'Uploading picture…'
      : busy ? editor.action === 'disable' ? 'Turning off…' : editor.action === 'enable' ? 'Turning on…' : 'Saving…' : dirty ? editor.restored ? 'Your unsaved draft was restored.' : 'Unsaved changes'
        : editor.saved ? 'Changes saved' : '');

  return <div className="size-full overflow-y-auto bg-background custom-scrollbar">
    <div className={dashboardChromeColumnClassName('pb-8 pt-3')}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Website chat</h1>
          <div role="status" aria-live="polite" className={cn('mt-1 flex min-h-5 flex-wrap items-center gap-1.5 text-xs', editor.error || conflict || validation.error ? 'text-destructive' : 'text-muted-foreground')}>
            {editor.saved && !conflict && !editor.error && <Check className="size-3.5" />}{status || data.shopName}
            {conflict && <button type="button" disabled={busy || uploading} onClick={() => editor.run('reload')} className="underline underline-offset-4">Reload saved settings</button>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {dirty && <Button type="button" variant="ghost" size="sm" aria-label="Discard" disabled={busy || uploading} onClick={editor.discard}><Undo2 className="size-4 sm:hidden" /><span className="hidden sm:inline">Discard</span></Button>}
          <Button type="submit" form="chat-settings" aria-label="Save changes" disabled={!canSave || (!dirty && !!data.configuration)}>
            {busy && editor.action === 'save' && <Loader2 className="size-3.5 animate-spin" />}<span className="sm:hidden">Save</span><span className="hidden sm:inline">Save changes</span>
          </Button>
        </div>
      </header>

      <section aria-label="Chat setup" className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="flex items-center gap-2 text-sm font-medium"><span className={cn('size-2 shrink-0 rounded-full', needsAttention ? 'bg-amber-600' : data.enabled ? 'bg-green-600' : 'bg-muted-foreground/40')} />
            {needsAttention ? 'Chat needs attention' : data.enabled ? 'Enabled in Shopkeeper' : 'Chat is off'}
          </h2>
          {(needsShopify || (setup && !setup.canEnable) || data.enabled) && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {needsShopify ? 'Reconnect Shopify to finish setting up chat.'
              : setup && !setup.canEnable ? 'Chat is temporarily unavailable. You can still customize it below.'
                : 'Chat appears wherever Shopkeeper Chat is enabled in your Shopify theme.'}
          </p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsShopify ? <Button asChild variant="outline"><Link href="/dashboard/integrations?configure=shopify">Reconnect Shopify</Link></Button>
            : data.enabled ? <>
              <Button asChild variant="outline"><a href={'https://' + data.shop} target="_blank" rel="noopener noreferrer">View store<ArrowUpRight /></a></Button>
            </>
              : <Button type="button" disabled={!canSave || !setup?.canEnable} onClick={() => editor.run('enable')}>
                {!setup && !setupError ? <><Loader2 className="size-3.5 animate-spin" />Checking…</> : busy && editor.action === 'enable' ? <><Loader2 className="size-3.5 animate-spin" />Turning on…</> : dirty ? 'Save and turn on' : 'Turn on chat'}
              </Button>}
          {data.enabled && <Button type="button" variant="ghost" disabled={!canManage || busy || uploading} onClick={() => editor.run('disable')}>{busy && editor.action === 'disable' ? 'Turning off…' : 'Turn off'}</Button>}
        </div>
        {data.enabled && themeEditorUrl && <div className="w-full border-t border-border pt-4 text-sm">
          {setup && !setup.lastConnectedAt ? <>
            <p className="mb-3 text-muted-foreground">One more step: enable the Shopkeeper Chat app embed in Shopify, then save your theme.</p>
            <Button asChild><a href={themeEditorUrl} target="_blank" rel="noopener noreferrer">Finish setup in Shopify<ArrowUpRight /></a></Button>
          </> : <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">Shopify theme settings<ArrowUpRight className="size-3.5" /></a>}
          <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">Replacing Shopify Inbox?</summary><p className="mt-1 leading-relaxed">Turn off its chat button in Shopify so customers see only one chat.</p></details>
        </div>}
        {setupError && <p className="w-full text-xs text-destructive">Couldn&apos;t check chat setup. <button type="button" onClick={() => void refreshSetup().catch(() => undefined)} className="underline underline-offset-4">Try again</button></p>}
      </section>

      {!canManage && <p className="mb-4 text-sm text-muted-foreground">Only workspace admins can change website chat.</p>}
      <div className="mb-4 flex gap-2 lg:hidden" aria-label="Editor view">
        {(['settings', 'preview'] as const).map(panel => <button key={panel} type="button" aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}
          className={cn('flex-1 rounded-md px-3 py-2.5 text-sm', mobilePanel === panel ? 'bg-secondary font-medium' : 'text-muted-foreground')}>
          {panel === 'settings' ? 'Customize' : 'Preview'}
        </button>)}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        <form id="chat-settings" noValidate className={cn('min-w-0 py-1', mobilePanel === 'preview' && 'hidden lg:block')}
          onSubmit={event => { event.preventDefault(); editor.run('save'); }}>
          <ChatSettingsFields settings={settings} shopName={data.shopName} disabled={frozen}
            onChange={editor.change} onUploadingChange={editor.setUploading} />
          {!data.configuration && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Your current theme design stays in use until you save this preview.</p>}
          <div className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            <p>Replies and approvals follow your <Link href={settingsSectionHref("approvals")} className="underline underline-offset-4">approval settings</Link>.</p>
            {setup && <p className="mt-2">{setup.checks.find(check => check.id === 'operator')?.ready
              ? 'Requests for you appear in iMessage and your dashboard.' : <>Requests for you appear in your dashboard. <Link href={settingsSectionHref("briefing")} className="underline underline-offset-4">Connect iMessage</Link></>}</p>}
            {setup && !setup.checks.find(check => check.id === 'email')?.ready && <p className="mt-2">To let customers check their orders, <Link href="/dashboard/integrations?configure=gmail" className="underline underline-offset-4">connect an email account</Link>.</p>}
          </div>
        </form>
        <div className={cn('min-w-0 lg:sticky lg:top-24', mobilePanel === 'settings' && 'hidden lg:block')}>
          <ChatPreview settings={settings} shopName={data.shopName} />
        </div>
      </div>
    </div>
  </div>;
}
