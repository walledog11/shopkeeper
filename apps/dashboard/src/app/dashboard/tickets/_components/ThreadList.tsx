"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Search, Inbox, X, CheckSquare, Square, Loader2, Archive, Tag } from "lucide-react"
import type { ChannelType, Ticket } from "@/types"
import { getChannelInfo } from "@/lib/channels"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const FILTER_IDS: ChannelType[] = ['email', 'ig_dm', 'sms_agent']

const CHANNEL_FILTERS = FILTER_IDS.map(id => {
  const info = getChannelInfo(id)
  return { id, logo: info.logo, label: info.name }
})

interface Props {
  tickets: Ticket[]
  totalCount: number
  activeTab: 'open' | 'closed'
  activeFilter: ChannelType | null
  activeTicketId: string | null
  openCount: number
  searchQuery: string
  isSearchMode?: boolean
  isSearchLoading?: boolean
  selectedIds: string[]
  onSearchChange: (q: string) => void
  onTabChange: (tab: 'open' | 'closed') => void
  onFilterChange: (id: ChannelType | null) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onBulkClose: () => void
  onBulkArchive: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

export default function ThreadList({
  tickets, totalCount, activeTab, activeFilter, activeTicketId, openCount,
  searchQuery, isSearchMode, isSearchLoading, selectedIds,
  onSearchChange, onTabChange, onFilterChange, onSelectTicket,
  onToggleSelect, onBulkClose, onBulkArchive, onBulkTag, onClearSelection,
  hasMore, isLoadingMore, onLoadMore,
}: Props) {
  const hasSelection = selectedIds.length > 0
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)

  return (
    <>
      {/* Filter bar */}
      <div className="px-3 pt-5 md:pt-3 pb-2 border-b border-border bg-background space-y-2">

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
          <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search all tickets…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Open / Closed tabs */}
        {!isSearchMode && (
          <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as 'open' | 'closed')}>
            <TabsList className="w-full bg-white/[0.06] h-auto p-0.5 gap-0.5">
              <TabsTrigger
                value="open"
                className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'open' ? 'bg-amber-400' : 'bg-white/20'}`} />
                Open
                {openCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === 'open' ? 'bg-white/[0.15] text-white' : 'bg-white/[0.08] text-white/35'
                  }`}>
                    {openCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'closed' ? 'bg-green-400' : 'bg-white/20'}`} />
                Closed
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Search mode label */}
        {isSearchMode && (
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              {isSearchLoading && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              <span className="text-[11px] font-semibold text-white/40">
                {isSearchLoading ? 'Searching…' : 'Search results'}
              </span>
            </div>
            <button onClick={() => onSearchChange('')} className="text-[11px] text-white/30 hover:text-white/60 font-medium">
              Clear
            </button>
          </div>
        )}

        {/* Channel filter */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onFilterChange(null)}
              className={`flex-1 h-9 rounded-md border text-[11px] font-semibold transition-all ${
                activeFilter === null
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60'
              }`}
            >
              All
            </button>
            {CHANNEL_FILTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => onFilterChange(activeFilter === ch.id ? null : ch.id)}
                title={ch.label}
                className={`flex-1 h-9 rounded-md border flex items-center justify-center transition-all ${
                  activeFilter === ch.id
                    ? 'border-white/[0.30] bg-white/[0.10]'
                    : 'border-border bg-transparent hover:border-white/[0.18] hover:bg-white/[0.05]'
                }`}
              >
                <Image src={ch.logo} alt={ch.label} width={16} height={16} className="object-contain opacity-60 brightness-0 invert" />
              </button>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {hasSelection ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between bg-white/[0.10] border border-white/[0.12] rounded-md px-3 py-2">
              <span className="text-[11px] font-semibold text-white/80">
                {selectedIds.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onBulkClose}
                  className="text-[11px] font-semibold text-white bg-white/[0.15] hover:bg-white/[0.22] px-2.5 py-1 rounded transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={onBulkArchive}
                  title="Archive selected"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowTagInput(v => !v)}
                  title="Tag selected"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" />
                </button>
                <button onClick={onClearSelection} className="text-white/40 hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {showTagInput && (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  onBulkTag(tagInput.trim())
                  setTagInput('')
                  setShowTagInput(false)
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder="Tag name…"
                  className="flex-1 text-[11px] text-white/70 bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"
                />
                <button
                  type="submit"
                  disabled={!tagInput.trim()}
                  className="text-[11px] font-semibold text-white bg-white/[0.15] hover:bg-white/[0.22] disabled:opacity-40 px-2.5 py-1 rounded transition-colors"
                >
                  Apply
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-white/25 font-medium px-0.5">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {!isSearchMode && activeFilter ? ` · ${CHANNEL_FILTERS.find(c => c.id === activeFilter)?.label ?? activeFilter}` : ''}
            {searchQuery ? ` · "${searchQuery}"` : ''}
          </p>
        )}
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {tickets.map((ticket) => {
          const isSelected = selectedIds.includes(ticket.id)
          const lastRealMsg = [...ticket.messages].reverse().find(m => m.sender !== 'note')
          const awaitingReply = ticket.status === 'open' && lastRealMsg?.sender === 'customer'
          return (
            <div
              key={ticket.id}
              className={`cursor-pointer relative px-4 py-3.5 transition-colors group ${
                activeTicketId === ticket.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
              }`}
            >
              {/* Active indicator */}
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
                activeTab === 'closed' && activeTicketId === ticket.id ? 'bg-green-400' :
                activeTicketId === ticket.id ? 'bg-amber-400' : 'bg-transparent'
              }`} />

              {/* Checkbox */}
              <button
                onClick={e => { e.stopPropagation(); onToggleSelect(ticket.id) }}
                className={`absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${
                  hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {isSelected
                  ? <CheckSquare className="w-3.5 h-3.5 text-white/70" />
                  : <Square className="w-3.5 h-3.5 text-white/20" />
                }
              </button>

              {/* Content */}
              <div
                onClick={() => onSelectTicket(ticket.id)}
                className={`transition-all ${hasSelection ? 'pl-5' : 'group-hover:pl-5'}`}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 relative shrink-0 opacity-70">
                      <Image src={ticket.logo} fill alt={ticket.platform} className="object-contain" />
                    </div>
                    <span className="text-xs font-semibold text-white/80 truncate">{ticket.customer}</span>
                    {awaitingReply && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Awaiting your reply" />
                    )}
                  </div>
                  <span className="text-[10px] text-white/25 shrink-0">{ticket.time}</span>
                </div>

                <p className="text-[11px] font-medium text-white/55 truncate mb-1">{ticket.subject}</p>
                <p className="text-[11px] text-white/30 line-clamp-1 mb-2">{ticket.preview}</p>

                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    ticket.status === 'closed' || activeTab === 'closed'
                      ? 'bg-green-400/10 text-green-400'
                      : 'bg-amber-400/10 text-amber-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      ticket.status === 'closed' || activeTab === 'closed' ? 'bg-green-400' : 'bg-amber-400'
                    }`} />
                    {ticket.status === 'closed' || activeTab === 'closed' ? 'Closed' : 'Open'}
                  </span>
                  {awaitingReply ? (
                    <span className="text-[10px] font-semibold text-amber-400/70">Awaiting reply</span>
                  ) : isSearchMode && ticket.status ? (
                    <span className="text-[10px] text-white/20 font-medium capitalize">{ticket.status}</span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {tickets.length === 0 && (
          isSearchMode ? (
            <div className="text-center p-8 text-white/30 text-sm">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : totalCount === 0 && !searchQuery && !activeFilter ? (
            <div className="flex flex-col items-center text-center p-8 gap-3">
              <div className="w-12 h-12 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
                <Inbox className="w-5 h-5 text-white/20" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/50 mb-1">No tickets yet</p>
                <p className="text-xs text-white/30 mb-3">Connect a channel to start receiving customer messages.</p>
                <Link href="/dashboard/integrations" className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">
                  Set up integrations →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 text-white/25 text-sm">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${activeTab} tickets${activeFilter ? ` from ${CHANNEL_FILTERS.find(c => c.id === activeFilter)?.label ?? activeFilter}` : ''}.`
              }
            </div>
          )
        )}

        {!isSearchMode && hasMore && (
          <div className="px-4 py-3 border-t border-white/[0.05]">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full text-xs font-semibold text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors py-1"
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
