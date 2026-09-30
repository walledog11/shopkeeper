import type { Metadata } from "next";
import { Navbar } from "./_components/Navbar";
import { Hero } from "./_components/Hero";
import { MerchantTasks } from "./_components/MerchantTasks";
import { CustomerSupportShowcase } from "./_components/CustomerSupportShowcase";
import { ConversationBento } from "./_components/ConversationBento";
import { Onboarding } from "./_components/Onboarding";
import { ProactiveOperations } from "./_components/ProductOverview";
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
      <Navbar />
      <Hero />
      <div className="m-chapter m-chapter--alt">
        <MerchantTasks />
      </div>
      <CustomerSupportShowcase />
      <div className="m-chapter m-chapter--alt">
        <ConversationBento />
      </div>
      <Onboarding />
      <div className="m-chapter m-chapter--dark">
        <ProactiveOperations />
      </div>
      <Pricing />
      <div className="m-chapter m-chapter--alt">
        <Faq />
      </div>
      <Cta />
      <Footer />
    </main>
  );
}
