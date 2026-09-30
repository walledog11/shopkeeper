import { ButtonLink } from "./ButtonLink";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
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
            <span aria-hidden className="absolute left-1/2 top-1/2 h-px w-[300vw] -translate-x-1/2 bg-white/12" />
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
      <h1 className="m-display m-h1 mx-auto mb-5 max-w-[min(900px,94vw)]" style={rise(0)}>
        The AI shopkeeper built for solo Shopify stores
      </h1>

      <p className="m-lede mx-auto mb-8 max-w-[560px]" style={rise(80)}>
        Shopkeeper answers customers and does the work in Shopify, while you
        approve anything that matters by text from iMessage or the dashboard.
      </p>

      <div style={rise(160)}>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <ButtonLink href="/signup" variant="primary" size="lg">
            {PRIMARY_CTA_LABEL}
          </ButtonLink>
          <ButtonLink href="#workflow" variant="outline" size="lg">
            <MessageSquareText aria-hidden className="size-4" />
            See what you can ask
          </ButtonLink>
        </div>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[color:var(--m-ink-3)]">
          {heroProofPoints.map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5" />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <HeroFlow />
    </section>
  );
}
