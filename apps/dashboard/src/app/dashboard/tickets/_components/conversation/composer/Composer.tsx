"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { useOrganization } from "@clerk/nextjs"
import { Bot, Send, Loader2, Lock, StickyNote } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import type { CannedResponse } from "@/types"

interface ShopifyData {
  customer: { first_name: string; last_name: string } | null
  orders: { name: string }[]
  shop?: string
}

interface Props {
  customerName: string
  agentName?: string
  channelType?: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  value: string
  isNote: boolean
  isClerkMode?: boolean
  isNoteMode?: boolean
  hideToggle?: boolean
  placeholder?: string
  isDrafting: boolean
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onClearClerk?: () => void
  onSend: (isNote: boolean) => void
  onDraft: () => void
  onToggleNote?: (isNote: boolean) => void
  onAddNote?: () => void
  onCancelNote?: () => void
}

export default function Composer({
  customerName,
  agentName = "Clerk",
  channelType,
  shopifyCustomerId,
  customerPlatformId,
  value,
  isNote,
  isClerkMode = false,
  isNoteMode = false,
  hideToggle = false,
  placeholder,
  isDrafting,
  isSending,
  error,
  onChange,
  onClearClerk,
  onSend,
  onDraft,
  onToggleNote,
  onAddNote,
  onCancelNote,
}: Props) {
  const { organization } = useOrganization()

  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: cannedData } = useSWR<{ responses: CannedResponse[] }>(
    slashQuery !== null ? '/api/canned-responses' : null,
    fetcher,
  )

  // Same SWR key as ContextPanel — deduplicated, no extra requests
  const shopifySwrKey =
    channelType === 'email' && customerPlatformId
      ? `/api/shopify/customer?email=${encodeURIComponent(customerPlatformId)}`
      : shopifyCustomerId
        ? `/api/shopify/customer?customerId=${encodeURIComponent(shopifyCustomerId)}`
        : null
  const { data: shopifyData } = useSWR<ShopifyData>(shopifySwrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const filteredCanned = slashQuery !== null
    ? (cannedData?.responses ?? []).filter(r => {
        const q = slashQuery.toLowerCase()
        const matchesQuery = !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)
        const matchesChannel = r.channels.length === 0 || !channelType || r.channels.includes(channelType)
        return matchesQuery && matchesChannel
      })
    : []

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0) }, [slashQuery, filteredCanned.length])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const handleTextChange = (newValue: string) => {
    onChange(newValue)
    const match = newValue.match(/(^|\s)\/(\S*)$/)
    if (match) {
      setSlashQuery(match[2])
    } else {
      setSlashQuery(null)
    }
  }

  const insertCanned = (r: CannedResponse) => {
    let body = r.body

    // Substitute variables using Shopify data when available
    const shopifyCustomer = shopifyData?.customer
    const shopifyOrders   = shopifyData?.orders ?? []

    if (shopifyCustomer?.first_name) {
      body = body.replace(/{{customer_name}}/g, shopifyCustomer.first_name)
    }
    if (shopifyOrders[0]?.name) {
      body = body.replace(/{{order_number}}/g, shopifyOrders[0].name)
    }
    if (organization?.name) {
      body = body.replace(/{{store_name}}/g, organization.name)
    }
    const newValue = value.replace(/(^|\s)\/\S*$/, (m) => {
      const prefix = m.match(/^\s/) ? m[0] : ''
      return prefix + body
    })
    onChange(newValue)
    setSlashQuery(null)
    setSelectedIdx(0)
    textareaRef.current?.focus()
    // Fire-and-forget usage tracking
    fetch(`/api/canned-responses/${r.id}/use`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-background border-t border-border shrink-0">
      {/* Canned response popover */}
      {slashQuery !== null && filteredCanned.length > 0 && (
        <div
          ref={listRef}
          className="mb-2 rounded-md border border-white/[0.12] bg-popover shadow-lg overflow-hidden max-h-52 overflow-y-auto"
        >
          {filteredCanned.map((r, idx) => (
            <button
              key={r.id}
              onMouseDown={e => { e.preventDefault(); insertCanned(r) }}
              onMouseEnter={() => setSelectedIdx(idx)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors border-b border-white/[0.05] last:border-0 ${
                idx === selectedIdx ? 'bg-white/[0.10]' : 'hover:bg-white/[0.07]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/70">{r.title}</p>
                <p className="text-xs text-white/35 truncate">{r.body}</p>
              </div>
              {r.channels.length > 0 && (
                <div className="flex items-center gap-1 shrink-0 pt-px">
                  {r.channels.map(ch => (
                    <span
                      key={ch}
                      className={`w-1.5 h-1.5 rounded-full ${
                        ch === 'email' ? 'bg-blue-400' : ch === 'ig_dm' ? 'bg-pink-400' : 'bg-green-400'
                      }`}
                    />
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <div className={`border rounded-md overflow-hidden transition-colors ${
        error
          ? 'border-red-500/40'
          : isClerkMode
            ? 'border-violet-500 focus-within:border-violet-400'
            : isNoteMode
              ? 'border-amber-400/50 focus-within:border-amber-400/80'
              : isNote
                ? 'border-violet-400/30 focus-within:border-violet-400/60'
                : 'border-white/[0.12] focus-within:border-white/[0.25]'
      }`}>
        <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-2 min-h-[48px]">
          {isClerkMode && (
            <span className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-[11px] font-semibold px-2.5 py-[5px] rounded-full shrink-0">
              <Bot className="w-3 h-3" />
              @{agentName.toLowerCase()}
            </span>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={e => {
              // Slash-picker keyboard navigation
              if (slashQuery !== null && filteredCanned.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelectedIdx(i => (i + 1) % filteredCanned.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelectedIdx(i => (i - 1 + filteredCanned.length) % filteredCanned.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
                  e.preventDefault()
                  insertCanned(filteredCanned[selectedIdx])
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSlashQuery(null)
                  return
                }
              }

              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                if (value.trim() && !isSending) onSend(isNote)
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                const target = e.target as HTMLTextAreaElement
                const start = target.selectionStart
                const end = target.selectionEnd
                const newValue = value.substring(0, start) + '\n' + value.substring(end)
                onChange(newValue)
                setTimeout(() => {
                  target.selectionStart = start + 1
                  target.selectionEnd = start + 1
                }, 0)
              }
              if (e.key === 'Backspace' && value === '' && isClerkMode && onClearClerk) {
                e.preventDefault()
                onClearClerk()
              }
            }}
            disabled={isSending}
            className="flex-1 w-0 bg-transparent resize-none outline-none text-base md:text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
            placeholder={isNoteMode ? 'Add a note for your team…' : placeholder ?? (isClerkMode ? `What should ${agentName} do?` : isNote ? 'Add a private note for your team…' : `Reply to ${customerName}…`)}
          />
        </div>
        <div className="flex justify-between items-center px-3 pb-2.5">
          {isNoteMode && onCancelNote ? (
            <button
              onClick={onCancelNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-white/30 hover:text-white/60 transition-colors"
            >
              Cancel note
            </button>
          ) : onAddNote ? (
            <button
              onClick={onAddNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-400/70 hover:text-amber-400 transition-colors"
            >
              <StickyNote className="w-3 h-3" />
              Add note
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 hidden sm:block">↵ to send</span>
            <button
              disabled={!value.trim() || isSending}
              onClick={() => onSend(isNote)}
              className={`flex items-center gap-1.5 text-xs font-semibold disabled:bg-white/[0.06] disabled:text-white/25 h-8 px-4 rounded-md transition-colors ${
                isClerkMode
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : isNoteMode
                    ? 'bg-amber-500 text-white hover:bg-amber-400'
                    : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              {isSending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isClerkMode ? 'Running…' : 'Saving…'}</>
              ) : isClerkMode ? (
                <><Bot className="w-3.5 h-3.5" /> Ask Clerk</>
              ) : isNoteMode ? (
                <><StickyNote className="w-3.5 h-3.5" /> Save note</>
              ) : isNote ? (
                <><Lock className="w-3.5 h-3.5" /> Add Note</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Send</>
              )}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-400 font-medium px-1">{error}</p>
      )}
    </div>
  )
}
