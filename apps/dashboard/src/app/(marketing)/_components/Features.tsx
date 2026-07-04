"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { IMessageScreen } from "./chat-demo/IMessageChatDemo";
import { InstagramScreen } from "./chat-demo/InstagramChatDemo";
import { PhoneFrame } from "./chat-demo/PhoneFrame";
import { useChatDemoAnimation } from "./chat-demo/useChatDemoAnimation";
import type { ChatMessage } from "./chat-demo/shared";

type ChatVariant = "instagram" | "imessage";

interface Feature {
  num: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  annotation: string;
  chat: {
    variant: ChatVariant;
    title: string;
    subtitle: string;
    avatar: string;
    avatarBg?: string;
    avatarSrc?: string;
    messages: ChatMessage[];
  };
}

const FEATURES: Feature[] = [
  {
    num: "01",
    title: (
      <>
        Answers customers <em className="italic text-[#9c9285]">while you sleep.</em>
      </>
    ),
    body: "Shopkeeper reads every DM and email the second it lands, pulls the real order from Shopify, and replies the way you would. When it isn't sure, it doesn't guess — it hands the thread to you.",
    bullets: [
      "Instagram, email & iMessage in one brain",
      "Learns your tone from the replies you've already sent",
      "Escalates to you instead of bluffing",
    ],
    annotation: "2:14 am — you were asleep",
    chat: {
      variant: "instagram",
      title: "linen & loom",
      subtitle: "linenandloom",
      avatar: "L",
      avatarBg: "linear-gradient(135deg,#f09433,#dc2743)",
      messages: [
        { from: "user", text: "hey!! my order was supposed to be here friday 😭 it's been a week", time: "2:14 AM" },
        {
          from: "agent",
          text: "So sorry for the wait, Morgan! Just checked — order #2961 is out for delivery right now, due by 8pm tonight. Here's live tracking: usps.com/9400…",
          time: "2:14 AM",
        },
        { from: "user", text: "omg amazing, thank you!!", time: "2:15 AM" },
        { from: "agent", text: "Anytime 💛 I'll keep an eye on it and ping you if anything changes.", time: "2:15 AM" },
      ],
    },
  },
  {
    num: "02",
    title: (
      <>
        Asks <em className="italic text-[#9c9285]">before it acts.</em>
      </>
    ),
    body: "You set the rules — refund caps, blocked actions, how much rope it gets. Shopkeeper starts cautious and earns autonomy one approval at a time, because one bad refund can undo months of trust.",
    bullets: [
      "Refund limits and blocked cancellations you control",
      "Approvals are one tap, right in Telegram",
      "Every action logged on the thread",
    ],
    annotation: "your call — one tap",
    chat: {
      variant: "imessage",
      title: "Shopkeeper",
      subtitle: "iMessage · your store",
      avatar: "S",
      avatarSrc: "/logos/shopkeeper-shop-logo.png",
      messages: [
        {
          from: "agent",
          text: "Kim's asking to cancel order #3088 — that's $212. Cancellations need your OK, so I haven't touched it. Refund, or offer store credit first?",
          time: "1:42 PM",
        },
        { from: "user", text: "try credit", time: "1:44 PM" },
        {
          from: "agent",
          text: "Offered $212 in store credit plus 10% as a thank-you. If she still wants the refund, I'll draft it for one-tap approval.",
          time: "1:44 PM",
        },
        { from: "agent", text: "Update: she took the credit 🎉 Order's intact.", time: "1:51 PM" },
      ],
    },
  },
  {
    num: "03",
    title: (
      <>
        Knows your store <em className="italic text-[#9c9285]">cold.</em>
      </>
    ),
    body: "Live Shopify orders and inventory, your policies, every past conversation. Ask it anything about your store and it answers from data, not vibes.",
    bullets: [
      "Reads live orders, inventory & tracking",
      "Remembers every customer conversation",
      "Cites your policies and FAQs, not generic ones",
    ],
    annotation: "live from your Shopify",
    chat: {
      variant: "imessage",
      title: "Shopkeeper",
      subtitle: "iMessage · your store",
      avatar: "S",
      avatarSrc: "/logos/shopkeeper-shop-logo.png",
      messages: [
        { from: "user", text: "how many linen jumpsuits left in xs?", time: "4:20 PM" },
        {
          from: "agent",
          text: "11 in XS, 3 in S. It's also your most-asked item this week — 9 DMs about a restock.",
          time: "4:20 PM",
        },
        { from: "user", text: "restock lands tuesday", time: "4:22 PM" },
        {
          from: "agent",
          text: "Noted 📌 I'll tell anyone who asks, and I can message the 9 who already did once it drops. Want that?",
          time: "4:22 PM",
        },
      ],
    },
  },
];

type PanelState = "parked" | "active" | "queued";

/** True once ref has been at least 30% visible; stays true after. */
function useInViewOnce(ref: RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setInView(true);
      observer.disconnect();
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

function StepCopy({ feature }: { feature: Feature }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.15em] text-stone-500 [font-family:var(--m-caveat)]">
        <span className="inline-block h-px w-6 bg-stone-400" />
        {feature.num}
      </div>
      <h2 className="mb-5 max-w-[16ch] text-[clamp(36px,4vw,56px)] font-extrabold leading-[1] tracking-[-0.01em] [font-family:var(--m-caveat)]">
        {feature.title}
      </h2>
      <p className="mb-7 max-w-[46ch] text-[16px] leading-relaxed text-stone-700">{feature.body}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[14px] text-stone-700">
        {feature.bullets.map(b => (
          <li key={b} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#2b2118] text-[9px] text-[#f6f2eb]">✓</span>
            {b}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Mobile: one stage; swiping plays the same iOS push transition as desktop. */
function MobileCarousel() {
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInViewOnce(stageRef);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const go = (next: number) => setActive(Math.min(FEATURES.length - 1, Math.max(0, next)));

  return (
    <div
      className="pt-10 md:hidden"
      onTouchStart={e => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={e => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="grid">
        {FEATURES.map((f, i) => (
          <div
            key={f.num}
            aria-hidden={i !== active}
            className={`col-start-1 row-start-1 transition-[opacity,transform] duration-500 motion-reduce:transition-none ${
              i === active
                ? "opacity-100"
                : `pointer-events-none opacity-0 ${i < active ? "-translate-x-3" : "translate-x-3"}`
            }`}
          >
            <StepCopy feature={f} />
          </div>
        ))}
      </div>
      <div ref={stageRef} className="mx-auto mt-10 w-[min(100%,290px)]">
        <PhoneFrame>
          {FEATURES.map((f, i) => (
            <PhonePanel
              key={f.num}
              feature={f}
              index={i}
              state={i === active ? "active" : i < active ? "parked" : "queued"}
              started={i === active && inView}
            />
          ))}
        </PhoneFrame>
      </div>
      <div className="mt-7 flex items-center justify-center gap-2">
        {FEATURES.map((f, i) => (
          <button
            key={f.num}
            type="button"
            aria-label={`Step ${f.num}`}
            onClick={() => go(i)}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-stone-900/70" : "w-[7px] bg-stone-900/20"
            }`}
          />
        ))}
        <span className="ml-2 text-[18px] leading-none text-stone-400 [font-family:var(--m-caveat)]">
          swipe →
        </span>
      </div>
    </div>
  );
}

/** One app screen inside the phone; slides like an iOS navigation push. */
function PhonePanel({
  feature,
  state,
  index,
  started,
}: {
  feature: Feature;
  state: PanelState;
  index: number;
  started: boolean;
}) {
  const { count, typing } = useChatDemoAnimation(feature.chat.messages, null, started);
  const Screen = feature.chat.variant === "instagram" ? InstagramScreen : IMessageScreen;

  return (
    <div
      className="absolute inset-0 bg-white shadow-[-24px_0_48px_-12px_rgba(22,20,19,0.3)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0.25,1)] will-change-transform motion-reduce:transition-none"
      style={{
        zIndex: index,
        transform:
          state === "active" ? "translateX(0)" : state === "parked" ? "translateX(-30%)" : "translateX(103%)",
      }}
    >
      <Screen
        title={feature.chat.title}
        subtitle={feature.chat.subtitle}
        avatar={feature.chat.avatar}
        avatarBg={feature.chat.avatarBg ?? "#2f7a4a"}
        avatarSrc={feature.chat.avatarSrc}
        messages={feature.chat.messages}
        count={count}
        typing={typing}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-700 motion-reduce:transition-none ${
          state === "parked" ? "opacity-15" : "opacity-0"
        }`}
      />
    </div>
  );
}

export function Features() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageInView = useInViewOnce(stageRef);

  useEffect(() => {
    const steps = stepRefs.current.filter((el): el is HTMLDivElement => el !== null);
    if (steps.length === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45%", threshold: 0 },
    );
    steps.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how" className="border-t border-stone-900/10">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-16 md:pb-0 md:pt-20">
        <div className="flex items-center justify-center gap-3 text-[22px] text-stone-500 [font-family:var(--m-caveat)]">
          <span className="h-px w-10 bg-stone-400/60" aria-hidden />
          how it works
          <span className="h-px w-10 bg-stone-400/60" aria-hidden />
        </div>

        <MobileCarousel />

        <div className="hidden md:grid md:grid-cols-2 md:gap-20">
          <div className="py-[8vh]">
            {FEATURES.map((f, i) => (
              <div
                key={f.num}
                ref={el => { stepRefs.current[i] = el; }}
                data-step={i}
                className="flex min-h-[88vh] flex-col justify-center"
              >
                <div
                  className={`transition-opacity duration-500 motion-reduce:transition-none ${
                    active === i ? "" : "opacity-30"
                  }`}
                >
                  <StepCopy feature={f} />
                </div>
              </div>
            ))}
          </div>

          <div className="relative hidden md:block">
            <div className="sticky top-0 flex h-screen flex-col items-center justify-center">
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(214,196,170,0.5),rgba(214,196,170,0.16)_58%,transparent_100%)]"
              />
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-900/[0.05]"
              />
              <div ref={stageRef} className="relative w-[min(320px,35vh)]">
                <PhoneFrame>
                  {FEATURES.map((f, i) => (
                    <PhonePanel
                      key={f.num}
                      feature={f}
                      index={i}
                      state={i === active ? "active" : i < active ? "parked" : "queued"}
                      started={i === active && stageInView}
                    />
                  ))}
                </PhoneFrame>
                <div className="pointer-events-none absolute -left-48 bottom-24 h-16 w-[160px] -rotate-3 text-right text-[21px] leading-[1.15] text-stone-500 [font-family:var(--m-caveat)]">
                  {FEATURES.map((f, i) => (
                    <span
                      key={f.num}
                      className={`absolute inset-0 transition-opacity duration-500 ${
                        i === active ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {f.annotation}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative mt-7 flex items-center gap-2">
                {FEATURES.map((f, i) => (
                  <button
                    key={f.num}
                    type="button"
                    aria-label={`Step ${f.num}`}
                    onClick={() =>
                      stepRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                    className={`h-[7px] rounded-full transition-all duration-300 ${
                      i === active ? "w-6 bg-stone-900/70" : "w-[7px] bg-stone-900/20 hover:bg-stone-900/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
