import Link from "next/link";
import { ChatDemo, type ChatMessage } from "./ChatDemo";

const HERO_CHAT: ChatMessage[] = [
  {
    from: "agent",
    text: "Morning ☀️ 14 customer messages came in overnight. I handled 12 — tracking links, sizing, one discount code. Two need your call.",
    time: "7:02 AM",
  },
  {
    from: "agent",
    text: "First: Sarah on Instagram wants to swap order #2849 to a Medium before it ships. Medium's in stock. My draft: “Hey Sarah! Done — swapped you to a Medium, same delivery date 💛” Send it?",
    time: "7:02 AM",
  },
  { from: "user", text: "send it", time: "7:08 AM" },
  {
    from: "agent",
    text: "Sent ✓ Next: David's asking for a refund on #3012 — $84, inside your 30-day window. Approve?",
    time: "7:08 AM",
  },
  { from: "user", text: "approve", time: "7:09 AM" },
  {
    from: "agent",
    text: "Refunded $84 ✓ and his return label is in his inbox. That's everything — go enjoy your coffee.",
    time: "7:09 AM",
  },
];

export function Hero() {
  return (
    <section className="relative px-6 pb-20 pt-16 text-center sm:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[55%] -z-10 h-[600px] w-[900px] max-w-none -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(47,122,74,0.14),transparent)]"
      />

      <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 [font-family:var(--m-mono)]">
        ✦ AI support for Shopify brands
      </p>

      <h1 className="mx-auto mb-6 max-w-[16ch] text-[clamp(48px,8vw,104px)] font-normal leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]">
        Meet Shopkeeper, <em className="italic text-[#2f7a4a]">your newest employee.</em>
      </h1>

      <p className="mx-auto mb-8 max-w-[52ch] text-[17px] leading-relaxed text-stone-700">
        It answers your customers on Instagram, email, and SMS — in your voice, with your store&apos;s
        real order data — and texts you when something needs a human. You approve; it does the typing.
      </p>

      <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="inline-flex items-center rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-[#f6f2eb] no-underline transition-colors hover:bg-stone-700"
        >
          Hire Shopkeeper — free for 14 days
        </Link>
        <Link
          href="#how"
          className="inline-flex items-center rounded-full border border-stone-900/15 px-6 py-3 text-sm font-semibold text-stone-900 no-underline transition-colors hover:border-stone-900/35"
        >
          Watch it work ↓
        </Link>
      </div>

      <div className="mb-14 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[13px] text-stone-600">
        {["No credit card", "Shopify connects in 2 min", "Cancel anytime"].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-full bg-[#2f7a4a] text-[9px] text-white">✓</span>
            {item}
          </span>
        ))}
      </div>

      <ChatDemo
        title="Shopkeeper"
        subtitle="your store · online"
        avatar="S"
        messages={HERO_CHAT}
      />
      <p className="mt-6 text-[13px] text-stone-500 [font-family:var(--m-mono)]">
        ↑ this morning&apos;s report, live from Telegram
      </p>
    </section>
  );
}
