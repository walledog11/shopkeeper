"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import type { SampleReply } from "@/types"
import { inputCls } from "./kb-page-utils"

interface Props {
  storeName: string
  aiContext: string
  brandVoice: string
  sampleReplies: SampleReply[]
  onSave: (input: { aiContext: string; brandVoice: string; sampleReplies: SampleReply[] }) => Promise<void>
  onBack: () => void
}

export function StoreProfileEditDetail({ storeName, aiContext, brandVoice, sampleReplies, onSave, onBack }: Props) {
  const [storeDraft, setStoreDraft] = useState(aiContext)
  const [voiceDraft, setVoiceDraft] = useState(brandVoice)
  const [samples, setSamples] = useState(sampleReplies)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setStoreDraft(aiContext); setVoiceDraft(brandVoice); setSamples(sampleReplies) }, [aiContext, brandVoice, sampleReplies])

  async function save() {
    setSaving(true); setError(null)
    try {
      await onSave({
        aiContext: storeDraft.trim(),
        brandVoice: voiceDraft.trim(),
        sampleReplies: samples.map(sample => ({ ...sample, body: sample.body.trim(), ...(sample.context !== undefined ? { context: sample.context.trim() || undefined } : {}), ...(sample.tag !== undefined ? { tag: sample.tag.trim() || undefined } : {}) })),
      })
      onBack()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save core context.")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><p className="text-xs font-semibold uppercase text-faint">Core context</p><h2 className="mt-1 text-lg font-semibold text-foreground">Store facts and reply style</h2><p className="mt-1 text-xs text-muted-foreground">{storeName}</p></div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <section className="space-y-3">
            <div><label htmlFor="store-profile-body" className="block text-sm font-semibold text-foreground">Store facts</label><p className="mt-1 text-xs text-muted-foreground">Products, policies, shipping expectations, and other durable business details.</p></div>
            <textarea id="store-profile-body" value={storeDraft} onChange={event => setStoreDraft(event.target.value)} rows={7} maxLength={2000} placeholder="e.g. We sell phone cases. Ships in 2-3 business days. 30-day returns on unused items." className={`${inputCls} resize-none`} />
            <p className="text-xs text-faint">{storeDraft.length} / 2,000</p>
          </section>
          <section className="mt-8 space-y-3 border-t border-border pt-6">
            <div><label htmlFor="reply-style-body" className="block text-sm font-semibold text-foreground">Reply style</label><p className="mt-1 text-xs text-muted-foreground">The tone, phrasing, and language the agent should use.</p></div>
            <textarea id="reply-style-body" value={voiceDraft} onChange={event => setVoiceDraft(event.target.value)} rows={4} maxLength={200} placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language." className={`${inputCls} resize-none`} />
            <p className="text-xs text-faint">{voiceDraft.length} / 200</p>
          </section>
          <section className="mt-8 space-y-3 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Sample replies</p><p className="mt-1 text-xs text-muted-foreground">Real examples help the agent reproduce your writing style.</p></div><button type="button" onClick={() => setSamples(current => [...current, { id: crypto.randomUUID(), body: "" }])} disabled={samples.length >= 10} aria-label="Add sample reply" className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-foreground/[0.04] disabled:opacity-35"><Plus className="size-4" /></button></div>
            <p className="text-xs text-faint">{samples.length} / 10 examples</p>
            <div className="space-y-2.5">{samples.map((sample, index) => (
              <div key={sample.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Example {index + 1}</span><button type="button" onClick={() => setSamples(current => current.filter(item => item.id !== sample.id))} aria-label={`Remove sample reply ${index + 1}`} className="inline-flex size-7 items-center justify-center text-faint hover:text-red-400"><Trash2 className="size-3.5" /></button></div>
                <textarea value={sample.body} onChange={event => setSamples(current => current.map(item => item.id === sample.id ? { ...item, body: event.target.value } : item))} rows={3} maxLength={300} placeholder="Write an example reply in your preferred style." className={`${inputCls} resize-none`} />
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={sample.context ?? ""} onChange={event => setSamples(current => current.map(item => item.id === sample.id ? { ...item, context: event.target.value } : item))} placeholder="When to use (optional)" className={inputCls} /><input value={sample.tag ?? ""} onChange={event => setSamples(current => current.map(item => item.id === sample.id ? { ...item, tag: event.target.value } : item))} placeholder="Ticket tag (optional)" className={inputCls} /></div>
              </div>
            ))}</div>
          </section>
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onBack} className="px-3 py-1.5 text-xs text-faint hover:text-strong">Cancel</button><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Save changes</button></div>
      </div>
    </div>
  )
}
