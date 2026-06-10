import { Navbar } from "./_components/Navbar";
import { Hero } from "./_components/Hero";
import { Channels } from "./_components/Channels";
import { Features } from "./_components/Features";
import { Integrations } from "./_components/Integrations";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA as Cta } from "./_components/CTA";
import { Footer } from "./_components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Channels />
      <Features />
      <Integrations />
      <Pricing />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
