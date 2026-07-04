import type { ReactNode } from "react"

export interface ChatMessage {
  from: "agent" | "user"
  text: string
  time: string
}

export interface ChatVariantViewProps {
  title: string
  subtitle: string
  avatar: string
  avatarBg: string
  avatarSrc?: string
  messages: ChatMessage[]
  count: number
  typing: boolean
}

export type ClusterPosition = "single" | "first" | "middle" | "last"

export const IOS_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif"

function StatusBarIcons() {
  return (
    <div className="flex items-center gap-[0.37em]">
      <svg width="1.26em" height="0.81em" viewBox="0 0 17 11" fill="currentColor" aria-hidden>
        <rect x="0" y="7" width="3" height="4" rx="0.5" />
        <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
        <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" />
        <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
      </svg>
      <svg width="1.11em" height="0.81em" viewBox="0 0 15 11" fill="currentColor" aria-hidden>
        <path d="M7.5 2.2C5.1 2.2 2.9 3.1 1 4.8l1.1 1.1C3.7 4.3 5.5 3.5 7.5 3.5s3.8.8 5.4 2.4l1.1-1.1C10.1 3.1 7.9 2.2 7.5 2.2z" />
        <path d="M7.5 5.5c-1.5 0-2.9.6-3.9 1.7l1.1 1.1c.7-.7 1.7-1.1 2.8-1.1s2.1.4 2.8 1.1l1.1-1.1C10.4 6.1 9 5.5 7.5 5.5z" />
        <circle cx="7.5" cy="9.5" r="1.5" />
      </svg>
      <svg width="1.85em" height="0.89em" viewBox="0 0 25 12" fill="none" aria-hidden>
        <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" strokeOpacity="0.35" />
        <rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor" />
        <path d="M23 4.5v3a1.5 1.5 0 0 0 0-3z" fill="currentColor" fillOpacity="0.4" />
      </svg>
    </div>
  )
}

/** Frame-level overlay: stays put while app screens slide beneath it. */
export function PhoneStatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-[2em] pt-[1em] text-[min(13.5px,4.5cqw)] text-stone-900">
      <span className="font-semibold leading-none tracking-tight">9:41</span>
      <StatusBarIcons />
    </div>
  )
}

export function DynamicIsland() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[min(9px,3cqw)] z-40 h-[min(27px,9.2cqw)] w-[min(93px,31.6cqw)] -translate-x-1/2 rounded-full bg-black">
      <span className="absolute right-[min(6px,2cqw)] top-1/2 size-[min(15px,5.1cqw)] -translate-y-1/2 rounded-full bg-[#0c0c10]">
        <span className="absolute left-1/2 top-1/2 size-[min(7px,2.4cqw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#141c2a] shadow-[inset_0_0_3px_rgba(70,110,180,0.55)]" />
      </span>
    </div>
  )
}

export function TimeDivider({ children }: { children: ReactNode }) {
  return (
    <div className="animate-[m-msg_0.35s_ease] py-2.5 text-center text-[0.85em] text-stone-400">
      {children}
    </div>
  )
}

export function TypingBubble({ receivedClass }: { receivedClass: string }) {
  return (
    <div
      className={`inline-flex w-fit shrink-0 animate-[m-msg_0.25s_ease] items-center gap-1 rounded-[18px] rounded-bl-[5px] px-3.5 py-2.5 ${receivedClass}`}
      style={{ fontFamily: IOS_FONT }}
    >
      {[0, 1, 2].map(index => (
        <span
          key={index}
          className="size-1.5 animate-[m-typedot_1s_ease_infinite] rounded-full bg-stone-400"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </div>
  )
}

export function getClusterPosition(messages: ChatMessage[], index: number): ClusterPosition {
  const current = messages[index]
  const previousMatches = index > 0 && messages[index - 1].from === current.from
  const nextMatches = index < messages.length - 1 && messages[index + 1].from === current.from
  if (!previousMatches && !nextMatches) return "single"
  if (!previousMatches && nextMatches) return "first"
  if (previousMatches && nextMatches) return "middle"
  return "last"
}

export function receivedBubbleRadius(cluster: ClusterPosition) {
  if (cluster === "single" || cluster === "last") return "rounded-[18px] rounded-bl-[5px]"
  if (cluster === "first") return "rounded-[18px] rounded-bl-[18px]"
  return "rounded-[18px]"
}

export function sentBubbleRadius(cluster: ClusterPosition) {
  if (cluster === "single" || cluster === "last") return "rounded-[18px] rounded-br-[5px]"
  if (cluster === "first") return "rounded-[18px] rounded-br-[18px]"
  return "rounded-[18px]"
}
