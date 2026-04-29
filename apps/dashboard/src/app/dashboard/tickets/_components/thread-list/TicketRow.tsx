"use client"

import Image from "next/image"
import { Ban, CheckSquare, Flag, RotateCcw, Sparkle, Sparkles, Square } from "lucide-react"
import { getSlaInfo } from "./sla"
import { getAvatarGradient, getInitials, getTagStyle, type TicketListTab } from "./constants"
import type { Ticket } from "@/types"

interface TicketRowProps {
  activeTab: TicketListTab
  activeTicketId: string | null
  hasSelection: boolean
  isSearchMode?: boolean
  isSelected: boolean
  ticket: Ticket
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
}

export function TicketRow({
  activeTab,
  activeTicketId,
  hasSelection,
  isSearchMode,
  isSelected,
  ticket,
  onSelectTicket,
  onToggleSelect,
  onMarkAsSpam,
  onRecover,
}: TicketRowProps) {
  const lastRealMsg = [...ticket.messages].reverse().find(message => message.sender !== "note")
  const awaitingReply = ticket.status === "open" && lastRealMsg?.sender === "customer"
  const sla = awaitingReply ? getSlaInfo(ticket.lastCustomerMessageAt) : null
  const isActive = activeTicketId === ticket.id
  const tagStyle = getTagStyle(ticket.tag)
  const gradient = getAvatarGradient(ticket.customer)
  const initials = getInitials(ticket.customer)
  const closed = ticket.status === "closed" || activeTab === "closed"

  const overdue = sla?.dot === "bg-red-400"

  return (
    <div
      className={`cursor-pointer relative px-4 py-2 mt-0.5 transition-colors group ${
        isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
        isActive ? "bg-green-400" : "bg-transparent"
      }`} />

      <button
        onClick={event => { event.stopPropagation(); onToggleSelect(ticket.id) }}
        className={`absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${
          hasSelection || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {isSelected
          ? <CheckSquare className="w-3.5 h-3.5 text-white/70" />
          : <Square className="w-3.5 h-3.5 text-white/20" />
        }
      </button>

      <div
        onClick={() => onSelectTicket(ticket.id)}
        className={`flex items-start gap-3 transition-all ${hasSelection ? "pl-5" : "group-hover:pl-5"}`}
      >
        <div className="relative w-9 h-9 shrink-0">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[14px] font-bold shadow-sm`}>
            {initials}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
            <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain brightness-0 invert opacity-80" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold text-white/90 truncate">{ticket.customer}</span>
            <span className={`text-[10px] shrink-0 ${overdue ? "text-red-400 font-semibold" : "text-white/30"}`}>{ticket.time}</span>
          </div>

          <p className="text-[13px] font-medium text-white/80 truncate mb-0.5">{ticket.subject}</p>
          <p className="text-xs text-white/40 line-clamp-1 mb-2">{ticket.preview}</p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagStyle.className}`}>
              {tagStyle.label}
            </span>
            {ticket.hasPlan && !closed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                <Sparkles className="w-2.5 h-2.5 mr-1"/> Plan ready
              </span>
            )}
            {ticket.filterStatus === "questionable" && !closed && (
              <span
                title={ticket.filterReason ?? undefined}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400"
              >
                <Flag className="w-2.5 h-2.5 mr-1" /> Flagged
              </span>
            )}
            {closed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-400/10 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Closed
              </span>
            )}
            {!sla && isSearchMode && ticket.status && !closed && (
              <span className="text-[10px] text-white/25 font-medium capitalize ml-auto">{ticket.status}</span>
            )}
          </div>
        </div>
      </div>

      {!hasSelection && !isSearchMode && (activeTab === "filtered"
        ? onRecover && (
            <button
              onClick={event => { event.stopPropagation(); onRecover(ticket.id) }}
              title="Recover to inbox"
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-emerald-400"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )
        : !closed && ticket.filterStatus !== "filtered" && onMarkAsSpam && (
            <button
              onClick={event => { event.stopPropagation(); onMarkAsSpam(ticket.id) }}
              title="Mark as spam"
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-red-400"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          )
      )}
    </div>
  )
}
