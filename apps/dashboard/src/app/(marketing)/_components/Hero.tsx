import Image from "next/image";
import { GlassLink } from "./GlassLink";
import { MarketingHandoffLink } from "./MarketingHandoffLink";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import { HeroMedia } from "./HeroMedia";
import {
  marketingSectionBodyClass,
  marketingSectionTitleClass,
  marketingSurfaceCardClass,
} from "./marketingUi";
import { Check, MessageSquareText } from "lucide-react";

const operationGroups = [
  {
    title: "Before it ships",
    items: [
      "Look up orders and customer details",
      "Correct a shipping address",
      "Add, remove, or swap order items",
      "Cancel an eligible unfulfilled order",
    ],
  },
  {
    title: "Returns & refunds",
    items: [
      "Refund a whole order or specified items",
      "Open a return for delivered items",
      "Arrange an eligible size or color exchange",
      "Attach a return label you provide",
    ],
  },
  {
    title: "The rest of the paperwork",
    items: [
      "Create an unpaid customer order",
      "Issue a requested fixed-value gift card",
      "Update customer details and notes",
      "Record fulfillment and tracking after shipment",
    ],
  },
] as const;

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
        <div id="operations" className="mb-14 scroll-mt-28 text-center sm:mb-16">
          <h2 className={`${marketingSectionTitleClass} max-w-[20ch]`}>
            The actual order work, from lookup to return.
          </h2>
          <p className={marketingSectionBodyClass}>
            These are changes Shopkeeper can make in your connected store. Ask for them
            yourself, or review a proposal from a customer conversation. Each action still
            has to meet Shopify’s requirements and your configured limits.
          </p>
          <div className="mx-auto mt-8 grid max-w-5xl gap-3 text-left sm:gap-4 md:grid-cols-3">
            {operationGroups.map((group) => (
              <div
                key={group.title}
                className={marketingSurfaceCardClass}
              >
                <h3 className="m-display text-[1.05rem] font-semibold tracking-[-0.03em] text-stone-950 sm:text-[1.125rem]">
                  {group.title}
                </h3>
                <ul className="mt-4 space-y-2.5 text-[14px] leading-snug text-stone-600 sm:text-[15px] sm:leading-relaxed">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[var(--m-good)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-8 sm:mt-10">
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
          </div>
          <div className="mx-auto max-w-[560px] rounded-[2.25rem] bg-white/35 p-2 shadow-[0_30px_80px_-52px_rgba(43,33,24,0.5)] ring-1 ring-stone-900/5 sm:p-3">
            <HeroMedia />
          </div>
        </div>

        <div className="mt-8">
          <MarketingHandoffLink href="/product/order-operations" label="Order workflows and requirements" />
        </div>
      </div>
    </section>
  );
}
