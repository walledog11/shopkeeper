import {
  TimeDivider,
  TypingBubble,
  getClusterPosition,
  receivedBubbleRadius,
  sentBubbleRadius,
  type ChatVariantViewProps,
} from "./shared"

function InstagramHeader({
  title,
  subtitle,
  avatar,
  avatarBg,
}: Pick<ChatVariantViewProps, "title" | "subtitle" | "avatar" | "avatarBg">) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-3 pb-2.5 pt-1.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 text-stone-900"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white ring-1 ring-black/[0.06]"
        style={{ background: avatarBg }}
      >
        {avatar}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[1.15em] font-semibold leading-tight text-stone-900">{title}</div>
        <div className="truncate text-[0.92em] leading-tight text-stone-500">{subtitle}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6 text-stone-900"
          aria-hidden
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6 text-stone-900"
          aria-hidden
        >
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </div>
    </div>
  )
}

function InstagramInputBar() {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 text-stone-900"
        aria-hidden
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      <span className="flex-1 rounded-full bg-[#efefef] px-4 py-[8px] text-[1.05em] text-stone-500">
        Message...
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 text-stone-900"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 text-stone-900"
        aria-hidden
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
      </svg>
    </div>
  )
}

function Avatar({ avatar, avatarBg }: Pick<ChatVariantViewProps, "avatar" | "avatarBg">) {
  return (
    <span
      className="grid size-[22px] shrink-0 place-items-center self-end rounded-full text-[9px] font-semibold text-white ring-1 ring-black/[0.06]"
      style={{ background: avatarBg }}
    >
      {avatar}
    </span>
  )
}

/** Instagram DM screen — no frame chrome; rendered inside PhoneFrame. */
export function InstagramScreen({
  title,
  subtitle,
  avatar,
  avatarBg,
  messages,
  count,
  typing,
}: ChatVariantViewProps) {
  const visible = messages.slice(0, count)

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-[min(13px,4.4cqw)]">
      <div className="shrink-0 border-b border-black/[0.06] pt-[44px]">
        <InstagramHeader title={title} subtitle={subtitle} avatar={avatar} avatarBg={avatarBg} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden px-3 pb-2">
        {count > 0 && <TimeDivider>Today {messages[0].time}</TimeDivider>}
        {visible.map((message, index) => {
          const cluster = getClusterPosition(visible, index)
          const gap = index === 0 ? "" : visible[index - 1].from === message.from ? "mt-[2px]" : "mt-2.5"

          if (message.from === "agent") {
            const showAvatar = cluster === "single" || cluster === "last"
            return (
              <div
                key={`${message.from}-${message.text}`}
                className={`flex max-w-[82%] animate-[m-msg_0.35s_ease] items-end gap-1.5 self-start ${gap}`}
              >
                {showAvatar
                  ? <Avatar avatar={avatar} avatarBg={avatarBg} />
                  : <span className="size-[22px] shrink-0" aria-hidden />}
                <div className={`min-w-0 bg-[#efefef] px-3.5 py-[7px] text-[1em] leading-[1.4] text-stone-900 ${receivedBubbleRadius(cluster)}`}>
                  {message.text}
                </div>
              </div>
            )
          }

          return (
            <div
              key={`${message.from}-${message.text}`}
              className={`max-w-[76%] animate-[m-msg_0.35s_ease] self-end ${gap}`}
            >
              <div className={`bg-gradient-to-b from-[#8A3AB9] to-[#6B37B7] px-3.5 py-[7px] text-[1em] leading-[1.4] text-white ${sentBubbleRadius(cluster)}`}>
                {message.text}
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="mt-2.5 flex max-w-[82%] items-end gap-1.5 self-start">
            <Avatar avatar={avatar} avatarBg={avatarBg} />
            <TypingBubble receivedClass="bg-[#efefef]" />
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pb-[20px] pt-1">
        <InstagramInputBar />
      </div>
    </div>
  )
}
