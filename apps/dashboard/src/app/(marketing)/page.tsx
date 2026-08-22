import type { Metadata } from "next";
import { Navbar } from "./_components/Navbar";
import { Hero } from "./_components/Hero";
import { Delegation } from "./_components/Delegation";
import { Capabilities } from "./_components/Capabilities";
import { ControlMoment } from "./_components/ProductOverview";
import { Onboarding } from "./_components/Onboarding";
import { Trust } from "./_components/Trust";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA } from "./_components/CTA";
import { Footer } from "./_components/Footer";

const title = "Shopkeeper for Shopify — AI customer support that fixes the order";
const description =
  "Shopkeeper handles routine Instagram and email support, completes supported Shopify order work, and asks you when a decision needs approval.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Shopkeeper",
  alternateName: "Shopkeeper for Shopify",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description,
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "19",
      priceCurrency: "USD",
      category: "subscription",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "49",
      priceCurrency: "USD",
      category: "subscription",
    },
  ],
};

export default function Home() {
  return (
    <main className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Navbar />
      <Hero />
      <Delegation />
      <Capabilities />
      <ControlMoment />
      <Onboarding />
      <Trust />
      <Pricing />
      <Faq />
      <CTA />
      <Footer />
    </main>
  );
}
