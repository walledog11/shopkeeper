"use client";

import { cloneElement, useId, type ReactElement } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
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
  function set<K extends keyof StorefrontChatSettings>(key: K, value: StorefrontChatSettings[K]) {
    onChange({ [key]: value });
  }

  return <fieldset disabled={disabled} className="min-w-0 space-y-7 disabled:opacity-60">
      <div className="space-y-6">
        <ChatPictureUpload url={settings.logoUrl} disabled={disabled}
          onChange={url => set('logoUrl', url)} onUploadingChange={onUploadingChange} />
        <div className="space-y-3">
          <div className="text-sm font-medium">Brand color</div>
          <div className="flex items-center gap-2.5">
            {colors.map(([name, color]) => <button key={color} type="button" aria-label={`${name} color`}
              aria-pressed={settings.accentColor === color} onClick={() => set('accentColor', color)}
              style={{ backgroundColor: color }}
              className={cn('flex size-9 items-center justify-center rounded-full border border-black/10 text-white outline-offset-3 focus-visible:outline-2', settings.accentColor === color && 'ring-1 ring-foreground ring-offset-3 ring-offset-background')}>
              {settings.accentColor === color && <Check className="size-3.5" />}
            </button>)}
            <label className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border" title="Choose your own color">
              <span aria-hidden className="absolute inset-0 opacity-45" style={{ background: 'conic-gradient(#e08b8b, #e7d2a0, #95bda2, #93b3d6, #b69bc7, #e08b8b)' }} />
              <Plus aria-hidden className="relative size-4 text-foreground" />
              <input type="color" aria-label="Custom color" value={settings.accentColor}
                onChange={event => set('accentColor', event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
        <Field label="Welcome message"><Textarea value={settings.greeting} rows={3} maxLength={400} onChange={event => set('greeting', event.target.value)} /></Field>
      </div>
      <details className="group border-t border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          More options<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 pb-2">
        <Field label="Chat name"><Input value={settings.title} placeholder={shopName} maxLength={60} onChange={event => set('title', event.target.value)} /></Field>
        <Field label="Short description"><Input value={settings.subtitle} maxLength={100} placeholder="Here to help" onChange={event => set('subtitle', event.target.value)} /></Field>
        <div className="space-y-3 border-t border-border pt-6">
          <Field label="Chat button">
            <select value={settings.launcherStyle} onChange={event => set('launcherStyle', event.target.value as 'label' | 'icon')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="label">Icon and text</option><option value="icon">Icon only</option>
            </select>
          </Field>
          {settings.launcherStyle === 'label' && <Field label="Button text"><Input value={settings.launcherLabel} maxLength={40} onChange={event => set('launcherLabel', event.target.value)} /></Field>}
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
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="both">Computers and phones</option><option value="desktop">Computers only</option><option value="mobile">Phones only</option>
            {!settings.showOnDesktop && !settings.showOnMobile && <option value="none">Hidden on all devices</option>}
          </select>
        </Field>
        <div className="space-y-3 border-t border-border pt-6">
          <div><h2 className="text-sm font-medium">Suggested questions</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Customers can tap a question to start chatting.</p></div>
          {settings.quickPrompts.map((prompt, index) => <div key={index} className="flex items-center gap-1.5">
            <Input aria-label={`Suggested question ${index + 1}`} value={prompt} maxLength={100} placeholder="Add a question"
              onChange={event => set('quickPrompts', settings.quickPrompts.map((value, i) => i === index ? event.target.value : value))} />
            <button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => set('quickPrompts', settings.quickPrompts.filter((_, i) => i !== index))}
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
          </div>)}
          {settings.quickPrompts.length < 6 && <button type="button" onClick={() => set('quickPrompts', [...settings.quickPrompts, ''])}
            className="inline-flex items-center gap-1.5 py-1 text-xs font-medium hover:underline"><Plus className="size-3.5" />Add a question</button>}
        </div>
        </div>
      </details>
    </fieldset>;
}
