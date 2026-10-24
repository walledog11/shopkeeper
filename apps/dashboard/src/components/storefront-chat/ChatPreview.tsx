"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { StorefrontChatSettings } from '@/lib/storefront-chat/configuration';
import { parseChatImageUrl } from '@/lib/storefront-chat/images';
import { cn } from '@/lib/ui/cn';

export function ChatPreview({ settings, shopName }: { settings: StorefrontChatSettings; shopName: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [scene, setScene] = useState<'welcome' | 'launcher'>('welcome');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(520);
  const frameWidth = device === 'desktop' ? 520 : 375;
  const scale = Math.min(1, availableWidth / frameWidth);
  const visible = device === 'desktop' ? settings.showOnDesktop : settings.showOnMobile;
  const sendPreview = useCallback(() => {
    // The sandbox has an opaque origin. Check its window on receipt; '*' on
    // send contains only public presentation data, never credentials.
    const logoUrl = parseChatImageUrl(settings.logoUrl)
      ? new URL(settings.logoUrl, window.location.origin).href : settings.logoUrl;
    frame.current?.contentWindow?.postMessage({
      type: 'shopkeeper:preview', settings: { ...settings, logoUrl }, scene, shopName,
    }, '*');
  }, [settings, scene, shopName]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'shopkeeper:ready') sendPreview();
      if (event.data?.type === 'shopkeeper:rendered') { setReady(true); setFailed(false); }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [sendPreview]);
  useEffect(() => { sendPreview(); }, [sendPreview, device]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setFailed(true), 15000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);

  const control = 'rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring';
  return <section aria-label="Live chat preview">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1" aria-label="Preview device">
        {(['desktop', 'mobile'] as const).map(value => {
          const Icon = value === 'desktop' ? Monitor : Smartphone;
          return <button key={value} type="button" aria-label={`${value === 'desktop' ? 'Desktop' : 'Phone'} preview`} aria-pressed={device === value}
            className={cn(control, 'inline-flex items-center gap-1.5', device === value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setDevice(value)}><Icon className="size-3.5" />{value === 'desktop' ? 'Desktop' : 'Phone'}</button>;
        })}
      </div>
      <div className="flex items-center gap-1" aria-label="Preview view">
        {(['welcome', 'launcher'] as const).map(value => <button key={value} type="button" aria-pressed={scene === value}
          className={cn(control, scene === value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => setScene(value)}>{value === 'welcome' ? 'Chat' : 'Button'}</button>)}
      </div>
    </div>
    <div className="overflow-hidden rounded-lg bg-[#f5f4f2] py-4">
      <div ref={viewport} style={{ height: 650 * scale }}
        className={cn('relative mx-auto w-full overflow-hidden', device === 'mobile' ? 'max-w-[375px] rounded-xl border border-border' : 'max-w-[520px]')}>
        <iframe key={attempt} ref={frame} title="Website chat preview" sandbox="allow-scripts"
          src="/api/integrations/shopify/storefront-chat/preview" onLoad={sendPreview}
          className="absolute left-0 top-0 block h-[650px] origin-top-left border-0"
          style={{ width: frameWidth, transform: `scale(${scale})` }} />
        {(!ready || !visible) && <div className="absolute inset-0 flex items-center justify-center bg-[#f5f4f2] p-8 text-center text-sm text-muted-foreground" role="status">
          {failed ? <div><p>The preview couldn&apos;t load.</p><button type="button" className="mt-3 underline underline-offset-4"
            onClick={() => { setFailed(false); setReady(false); setAttempt(value => value + 1); }}>Try again</button></div>
            : !ready ? 'Loading preview…' : `Chat is hidden on ${device === 'desktop' ? 'computers' : 'phones'}. Change “Show on” to see it here.`}
        </div>}
      </div>
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">Preview only. Messages won&apos;t be sent.</p>
  </section>;
}
