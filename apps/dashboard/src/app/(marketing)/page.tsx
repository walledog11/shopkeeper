import type { Metadata } from "next";
import { Navbar } from "./_components/Navbar";
import { MarginThread } from "./_components/MarginThread";
import { Hero } from "./_components/Hero";
import { BeyondSupport, NightTimeline, ProblemSection, Proof, TrustSection } from "./_components/ProductOverview";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA as Cta } from "./_components/CTA";
import { Footer } from "./_components/Footer";

const title = "Shopkeeper — your Shopify support, handled before you wake up";
const description = "Shopkeeper answers your customers on Instagram, email, and chat. Routine questions get answered on the spot; anything involving money comes to you as a plan by text.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title, description, url: "/", type: "website", siteName: "Shopkeeper",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
  },
  twitter: { title, description, card: "summary_large_image", images: ["/og.png"] },
};

export default function Home() {
  return (
    <main className="relative">
      <MarginThread />
      <Navbar />
      <Hero />
      <ProblemSection />
      <NightTimeline />
      <BeyondSupport />
      <TrustSection />
      <Proof />
      <Pricing />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
