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

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col bg-white">

      {/* Hero section with warm peach gradient — white at top, soft peach at bottom */}
      <div
        className="relative w-full flex flex-col items-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 160% 90% at 50% 110%, #f8c09a 0%, #fddcc9 22%, #fef0e6 50%, #fff8f4 75%, #ffffff 100%)",
        }}
      >
        {/* Navbar and Hero sit on top */}
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
