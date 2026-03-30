import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import HeroGraphic from "@/components/landing/heroGraphic";

export function Hero() {
  return (
    <section className="relative overflow-hidden w-full pt-28 md:pt-36 lg:pt-32 pb-16 md:pb-24">
      {/* Subtle Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20 pointer-events-none blur-[100px] bg-gradient-to-b from-yellow-400 to-transparent z-0" />

      <div className="container relative z-10 mx-auto px-4 md:px-6 max-w-7xl">
        {/* Adjusted gaps for better medium-screen breathing room */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-10 xl:gap-16 items-center">
          
          {/* Left side – Text */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left gap-6 lg:gap-8">


            {/* Main Headline - SCALED for exact breakpoints */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-extrabold tracking-tighter text-foreground leading-[1.05] max-w-2xl">
              The AI support agent for e-commerce brands.
            </h1>

            {/* Subtitle */}
            <p className="max-w-[540px] text-base sm:text-lg md:text-xl lg:text-lg xl:text-xl text-muted-foreground leading-relaxed">
              Every Instagram DM, SMS, Shopify order, and email — in one inbox. Clerk reads the ticket, drafts the reply, and resolves it. You just approve.
            </p>

            {/* CTA Group */}
            <div className="flex flex-col w-full sm:w-auto items-center lg:items-start gap-3 mt-2">
              <div className="flex flex-col sm:flex-row w-full gap-3">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
                  asChild
                >
                  <Link href="/signup">Get started free</Link>
                </Button>
                
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base font-semibold rounded-full bg-white/50 backdrop-blur-sm border-slate-200 hover:bg-slate-50 transition-all"
                  asChild
                >
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
              
              <p className="text-xs font-medium text-slate-400 mt-2">
                No credit card required &middot; Setup in 5 minutes
              </p>
            </div>

          </div>

          {/* Right side - Graphic */}
          <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-full mx-auto">
            <HeroGraphic />
          </div>

        </div>
      </div>
    </section>
  );
}