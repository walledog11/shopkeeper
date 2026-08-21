import { Navbar } from "./_components/Navbar";
import { MarginThread } from "./_components/MarginThread";
import { Hero } from "./_components/Hero";
import { CoreProductOverview, ProactiveOperations, TrustSection } from "./_components/ProductOverview";
import { Onboarding } from "./_components/Onboarding";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA as Cta } from "./_components/CTA";
import { Footer } from "./_components/Footer";

export default function Home() {
  return (
    <main className="relative">
      <MarginThread />
      <Navbar />
      <Hero />
      <CoreProductOverview />
      <ProactiveOperations />
      <Onboarding />
      <TrustSection />
      <Pricing />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
