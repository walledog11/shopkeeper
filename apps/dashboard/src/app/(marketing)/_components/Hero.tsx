import { Button } from "@/components/ui/button";
import Link from "next/link";
import HeroGraphic from "./HeroGraphic";

export function Hero() {
  return (
    <section className="relative w-full pt-28 md:pt-36 lg:pt-40 pb-0">

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

          {/* Subtitle — one sentence */}
          <p className="max-w-[480px] text-base sm:text-lg md:text-xl text-slate-500 leading-relaxed">
            One inbox for every channel. AI that triages, drafts, and executes — only when you approve.
          </p>

          {/* Single CTA */}
          <div className="flex flex-col items-center gap-3 mt-2">
            <Button
              size="lg"
              className="h-12 px-8 text-base font-semibold rounded-full bg-amber-400 text-amber-950 shadow-lg hover:bg-amber-500 hover:shadow-xl transition-all"
              asChild
            >
              <Link href="/signup">Get started — for free</Link>
            </Button>

            <p className="text-xs font-medium text-slate-400">
              No credit card required &middot; Setup in 5 minutes
            </p>
          </div>
        </div>

        {/* Dashboard graphic */}
        <div className="relative mt-14 w-full h-[320px] sm:h-[420px] md:h-[500px] lg:h-[560px]">
          <HeroGraphic />
        </div>

      </div>
    </section>
  );
}
