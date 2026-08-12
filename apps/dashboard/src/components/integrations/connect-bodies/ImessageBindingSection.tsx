"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import useSWR from "swr"
import { Bell, Check, Copy, Loader2, Plus, Smartphone, Trash2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import {
  channelBindingError,
  channelBindingValue,
  useChannelBindingAttempt,
} from "@/hooks/useChannelBindingAttempt"
import { fetcher } from "@/lib/api/fetcher"
import { formatDate } from "@/lib/format/date"
import { buildSmsDeepLink, formatHandleLabel } from "@/lib/imessage-connect"
import { startImessageBinding } from "@/lib/integrations/channel-binding-client"
import { captureClientProductEvent } from "@/lib/product-events"
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
  error: string | null
  unlinking: string | "all" | null
}

const INITIAL_STATE: ImessageBindingState = {
  confirmingDeleteAll: false,
  error: null,
  unlinking: null,
}

function mergeState(
  state: ImessageBindingState,
  patch: Partial<ImessageBindingState>,
): ImessageBindingState {
  return { ...state, ...patch }
}

// Operator-channel binding: the merchant links their iPhone by texting a single-use
// connect code to Shopkeeper's platform iMessage line. No per-merchant credentials —
// `handle` is the fixed line to text, surfaced so the merchant knows where to send it.
export function ImessageBindingSection({ handle }: { handle: string | null }) {
  const { data, mutate } = useSWR<ImessageBindStatus>('/api/integrations/imessage/bind', fetcher)
  const [{ confirmingDeleteAll, error: actionError, unlinking }, updateState] =
    useReducer(mergeState, INITIAL_STATE)
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handles = data?.handles ?? []
  const isConnected = handles.length > 0
  const binding = useChannelBindingAttempt({
    connectionCount: handles.length,
    requestBinding: (signal) => {
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform: "imessage",
      })
      return startImessageBinding({ signal })
    },
    refreshStatus: mutate,
    requestFailureMessage: "Couldn't create a connect code.",
    refreshFailureMessage: "Couldn't verify the iMessage connection. Try again.",
  })
  const token = channelBindingValue(binding.state)
  const minting = binding.state.status === "requesting"
  const error = actionError ?? channelBindingError(binding.state)
  const deepLink = token && handle ? buildSmsDeepLink(handle, token) : null

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  async function copyToken() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2_000)
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
      binding.reset()
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
            <div className="rounded-lg bg-foreground p-2 shadow-sm">
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
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
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
      {error && <p className="text-xs text-red-600">{error}</p>}

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
              onClick={() => { void binding.start() }}
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
                  className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors whitespace-nowrap shrink-0"
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
              onClick={() => { void binding.start() }}
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
