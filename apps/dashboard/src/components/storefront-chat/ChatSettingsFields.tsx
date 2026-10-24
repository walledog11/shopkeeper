"use client";

import { cloneElement, useId, useState, type ReactElement } from 'react';
import { Check, MessageCircle, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { StorefrontChatSettings } from '@/lib/storefront-chat/configuration';
import { cn } from '@/lib/ui/cn';
import { ChatPictureUpload } from './ChatPictureUpload';

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    {cloneElement(children, { id })}
  </div>;
}

const colors = [
  ['Ink', '#1b1a19'], ['Blue', '#2458b8'], ['Green', '#30694e'],
  ['Plum', '#704459'], ['Clay', '#a84c35'],
] as const;

export function ChatSettingsFields({ settings, shopName, disabled, onChange, onUploadingChange }: {
  settings: StorefrontChatSettings;
  shopName: string;
  disabled: boolean;
  onChange: (changes: Partial<StorefrontChatSettings>) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [tab, setTab] = useState<'appearance' | 'messages'>('appearance');
  function set<K extends keyof StorefrontChatSettings>(key: K, value: StorefrontChatSettings[K]) {
    onChange({ [key]: value });
  }

  return <div className="min-w-0">
    <div className="mb-6 flex gap-6 border-b border-border" aria-label="Chat settings">
      {(['appearance', 'messages'] as const).map(value => <button key={value} type="button"
        aria-pressed={tab === value} onClick={() => setTab(value)}
        className={cn('border-b-2 pb-3 text-sm capitalize transition-colors', tab === value
          ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
        {value === 'appearance' ? 'Appearance' : 'Messages'}
      </button>)}
    </div>
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-60">
      {/* Keep the uploader mounted when switching tabs so an upload can finish. */}
      <div className={cn('space-y-6', tab !== 'appearance' && 'hidden')}>
        <ChatPictureUpload url={settings.logoUrl} disabled={disabled}
          onChange={url => set('logoUrl', url)} onUploadingChange={onUploadingChange} />
        <Field label="Name"><Input value={settings.title} placeholder={shopName} maxLength={60} onChange={event => set('title', event.target.value)} /></Field>
        <div className="space-y-3">
          <div className="text-sm font-medium">Color</div>
          <div className="flex items-center gap-2.5">
            {colors.map(([name, color]) => <button key={color} type="button" aria-label={`${name} color`}
              aria-pressed={settings.accentColor === color} onClick={() => set('accentColor', color)}
              style={{ backgroundColor: color }}
              className={cn('flex size-8 items-center justify-center rounded-full border border-black/10 text-white outline-offset-3 focus-visible:outline-2', settings.accentColor === color && 'ring-1 ring-foreground ring-offset-3 ring-offset-background')}>
              {settings.accentColor === color && <Check className="size-3.5" />}
            </button>)}
            <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border" title="Choose your own color">
              <span aria-hidden className="absolute inset-0 opacity-45" style={{ background: 'conic-gradient(#e08b8b, #e7d2a0, #95bda2, #93b3d6, #b69bc7, #e08b8b)' }} />
              <Plus aria-hidden className="relative size-4 text-foreground" />
              <input type="color" aria-label="Custom color" value={settings.accentColor}
                onChange={event => set('accentColor', event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
        <div className="space-y-3 border-t border-border pt-6">
          <div className="text-sm font-medium">Chat button</div>
          <div className="grid grid-cols-2 gap-2">
            {(['label', 'icon'] as const).map(style => <button key={style} type="button"
              aria-label={style === 'label' ? 'Button with text' : 'Icon button'} aria-pressed={settings.launcherStyle === style}
              onClick={() => set('launcherStyle', style)}
              className={cn('flex h-20 flex-col items-center justify-center gap-2 rounded-lg border text-xs', settings.launcherStyle === style ? 'border-foreground bg-secondary/40' : 'border-border text-muted-foreground hover:bg-secondary/30')}>
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-2 text-[10px] text-background"><MessageCircle className="size-3.5" />{style === 'label' && 'Chat with us'}</span>
              {style === 'label' ? 'With text' : 'Icon only'}
            </button>)}
          </div>
          {settings.launcherStyle === 'label' && <Field label="Button text"><Input value={settings.launcherLabel} maxLength={40} required onChange={event => set('launcherLabel', event.target.value)} /></Field>}
        </div>
        <div className="space-y-3">
          <div className="text-sm font-medium">Button position</div>
          <div className="grid grid-cols-2 gap-2">
            {(['left', 'right'] as const).map(position => <button key={position} type="button" aria-pressed={settings.position === position}
              onClick={() => set('position', position)}
              className={cn('flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-xs', settings.position === position ? 'border-foreground bg-secondary/40' : 'border-border text-muted-foreground')}>
              <span aria-hidden className="relative h-5 w-7 rounded-sm border border-current opacity-60"><span className={cn('absolute bottom-0.5 size-1.5 rounded-full bg-current', position === 'left' ? 'left-0.5' : 'right-0.5')} /></span>
              {position === 'left' ? 'Bottom left' : 'Bottom right'}
            </button>)}
          </div>
        </div>
        <Field label="Show on">
          <select value={settings.showOnDesktop && settings.showOnMobile ? 'both' : settings.showOnDesktop ? 'desktop' : settings.showOnMobile ? 'mobile' : 'none'}
            onChange={event => onChange({ showOnDesktop: ['both', 'desktop'].includes(event.target.value), showOnMobile: ['both', 'mobile'].includes(event.target.value) })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="both">Computers and phones</option><option value="desktop">Computers only</option><option value="mobile">Phones only</option>
            {!settings.showOnDesktop && !settings.showOnMobile && <option value="none">Hidden on all devices</option>}
          </select>
        </Field>
      </div>
      <div className={cn('space-y-6', tab !== 'messages' && 'hidden')}>
        <Field label="Welcome message"><Textarea value={settings.greeting} rows={4} maxLength={400} onChange={event => set('greeting', event.target.value)} /></Field>
        <Field label="Under your name"><Input value={settings.subtitle} maxLength={100} placeholder="Here to help" onChange={event => set('subtitle', event.target.value)} /></Field>
        <div className="space-y-3 border-t border-border pt-6">
          <div><h2 className="text-sm font-medium">Suggested questions</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Customers can tap a question to start chatting.</p></div>
          {settings.quickPrompts.map((prompt, index) => <div key={index} className="flex items-center gap-1.5">
            <Input aria-label={`Suggested question ${index + 1}`} value={prompt} maxLength={100} placeholder="Add a question"
              onChange={event => set('quickPrompts', settings.quickPrompts.map((value, i) => i === index ? event.target.value : value))} />
            <button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => set('quickPrompts', settings.quickPrompts.filter((_, i) => i !== index))}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
          </div>)}
          {settings.quickPrompts.length < 6 && <button type="button" onClick={() => set('quickPrompts', [...settings.quickPrompts, ''])}
            className="inline-flex items-center gap-1.5 py-1 text-xs font-medium hover:underline"><Plus className="size-3.5" />Add a question</button>}
        </div>
      </div>
    </fieldset>
  </div>;
}
