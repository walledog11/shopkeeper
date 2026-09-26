import Image from "next/image";
import { GlassLink } from "./GlassLink";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import { HeroMedia } from "./HeroMedia";
import { Check, MessageSquareText } from "lucide-react";

const heroProofPoints = ["Free for 14 days", "No card to start", "Connects to Shopify"] as const;

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

// Fixed positions so server and client render the same sparkle field.
const sparkles = [
  { top: "14%", left: "9%", delay: "0s", size: 6 },
  { top: "28%", left: "22%", delay: "1.4s", size: 4 },
  { top: "62%", left: "12%", delay: "2.6s", size: 5 },
  { top: "80%", left: "30%", delay: "0.8s", size: 3 },
  { top: "18%", left: "78%", delay: "2s", size: 5 },
  { top: "40%", left: "90%", delay: "0.4s", size: 4 },
  { top: "70%", left: "84%", delay: "3.1s", size: 6 },
  { top: "86%", left: "66%", delay: "1.8s", size: 3 },
  { top: "48%", left: "4%", delay: "3.6s", size: 3 },
  { top: "8%", left: "56%", delay: "2.9s", size: 4 },
] as const;

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M7 1.5c.3 2.9 1.6 4.2 4.5 4.5-2.9.3-4.2 1.6-4.5 4.5C6.7 7.6 5.4 6.3 2.5 6 5.4 5.7 6.7 4.4 7 1.5Z" />
      <path d="M12.5 9c.15 1.5.85 2.2 2.3 2.35-1.45.15-2.15.85-2.3 2.35-.15-1.5-.85-2.2-2.35-2.35 1.5-.15 2.2-.85 2.35-2.35Z" />
    </svg>
  );
}

function HeroFlow() {
  return (
    <div className="mx-auto mt-14 w-full max-w-6xl sm:mt-16" style={rise(260)}>
      <div
        className="m-shimmer-panel relative overflow-hidden rounded-[1.75rem] px-5 pb-10 pt-10 sm:pt-12"
        role="img"
        aria-label="A customer asks to swap their order to a medium. Shopkeeper checks the order in Shopify, replies, and the swap is approved from iMessage and updated in Shopify."
      >
        <div aria-hidden className="m-shimmer-sheen" />
        <div aria-hidden className="m-grain pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay" />
        {sparkles.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="m-sparkle"
            style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
          />
        ))}
        <div className="relative flex flex-col items-center">
          <div className="relative flex w-full justify-center">
            <span aria-hidden className="absolute left-1/2 top-1/2 h-px w-[300vw] -translate-x-1/2 bg-white/45" />
            <div className="m-flow-step m-flow-card" style={{ animationDelay: "500ms" }}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9c9a8] text-[12px] font-semibold text-[#5a3a1e] ring-2 ring-white/70">
                M
              </span>
              <span>Can I swap my order to a medium?</span>
            </div>
          </div>

          <span aria-hidden className="m-flow-line" />

          <div className="m-flow-step m-flow-chip" style={{ animationDelay: "900ms" }}>
            <SparkIcon className="size-3.5" />
            Checking order #1042 in Shopify
          </div>

          <span aria-hidden className="m-flow-line" />

          <div className="m-flow-step m-flow-card" style={{ animationDelay: "1300ms" }}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/80 text-stone-800">
              <SparkIcon className="size-3.5" />
            </span>
            <span>Good news, a medium is in stock. Swapping it for you now.</span>
          </div>

          <span aria-hidden className="m-flow-line" />

          <div className="m-flow-step m-flow-pill" style={{ animationDelay: "1700ms" }}>
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 8.5 4.5 11.5 10 5" />
              <path d="M7.5 11.5 13.5 5" />
            </svg>
            Approved from iMessage
          </div>

          <span aria-hidden className="m-flow-line is-short" />
          <span aria-hidden className="m-flow-dot" />
          <p className="m-flow-step mt-2 text-[12.5px] font-medium text-white/90" style={{ animationDelay: "2000ms" }}>
            Order updated in Shopify
          </p>
          <span aria-hidden className="m-flow-dot mt-2" />
          <span aria-hidden className="m-flow-line is-fade" />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative isolate px-5 pb-8 pt-14 text-center sm:px-6 sm:pt-20 md:pb-12">
      <h1
        className="m-display mx-auto mb-5 max-w-[min(900px,94vw)] text-[clamp(2.3rem,5.2vw,4.25rem)] font-medium! tracking-[-0.035em]!"
        style={rise(0)}
      >
        The AI shopkeeper built for solo Shopify stores
      </h1>

      <p
        className="mx-auto mb-8 max-w-[560px] text-[16px] leading-[1.65] text-stone-600 sm:text-[17px]"
        style={rise(80)}
      >
        Shopkeeper answers customers and does the work in Shopify, while you
        approve anything that matters by text from iMessage or the dashboard.
      </p>

      <div style={rise(160)}>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <GlassLink href="/signup" variant="primary" className="min-h-12 justify-center px-7 py-3">
            {PRIMARY_CTA_LABEL}
          </GlassLink>
          <GlassLink href="#workflow" variant="outline" className="min-h-12 justify-center gap-2 px-7 py-3">
            <MessageSquareText aria-hidden className="size-4" />
            See what you can ask
          </GlassLink>
        </div>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-stone-500">
          {heroProofPoints.map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-stone-400" />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <HeroFlow />
    </section>
  );
}

export function CustomerWorkflow() {
  return (
    <section aria-label="Customer request walkthrough" className="relative isolate px-5 py-14 sm:px-6">
      <div id="demo" style={rise(260)} className="relative mx-auto mt-2 max-w-6xl scroll-mt-28">
        <div className="mb-7 text-center">
          <p className="m-kicker">When a customer writes first · example workflow</p>
          <h2 className="m-display mx-auto mt-4 max-w-[18ch] text-[clamp(1.9rem,4vw,3.25rem)]">
            From a customer’s DM to a change in Shopify.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-stone-600">
            Maya wants a different size. Shopkeeper finds her order, checks stock,
            prepares the change, and asks you to approve it. Then it updates the order
            and replies to her on Instagram.
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-32 -inset-y-16 -z-10 overflow-hidden [mask-image:radial-gradient(62%_60%_at_50%_50%,black_28%,transparent_74%)]"
          >
            <Image
              src="/atmosphere/hero-light.jpg"
              alt=""
              fill
              sizes="100vw"
              className="scale-110 object-cover opacity-75 [filter:blur(26px)_sepia(0.18)_saturate(0.85)_brightness(1.07)]"
            />
            <div className="m-grain absolute inset-0" />
          </div>
          <div className="mx-auto max-w-[560px] rounded-[2.25rem] bg-white/35 p-2 shadow-[0_30px_80px_-52px_rgba(43,33,24,0.5)] ring-1 ring-stone-900/5 sm:p-3">
            <HeroMedia />
          </div>
        </div>
        <p className="mx-auto mt-5 max-w-[54ch] text-center text-[12px] leading-relaxed text-stone-500">
          Fictional customer, store, and order details. Once an order ships, a swap
          becomes an exchange rather than an edit. What Shopkeeper can do is still
          bounded by the rules you set.
        </p>
      </div>
    </section>
  );
}
