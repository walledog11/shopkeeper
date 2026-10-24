"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { requestJson, errorMessageFromUnknown, isApiRequestError } from '@/lib/api/fetcher';
import { DEFAULT_CHAT_SETTINGS, validateChatSettings, type ChatConfigurationResponse, type PublishedChatConfiguration, type StorefrontChatSettings } from '@/lib/storefront-chat/configuration';
import { dashboardChromeColumnClassName } from '@/app/dashboard/_components/sidebar/sidebar-helpers';
import { cn } from '@/lib/ui/cn';
import { ChatSettingsFields } from './ChatSettingsFields';
import { ChatPreview } from './ChatPreview';

const endpoint = '/api/integrations/shopify/storefront-chat/configuration';

export default function StorefrontChatEditor({ initialData, canManage, themeEditorUrl, setup }: {
  initialData: ChatConfigurationResponse;
  canManage: boolean;
  themeEditorUrl: string | null;
  setup: { canEnable: boolean; needsShopify: boolean; connected: boolean };
}) {
  const [data, setData] = useState(initialData);
  const [settings, setSettings] = useState<StorefrontChatSettings>(initialData.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'settings' | 'preview'>('settings');
  const dirty = JSON.stringify(settings) !== JSON.stringify(data.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
  const validation = validateChatSettings(settings);
  const busy = saving || toggling || uploading;

  useEffect(() => {
    if (!dirty && !uploading) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, uploading]);

  function change(changes: Partial<StorefrontChatSettings>) {
    setSettings(current => ({ ...current, ...changes }));
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (!canManage || busy || !validation.settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const result = await requestJson<{ configuration: PublishedChatConfiguration }>(endpoint, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: validation.settings, revision: data.configuration?.revision ?? 0 }),
      }, 'Could not save your changes. Please try again.');
      setData(current => ({ ...current, configuration: result.configuration }));
      setSettings(result.configuration.settings);
      setSaved(true); setConflict(false);
    } catch (cause) {
      setError(errorMessageFromUnknown(cause, 'Could not save your changes.'));
      setConflict(isApiRequestError(cause, 409));
    } finally { setSaving(false); }
  }

  async function toggle(enabled: boolean) {
    if (!canManage || busy) return;
    setToggling(true); setError(null);
    try {
      const result = await requestJson<{ enabled: boolean }>('/api/integrations/shopify/storefront-chat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      }, 'Could not update chat. Please try again.');
      setData(current => ({ ...current, enabled: result.enabled }));
    } catch (cause) { setError(errorMessageFromUnknown(cause, 'Could not update chat.')); }
    finally { setToggling(false); }
  }

  async function reload() {
    setSaving(true);
    try {
      const latest = await requestJson<ChatConfigurationResponse>(endpoint);
      setData(latest); setSettings(latest.configuration?.settings ?? DEFAULT_CHAT_SETTINGS);
      setConflict(false); setError(null); setSaved(false);
    } catch (cause) { setError(errorMessageFromUnknown(cause, 'Could not reload settings.')); }
    finally { setSaving(false); }
  }

  return <div className="size-full overflow-y-auto bg-background custom-scrollbar">
    <div className={dashboardChromeColumnClassName('pb-8 pt-3')}>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website chat</h1>
          <p className="mt-1 text-xs text-muted-foreground">{data.shop}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {
            setSettings(data.configuration?.settings ?? DEFAULT_CHAT_SETTINGS); setError(null); setSaved(false);
          }}>Discard</Button>}
          <Button type="submit" form="chat-settings" disabled={!canManage || busy || !!validation.error || conflict || (!dirty && !!data.configuration)}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}Save changes
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3.5">
        <div className="flex items-center gap-3">
          <Switch checked={data.enabled} onChange={enabled => void toggle(enabled)}
            disabled={!canManage || busy || (!data.enabled && !setup.canEnable)} ariaLabel="Show chat on website"
            className={cn('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>span]:bg-white', data.enabled && 'bg-foreground')} />
          <span className="text-sm">Show on website</span>
          <span className="text-xs text-muted-foreground">{toggling ? 'Updating…' : data.enabled ? 'On' : 'Off'}</span>
        </div>
        {themeEditorUrl && <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open Shopify theme<ArrowUpRight className="size-3.5" /></a>}
      </div>
      <div role="status" aria-live="polite" className="text-xs">
        {error ? <p className="py-3 text-destructive">{error} {conflict && <button type="button" disabled={busy} onClick={() => void reload()} className="underline underline-offset-4">Reload saved settings</button>}</p>
          : validation.error ? <p className="py-3 text-destructive">{validation.error}</p>
          : saved ? <p className="flex items-center gap-1.5 py-3 text-muted-foreground"><Check className="size-3.5" />Changes saved.</p>
          : dirty ? <p className="py-3 text-muted-foreground">Unsaved changes</p> : null}
      </div>
      {!canManage && <p className="py-3 text-xs text-muted-foreground">Only workspace admins can change website chat.</p>}
      {!setup.canEnable && <p className="py-3 text-xs text-muted-foreground">{setup.needsShopify
        ? <>Reconnect Shopify to turn on chat. <Link href="/dashboard/integrations?configure=shopify" className="font-medium underline underline-offset-4">Reconnect Shopify</Link></>
        : 'Chat is not available for this workspace yet. You can still save your design.'}</p>}
      {data.enabled && !setup.connected && themeEditorUrl && <p className="py-3 text-xs text-muted-foreground">To show chat on your store, turn on the Shopkeeper Chat app embed in your Shopify theme and save.</p>}
      <div className="mt-4 flex gap-2 lg:hidden" aria-label="Editor view">
        {(['settings', 'preview'] as const).map(panel => <button key={panel} type="button" aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}
          className={cn('flex-1 rounded-md px-3 py-2 text-sm', mobilePanel === panel ? 'bg-secondary font-medium' : 'text-muted-foreground')}>
          {panel === 'settings' ? 'Edit' : 'Preview'}
        </button>)}
      </div>
      <div className="grid items-start lg:grid-cols-[340px_minmax(0,1fr)]">
        <form id="chat-settings" className={cn('min-w-0 py-6 lg:pr-7', mobilePanel === 'preview' && 'hidden lg:block')}
          onSubmit={event => { event.preventDefault(); void save(); }}>
          <ChatSettingsFields settings={settings} shopName={data.shopName} disabled={!canManage || saving || toggling}
            onChange={change} onUploadingChange={setUploading} />
          {!data.configuration && <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Saving replaces the chat settings in your Shopify theme.</p>}
        </form>
        <div className={cn('min-w-0 py-6 lg:sticky lg:top-0 lg:border-l lg:border-border lg:pl-7', mobilePanel === 'settings' && 'hidden lg:block')}>
          <ChatPreview settings={settings} shopName={data.shopName} />
        </div>
      </div>
    </div>
  </div>;
}
