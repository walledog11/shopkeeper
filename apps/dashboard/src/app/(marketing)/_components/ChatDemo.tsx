"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  from: "agent" | "user";
  text: string;
  time: string;
}

export type ChatVariant = "instagram" | "imessage";

interface ChatDemoProps {
  /** Chat header title, e.g. "Shopkeeper" or a brand handle */
  title: string;
  subtitle: string;
  avatar: string;
  avatarBg?: string;
  messages: ChatMessage[];
  variant?: ChatVariant;
}

type ClusterPosition = "single" | "first" | "middle" | "last";

const IOS_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";

function getClusterPosition(messages: ChatMessage[], index: number): ClusterPosition {
  const curr = messages[index];
  const prevSame = index > 0 && messages[index - 1].from === curr.from;
  const nextSame = index < messages.length - 1 && messages[index + 1].from === curr.from;
  if (!prevSame && !nextSame) return "single";
  if (!prevSame && nextSame) return "first";
  if (prevSame && nextSame) return "middle";
  return "last";
}

function StatusBarIcons() {
  return (
    <div className="flex items-center gap-[5px]">
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden>
        <rect x="0" y="7" width="3" height="4" rx="0.5" />
        <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
        <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" />
        <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
      </svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden>
        <path d="M7.5 2.2C5.1 2.2 2.9 3.1 1 4.8l1.1 1.1C3.7 4.3 5.5 3.5 7.5 3.5s3.8.8 5.4 2.4l1.1-1.1C10.1 3.1 7.9 2.2 7.5 2.2z" />
        <path d="M7.5 5.5c-1.5 0-2.9.6-3.9 1.7l1.1 1.1c.7-.7 1.7-1.1 2.8-1.1s2.1.4 2.8 1.1l1.1-1.1C10.4 6.1 9 5.5 7.5 5.5z" />
        <circle cx="7.5" cy="9.5" r="1.5" />
      </svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
        <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" strokeOpacity="0.35" />
        <rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor" />
        <path d="M23 4.5v3a1.5 1.5 0 0 0 0-3z" fill="currentColor" fillOpacity="0.4" />
      </svg>
    </div>
  );
}

function TypingBubble({ receivedClass }: { receivedClass: string }) {
  return (
    <div
      className={`flex items-center gap-1 rounded-[18px] rounded-bl-[5px] px-3.5 py-2.5 animate-[m-msg_0.25s_ease] ${receivedClass}`}
      style={{ fontFamily: IOS_FONT }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-stone-400 animate-[m-typedot_1s_ease_infinite]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function InstagramStatusBar() {
  return (
    <div className="relative shrink-0 min-h-[44px] px-5 pb-1 pt-[10px]">
      <div className="pointer-events-none absolute left-1/2 top-[11px] -translate-x-1/2">
        <span className="block h-[22px] w-[84px] rounded-full bg-stone-900 sm:h-[24px] sm:w-[90px]" />
      </div>
      <div className="flex items-center justify-between text-[11px] font-semibold tracking-tight text-stone-900">
        <span>9:41</span>
        <StatusBarIcons />
      </div>
    </div>
  );
}

function InstagramHeader({
  title,
  subtitle,
  avatar,
  avatarBg,
}: Pick<ChatDemoProps, "title" | "subtitle" | "avatar" | "avatarBg">) {
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
      <div className="flex shrink-0 items-center gap-4">
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
  );
}

function IMessageStatusBar() {
  return (
    <div className="relative shrink-0 min-h-[44px] px-5 pb-1 pt-[10px]">
      <div className="pointer-events-none absolute left-1/2 top-[11px] -translate-x-1/2">
        <span className="block h-[22px] w-[84px] rounded-full bg-stone-900 sm:h-[24px] sm:w-[90px]" />
      </div>
      <div className="flex items-center justify-between text-[11px] font-semibold tracking-tight text-stone-900">
        <span>9:41</span>
        <StatusBarIcons />
      </div>
    </div>
  );
}

function IMessageHeader({
  title,
  avatar,
  avatarBg,
}: Pick<ChatDemoProps, "title" | "avatar" | "avatarBg">) {
  return (
    <div className="relative flex min-h-[52px] items-center justify-center px-3 pb-2 pt-1">
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
        <div className="flex items-center gap-px text-[11px] font-medium leading-none text-stone-900">
          <span className="truncate max-w-[140px]">{title}</span>
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
  );
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
  );
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
        <span
          className="block rounded-full border border-stone-900/[0.08] bg-white py-[7px] pl-3.5 pr-9 text-[13px] text-stone-400 shadow-[0_0.5px_2px_rgba(0,0,0,0.06)]"
        >
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
  );
}

function receivedBubbleRadius(cluster: ClusterPosition) {
  switch (cluster) {
    case "single":
    case "last":
      return "rounded-[18px] rounded-bl-[5px]";
    case "first":
      return "rounded-[18px] rounded-bl-[18px]";
    case "middle":
      return "rounded-[18px]";
  }
}

function sentBubbleRadius(cluster: ClusterPosition) {
  switch (cluster) {
    case "single":
    case "last":
      return "rounded-[18px] rounded-br-[5px]";
    case "first":
      return "rounded-[18px] rounded-br-[18px]";
    case "middle":
      return "rounded-[18px]";
  }
}

function IMessageMessages({
  messages,
  count,
  title,
  avatar,
  avatarBg,
  typing,
}: {
  messages: ChatMessage[];
  count: number;
  title: string;
  avatar: string;
  avatarBg?: string;
  typing: boolean;
}) {
  const visible = messages.slice(0, count);
  const lastUserIndex = visible.reduce(
    (last, m, i) => (m.from === "user" ? i : last),
    -1,
  );

  return (
    <div className="flex flex-col gap-2 px-2.5 pt-[100px] pb-[72px]">
      {visible.map((m, i) => {
        const cluster = getClusterPosition(visible, i);
        const showSender = m.from === "agent" && (i === 0 || visible[i - 1].from !== "agent");
        const clusterGap = cluster === "middle" || cluster === "last" ? "mt-[2px]" : "";

        if (m.from === "agent") {
          return (
            <div
              key={`${m.from}-${m.text}`}
              className={`flex max-w-[90%] items-end gap-1.5 self-start animate-[m-msg_0.35s_ease] ${clusterGap}`}
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
                  <div className="mb-0.5 pl-0.5 text-[11px] leading-none text-stone-500">{title}</div>
                )}
                <div
                  className={`px-3.5 py-2 text-[13px] leading-[1.35] text-stone-900 bg-[#E9E9EB] ${receivedBubbleRadius(cluster)}`}
                >
                  {m.text}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={`${m.from}-${m.text}`}
            className={`flex max-w-[82%] flex-col items-end self-end animate-[m-msg_0.35s_ease] ${clusterGap}`}
          >
            <div
              className={`px-3.5 py-2 text-[13px] leading-[1.35] text-white bg-[#007AFF] ${sentBubbleRadius(cluster)}`}
            >
              {m.text}
            </div>
            {i === lastUserIndex && (
              <span className="mt-0.5 pr-0.5 text-[9px] leading-none text-stone-400">Read</span>
            )}
          </div>
        );
      })}
      {typing && (
        <div className="flex max-w-[90%] items-end gap-1.5 self-start animate-[m-msg_0.25s_ease]">
          <span
            className="mb-0.5 grid size-[26px] shrink-0 place-items-center self-end rounded-full text-[10px] font-semibold text-white"
            style={{ background: avatarBg }}
          >
            {avatar}
          </span>
          <div className="min-w-0">
            <div className="mb-0.5 pl-0.5 text-[11px] leading-none text-stone-500">{title}</div>
            <TypingBubble receivedClass="bg-[#E9E9EB]" />
          </div>
        </div>
      )}
    </div>
  );
}

function InstagramMessages({
  messages,
  count,
  typing,
  receivedBubble,
  sentBubble,
  receivedTyping,
}: {
  messages: ChatMessage[];
  count: number;
  typing: boolean;
  receivedBubble: string;
  sentBubble: string;
  receivedTyping: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 pt-2 pb-1">
      {messages.slice(0, count).map((m) => (
        <div
          key={`${m.from}-${m.text}`}
          className={`max-w-[82%] animate-[m-msg_0.35s_ease] ${
            m.from === "agent" ? "self-start" : "self-end"
          }`}
        >
          <div
            className={`px-3.5 py-2 text-[13px] leading-[1.4] ${
              m.from === "agent" ? receivedBubble : sentBubble
            }`}
          >
            {m.text}
            <span
              className={`mt-0.5 block text-right text-[10px] leading-none ${
                m.from === "agent" ? "text-stone-400" : "text-white/70"
              }`}
            >
              {m.time}
            </span>
          </div>
        </div>
      ))}
      {typing && <TypingBubble receivedClass={receivedTyping} />}
    </div>
  );
}

export function ChatDemo({
  title,
  subtitle,
  avatar,
  avatarBg = "#2f7a4a",
  messages,
  variant = "instagram",
}: ChatDemoProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);

  const isInstagram = variant === "instagram";
  const receivedBubble = "rounded-[18px] rounded-bl-[4px] bg-[#efefef] text-stone-900";
  const sentBubble =
    "rounded-[18px] rounded-br-[4px] bg-gradient-to-br from-[#8A3AB9] to-[#6B37B7] text-white";
  const receivedTyping = "bg-[#efefef]";

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(messages.length);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [messages.length]);

  useEffect(() => {
    if (!started || count >= messages.length) return;
    const next = messages[count];
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (next.from === "agent") {
      timers.push(setTimeout(() => setTyping(true), 400));
      timers.push(
        setTimeout(() => {
          setTyping(false);
          setCount((c) => c + 1);
        }, 1600),
      );
    } else {
      timers.push(setTimeout(() => setCount((c) => c + 1), 1000));
    }
    return () => timers.forEach(clearTimeout);
  }, [started, count, messages]);

  const phoneShell = (
    <div
      ref={frameRef}
      className="mx-auto w-[min(100%,300px)] rounded-[40px] bg-stone-900 p-1.5 shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)] sm:w-[320px] sm:rounded-[44px]"
    >
      {isInstagram ? (
        <div
          className="relative aspect-[393/852] w-full overflow-hidden rounded-[32px] bg-white sm:rounded-[36px]"
          style={{ fontFamily: IOS_FONT }}
        >
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-0 pt-[98px] pb-[76px]">
              <InstagramMessages
                messages={messages}
                count={count}
                typing={typing}
                receivedBubble={receivedBubble}
                sentBubble={sentBubble}
                receivedTyping={receivedTyping}
              />
            </div>
          </div>

          <div className="absolute inset-x-0 top-0 z-10 border-b border-black/[0.06] bg-white">
            <InstagramStatusBar />
            <InstagramHeader title={title} subtitle={subtitle} avatar={avatar} avatarBg={avatarBg} />
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-black/[0.06] bg-white px-3 pt-1.5">
            <InstagramInputBar />
            <div className="flex justify-center pb-1.5 pt-0.5">
              <span className="h-[5px] w-[112px] rounded-full bg-stone-900/20" />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative aspect-[393/852] w-full overflow-hidden rounded-[32px] bg-white sm:rounded-[36px]"
          style={{ fontFamily: IOS_FONT }}
        >
          {/* Messages scroll behind frosted chrome */}
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <IMessageMessages
              messages={messages}
              count={count}
              title={title}
              avatar={avatar}
              avatarBg={avatarBg}
              typing={typing}
            />
          </div>

          {/* Liquid glass header */}
          <div
            className="absolute inset-x-0 top-0 z-10 border-b border-black/[0.05] bg-white/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/72"
          >
            <IMessageStatusBar />
            <IMessageHeader title={title} avatar={avatar} avatarBg={avatarBg} />
          </div>

          {/* Liquid glass footer */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 bg-white/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/72"
          >
            <div className="px-3 pt-1.5">
              <IMessageInputBar />
            </div>
            <div className="flex justify-center pb-1.5 pt-0.5">
              <span className="h-[5px] w-[112px] rounded-full bg-stone-900/20" />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return phoneShell;
}
