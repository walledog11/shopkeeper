import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { GlassLink } from "./GlassLink";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";

const channels = [
  { name: "Instagram", logo: "/logos/instagram-logo.png" },
  { name: "Email", logo: "/logos/email.svg" },
  { name: "Website chat", logo: null },
] as const;

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative isolate px-5 pb-10 pt-12 sm:px-6 sm:pt-16 md:pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] [background:radial-gradient(58%_52%_at_50%_40%,rgba(249,245,238,0.95)_0%,rgba(249,245,238,0.55)_42%,transparent_72%)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <p className="m-kicker mb-5" style={rise(0)}>
            Customer support for Shopify stores
          </p>

          <h1
            className="m-display mx-auto mb-6 max-w-[14ch] text-[clamp(2.55rem,6vw,4.75rem)] lg:mx-0"
            style={rise(0)}
          >
            Your support, handled before you wake up.
          </h1>

          <p
            className="mx-auto mb-8 max-w-[560px] text-[17px] leading-[1.6] text-stone-600 sm:text-[18px] lg:mx-0"
            style={rise(80)}
          >
            Shopkeeper answers your customers on Instagram, email, and chat, day and night.
            Routine questions get answered on the spot. Anything involving money comes to
            you as a plan by text. Approve it with one reply.
          </p>

          <div className="mb-8" style={rise(160)}>
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              <GlassLink href="/signup" variant="primary" className="min-h-12 justify-center px-6 py-3">
                {PRIMARY_CTA_LABEL}
              </GlassLink>
              <GlassLink href="#night" variant="outline" className="min-h-12 justify-center px-6 py-3">
                See a night with Shopkeeper
              </GlassLink>
            </div>
            <p className="mt-3 text-[13px] text-stone-500">
              Free for 14 days. No per-ticket fees, ever.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-stone-600 lg:justify-start"
            style={rise(210)}
            aria-label="Channels Shopkeeper answers"
          >
            <span className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Answers on</span>
            {channels.map((channel) => (
              <span key={channel.name} className="inline-flex items-center gap-2">
                {channel.logo ? (
                  <Image src={channel.logo} alt="" width={18} height={18} className="size-[18px] object-contain" />
                ) : (
                  <MessageCircle aria-hidden className="size-[18px] text-stone-500" />
                )}
                {channel.name}
              </span>
            ))}
          </div>
        </div>

        <div style={rise(240)}>
          <BriefingPhone />
        </div>
      </div>
    </section>
  );
}

function Bubble({ from, children }: { from: "agent" | "you"; children: React.ReactNode }) {
  return from === "you" ? (
    <div className="ml-auto max-w-[70%] rounded-[20px] rounded-br-md bg-[#0a84ff] px-3.5 py-2 text-[14px] leading-snug text-white">
      {children}
    </div>
  ) : (
    <div className="max-w-[84%] rounded-[20px] rounded-bl-md bg-[#e9e9eb] px-3.5 py-2 text-[14px] leading-snug text-[#1c1c1e]">
      {children}
    </div>
  );
}

/** The morning briefing as it lands in iMessage — the product's daily moment. */
function BriefingPhone() {
  return (
    <figure className="relative mx-auto w-full max-w-[340px]">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(205,184,150,0.45),transparent)] blur-2xl"
      />
      <div className="rounded-[3rem] bg-[#1c1c1e] p-2.5 shadow-[0_40px_80px_-40px_rgba(43,33,24,0.65)] ring-1 ring-black/40">
        <div className="overflow-hidden rounded-[2.4rem] bg-white">
          <div className="flex flex-col items-center gap-1 border-b border-stone-200/80 bg-[#f7f7f7] px-4 pb-2.5 pt-7">
            <span className="grid size-10 place-items-center rounded-full bg-[#2b2118] text-[15px] font-bold text-[#f6f2eb] [font-family:var(--m-hand)]">
              S
            </span>
            <span className="text-[12px] font-medium text-[#1c1c1e]">Shopkeeper</span>
          </div>

          <div className="flex flex-col gap-2 px-3.5 pb-6 pt-3">
            <p className="text-center text-[11px] text-stone-400">Today 8:00 AM</p>
            <Bubble from="agent">
              Morning! I handled 14 customers overnight. 2 need you:
            </Bubble>
            <Bubble from="agent">
              1. Refund $38 to Dana. Her order arrived a week late (#1042).
              <br />
              2. Send Marcus a new case. His arrived cracked (#1057).
            </Bubble>
            <Bubble from="you">Approve both</Bubble>
            <p className="-mt-1 text-right text-[11px] text-stone-400">Read 8:02 AM</p>
            <Bubble from="agent">
              Done. Dana’s refund is on its way and Marcus’s replacement is ordered. I let them both know.
            </Bubble>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        An example morning briefing from Shopkeeper in iMessage, approved with one reply.
      </figcaption>
    </figure>
  );
}
