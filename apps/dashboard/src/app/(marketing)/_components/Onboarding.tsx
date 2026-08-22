"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SectionLabel } from "./SectionLabel";

const STORE_URL = "linenandloom.com";
const TYPE_START_MS = 850;
const TYPE_MS_PER_CHAR = 175;

const STEPS = [
  {
    id: "connect",
    title: "Connect Shopify",
    desc: "Use live order, product, inventory, and customer context. Read available store policies and pages into knowledge.",
    aria: "Connecting a Shopify store. Products, policies, orders, FAQs, and custom instructions sync one by one.",
    duration: 10500,
  },
  {
    id: "channels",
    title: "Choose where messages go",
    desc: "Connect a customer inbox, then add Instagram or website chat. Use iMessage when approvals should reach your phone.",
    aria: "Turning on Instagram, email, website chat, and iMessage.",
    duration: 8000,
  },
] as const;

const TILES = [
  { label: "Products", icon: ProductsIcon },
  { label: "Policies", icon: PoliciesIcon },
  { label: "Orders", icon: OrdersIcon },
  { label: "FAQ", icon: FaqIcon },
  { label: "Custom instructions", icon: InstructionsIcon },
] as const;

const CHANNELS = [
  { label: "Instagram", icon: <InstagramMark /> },
  { label: "Email", logo: "/logos/email.svg" },
  { label: "Website chat", icon: <ChatMark /> },
  { label: "iMessage", logo: "/logos/imessage.svg" },
] as const;

export function Onboarding() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [playId, setPlayId] = useState(0);
  const [staticPlay, setStaticPlay] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStaticPlay(true);
      setStarted(true);
      return;
    }

    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setInView(false);
          return;
        }
        setInView(true);
        setStarted(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || staticPlay) return;
    const timer = window.setTimeout(() => {
      setActiveStep((step) => (step + 1) % STEPS.length);
      setPlayId((id) => id + 1);
    }, STEPS[activeStep].duration);
    return () => window.clearTimeout(timer);
  }, [inView, staticPlay, activeStep]);

  function goToStep(index: number) {
    setActiveStep(index);
    setPlayId((id) => id + 1);
  }

  const step = STEPS[activeStep];
  const playing = started && !staticPlay;

  return (
    <section id="onboarding" className="scroll-mt-24 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div>
          <SectionLabel>guided setup</SectionLabel>
          <h2 className="m-display mx-auto max-w-[17ch] text-center text-[clamp(2.1rem,4.6vw,4.15rem)]">
            Connect the store. Choose where Shopkeeper should reach you.
          </h2>
          <p className="mx-auto mb-12 mt-5 max-w-[58ch] text-center text-[16px] leading-relaxed text-stone-600">
            No helpdesk migration project. Start with Shopify and one customer channel;
            Shopkeeper begins in Ask first so you can review the work.
          </p>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div
              ref={stageRef}
              className="m-onboard-stage"
              role="img"
              aria-label={step.aria}
            >
              {activeStep === 0 ? (
                <ConnectScene
                  key={`connect-${playId}`}
                  staticPlay={staticPlay || !started}
                  playing={playing}
                />
              ) : (
                <ChannelsScene
                  key={`channels-${playId}`}
                  staticPlay={staticPlay || !started}
                  playing={playing}
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-2">
              {STEPS.map((item, index) => {
                const active = index === activeStep;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToStep(index)}
                    aria-current={active ? "step" : undefined}
                    className={`rounded-2xl px-1 py-4 text-left transition-opacity duration-500 motion-reduce:transition-none ${
                      active ? "opacity-100" : "opacity-35 hover:opacity-70"
                    }`}
                  >
                    <h3 className="mb-2 text-[1.25rem] font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="max-w-[42ch] text-[16px] leading-relaxed text-stone-700">
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-[12px] text-stone-500">Example setup · Demo store data</p>
      </div>
    </section>
  );
}

function ConnectScene({
  staticPlay,
  playing,
}: {
  staticPlay: boolean;
  playing: boolean;
}) {
  const state = staticPlay ? "is-static" : playing ? "is-playing" : "";

  return (
    <div className={`m-onboard is-connect ${state}`} aria-hidden>
      <div className="m-onboard-stack">
        <div className="m-onboard-pill">
          <Image
            src="/logos/shopify.svg"
            alt=""
            width={22}
            height={25}
            className="m-onboard-shopify"
          />
          <TypedUrl playing={playing} staticPlay={staticPlay} />
        </div>
        {TILES.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="m-onboard-tile" style={{ "--i": index } as CSSProperties}>
              <span className="m-onboard-tile-icon">
                <Icon />
              </span>
              <span className="m-onboard-tile-label">{tile.label}</span>
              <span className="m-onboard-status">
                <span className="m-onboard-loader" />
                <span className="m-onboard-check">
                  <CheckIcon />
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelsScene({
  staticPlay,
  playing,
}: {
  staticPlay: boolean;
  playing: boolean;
}) {
  const state = staticPlay ? "is-static" : playing ? "is-playing" : "";

  return (
    <div className={`m-onboard is-channels ${state}`} aria-hidden>
      <div className="m-onboard-stack">
        {CHANNELS.map((channel, index) => (
          <div
            key={channel.label}
            className="m-onboard-tile"
            style={{ "--i": index } as CSSProperties}
          >
            <span className="m-onboard-tile-icon">
              {"logo" in channel ? (
                <Image
                  src={channel.logo}
                  alt=""
                  width={22}
                  height={22}
                  className="size-[22px] object-contain"
                />
              ) : (
                channel.icon
              )}
            </span>
            <span className="m-onboard-tile-label">{channel.label}</span>
            <span className="m-onboard-status">
              <span className="m-onboard-loader" />
              <span className="m-onboard-toggle">
                <span className="m-onboard-toggle-dash" />
                <span className="m-onboard-toggle-knob" />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypedUrl({ playing, staticPlay }: { playing: boolean; staticPlay: boolean }) {
  const [chars, setChars] = useState(staticPlay ? STORE_URL.length : 0);
  const [caret, setCaret] = useState(false);

  useEffect(() => {
    if (staticPlay) {
      setChars(STORE_URL.length);
      setCaret(false);
      return;
    }
    if (!playing) {
      setChars(0);
      setCaret(false);
      return;
    }

    setChars(0);
    setCaret(false);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setCaret(true), TYPE_START_MS));
    for (let i = 0; i < STORE_URL.length; i++) {
      timers.push(window.setTimeout(() => setChars(i + 1), TYPE_START_MS + (i + 1) * TYPE_MS_PER_CHAR));
    }
    timers.push(
      window.setTimeout(
        () => setCaret(false),
        TYPE_START_MS + STORE_URL.length * TYPE_MS_PER_CHAR + 500,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [playing, staticPlay]);

  return (
    <span className="m-onboard-typed">
      <span className="m-onboard-url">{STORE_URL.slice(0, chars)}</span>
      {caret ? <span className="m-onboard-caret" /> : null}
    </span>
  );
}

function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="4" y="5" width="2.4" height="14" rx="1.2" />
      <rect x="8.5" y="8" width="2.4" height="11" rx="1.2" />
      <rect x="13.1" y="4" width="2.4" height="15" rx="1.2" />
      <rect x="17.6" y="7" width="2.4" height="12" rx="1.2" />
    </svg>
  );
}

function PoliciesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 3.5h7.2L19 8.4V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path fill="#f6f2eb" d="M14 3.7v4.2h4.3" />
      <circle cx="12" cy="14.2" r="3.1" fill="#f6f2eb" />
      <path d="M12 12.4v2.2l1.4.8" fill="none" stroke="#161413" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.8 8.2 12 4.6l7.2 3.6v8.6L12 20.4 4.8 16.8V8.2Z" />
      <path d="M12 12.2 4.9 8.3M12 12.2v8M12 12.2l7.1-3.9" fill="none" stroke="#f6f2eb" strokeWidth="1.4" />
    </svg>
  );
}

function FaqIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="8.2" />
      <path
        d="M9.7 9.5c.2-1.3 1.2-2.1 2.5-2.1 1.4 0 2.4.8 2.4 2.1 0 1.2-.7 1.7-1.6 2.2-.8.4-1.1.8-1.1 1.6"
        fill="none"
        stroke="#f6f2eb"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12.1" cy="16.4" r="1" fill="#f6f2eb" />
    </svg>
  );
}

function InstructionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 5.4h14a1.6 1.6 0 0 1 1.6 1.6v8.1A1.6 1.6 0 0 1 19 16.7h-4.2L12 20.2l-2.8-3.5H5A1.6 1.6 0 0 1 3.4 15V7a1.6 1.6 0 0 1 1.6-1.6Z" />
      <path d="M9.1 9.2h1.6l1.3 4.6h.1l1.3-4.6H15v6.1h-1.2v-4.7h-.1l-1.4 4.7h-1.6L9.3 10.6h-.1v4.7H8V9.2h1.1Z" fill="#f6f2eb" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.4 9.2 17 19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id="m-ig" cx="30%" cy="110%" r="120%">
          <stop offset="0%" stopColor="#f58529" />
          <stop offset="45%" stopColor="#dd2a7b" />
          <stop offset="100%" stopColor="#8134af" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#m-ig)" />
      <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="3.2" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="16.6" cy="7.4" r="1.05" fill="#fff" />
    </svg>
  );
}

function ChatMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.2 5.4h11.2A2.2 2.2 0 0 1 17.6 7.6v6.1a2.2 2.2 0 0 1-2.2 2.2H9.4L5.8 19.2V15.9H4.2A2.2 2.2 0 0 1 2 13.7V7.6a2.2 2.2 0 0 1 2.2-2.2Z" />
      <path
        d="M10.6 9.2h9.2A2.2 2.2 0 0 1 22 11.4v5.4a2.2 2.2 0 0 1-2.2 2.2h-1.4v2.4L15.2 19H10.6A2.2 2.2 0 0 1 8.4 16.8v-5.4a2.2 2.2 0 0 1 2.2-2.2Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
