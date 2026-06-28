import {
  IOS_FONT,
  PhoneStatusBar,
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
}: Pick<ChatVariantViewProps, "title" | "avatar" | "avatarBg">) {
  return (
    <div className="relative flex min-h-[52px] items-center justify-center px-11 pb-2 pt-1">
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
        <span
          className="grid size-9 place-items-center rounded-full text-[13px] font-semibold text-white"
          style={{ background: avatarBg }}
        >
          {avatar}
        </span>
        <div className="flex max-w-full items-center gap-px text-[11px] font-medium leading-tight text-stone-900">
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
    <div className="flex items-center gap-2 px-1 pb-2 pt-1">
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
        <span className="block rounded-full border border-stone-900/[0.08] bg-white py-[7px] pl-3.5 pr-9 text-[13px] text-stone-400 shadow-[0_0.5px_2px_rgba(0,0,0,0.06)]">
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

function IMessageMessages({
  messages,
  count,
  title,
  avatar,
  avatarBg,
  typing,
}: Omit<ChatVariantViewProps, "subtitle">) {
  const visible = messages.slice(0, count)
  const lastUserIndex = visible.reduce(
    (last, message, index) => (message.from === "user" ? index : last),
    -1,
  )

  return (
    <div className="flex flex-col gap-2 px-2.5 pb-[72px] pt-[108px]">
      {visible.map((message, index) => {
        const cluster = getClusterPosition(visible, index)
        const showSender = message.from === "agent"
          && (index === 0 || visible[index - 1].from !== "agent")
        const clusterGap = cluster === "middle" || cluster === "last" ? "mt-[2px]" : ""

        if (message.from === "agent") {
          return (
            <div
              key={`${message.from}-${message.text}`}
              className={`flex max-w-[90%] animate-[m-msg_0.35s_ease] items-end gap-1.5 self-start ${clusterGap}`}
            >
              {showSender ? (
                <span
                  className="mb-0.5 grid size-[26px] shrink-0 place-items-center self-end rounded-full text-[10px] font-semibold text-white"
                  style={{ background: avatarBg }}
                >
                  {avatar}
                </span>
              ) : (
                <span className="size-[26px] shrink-0" aria-hidden />
              )}
              <div className="min-w-0">
                {showSender && (
                  <div className="mb-0.5 whitespace-nowrap pl-0.5 text-[11px] leading-tight text-stone-500">
                    {title}
                  </div>
                )}
                <div className={`bg-[#E9E9EB] px-3.5 py-2 text-[13px] leading-[1.35] text-stone-900 ${receivedBubbleRadius(cluster)}`}>
                  {message.text}
                </div>
              </div>
            </div>
          )
        }

        return (
          <div
            key={`${message.from}-${message.text}`}
            className={`flex max-w-[82%] animate-[m-msg_0.35s_ease] flex-col items-end self-end ${clusterGap}`}
          >
            <div className={`bg-[#007AFF] px-3.5 py-2 text-[13px] leading-[1.35] text-white ${sentBubbleRadius(cluster)}`}>
              {message.text}
            </div>
            {index === lastUserIndex && (
              <span className="mt-0.5 pr-0.5 text-[9px] leading-none text-stone-400">Read</span>
            )}
          </div>
        )
      })}
      {typing && (
        <div className="flex max-w-[90%] animate-[m-msg_0.25s_ease] items-end gap-1.5 self-start">
          <span
            className="mb-0.5 grid size-[26px] shrink-0 place-items-center self-end rounded-full text-[10px] font-semibold text-white"
            style={{ background: avatarBg }}
          >
            {avatar}
          </span>
          <div className="min-w-0">
            <div className="mb-0.5 whitespace-nowrap pl-0.5 text-[11px] leading-tight text-stone-500">
              {title}
            </div>
            <TypingBubble receivedClass="bg-[#E9E9EB]" />
          </div>
        </div>
      )}
    </div>
  )
}

export function IMessageChatDemo(props: ChatVariantViewProps) {
  return (
    <div
      className="relative aspect-[393/852] w-full overflow-hidden rounded-[32px] bg-white sm:rounded-[36px]"
      style={{ fontFamily: IOS_FONT }}
    >
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <IMessageMessages
          messages={props.messages}
          count={props.count}
          title={props.title}
          avatar={props.avatar}
          avatarBg={props.avatarBg}
          typing={props.typing}
        />
      </div>
      <div className="absolute inset-x-0 top-0 z-10 border-b border-black/[0.05] bg-white/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/72">
        <PhoneStatusBar />
        <IMessageHeader title={props.title} avatar={props.avatar} avatarBg={props.avatarBg} />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 bg-white/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/72">
        <div className="px-3 pt-1.5">
          <IMessageInputBar />
        </div>
        <div className="flex justify-center pb-1.5 pt-0.5">
          <span className="h-[5px] w-[112px] rounded-full bg-stone-900/20" />
        </div>
      </div>
    </div>
  )
}
