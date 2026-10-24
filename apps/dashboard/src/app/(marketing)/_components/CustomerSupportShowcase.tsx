import { HeroMedia } from "./HeroMedia";
import { MarketingHandoff } from "./MarketingHandoff";
import { MarketingSectionHeader } from "./MarketingSectionHeader";
import { MarketingSection } from "./MarketingSection";

export function CustomerSupportShowcase() {
  return (
    <MarketingSection
      id="customers"
      aria-labelledby="customer-support-showcase-heading"
      className="relative isolate"
    >
      <div className="relative mx-auto max-w-6xl scroll-mt-28">
        <MarketingSectionHeader
          id="customer-support-showcase-heading"
          className="mb-10 sm:mb-12"
          titleClassName="max-w-[22ch]"
          title="When customers write in, the order comes with the message."
          body="Instagram, email, or chat on your store: Shopkeeper reads the thread, checks Shopify, and sends you anything that needs a yes."
        />

        <div id="demo" className="relative mt-2 sm:mt-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-24 -inset-y-12 -z-10 bg-[radial-gradient(52%_56%_at_50%_50%,rgba(253,222,208,0.85)_0%,rgba(253,236,229,0.45)_46%,transparent_74%)]"
          />
          <div className="mx-auto max-w-[560px] rounded-[2.25rem] bg-white/60 p-2 shadow-[0_30px_80px_-52px_rgba(27,26,25,0.5)] ring-1 ring-[color:var(--m-line)] sm:p-3">
            <HeroMedia />
          </div>
        </div>

        <MarketingHandoff
          links={[
            { href: "/product/order-operations", label: "How order changes work" },
            { href: "/product/customer-support", label: "How replies use your store’s knowledge" },
          ]}
        />
      </div>
    </MarketingSection>
  );
}
