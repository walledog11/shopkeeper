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
      {/* Soft blue wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[8%] -z-10 h-[760px] w-[1100px] max-w-none -translate-x-1/2 blur-3xl bg-[radial-gradient(60%_50%_at_50%_35%,rgba(220,235,245,0.85),transparent_72%),radial-gradient(45%_40%_at_20%_60%,rgba(200,220,240,0.35),transparent_70%),radial-gradient(45%_40%_at_80%_55%,rgba(210,228,242,0.3),transparent_70%)]"
      />

      <div className="mb-7 inline-flex items-center gap-2.5" style={rise(0)}>
        <span className="rounded-full border border-stone-900/10 bg-white/80 px-2.5 py-1 text-[12px] font-medium text-stone-500">
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
        className="mx-auto mb-4 max-w-[min(720px,92vw)] text-[clamp(38px,5vw,60px)] font-semibold leading-[1.08] tracking-[-0.02em] text-black [font-family:var(--m-hero-serif)]"
        style={rise(80)}
      >
        Meet Shopkeeper,
        <br />
        now on Apple Messages
      </h1>

      <p
        className="mx-auto mb-9 max-w-[min(520px,88vw)] text-[15px] leading-[1.45] text-stone-500 sm:text-[16px]"
        style={rise(160)}
      >
        Try the new experience with rich actions in Apple Messages
      </p>

      <div style={rise(320)} className="mt-2">
        {/* Raw HTML so the `muted` attribute is present at parse time — React only sets
            the property, and the browser blocks autoplay on a not-yet-muted video. */}
        <div
          dangerouslySetInnerHTML={{
            __html: `<video src="https://cfkjygwgphgv2dom.public.blob.vercel-storage.com/demo-film.mp4" autoplay muted loop playsinline class="mx-auto w-full max-w-[880px] rounded-[28px] bg-[#f6f2eb] shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)]"></video>`,
          }}
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
