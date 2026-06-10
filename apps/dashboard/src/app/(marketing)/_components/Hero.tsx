import { GlassLink } from "./GlassLink";

function rise(delayMs: number) {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative isolate px-6 pb-20 pt-16 text-center sm:pt-24">
      {/* Soft watercolor wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[12%] -z-10 h-[720px] w-[1100px] max-w-none -translate-x-1/2 blur-2xl bg-[radial-gradient(55%_45%_at_50%_30%,rgba(168,190,202,0.4),transparent_70%),radial-gradient(45%_40%_at_25%_75%,rgba(208,190,160,0.45),transparent_70%),radial-gradient(45%_40%_at_78%_70%,rgba(170,184,162,0.35),transparent_70%)]"
      />

      <p
        className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 [font-family:var(--m-mono)]"
        style={rise(0)}
      >
        ✦ AI support for Shopify brands
      </p>

      <h1
        className="mx-auto mb-6 max-w-[16ch] text-[clamp(48px,8vw,104px)] font-normal leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]"
        style={rise(80)}
      >
        Meet Shopkeeper, <em className="italic text-[#9c9285]">your newest employee.</em>
      </h1>

      <div style={rise(420)} className="mt-10">
        {/* Raw HTML so the `muted` attribute is present at parse time — React only sets
            the property, and the browser blocks autoplay on a not-yet-muted video. */}
        <div
          dangerouslySetInnerHTML={{
            __html: `<video src="https://cfkjygwgphgv2dom.public.blob.vercel-storage.com/demo-film.mp4" autoplay muted loop playsinline class="mx-auto w-full max-w-[880px] rounded-[28px] bg-[#f6f2eb] shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)]"></video>`,
          }}
        />
      </div>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3" style={rise(240)}>
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
