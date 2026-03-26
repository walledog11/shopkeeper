"use client"

import Image from "next/image"
import Link from "next/link"
import { Search, Inbox, X, CheckSquare, Square } from "lucide-react"
import type { ChannelType, Ticket } from "@/types"

const CHANNEL_FILTERS: { id: ChannelType; logo: string; label: string }[] = [
  { id: 'email',  logo: '/logos/gmail.png',          label: 'Gmail' },
  { id: 'ig_dm',  logo: '/logos/instagram-logo.png', label: 'Instagram' },
]

interface Props {
  tickets: Ticket[]
  totalCount: number
  activeTab: 'open' | 'closed'
  activeFilter: ChannelType | null
  activeTicketId: string | null
  openCount: number
  searchQuery: string
  isSearchMode?: boolean
  selectedIds: string[]
  onSearchChange: (q: string) => void
  onTabChange: (tab: 'open' | 'closed') => void
  onFilterChange: (id: ChannelType | null) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onBulkClose: () => void
  onClearSelection: () => void
}

export default function ThreadList({
  tickets,
  totalCount,
  activeTab,
  activeFilter,
  activeTicketId,
  openCount,
  searchQuery,
  isSearchMode,
  selectedIds,
  onSearchChange,
  onTabChange,
  onFilterChange,
  onSelectTicket,
  onToggleSelect,
  onBulkClose,
  onClearSelection,
}: Props) {
  const hasSelection = selectedIds.length > 0

  return (
    <>
      {/* Filter bar */}
      <div className="px-3 pt-5 md:pt-3 pb-2 border-b border-slate-100 bg-white space-y-2">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9">
          <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search all tickets…"
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="text-slate-300 hover:text-slate-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Open / Closed tabs — hidden in search mode */}
        {!isSearchMode && (
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => onTabChange('open')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'open'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'open' ? 'bg-amber-500' : 'bg-slate-300'}`} />
              Open
              {openCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'open' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {openCount}
                </span>
              )}
            </button>
            <button
              onClick={() => onTabChange('closed')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'closed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'closed' ? 'bg-green-500' : 'bg-slate-300'}`} />
              Closed
            </button>
          </div>
        )}

        {/* Search mode label */}
        {isSearchMode && (
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-semibold text-slate-500">Search results</span>
            <button onClick={() => onSearchChange('')} className="text-[11px] text-slate-400 hover:text-slate-700 font-medium">
              Clear
            </button>
          </div>
        )}

        {/* Channel filter — hidden in search mode */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onFilterChange(null)}
              className={`flex-1 h-9 rounded-lg border text-[11px] font-semibold transition-all ${
                activeFilter === null
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              All
            </button>
            {CHANNEL_FILTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => onFilterChange(activeFilter === ch.id ? null : ch.id)}
                title={ch.label}
                className={`flex-1 h-9 rounded-lg border flex items-center justify-center transition-all ${
                  activeFilter === ch.id
                    ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Image src={ch.logo} alt={ch.label} width={16} height={16} className="object-contain" />
              </button>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {hasSelection ? (
          <div className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
            <span className="text-[11px] font-semibold text-white">
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onBulkClose}
                className="text-[11px] font-semibold text-white bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
              >
                Close all
              </button>
              <button
                onClick={onClearSelection}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Ticket count */
          <p className="text-[11px] text-slate-400 font-medium px-0.5">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {!isSearchMode && activeFilter ? ` · ${CHANNEL_FILTERS.find(c => c.id === activeFilter)?.label ?? activeFilter}` : ''}
            {searchQuery ? ` · "${searchQuery}"` : ''}
          </p>
        )}
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50">
        {tickets.map((ticket, idx) => {
          const isSelected = selectedIds.includes(ticket.id)
          const lastRealMsg = [...ticket.messages].reverse().find(m => m.sender !== 'note')
          const awaitingReply = ticket.status === 'open' && lastRealMsg?.sender === 'customer'
          return (
            <div
              key={ticket.id}
              className={`cursor-pointer relative px-4 py-3.5 transition-colors group ${
                activeTicketId === ticket.id ? 'bg-slate-50' : 'hover:bg-slate-50/70'
              }`}
            >
              {/* Active indicator */}
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
                activeTab === 'closed' ? 'bg-green-400' :
                activeTicketId === ticket.id ? 'bg-amber-400' :
                awaitingReply ? 'bg-amber-300' : 'bg-transparent'
              }`} />

              {/* Checkbox — appears on hover or when selection is active */}
              <button
                onClick={e => { e.stopPropagation(); onToggleSelect(ticket.id) }}
                className={`absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${
                  hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {isSelected
                  ? <CheckSquare className="w-3.5 h-3.5 text-slate-900" />
                  : <Square className="w-3.5 h-3.5 text-slate-300" />
                }
              </button>

              {/* Main content — shift right when selection is active */}
              <div
                onClick={() => onSelectTicket(ticket.id)}
                className={`transition-all ${hasSelection ? 'pl-5' : 'group-hover:pl-5'}`}
              >
                {/* Row top: channel icon + customer + time */}
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 relative shrink-0">
                      <Image src={ticket.logo} fill alt={ticket.platform} className="object-contain" />
                    </div>
                    <span className="text-xs font-semibold text-slate-900 truncate">{ticket.customer}</span>
                    {awaitingReply && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Awaiting your reply" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{ticket.time}</span>
                </div>

                {/* Subject */}
                <p className="text-[11px] font-medium text-slate-700 truncate mb-1">{ticket.subject}</p>

                {/* Preview */}
                <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{ticket.preview}</p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    ticket.status === 'closed' || activeTab === 'closed'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === 'closed' || activeTab === 'closed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {ticket.status === 'closed' || activeTab === 'closed' ? 'Closed' : 'Open'}
                  </span>
                  {awaitingReply ? (
                    <span className="text-[10px] font-semibold text-amber-600">Awaiting reply</span>
                  ) : isSearchMode && ticket.status ? (
                    <span className="text-[10px] text-slate-300 font-medium capitalize">{ticket.status}</span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {tickets.length === 0 && (
          isSearchMode ? (
            <div className="text-center p-8 text-slate-400 text-sm">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : totalCount === 0 && !searchQuery && !activeFilter ? (
            <div className="flex flex-col items-center text-center p-8 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Inbox className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">No tickets yet</p>
                <p className="text-xs text-slate-400 mb-3">Connect a channel to start receiving customer messages.</p>
                <Link
                  href="/dashboard/integrations"
                  className="text-xs font-semibold text-[#1c3b38] hover:underline"
                >
                  Set up integrations →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 text-slate-400 text-sm">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${activeTab} tickets${activeFilter ? ` from ${CHANNEL_FILTERS.find(c => c.id === activeFilter)?.label ?? activeFilter}` : ''}.`
              }
            </div>
          )
        )}
      </div>
    </>
  )
}
