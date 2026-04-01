import { Button } from "@/components/ui/button";
import Link from "next/link";
import HeroGraphic from "./HeroGraphic";

export function Hero() {
  return (
    <section className="relative w-full pt-28 md:pt-36 lg:pt-40 pb-0">

      {/* Decorative side shapes — clipped by parent overflow-hidden */}
      {/* Left: two overlapping rotated rounded rectangles */}
      <div
        className="absolute bottom-[4%] -left-40 w-80 h-80 rounded-[30px] bg-amber-400 rotate-[18deg] opacity-100 pointer-events-none"
      />
      <div
        className="absolute bottom-[18%] -left-48 w-80 h-80 rounded-[30px] bg-amber-400 rotate-[8deg] opacity-60 pointer-events-none"
        style={{ boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.45)" }}
      />

      {/* Right: mirror */}
      <div
        className="absolute bottom-[4%] -right-40 w-80 h-80 rounded-[30px] bg-amber-400 -rotate-[18deg] opacity-100 pointer-events-none"
      />
      <div
        className="absolute bottom-[18%] -right-48 w-80 h-80 rounded-[30px] bg-amber-400 -rotate-[8deg] opacity-60 pointer-events-none"
        style={{ boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.45)" }}
      />

      <div className="container relative z-10 mx-auto px-4 md:px-6 max-w-5xl">

        {/* Centered text block */}
        <div className="flex flex-col items-center text-center gap-6">

          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/60 bg-white/60 backdrop-blur-sm">
            <span className="text-xs font-bold tracking-widest uppercase text-amber-600">Clerk AI</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-slate-900 leading-[1.05] max-w-3xl">
            The AI support agent for{" "}
            <span className="text-amber-500">e-commerce brands.</span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-[540px] text-base sm:text-lg md:text-xl text-slate-500 leading-relaxed">
            Every Instagram DM, SMS, Shopify order, and email — in one inbox. Clerk reads the ticket, drafts the reply, and resolves it. You just approve.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
            <Button
              size="lg"
              className="h-12 px-8 text-base font-semibold rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all"
              asChild
            >
              <Link href="/signup">Get started — for free</Link>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base font-semibold rounded-full bg-white/70 backdrop-blur-sm border-slate-300 hover:bg-white transition-all"
              asChild
            >
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>

          <p className="text-xs font-medium text-slate-400">
            No credit card required &middot; Setup in 5 minutes
          </p>
        </div>

        {/* Dashboard graphic — responsive fixed height, naturally clipped at bottom */}
        <div className="relative mt-14 w-full h-[320px] sm:h-[420px] md:h-[500px] lg:h-[560px]">
          <HeroGraphic />
        </div>

      </div>
    </section>
  );
}
