"use client";

/**
 * Shopkeeper hero film — a poke.com-style product story told entirely in chat UI.
 * Every visual is a pure function of the master clock `t` (seconds) so frames can
 * be rendered deterministically: window.__seek(t) sets the clock, and the capture
 * script (scripts/render-demo-film.mjs) screenshots frame by frame.
 *
 * Live preview: open /demo-film — it autoplays on a loop.
 * Capture mode: /demo-film?capture — static until __seek is called.
 */

import Image from "next/image";
import { useEffect, useState } from "react";

const DURATION = 38.5;

const STAGE_W = 1200;
const STAGE_H = 900;

function stageScale() {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

/* ---------- timeline helpers ---------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Linear progress 0→1 across [a, b]. */
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** Slight overshoot, for bubble pops. */
const back = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
/** Fade in over [a,b], fade out over [c,d]. */
const win = (t: number, a: number, b: number, c: number, d: number) =>
  seg(t, a, b) * (1 - seg(t, c, d));

/** Standard message-bubble entrance. */
function pop(t: number, at: number, dur = 0.5): { opacity: number; transform: string } {
  const p = seg(t, at, at + dur);
  return {
    opacity: Math.min(1, p * 2.2),
    transform: `translateY(${(1 - easeOut(p)) * 18}px) scale(${0.94 + 0.06 * back(p)})`,
  };
}

function rise(t: number, at: number, dur = 0.6): React.CSSProperties {
  const p = seg(t, at, at + dur);
  return { opacity: p, transform: `translateY(${(1 - easeOut(p)) * 22}px)` };
}

/* ---------- shared bits ---------- */

function StoreGlyph({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
      <path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
    </svg>
  );
}

function AppIcon({ size }: { size: number }) {
  return (
    <div
      className="grid place-items-center bg-[#2b2118] text-[#f6f2eb] shadow-[0_30px_60px_-20px_rgba(22,20,19,0.45)]"
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
    >
      <StoreGlyph style={{ width: size * 0.52, height: size * 0.52 }} />
    </div>
  );
}

function VerifiedBadge({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <path
        fill="#2f7a4a"
        d="M12 1.7l2.4 1.9 3-.4 1.2 2.8 2.8 1.2-.4 3 1.9 2.4-1.9 2.4.4 3-2.8 1.2-1.2 2.8-3-.4-2.4 1.9-2.4-1.9-3 .4-1.2-2.8-2.8-1.2.4-3L1.1 12 3 9.6l-.4-3 2.8-1.2 1.2-2.8 3 .4z"
      />
      <path d="m8.4 12.2 2.4 2.4 4.8-5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TelegramMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <circle cx="12" cy="12" r="11" fill="#229ED9" />
      <path
        fill="#fff"
        d="M17.3 7.3 15.6 16c-.13.6-.49.75-.99.47l-2.74-2.02-1.32 1.27c-.15.15-.27.27-.55.27l.2-2.78 5.06-4.58c.22-.2-.05-.3-.34-.11l-6.25 3.94-2.7-.84c-.58-.18-.6-.58.13-.86l10.55-4.07c.49-.18.92.11.65.61z"
      />
    </svg>
  );
}

function WhatsAppMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="#25D366">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5 13.7c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.8 2c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.2 1.2z" />
    </svg>
  );
}

function TypingDots({ t }: { t: number }) {
  return (
    <div className="flex items-center gap-2 rounded-[26px] rounded-bl-lg bg-white px-7 py-6 shadow-sm">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-3 rounded-full bg-stone-400"
          style={{ opacity: 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.9)) }}
        />
      ))}
    </div>
  );
}

/* ---------- scene 1: app icon → chat list (0 – 4.7) ---------- */

function SceneIcon({ t }: { t: number }) {
  const o = win(t, 0, 0.4, 3.9, 4.7);
  if (o === 0) return null;

  const intro = easeOut(seg(t, 0.05, 0.9));
  const shrink = easeInOut(seg(t, 1.9, 2.9));
  const scale = (0.85 + 0.15 * intro) * (1 - 0.38 * shrink);
  const iconY = 360 - 60 * shrink;

  const neighbor = easeOut(seg(t, 2.1, 3.0));
  const rowIn = rise(t, 2.5, 0.7);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      {/* icon + label */}
      <div className="absolute left-1/2" style={{ top: iconY, transform: `translateX(-50%) scale(${scale})`, opacity: Math.min(1, intro * 2) }}>
        <AppIcon size={264} />
      </div>
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5"
        style={{ top: iconY + 132 + 132 * scale + 26, opacity: seg(t, 0.7, 1.2) }}
      >
        <span className="text-[38px] font-semibold tracking-tight text-[#161413]">Shopkeeper</span>
        <VerifiedBadge size={30} />
      </div>

      {/* neighboring chats, dimmed */}
      {[
        { x: -350, label: "Mom 💐", emoji: "👩🏼", bg: "#d8c9ae" },
        { x: 350, label: "Suppliers", emoji: "📦", bg: "#b9c6bb" },
      ].map((n) => (
        <div
          key={n.label}
          className="absolute left-1/2 flex flex-col items-center gap-3"
          style={{
            top: 380,
            opacity: 0.4 * neighbor,
            transform: `translateX(calc(-50% + ${n.x + (1 - neighbor) * Math.sign(n.x) * 70}px))`,
          }}
        >
          <span className="grid size-[130px] place-items-center rounded-full text-[56px]" style={{ background: n.bg }}>
            {n.emoji}
          </span>
          <span className="text-[24px] text-stone-500">{n.label}</span>
        </div>
      ))}

      {/* teased chat-list row */}
      <div className="absolute left-1/2 w-[760px] -translate-x-1/2" style={{ top: 700, ...rowIn, opacity: 0.5 * (rowIn.opacity as number) }}>
        <div className="flex items-center gap-5 border-t border-stone-900/10 pt-7">
          <span className="grid size-[64px] shrink-0 place-items-center rounded-full bg-[#c98a6b] text-[26px] font-semibold text-white">J</span>
          <div className="min-w-0 flex-1">
            <div className="text-[26px] font-semibold text-[#161413]">Jess Martin</div>
            <div className="truncate text-[24px] text-stone-500">hey my order never arrived 😡</div>
          </div>
          <span className="text-[22px] text-stone-400">2:14 AM</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- scene 2: the complaint, close up (4.5 – 9.3) ---------- */

function SceneComplaint({ t }: { t: number }) {
  const o = win(t, 4.5, 5.0, 8.5, 9.3);
  if (o === 0) return null;

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute left-[150px] top-[300px]" style={pop(t, 4.8)}>
        <div className="rounded-[44px] rounded-bl-xl bg-white px-14 py-10 text-[52px] leading-snug text-[#161413] shadow-sm">
          hey my order never arrived 😡
        </div>
      </div>
      <div
        className="absolute left-[170px] top-[472px] text-[22px] text-stone-500 [font-family:var(--m-mono)]"
        style={{ opacity: seg(t, 5.6, 6.1) }}
      >
        Jess Martin · order #1042 · 2:14 AM
      </div>
      <div className="absolute left-[150px] top-[548px]" style={pop(t, 6.8)}>
        <div className="rounded-[40px] rounded-bl-xl bg-white px-12 py-9 text-[40px] leading-snug text-[#161413] shadow-sm">
          this is my 2nd email — can someone please just fix it 😤
        </div>
      </div>
    </div>
  );
}

/* ---------- scenes 3+4: the Telegram thread (9.2 – 24.3) ---------- */

const GAP = 22;

interface ThreadMsg {
  at: number;
  typingAt?: number;
  h: number;
  side: "agent" | "user";
  render: (t: number) => React.ReactNode;
}

function PlanButton({
  t,
  at,
  label,
  pressed,
  dimmed,
}: {
  t: number;
  at: number;
  label: string;
  pressed?: boolean;
  dimmed?: boolean;
}) {
  const PRESS = 15.0;
  const press = pressed ? Math.sin(Math.PI * seg(t, PRESS, PRESS + 0.45)) : 0;
  const selected = pressed && t >= PRESS + 0.25;
  const dim = dimmed && t >= PRESS + 0.25 ? 0.38 : 1;
  const appear = pop(t, at, 0.4);
  return (
    <div
      className="flex h-[62px] items-center justify-center rounded-2xl border text-[26px] font-medium"
      style={{
        opacity: Math.min(appear.opacity, dim),
        transform: `${appear.transform} scale(${1 - 0.05 * press})`,
        background: selected ? "#d5ecca" : "#faf8f3",
        borderColor: selected ? "#9ec78c" : "rgba(22,20,19,0.12)",
        color: "#161413",
      }}
    >
      {label}
      {selected && <span className="ml-3 text-[#2f7a4a]">✓</span>}
    </div>
  );
}

const THREAD: ThreadMsg[] = [
  {
    at: 10.9,
    typingAt: 10.0,
    h: 175,
    side: "agent",
    render: () => (
      <Bubble side="agent">
        While you slept, Jess emailed twice — order <strong>#1042</strong>{" "}never arrived, tracking&apos;s
        stuck in transit at 6 days.
      </Bubble>
    ),
  },
  {
    at: 12.6,
    typingAt: 11.7,
    h: 412,
    side: "agent",
    render: (t) => (
      <Bubble side="agent">
        I can fix this — pick one:
        <div className="mt-4 flex w-[480px] flex-col gap-3">
          <PlanButton t={t} at={12.8} label="↩️  Resend the order" dimmed />
          <PlanButton t={t} at={12.95} label="💸  Refund $42" pressed />
          <PlanButton t={t} at={13.1} label="📮  Chase the carrier" dimmed />
          <PlanButton t={t} at={13.25} label="🙋  I’ll handle it" dimmed />
        </div>
      </Bubble>
    ),
  },
  {
    at: 15.8,
    h: 118,
    side: "user",
    render: () => (
      <Bubble side="user">
        <span className="font-semibold">Refund $42</span>
        <span className="mt-1 block text-[20px] text-stone-500">Selected · 7:04 AM</span>
      </Bubble>
    ),
  },
  {
    at: 17.2,
    typingAt: 16.4,
    h: 140,
    side: "agent",
    render: () => (
      <Bubble side="agent">
        Done — $42 is back on her card. Here&apos;s the apology, in your voice:
      </Bubble>
    ),
  },
  {
    at: 18.4,
    h: 295,
    side: "agent",
    render: (t) => (
      <div className="relative w-[660px] rounded-[26px] border border-stone-900/10 bg-white p-8 shadow-sm">
        <div className="border-b border-stone-900/10 pb-3 text-[21px] text-stone-500 [font-family:var(--m-mono)]">
          To: jess@gmail.com — Re: Order #1042
        </div>
        <p className="pt-4 text-[24px] leading-normal text-[#161413]">
          Hi Jess — I&apos;m so sorry your parcel got stuck. I&apos;ve refunded you in full today, and if it
          still turns up, keep it on us.
        </p>
        {/* merchant tapback */}
        <div
          className="absolute -right-4 -top-5 grid size-[52px] place-items-center rounded-full bg-[#2f7a4a] text-[24px] shadow-md"
          style={{
            opacity: seg(t, 19.8, 20.0),
            transform: `scale(${0.5 + 0.5 * back(seg(t, 19.8, 20.15))})`,
          }}
        >
          👍
        </div>
      </div>
    ),
  },
  {
    at: 21.4,
    typingAt: 20.6,
    h: 160,
    side: "agent",
    render: () => (
      <Bubble side="agent">
        I&apos;m watching the tracking too — if the carrier doesn&apos;t move by Friday, I&apos;ll file the
        claim myself.
      </Bubble>
    ),
  },
];

function Bubble({ side, children }: { side: "agent" | "user"; children: React.ReactNode }) {
  return (
    <div
      className={`inline-block max-w-[700px] px-9 py-6 text-[28px] leading-[1.45] text-[#161413] shadow-sm ${
        side === "agent" ? "rounded-[26px] rounded-bl-lg bg-white" : "rounded-[26px] rounded-br-lg bg-[#d5ecca]"
      }`}
    >
      {children}
    </div>
  );
}

function SceneThread({ t }: { t: number }) {
  const o = win(t, 9.2, 9.8, 23.4, 24.3);
  if (o === 0) return null;

  const HEADER_H = 96;
  const FOOTER_H = 88;
  const anchorY = STAGE_H - FOOTER_H - 26;

  // Cumulative static tops; the container slides up as content is revealed.
  const tops: number[] = [];
  let cum = 0;
  for (const m of THREAD) {
    tops.push(cum);
    cum += m.h + GAP;
  }

  const TYPING_H = 78;
  let revealed = 0;
  for (const m of THREAD) revealed += (m.h + GAP) * easeOut(seg(t, m.at - 0.4, m.at));
  let typingExtra = 0;
  let typingTop: number | null = null;
  let typingOpacity = 0;
  THREAD.forEach((m, i) => {
    if (m.typingAt === undefined) return;
    const visible = win(t, m.typingAt, m.typingAt + 0.25, m.at - 0.3, m.at);
    if (visible > 0) {
      typingExtra = (TYPING_H + GAP) * visible;
      typingTop = tops[i];
      typingOpacity = visible;
    }
  });

  const containerTop = anchorY - revealed - typingExtra;

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      {/* message scroll area */}
      <div className="absolute inset-x-0 overflow-hidden" style={{ top: HEADER_H, bottom: FOOTER_H, background: "#ece5d8" }}>
        <div className="absolute inset-x-0" style={{ top: containerTop - HEADER_H }}>
          <div className="relative mx-auto w-[920px]">
            {THREAD.map((m, i) => (
              <div
                key={m.at}
                className={`absolute w-full ${m.side === "user" ? "text-right" : ""}`}
                style={{ top: tops[i], ...pop(t, m.at) }}
              >
                {m.render(t)}
              </div>
            ))}
            {typingTop !== null && (
              <div className="absolute" style={{ top: typingTop, opacity: typingOpacity }}>
                <TypingDots t={t} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* header */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-4 border-b border-stone-900/10 bg-[#f6f2eb] px-12" style={{ height: HEADER_H }}>
        <span className="grid size-[58px] place-items-center rounded-full bg-[#2f7a4a]">
          <StoreGlyph className="size-7 text-white" />
        </span>
        <div>
          <div className="flex items-center gap-2 text-[26px] font-semibold leading-tight text-[#161413]">
            Shopkeeper <VerifiedBadge size={22} />
          </div>
          <div className="text-[20px] leading-tight text-stone-500">your employee · connected to your Shopify</div>
        </div>
        <span className="ml-auto text-[22px] text-stone-400">7:03 AM</span>
      </div>

      {/* input bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 border-t border-stone-900/10 bg-[#f6f2eb] px-12" style={{ height: FOOTER_H }}>
        <span className="flex-1 rounded-full bg-white px-7 py-3.5 text-[24px] text-stone-400">Message</span>
        <span className="grid size-[54px] shrink-0 place-items-center rounded-full bg-[#2f7a4a] text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6">
            <path d="m22 2-7 20-4-9-9-4z" />
            <path d="M22 2 11 13" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ---------- scene 5: capabilities (24.2 – 30.2) ---------- */

const CAPABILITIES = [
  { title: "Orders", sub: "refunds, swaps, cancellations", emoji: "📦" },
  { title: "Inventory", sub: "checks stock before promising", emoji: "📊" },
  { title: "Customers", sub: "remembers every conversation", emoji: "🧠" },
  { title: "Brand voice", sub: "sounds like you, not a bot", emoji: "✍️" },
  { title: "Daily digest", sub: "your whole store in one morning text", emoji: "☕" },
  { title: "Escalation", sub: "hands you the weird ones", emoji: "🙋" },
];

function SceneCapabilities({ t }: { t: number }) {
  const o = win(t, 24.2, 24.8, 29.4, 30.2);
  if (o === 0) return null;

  const CARD_H = 128;
  const stackH = CAPABILITIES.length * (CARD_H + GAP) - GAP;
  const viewTop = 230;
  const viewH = STAGE_H - viewTop - 60;
  const scroll = easeInOut(seg(t, 25.6, 29.2)) * Math.max(0, stackH - viewH + 30);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <h2 className="absolute inset-x-0 top-[104px] text-center text-[60px] text-[#161413] [font-family:var(--m-hand)]" style={rise(t, 24.4)}>
        It runs the rest, <span className="text-[#9c9285]">too.</span>
      </h2>
      <div className="absolute left-1/2 w-[840px] -translate-x-1/2 overflow-hidden" style={{ top: viewTop, height: viewH }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {CAPABILITIES.map((c, i) => (
            <div
              key={c.title}
              className="mb-[22px] flex items-center justify-between rounded-[30px] bg-white py-6 pl-10 pr-7 shadow-sm"
              style={{ height: CARD_H, ...pop(t, 25.0 + i * 0.18) }}
            >
              <div>
                <div className="text-[30px] font-semibold text-[#161413]">{c.title}</div>
                <div className="text-[24px] text-stone-500">{c.sub}</div>
              </div>
              <span className="grid size-[76px] place-items-center rounded-2xl bg-[#efe9df] text-[38px]">{c.emoji}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- scene 6: channels (30.0 – 35.2) ---------- */

const HUB = { x: 600, y: 566 };
const RADIUS = 244;

// Customer channels spaced evenly around the one employee. Offset 30° so the
// top-center stays clear for the heading and nothing sits dead-center.
const CHANNELS: { name: string; logo?: string; mark?: (s: number) => React.ReactNode }[] = [
  { name: "Instagram", logo: "/logos/instagram-logo.png" },
  { name: "Email", logo: "/logos/email.svg" },
  { name: "iMessage", logo: "/logos/sms.svg" },
  { name: "WhatsApp", mark: (s) => <WhatsAppMark size={s} /> },
  { name: "Telegram", mark: (s) => <TelegramMark size={s} /> },
  { name: "TikTok", logo: "/logos/tiktok-logo.png" },
];

function channelPos(i: number) {
  const theta = ((30 + i * 60) * Math.PI) / 180;
  return { x: HUB.x + RADIUS * Math.sin(theta), y: HUB.y - RADIUS * Math.cos(theta) };
}

function SceneChannels({ t }: { t: number }) {
  const o = win(t, 30.0, 30.6, 34.4, 35.2);
  if (o === 0) return null;

  const hubP = seg(t, 30.45, 31.05);

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <h2 className="absolute inset-x-0 top-[86px] text-center text-[58px] leading-[1.12] text-[#161413] [font-family:var(--m-hand)]" style={rise(t, 30.2)}>
        Wherever your customers are,
        <br />
        <span className="text-[#9c9285]">one employee across all of it.</span>
      </h2>

      {/* spokes from the one employee out to every channel */}
      <svg className="absolute inset-0" viewBox="0 0 1200 900" fill="none" aria-hidden>
        {CHANNELS.map((c, i) => {
          const { x, y } = channelPos(i);
          const fy = Math.sin(t * 1.1 + i) * 4;
          const p = easeOut(seg(t, 30.9 + i * 0.08, 31.6 + i * 0.08));
          return (
            <line
              key={c.name}
              x1={HUB.x}
              y1={HUB.y}
              x2={x}
              y2={y + fy}
              stroke="rgba(22,20,19,0.12)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RADIUS}
              strokeDashoffset={RADIUS * (1 - p)}
            />
          );
        })}
      </svg>

      {/* the one employee, at the center */}
      <div
        className="absolute"
        style={{ left: HUB.x - 70, top: HUB.y - 70, opacity: Math.min(1, hubP * 2), transform: `scale(${0.5 + 0.5 * back(hubP)})` }}
      >
        <div className="relative">
          <AppIcon size={140} />
          <span className="absolute -bottom-1.5 -right-1.5">
            <VerifiedBadge size={40} />
          </span>
        </div>
      </div>

      {/* channels around the ring */}
      {CHANNELS.map((c, i) => {
        const { x, y } = channelPos(i);
        const fy = Math.sin(t * 1.1 + i) * 4;
        const p = seg(t, 31.0 + i * 0.1, 31.55 + i * 0.1);
        return (
          <div
            key={c.name}
            className="absolute grid size-[108px] place-items-center rounded-[26px] bg-white shadow-[0_18px_38px_rgba(43,33,24,0.16)]"
            style={{
              left: x - 54,
              top: y - 54 + fy,
              opacity: Math.min(1, p * 2),
              transform: `scale(${0.55 + 0.45 * back(p)})`,
            }}
          >
            {c.mark ? (
              c.mark(56)
            ) : (
              <Image src={c.logo as string} alt={c.name} width={56} height={56} className="size-[56px] object-contain" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- scene 7: outro (35.0 – end) ---------- */

function SceneOutro({ t }: { t: number }) {
  const o = seg(t, 35.0, 35.6);
  if (o === 0) return null;

  return (
    <div className="absolute inset-0" style={{ opacity: o }}>
      <div className="absolute left-1/2 top-[300px] -translate-x-1/2" style={pop(t, 35.2)}>
        <AppIcon size={116} />
      </div>
      <h1 className="absolute inset-x-0 top-[430px] text-center text-[132px] leading-none tracking-[0.01em] text-[#161413] [font-family:var(--m-hand)]" style={rise(t, 35.5)}>
        Shopkeeper
      </h1>
      <p className="absolute inset-x-0 top-[586px] text-center text-[44px] text-[#9c9285] [font-family:var(--m-hand)]" style={rise(t, 36.1)}>
        your newest employee.
      </p>
    </div>
  );
}

/* ---------- stage ---------- */

declare global {
  interface Window {
    __seek?: (t: number) => void;
    __filmDuration?: number;
  }
}

export default function DemoFilmPage() {
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(stageScale);

  useEffect(() => {
    const fit = () => setScale(stageScale());
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    let raf = 0;
    let playing = !new URLSearchParams(window.location.search).has("capture");
    window.__seek = (sec: number) => {
      playing = false;
      cancelAnimationFrame(raf);
      setT(sec);
    };
    window.__filmDuration = DURATION;
    if (playing) {
      let start: number | null = null;
      const loop = (ts: number) => {
        if (!playing) return;
        if (start === null) start = ts;
        setT(((ts - start) / 1000) % DURATION);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 grid place-items-center bg-[#161413]">
      <div
        className="relative overflow-hidden bg-[#f6f2eb]"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        <SceneIcon t={t} />
        <SceneComplaint t={t} />
        <SceneThread t={t} />
        <SceneCapabilities t={t} />
        <SceneChannels t={t} />
        <SceneOutro t={t} />
        {/* paper grain on top of everything */}
        <div aria-hidden className="m-grain pointer-events-none absolute inset-0 opacity-60" />
      </div>
    </div>
  );
}
