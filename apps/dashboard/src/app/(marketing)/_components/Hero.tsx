import Image from "next/image";
import { GlassLink } from "./GlassLink";

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative isolate px-6 pb-20 pt-14 text-center sm:pt-20">

      {/* Soft paper-white clearing behind the copy — lets the crumpled texture
          recede directly under the type, then return to full grain at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] [background:radial-gradient(58%_52%_at_50%_40%,rgba(249,245,238,0.95)_0%,rgba(249,245,238,0.55)_42%,transparent_72%)]"
      />

      <div className="mb-7 inline-flex items-center gap-2.5" style={rise(0)}>
        <span className="rounded-full border border-stone-900/10 bg-white/80 px-2.5 py-1 text-[12px] font-medium text-stone-600">
          New
        </span>
        <a
          href="#channels"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-stone-800 transition-colors hover:text-black"
        >
          Apple Messages
          <span aria-hidden className="text-stone-400">
            ›
          </span>
        </a>
      </div>

      <h1
        className="mx-auto mb-4 max-w-[min(760px,92vw)] text-[clamp(42px,5.5vw,72px)] font-bold leading-[1.05] tracking-[-0.01em] [font-family:var(--m-caveat)] [text-shadow:0_1px_0_rgba(255,255,255,0.55),0_2px_16px_rgba(249,245,238,0.9)]"
        style={rise(80)}
      >
        The AI employee
        <br />
        for your Shopify store
      </h1>

      <p
        className="mx-auto mb-9 max-w-[min(540px,88vw)] text-[15px] leading-[1.45] text-stone-600 sm:text-[16px]"
        style={rise(160)}
      >
        It answers your customers overnight, fixes orders right in Shopify, and texts you the moment something needs your call.
      </p>

      <div style={rise(320)} className="relative mt-2">
        {/* Warm morning-light wash behind the demo film — placeholder photography,
            swap /atmosphere/hero-light.jpg for the final shot. */}
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
        <video
          aria-label="Shopkeeper demo film"
          src="https://cfkjygwgphgv2dom.public.blob.vercel-storage.com/demo-film.mp4"
          poster="/atmosphere/demo-poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="mx-auto aspect-[4/3] w-full max-w-[880px] rounded-[28px] bg-[#f6f2eb] shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)]"
        />
      </div>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3" style={rise(420)}>
        <GlassLink href="/signup" variant="primary" className="px-6 py-3">
          Hire Shopkeeper — free for 14 days
        </GlassLink>
        <GlassLink href="#how" variant="secondary" className="px-6 py-3">
          Watch it work ↓
        </GlassLink>
      </div>
    </section>
  );
}
