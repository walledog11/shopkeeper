import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BuiltFor } from "@/components/landing/BuiltFor";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { LogoScrollBar } from "@/components/landing/LogoScrollBar";
import { StatsBar } from "@/components/landing/StatsBar";
import { WorkSprawl } from "@/components/landing/WorkSprawl";
import { DotPattern } from "@/components/ui/dot-pattern";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col bg-white">
      
      {/* Container specifically for Hero + Dots so it doesn't bleed down the whole page */}
      <div className="relative w-full flex flex-col items-center overflow-hidden">
        {/* The DotPattern is now confined to the top portion of the page and fades out via a linear gradient at the bottom */}
        <DotPattern
          width={26}
          height={26}
          cr={1}
          className="absolute inset-0 z-0 opacity-80 [mask-image:linear-gradient(to_bottom,white_40%,transparent_100%)]"
        />
        
        {/* Navbar and Hero sit safely on top of the dots */}
        <div className="relative z-30 w-full">
          <Navbar />
          <Hero />
        </div>
      </div>

      {/* The rest of the sections sit below the dots on clean, solid backgrounds */}
      <div className="relative z-20 w-full bg-white">
        <StatsBar />
        <LogoScrollBar />
        <WorkSprawl />
        <Features />

        {/* IMPORTANT: Make sure these components below also have `bg-white` or `bg-slate-50` in their outermost div! */}
        <HowItWorks />
        <BuiltFor />
        <Pricing />
        <FAQ />
        <CTA />
        <Footer />
      </div>
      
    </main>
  );
}