import {
  IOS_FONT,
  PhoneStatusBar,
  TypingBubble,
  type ChatVariantViewProps,
} from "./shared"

function InstagramHeader({
  title,
  subtitle,
  avatar,
  avatarBg,
}: Pick<ChatVariantViewProps, "title" | "subtitle" | "avatar" | "avatarBg">) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-3 pb-2.5 pt-1">
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
        <div className="truncate text-[15px] font-semibold leading-tight text-stone-900">{title}</div>
        <div className="truncate text-[12px] leading-tight text-stone-500">{subtitle}</div>
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
    <div className="flex items-center gap-2.5 pb-2">
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
      <span className="flex-1 rounded-full bg-[#efefef] px-4 py-[8px] text-[14px] text-stone-500">
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

function InstagramMessages({
  messages,
  count,
  typing,
}: Pick<ChatVariantViewProps, "messages" | "count" | "typing">) {
  const receivedBubble = "rounded-[18px] rounded-bl-[4px] bg-[#efefef] text-stone-900"
  const sentBubble =
    "rounded-[18px] rounded-br-[4px] bg-gradient-to-br from-[#8A3AB9] to-[#6B37B7] text-white"

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-1 pt-2">
      {messages.slice(0, count).map(message => (
        <div
          key={`${message.from}-${message.text}`}
          className={`max-w-[82%] animate-[m-msg_0.35s_ease] ${
            message.from === "agent" ? "self-start" : "self-end"
          }`}
        >
          <div className={`px-3.5 py-2 text-[13px] leading-[1.4] ${
            message.from === "agent" ? receivedBubble : sentBubble
          }`}>
            {message.text}
            <span className={`mt-0.5 block text-right text-[10px] leading-none ${
              message.from === "agent" ? "text-stone-400" : "text-white/70"
            }`}>
              {message.time}
            </span>
          </div>
        </div>
      ))}
      {typing && (
        <div className="max-w-[82%] self-start animate-[m-msg_0.25s_ease]">
          <TypingBubble receivedClass="bg-[#efefef]" />
        </div>
      )}
    </div>
  )
}

export function InstagramChatDemo(props: ChatVariantViewProps) {
  return (
    <div
      className="relative aspect-[393/852] w-full overflow-hidden rounded-[32px] bg-white sm:rounded-[36px]"
      style={{ fontFamily: IOS_FONT }}
    >
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="px-0 pb-[76px] pt-[98px]">
          <InstagramMessages messages={props.messages} count={props.count} typing={props.typing} />
        </div>
      </div>
      <div className="absolute inset-x-0 top-0 z-10 border-b border-black/[0.06] bg-white">
        <PhoneStatusBar />
        <InstagramHeader
          title={props.title}
          subtitle={props.subtitle}
          avatar={props.avatar}
          avatarBg={props.avatarBg}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-black/[0.06] bg-white px-3 pt-1.5">
        <InstagramInputBar />
        <div className="flex justify-center pb-1.5 pt-0.5">
          <span className="h-[5px] w-[112px] rounded-full bg-stone-900/20" />
        </div>
      </div>
    </div>
  )
}
