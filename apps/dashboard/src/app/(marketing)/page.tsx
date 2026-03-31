import { Navbar } from "./_components/Navbar";
import { Hero } from "./_components/Hero";
import { Features } from "./_components/Features";
import { HowItWorks } from "./_components/HowItWorks";
import { BuiltFor } from "./_components/BuiltFor";
import { Pricing } from "./_components/Pricing";
import { FAQ } from "./_components/FAQ";
import { CTA } from "./_components/CTA";
import { Footer } from "./_components/Footer";
import { LogoScrollBar } from "./_components/LogoScrollBar";
import { StatsBar } from "./_components/StatsBar";
import { WorkSprawl } from "./_components/WorkSprawl";
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
