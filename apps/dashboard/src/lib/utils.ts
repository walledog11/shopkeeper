import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getChannelInfo } from '@/lib/channels'
import { AGENT_NOTE_PREFIX, SENDER_TYPE } from '@/lib/constants'
import { AGENT_TURN_PREFIX } from '@/lib/agent/tools'
import type { Thread, Ticket } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(dateString: string): string {
  if (!dateString) return "Just now";
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateLabel} · ${time}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function getCustomerName(customer: { name?: string | null; platformId?: string | null } | null | undefined): string {
  if (customer?.name) return customer.name
  const id = customer?.platformId
  if (!id) return 'Unknown Customer'
  // Email address — show as-is
  if (id.includes('@')) return id
  // Purely numeric — show short customer ID
  if (/^\d+$/.test(id)) return `Customer ${id.slice(-6)}`
  // Underscore-joined string — clean up and title-case
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40)
}

export function threadToTicket(thread: Thread, agentName?: string): Ticket {
  const channel = getChannelInfo(thread.channelType)
  const lastMsg = thread.messages.filter(m => m.senderType !== SENDER_TYPE.NOTE).at(-1)
  const lastCustomerMsg = thread.messages.filter(m => m.senderType === SENDER_TYPE.CUSTOMER).at(-1)
  return {
    id: thread.id,
    channelType: thread.channelType,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    time: lastMsg ? formatTime(lastMsg.sentAt) : 'New',
    subject: thread.tag || "New Inquiry",
    preview: lastMsg?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: thread.aiSummary || "Clerk is analyzing this conversation...",
    status: thread.status,
    lastCustomerMessageAt: lastCustomerMsg?.sentAt ?? null,
    hasPlan: thread.cachedPlan !== null,
    messages: thread.messages
      .filter(msg => !(msg.senderType === SENDER_TYPE.NOTE && msg.contentText?.startsWith(AGENT_TURN_PREFIX)))
      .map((msg) => {
        const isAgentNote = msg.senderType === SENDER_TYPE.NOTE && msg.contentText?.startsWith(AGENT_NOTE_PREFIX)
        return {
          id: msg.id,
          sender: msg.senderType,
          text: isAgentNote ? msg.contentText!.slice(AGENT_NOTE_PREFIX.length) : msg.contentText,
          time: formatTime(msg.sentAt),
          author: msg.senderType === SENDER_TYPE.NOTE ? (isAgentNote ? (agentName ?? 'Agent') : 'You') : undefined,
          isAgentNote,
          attachments: msg.attachments ?? [],
        }
      })
  }
}
