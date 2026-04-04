import { Navbar } from "./_components/Navbar";
import { Hero } from "./_components/Hero";
import { Features } from "./_components/Features";
import { BuiltFor } from "./_components/BuiltFor";
import { Pricing } from "./_components/Pricing";
import { FAQ } from "./_components/FAQ";
import { CTA } from "./_components/CTA";
import { Footer } from "./_components/Footer";
import { WorkSprawl } from "./_components/WorkSprawl";
import { MidPageCTA } from "./_components/MidPageCTA";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col bg-white">

      {/* Hero section with warm peach gradient */}
      <div
        className="relative w-full flex flex-col items-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 160% 90% at 50% 110%, #f8c09a 0%, #fddcc9 22%, #fef0e6 50%, #fff8f4 75%, #ffffff 100%)",
        }}
      >
        <div className="relative z-30 w-full">
          <Navbar />
          <Hero />
        </div>
      </div>

      <div className="relative z-20 w-full">
        <WorkSprawl />
        <Features />
        <MidPageCTA />
        <BuiltFor />
        <Pricing />
        <FAQ />
        <CTA />
        <Footer />
      </div>

    </main>
  );
}
