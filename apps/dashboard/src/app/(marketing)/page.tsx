import type { Metadata } from "next";
import { Navbar } from "./_components/Navbar";
import { MarginThread } from "./_components/MarginThread";
import { Hero } from "./_components/Hero";
import { CoreProductOverview, ProactiveOperations, TrustSection } from "./_components/ProductOverview";
import { Onboarding } from "./_components/Onboarding";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA as Cta } from "./_components/CTA";
import { Footer } from "./_components/Footer";

const title = "Shopkeeper — manage your Shopify store by text";
const description = "An AI agent for orders, stock checks, sales, and customer messages. Give Shopkeeper work through iMessage or the dashboard, with your store knowledge and action limits.";

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
