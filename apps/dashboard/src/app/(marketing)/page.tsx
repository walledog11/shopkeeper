import type { Metadata } from "next";
import { Navbar } from "./_components/Navbar";
import { Story } from "./_components/Story";
import { Limits } from "./_components/Limits";
import { MorningText } from "./_components/MorningText";
import { Pricing } from "./_components/Pricing";
import { FAQ as Faq } from "./_components/FAQ";
import { CTA as Cta } from "./_components/CTA";
import { Footer } from "./_components/Footer";

// Title, description and the link preview are the site defaults in the root layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className="relative">
      <Navbar tone="dark" />
      <Story />
      <Limits />
      <div className="m-chapter m-chapter--alt">
        <MorningText />
      </div>
      <Pricing />
      <div className="border-t border-[color:var(--m-line)]">
        <Faq />
      </div>
      <Cta />
      <Footer />
    </main>
  );
}
