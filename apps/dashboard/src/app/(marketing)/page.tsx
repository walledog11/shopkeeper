import { Navbar } from "./_components/Navbar";
import { MarginThread } from "./_components/MarginThread";
import { Hero } from "./_components/Hero";
import { Channels } from "./_components/Channels";
import { Touchpoints } from "./_components/Touchpoints";
import { Onboarding } from "./_components/Onboarding";
import { Features } from "./_components/Features";
import { Integrations } from "./_components/Integrations";
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
      <Integrations />
      <Channels />
      <Touchpoints />
      <Onboarding />
      <Features />
      <Pricing />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
