"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  from: "agent" | "user";
  text: string;
  time: string;
}

interface ChatDemoProps {
  /** Chat header title, e.g. "Shopkeeper" or a brand handle */
  title: string;
  subtitle: string;
  avatar: string;
  avatarBg?: string;
  messages: ChatMessage[];
}

function TypingBubble() {
  return (
    <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm animate-[m-msg_0.25s_ease]">
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

export function ChatDemo({ title, subtitle, avatar, avatarBg = "#2f7a4a", messages }: ChatDemoProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);

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

  return (
    <div
      ref={frameRef}
      className="mx-auto w-[320px] rounded-[44px] bg-stone-900 p-2.5 shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)] sm:w-[360px]"
    >
      <div className="flex h-[560px] flex-col overflow-hidden rounded-[34px] bg-[#ece5d8]">
        {/* Notch */}
        <div className="flex justify-center bg-[#f6f2eb] pt-2.5">
          <span className="h-[18px] w-24 rounded-full bg-stone-900" />
        </div>

        {/* Chat header */}
        <div className="flex items-center gap-2.5 border-b border-stone-900/5 bg-[#f6f2eb] px-4 py-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
            style={{ background: avatarBg }}
          >
            {avatar}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold leading-tight">{title}</div>
            <div className="truncate text-[11px] leading-tight text-stone-500">{subtitle}</div>
          </div>
        </div>

        {/* Messages — newest pinned to bottom, oldest clip off the top like a real chat */}
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden px-3 pb-3 pt-4">
          {messages.slice(0, count).map((m) => (
            <div
              key={`${m.from}-${m.text}`}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.45] shadow-sm animate-[m-msg_0.35s_ease] ${
                m.from === "agent"
                  ? "self-start rounded-bl-md bg-white text-stone-900"
                  : "self-end rounded-br-md bg-[#d5ecca] text-stone-900"
              }`}
            >
              {m.text}
              <span className="mt-1 block text-right text-[10px] text-stone-400">{m.time}</span>
            </div>
          ))}
          {typing && <TypingBubble />}
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2 border-t border-stone-900/5 bg-[#f6f2eb] px-3 py-2.5">
          <span className="flex-1 rounded-full bg-white px-4 py-2 text-[13px] text-stone-400">Message</span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#2f7a4a] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="m22 2-7 20-4-9-9-4z" />
              <path d="M22 2 11 13" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
