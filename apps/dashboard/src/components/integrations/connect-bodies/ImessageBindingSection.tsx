"use client"

import { useEffect, useReducer, useRef } from "react"
import useSWR from "swr"
import { Bell, Check, Copy, Loader2, Plus, Smartphone, Trash2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { fetcher } from "@/lib/api/fetcher"
import { formatDate } from "@/lib/format/date"
import { ConfigureSection } from "../ConfigureSection"
import { ConfigureAccountRow } from "../ConfigureAccountRow"
import { ActionRow } from "../ActionRow"
import { PermissionActionLink, PermissionRow } from "../PermissionRow"

interface ImessageBindStatus {
  lineConnected: boolean
  connected: boolean
  handles: { senderId: string; displayLabel: string; connectedAt: string }[]
}

const IMESSAGE_PERMISSIONS = [
  { icon: Check, label: "Send instructions and approvals from your iPhone" },
  { icon: Bell, label: "Receive order updates and ticket digests on iMessage" },
] as const

const DELETE_ALL_NOTE = "Linked iPhones will stop being recognized when they text the line."

interface ImessageBindingState {
  confirmingDeleteAll: boolean
  copied: boolean
  error: string | null
  justLinked: string | null
  minting: boolean
  token: string | null
  unlinking: string | "all" | null
}

const INITIAL_STATE: ImessageBindingState = {
  confirmingDeleteAll: false,
  copied: false,
  error: null,
  justLinked: null,
  minting: false,
  token: null,
  unlinking: null,
}

function mergeState(
  state: ImessageBindingState,
  patch: Partial<ImessageBindingState>,
): ImessageBindingState {
  return { ...state, ...patch }
}

// The line is a phone number, so an `sms:` deep link pre-fills both the recipient
// and the connect code. Scanned with the iPhone camera, Messages opens ready to
// send — no hand-carrying the code across devices. Body uses `&` (not `?`) per iOS.
function buildSmsDeepLink(handle: string, token: string): string {
  const number = handle.replace(/[^\d+]/g, "")
  return `sms:${number}&body=${encodeURIComponent(token)}`
}

// A bound handle's label is usually a raw E.164 number (e.g. +19096622741). Pretty-
// print US/Canada numbers as +1 (909) 662-2741; leave names, emails, and anything
// that isn't purely phone characters untouched.
function formatHandleLabel(label: string): string {
  if (/[^\d\s()+\-.]/.test(label)) return label
  const digits = label.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1)
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return label
}

// Operator-channel binding: the merchant links their iPhone by texting a single-use
// connect code to Shopkeeper's platform iMessage line. No per-merchant credentials —
// `handle` is the fixed line to text, surfaced so the merchant knows where to send it.
export function ImessageBindingSection({ handle }: { handle: string | null }) {
  const { data, mutate } = useSWR<ImessageBindStatus>('/api/integrations/imessage/bind', fetcher)
  const [{ confirmingDeleteAll, copied, error, justLinked, minting, token, unlinking }, updateState] =
    useReducer(mergeState, INITIAL_STATE)
  const handleCountAtMintRef = useRef(0)

  const handles = data?.handles ?? []
  const isConnected = handles.length > 0
  const deepLink = token && handle ? buildSmsDeepLink(handle, token) : null
  const newestHandleLabel = handles.length > 0 ? handles[handles.length - 1].displayLabel : null

  // While a connect code is showing, poll so a freshly linked handle appears, and
  // clear the code once the merchant has texted it in (handle count grows).
  useEffect(() => {
    if (!token) return
    const id = setInterval(() => { void mutate() }, 4000)
    return () => clearInterval(id)
  }, [token, mutate])

  // When the texted code lands, the handle list grows: clear the code and surface a
  // brief "linked" confirmation so the merchant knows it worked (the code vanishing
  // alone reads as ambiguous).
  useEffect(() => {
    if (!token || handles.length <= handleCountAtMintRef.current) return
    updateState({ justLinked: newestHandleLabel ?? "iPhone", token: null })
    const id = setTimeout(() => updateState({ justLinked: null }), 6000)
    return () => clearTimeout(id)
  }, [token, handles.length, newestHandleLabel])

  async function mint() {
    updateState({ minting: true, error: null })
    try {
      const res = await fetch('/api/integrations/imessage/bind', { method: 'POST' })
      const body = await res.json() as { token?: string; error?: string }
      if (!res.ok || !body.token) throw new Error(body.error || 'Failed to create a connect code')
      handleCountAtMintRef.current = handles.length
      updateState({ token: body.token })
    } catch (e) {
      updateState({ error: e instanceof Error ? e.message : 'Failed to create a connect code' })
    } finally {
      updateState({ minting: false })
    }
  }

  async function copyToken() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      updateState({ copied: true })
      setTimeout(() => updateState({ copied: false }), 2000)
    } catch {
      // Clipboard can be unavailable (insecure context) — the code is still shown.
    }
  }

  // `target` is a senderId, or "all" to unbind every handle (no senderId query param).
  async function unlink(target: string) {
    updateState({ unlinking: target, error: null })
    try {
      const qs = target === "all" ? "" : `?senderId=${encodeURIComponent(target)}`
      const res = await fetch(`/api/integrations/imessage/bind${qs}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
    } catch {
      updateState({ error: 'Failed to unlink. Please try again.' })
    } finally {
      updateState({ unlinking: null })
    }
  }

  const connectBody = token ? (
    <ConfigureSection title="Scan to link your iPhone">
      <div className="px-4 py-4 flex flex-col items-center gap-3">
        {deepLink && (
          <>
            <div className="rounded-lg bg-white p-2 shadow-sm">
              <QRCodeSVG
                value={deepLink}
                size={176}
                level="M"
                marginSize={2}
                title="iMessage connect QR code"
              />
            </div>
            <p className="text-xs text-foreground/40 text-center leading-relaxed">
              Scan with your iPhone camera — Messages opens with the code ready to send.
            </p>
            <div className="flex w-full items-center gap-3 text-[10px] uppercase tracking-wide text-foreground/25">
              <span className="h-px flex-1 bg-foreground/[0.08]" />
              or text it yourself
              <span className="h-px flex-1 bg-foreground/[0.08]" />
            </div>
          </>
        )}

        <div className="w-full space-y-2">
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
            Text this code to{handle ? <> <span className="font-medium text-foreground/55">{handle}</span></> : " your iMessage line"}.
            It expires in 24 hours.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground/30">
          <Loader2 className="size-3.5 animate-spin" />
          Waiting for your text…
        </div>
      </div>
    </ConfigureSection>
  ) : null

  return (
    <div className="space-y-5">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {justLinked && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs font-medium text-emerald-300">
          <Check className="size-3.5 shrink-0" />
          {justLinked} linked
        </div>
      )}

      {isConnected ? (
        <>
          <div className="space-y-2">
            {handles.map((h, index) => (
              <ConfigureAccountRow
                key={h.senderId}
                icon={Smartphone}
                title={formatHandleLabel(h.displayLabel) || `iPhone ${index + 1}`}
                description={`Linked ${formatDate(h.connectedAt)}`}
                action={
                  <PermissionActionLink
                    onClick={() => unlink(h.senderId)}
                    disabled={unlinking !== null}
                  >
                    {unlinking === h.senderId ? "Unlinking…" : "Unlink"}
                  </PermissionActionLink>
                }
              />
            ))}
          </div>

          {connectBody}

          <ConfigureSection title="Permissions">
            {IMESSAGE_PERMISSIONS.map((permission) => (
              <PermissionRow
                key={permission.label}
                icon={permission.icon}
                title={permission.label}
                action={<PermissionActionLink>Connected</PermissionActionLink>}
              />
            ))}
          </ConfigureSection>

          <ConfigureSection title="Actions">
            <ActionRow
              icon={Plus}
              label={minting ? "Creating code…" : "Link another iPhone"}
              onClick={mint}
              disabled={minting || token !== null}
            />
            <ActionRow
              icon={Trash2}
              label="Delete all connections"
              destructive
              onClick={() => updateState({ confirmingDeleteAll: true })}
              disabled={unlinking !== null}
            />
            {confirmingDeleteAll && (
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-foreground/[0.02]">
                <p className="text-xs text-foreground/55 leading-relaxed">{DELETE_ALL_NOTE}</p>
                <button
                  type="button"
                  onClick={() => {
                    updateState({ confirmingDeleteAll: false })
                    void unlink("all")
                  }}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Confirm
                </button>
              </div>
            )}
          </ConfigureSection>
        </>
      ) : (
        <div className="space-y-3">
          {!token && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/40 leading-relaxed">
                Link your iPhone to text your store&apos;s agent — order lookups, daily digests, and one-tap approvals.
              </p>
              <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Tap “Link your iPhone” below</li>
                <li>Scan the code with your iPhone camera</li>
                <li>Send the prefilled message — your iPhone links instantly</li>
              </ol>
            </div>
          )}
          {connectBody ?? (
            <Button
              size="sm"
              disabled={minting}
              onClick={mint}
              className="h-9 px-4 font-medium"
            >
              {minting ? <Loader2 className="size-3.5 animate-spin" /> : "Link your iPhone"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
