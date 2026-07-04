import Image from "next/image"
import {
  TimeDivider,
  TypingBubble,
  getClusterPosition,
  receivedBubbleRadius,
  sentBubbleRadius,
  type ChatVariantViewProps,
} from "./shared"

function IMessageHeader({
  title,
  avatar,
  avatarBg,
  avatarSrc,
}: Pick<ChatVariantViewProps, "title" | "avatar" | "avatarBg" | "avatarSrc">) {
  return (
    <div className="relative flex min-h-[56px] items-center justify-center px-11 pb-2">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[20px] text-[#007AFF]"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        {avatarSrc ? (
          <span className="relative size-9 overflow-hidden rounded-full">
            <Image src={avatarSrc} alt="" fill sizes="36px" className="object-cover" />
          </span>
        ) : (
          <span
            className="grid size-9 place-items-center rounded-full text-[13px] font-semibold text-white"
            style={{ background: avatarBg }}
          >
            {avatar}
          </span>
        )}
        <div className="flex max-w-full items-center gap-px text-[0.85em] font-medium leading-tight text-stone-900">
          <span className="whitespace-nowrap">{title}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-2.5 shrink-0 text-stone-400"
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[20px] text-[#007AFF]"
          aria-hidden
        >
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </div>
    </div>
  )
}

function IMessageInputBar() {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#E9E9EB] text-stone-500"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <div className="relative min-w-0 flex-1">
        <span className="block rounded-full border border-stone-900/[0.08] bg-white py-[7px] pl-3.5 pr-9 text-[1em] text-stone-400 shadow-[0_0.5px_2px_rgba(0,0,0,0.06)]">
          iMessage
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute right-2.5 top-1/2 size-[18px] -translate-y-1/2 text-stone-400"
          aria-hidden
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
        </svg>
      </div>
    </div>
  )
}

/** 1:1 iMessage screen — no frame chrome; rendered inside PhoneFrame. */
export function IMessageScreen({
  title,
  avatar,
  avatarBg,
  avatarSrc,
  messages,
  count,
  typing,
}: ChatVariantViewProps) {
  const visible = messages.slice(0, count)
  const lastUserIndex = visible.reduce(
    (last, message, index) => (message.from === "user" ? index : last),
    -1,
  )

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-[min(13px,4.4cqw)]">
      <div className="shrink-0 border-b border-black/[0.05] bg-[#f7f7f8] pt-[40px]">
        <IMessageHeader title={title} avatar={avatar} avatarBg={avatarBg} avatarSrc={avatarSrc} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden px-3 pb-2">
        {count > 0 && (
          <TimeDivider>
            <span className="font-semibold">Today</span> {messages[0].time}
          </TimeDivider>
        )}
        {visible.map((message, index) => {
          const cluster = getClusterPosition(visible, index)
          const gap = index === 0 ? "" : visible[index - 1].from === message.from ? "mt-[2px]" : "mt-2"

          if (message.from === "agent") {
            return (
              <div
                key={`${message.from}-${message.text}`}
                className={`max-w-[80%] animate-[m-msg_0.35s_ease] self-start ${gap}`}
              >
                <div className={`bg-[#E9E9EB] px-3.5 py-[7px] text-[1em] leading-[1.35] text-stone-900 ${receivedBubbleRadius(cluster)}`}>
                  {message.text}
                </div>
              </div>
            )
          }

          return (
            <div
              key={`${message.from}-${message.text}`}
              className={`flex max-w-[80%] animate-[m-msg_0.35s_ease] flex-col items-end self-end ${gap}`}
            >
              <div className={`bg-[#007AFF] px-3.5 py-[7px] text-[1em] leading-[1.35] text-white ${sentBubbleRadius(cluster)}`}>
                {message.text}
              </div>
              {index === lastUserIndex && (
                <span className="mt-1 pr-0.5 text-[0.8em] font-medium leading-none text-stone-400">
                  Delivered
                </span>
              )}
            </div>
          )
        })}
        {typing && (
          <div className="mt-2 max-w-[80%] self-start">
            <TypingBubble receivedClass="bg-[#E9E9EB]" />
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pb-[20px] pt-1">
        <IMessageInputBar />
      </div>
    </div>
  )
}
