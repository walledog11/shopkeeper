import Image from "next/image";
import { GlassLink } from "./GlassLink";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import { HeroMedia } from "./HeroMedia";

const integrationRoles = [
  { name: "Instagram, email, website chat", role: "Customer messages", logo: "/logos/instagram-logo.png" },
  { name: "iMessage", role: "Your approvals", logo: "/logos/imessage.svg" },
  { name: "Shopify", role: "Order work", logo: "/logos/shopify.svg" },
] as const;

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative isolate px-5 pb-20 pt-12 text-center sm:px-6 sm:pt-16 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] [background:radial-gradient(58%_52%_at_50%_40%,rgba(249,245,238,0.95)_0%,rgba(249,245,238,0.55)_42%,transparent_72%)]"
      />

      <p className="m-kicker mb-5" style={rise(0)}>
        An AI support operator for your Shopify store
      </p>

      <h1
        className="m-display mx-auto mb-6 max-w-[min(820px,94vw)] text-[clamp(2.55rem,6vw,5rem)]"
        style={rise(0)}
      >
        Answers the DM. Fixes the order. Asks before spending your money.
      </h1>

      <p
        className="mx-auto mb-8 max-w-[620px] text-[17px] leading-[1.6] text-stone-600 sm:text-[18px]"
        style={rise(80)}
      >
        You get to your DMs at 11pm. Order #3102 already has a size swap waiting,
        checked against live stock. Shopkeeper wrote the reply — it just needs your yes.
      </p>

      <div className="mb-9" style={rise(160)}>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <GlassLink href="/signup" variant="primary" className="min-h-12 justify-center px-6 py-3">
            {PRIMARY_CTA_LABEL}
          </GlassLink>
          <GlassLink href="#demo" variant="outline" className="min-h-12 justify-center px-6 py-3">
            See Shopkeeper work
          </GlassLink>
        </div>
        <p className="mt-3 text-[13px] text-stone-500">
          Free for 14 days. You add a card when you pick a plan.
        </p>
      </div>

      <div
        className="mx-auto mb-14 grid max-w-[760px] divide-y divide-stone-900/10 border-y border-stone-900/10 text-left sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        style={rise(210)}
        aria-label="How Shopkeeper connects"
      >
        {integrationRoles.map((item) => (
          <div key={item.role} className="flex items-center gap-3 px-3 py-4 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/65 ring-1 ring-stone-900/8">
              <Image src={item.logo} alt="" width={22} height={22} className="size-[22px] object-contain" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                {item.role}
              </span>
              <span className="mt-0.5 block text-[13px] font-semibold text-stone-800">{item.name}</span>
            </span>
          </div>
        ))}
      </div>

      <div id="demo" style={rise(260)} className="relative mx-auto mt-2 max-w-6xl scroll-mt-28">
        <div className="mb-7 text-center">
          <p className="m-kicker">Example workflow · demo data</p>
          <h2 className="m-display mx-auto mt-4 max-w-[18ch] text-[clamp(1.9rem,4vw,3.25rem)]">
            One message. The order gets handled.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-stone-600">
            The third step is the one that matters. Shopkeeper has the swap ready and
            stops anyway, because changing order #3102 is your call.
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
