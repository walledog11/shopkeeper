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
import { HowItWorks } from "./_components/HowItWorks";
import NotificationBar from "./_components/NotificationBar";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col bg-white">
      <div className="relative z-30 w-full">
        <NotificationBar />
        <Navbar />
        <Hero />
      </div>

      <div className="relative z-20 w-full">
        <WorkSprawl />
        <HowItWorks />
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
