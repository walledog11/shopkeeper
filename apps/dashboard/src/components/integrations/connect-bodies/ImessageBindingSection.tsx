"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Check, Copy, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetcher } from "@/lib/api/fetcher"
import { ConfigureSection } from "../ConfigureSection"

interface ImessageBindStatus {
  lineConnected: boolean
  connected: boolean
  handles: { senderId: string; displayLabel: string; connectedAt: string }[]
}

// Operator-channel binding: the merchant links their iPhone by texting a single-use
// connect code to Shopkeeper's platform iMessage line. No per-merchant credentials —
// `handle` is the fixed line to text, surfaced so the merchant knows where to send it.
export function ImessageBindingSection({ handle }: { handle: string | null }) {
  const { data, mutate } = useSWR<ImessageBindStatus>('/api/integrations/imessage/bind', fetcher)
  const [minting, setMinting] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [handleCountAtMint, setHandleCountAtMint] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  const handles = data?.handles ?? []

  // While a connect code is showing, poll so a freshly linked handle appears, and
  // clear the code once the merchant has texted it in (handle count grows).
  useEffect(() => {
    if (!token) return
    const id = setInterval(() => { void mutate() }, 4000)
    return () => clearInterval(id)
  }, [token, mutate])

  useEffect(() => {
    if (token && handles.length > handleCountAtMint) setToken(null)
  }, [token, handles.length, handleCountAtMint])

  async function mint() {
    setMinting(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/imessage/bind', { method: 'POST' })
      const body = await res.json() as { token?: string; error?: string }
      if (!res.ok || !body.token) throw new Error(body.error || 'Failed to create a connect code')
      setHandleCountAtMint(handles.length)
      setToken(body.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create a connect code')
    } finally {
      setMinting(false)
    }
  }

  async function copyToken() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable (insecure context) — the code is still shown.
    }
  }

  async function unlink(senderId: string) {
    setUnlinking(senderId)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/imessage/bind?senderId=${encodeURIComponent(senderId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
    } catch {
      setError('Failed to unlink. Please try again.')
    } finally {
      setUnlinking(null)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-foreground/60">Linked iPhones</p>
        <p className="text-xs text-foreground/35 leading-relaxed">
          Link your handle so the agent recognizes you when you text the line.
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {handles.length > 0 && (
        <ul className="space-y-1.5">
          {handles.map(h => (
            <li
              key={h.senderId}
              className="flex items-center justify-between gap-2 rounded-md border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2"
            >
              <span className="truncate text-xs font-medium text-foreground/70">{h.displayLabel}</span>
              <button
                type="button"
                onClick={() => unlink(h.senderId)}
                disabled={unlinking === h.senderId}
                aria-label={`Unlink ${h.displayLabel}`}
                className="shrink-0 inline-flex items-center justify-center size-6 rounded-md text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.06] transition-colors disabled:opacity-50"
              >
                {unlinking === h.senderId ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {token ? (
        <ConfigureSection title={handle ? `Text this code to ${handle}` : "Text this code to your line"}>
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-xs font-mono text-foreground/80">
                {token}
              </code>
              <button
                type="button"
                onClick={copyToken}
                aria-label="Copy connect code"
                className="shrink-0 inline-flex items-center justify-center h-9 px-3 rounded-md border border-foreground/[0.08] text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
              >
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            <p className="text-xs text-foreground/35 leading-relaxed">
              From your iPhone, text this code to{handle ? <> <span className="font-medium text-foreground/55">{handle}</span></> : " your iMessage line"}.
              It links this device and expires in 24 hours.
            </p>
          </div>
        </ConfigureSection>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={minting}
          onClick={mint}
          className="h-9 px-4 font-medium"
        >
          {minting ? <Loader2 className="size-3.5 animate-spin" /> : handles.length > 0 ? "Link another iPhone" : "Link your iPhone"}
        </Button>
      )}
    </div>
  )
}
