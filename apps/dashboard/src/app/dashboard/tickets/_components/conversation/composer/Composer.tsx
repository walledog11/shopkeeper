"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { useOrganization } from "@clerk/nextjs"
import { Bot, Loader2 } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { buildShopifyCustomerKey } from "@/lib/shopify/customer-key"
import type { CannedResponse } from "@/types"
import type { ShopifyData } from "@/types/shopify"
import { useMediaQuery } from "@/hooks/useMediaQuery"

interface IntegrationRow {
  platform: string
  fromEmail?: string | null
  externalAccountId: string
}

interface Props {
  customerName: string
  agentName?: string
  channelType?: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  value: string
  isClerkMode?: boolean
  viewTab: "chat" | "notes"
  noteCount: number
  onViewTabChange: (tab: "chat" | "notes") => void
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onClearClerk?: () => void
  onSend: (isNote: boolean) => void
}

export default function Composer({
  customerName,
  agentName = "Clerk",
  channelType,
  shopifyCustomerId,
  customerPlatformId,
  value,
  isClerkMode = false,
  viewTab,
  noteCount,
  onViewTabChange,
  isSending,
  error,
  onChange,
  onClearClerk,
  onSend,
}: Props) {
  const { organization } = useOrganization()

  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shouldRestoreTextareaFocusRef = useRef(false)

  const isNoteTab = viewTab === "notes"
  const isEmailLike = channelType === "email" || channelType === "shopify"

  const { data: cannedData } = useSWR<{ responses: CannedResponse[] }>(
    slashQuery !== null ? '/api/canned-responses' : null,
    fetcher,
  )

  const { data: integrations } = useSWR<IntegrationRow[]>(
    isEmailLike ? '/api/integrations' : null,
    fetcher,
  )
  const emailIntegration = integrations?.find(i => i.platform === 'email')
  const senderEmail = emailIntegration?.fromEmail || emailIntegration?.externalAccountId || null

  // Same SWR key as ContextPanel, so the latest-order context is deduplicated.
  const shopifySwrKey = buildShopifyCustomerKey({
    channelType,
    customerPlatformId,
    shopifyCustomerId,
    orderLimit: 1,
  })
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

  useEffect(() => { setSelectedIdx(0) }, [slashQuery, filteredCanned.length])

  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const cap = Math.min(viewportHeight * 0.4, 320)
    ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [resizeTextarea, value])

  useEffect(() => {
    window.visualViewport?.addEventListener("resize", resizeTextarea)
    window.addEventListener("resize", resizeTextarea)

    return () => {
      window.visualViewport?.removeEventListener("resize", resizeTextarea)
      window.removeEventListener("resize", resizeTextarea)
    }
  }, [resizeTextarea])

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
    const shopifyCustomer = shopifyData?.customer
    const shopifyOrders = shopifyData?.orders ?? []

    if (shopifyCustomer?.first_name) {
      body = body.replace(/{{customer_name}}/g, shopifyCustomer.first_name)
    }
    if (shopifyOrders[0]?.name) {
      body = body.replace(/{{order_number}}/g, shopifyOrders[0].name)
    }
    if (organization?.name) {
      body = body.replace(/{{store_name}}/g, organization.name)
    }
    const hadSlash = /(^|\s)\/\S*$/.test(value)
    const newValue = hadSlash
      ? value.replace(/(^|\s)\/\S*$/, (m) => {
          const prefix = m.match(/^\s/) ? m[0] : ''
          return prefix + body
        })
      : value + (value && !value.endsWith(' ') && !value.endsWith('\n') ? ' ' : '') + body
    onChange(newValue)
    setSlashQuery(null)
    setSelectedIdx(0)
    textareaRef.current?.focus()
    fetch(`/api/canned-responses/${r.id}/use`, { method: 'POST' }).catch(() => {})
  }

  const isMobile = useMediaQuery('(max-width: 767px)')
  const placeholderParts = isNoteTab
    ? ['Add a private note for your team', ...(isMobile ? [] : ['⌘↵ to send'])]
    : [
        `Reply to ${customerName}…`,
        `type @${agentName.toLowerCase()} to invoke ${agentName}`,
        ...(isMobile ? [] : ['⌘↵ to send']),
      ]
  const placeholder = placeholderParts.join('  ·  ')

  const sendDisabled = !value.trim() || isSending
  const rememberTextareaFocus = () => {
    shouldRestoreTextareaFocusRef.current = document.activeElement === textareaRef.current
  }
  const handleViewTabSelect = (tab: "chat" | "notes") => {
    onViewTabChange(tab)

    if (shouldRestoreTextareaFocusRef.current) {
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
    }

    shouldRestoreTextareaFocusRef.current = false
  }

  return (
    <div className="bg-background border-t border-border shrink-0 pb-[max(0rem,env(safe-area-inset-bottom))]">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 border-b border-border">
        <TabButton
          active={!isNoteTab}
          onClick={() => handleViewTabSelect('chat')}
          onPointerDown={rememberTextareaFocus}
        >
          Reply
        </TabButton>
        <TabButton
          active={isNoteTab}
          onClick={() => handleViewTabSelect('notes')}
          onPointerDown={rememberTextareaFocus}
        >
          Internal note
          {noteCount > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              isNoteTab ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.08] text-white/35'
            }`}>
              {noteCount}
            </span>
          )}
        </TabButton>
      </div>

      <div className="relative px-5 pt-3">
        {/* Canned response popover */}
        {slashQuery !== null && filteredCanned.length > 0 && (
          <div
            ref={listRef}
            className="absolute left-5 right-5 bottom-full mb-2 rounded-md border border-white/[0.12] bg-popover shadow-lg overflow-hidden max-h-52 overflow-y-auto z-10"
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

        <div className="flex items-start gap-2">
          {isClerkMode && (
            <span className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-[11px] font-semibold px-2.5 py-[5px] rounded-full shrink-0 mt-0.5">
              <Bot className="w-3 h-3" />
              @{agentName.toLowerCase()}
            </span>
          )}
          <textarea
            data-testid="reply-composer-textarea"
            ref={textareaRef}
            value={value}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={e => {
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

              // ⌘/Ctrl + Enter sends; plain Enter inserts newline (default).
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (!sendDisabled) onSend(isNoteTab)
                return
              }
              if (e.key === 'Backspace' && value === '' && isClerkMode && onClearClerk) {
                e.preventDefault()
                onClearClerk()
              }
            }}
            disabled={isSending}
            rows={2}
            className="flex-1 w-0 min-h-[44px] max-h-[40vh] overflow-y-auto bg-transparent resize-none outline-none text-base md:text-sm text-white/80 placeholder:text-white/30 disabled:opacity-50"
            placeholder={placeholder}
          />
        </div>

        <div className="flex items-center justify-between pt-3 pb-3">
          <div />
          <div className="flex items-center gap-3">
            {isEmailLike && senderEmail && !isNoteTab && !isClerkMode && (
              <span className="text-xs text-white/40 hidden sm:block">
                Replies as <span className="font-semibold text-white/70">{senderEmail}</span>
              </span>
            )}
            <button
              data-testid="reply-composer-send"
              disabled={sendDisabled}
              onClick={() => onSend(isNoteTab)}
              className={`flex items-center gap-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed h-8 pl-3 pr-2 rounded-md transition-colors ${
                isClerkMode
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : isNoteTab
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : 'bg-emerald-500 text-white hover:bg-emerald-400'
              }`}
            >
              {isSending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isClerkMode ? 'Running…' : 'Sending…'}</>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <span className="text-sm leading-none">↑</span>
                    {isClerkMode ? `Ask ${agentName}` : isNoteTab ? 'Save note' : 'Send'}
                  </span>
                  <kbd className="hidden md:inline bg-black/25 text-white/80 text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none">
                    ⌘↵
                  </kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-1 mb-2 text-[11px] text-red-400 font-medium px-5">{error}</p>
      )}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  onPointerDown?: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, onPointerDown, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`relative inline-flex items-center text-sm font-semibold px-3 py-2 transition-colors ${
        active ? 'text-white' : 'text-white/35 hover:text-white/60'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-500 rounded-t-sm" />
      )}
    </button>
  )
}
