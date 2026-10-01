import { HeroMedia } from "./HeroMedia";
import { MarketingHandoffLink } from "./MarketingHandoffLink";
import { SectionLabel } from "./SectionLabel";
import { marketingSectionBodyClass, marketingSectionTitleClass } from "./marketingUi";

export function CustomerSupportShowcase() {
  return (
    <section
      id="customers"
      aria-labelledby="customer-support-showcase-heading"
      className="relative isolate px-5 py-16 sm:px-6 sm:py-24"
    >
      <div className="relative mx-auto max-w-6xl scroll-mt-28">
        <div className="mb-10 text-center sm:mb-12">
          <SectionLabel>Customer messages</SectionLabel>
          <h2
            id="customer-support-showcase-heading"
            className={`${marketingSectionTitleClass} mx-auto max-w-[22ch]`}
          >
            When customers write in, the order comes with the message.
          </h2>
          <p className={marketingSectionBodyClass}>
            Instagram, email, or chat on your store: Shopkeeper reads the thread,
            checks Shopify, and sends you anything that needs a yes.
          </p>
        </div>

        <div id="demo" className="relative mt-2 sm:mt-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-24 -inset-y-12 -z-10 bg-[radial-gradient(52%_56%_at_50%_50%,rgba(253,222,208,0.85)_0%,rgba(253,236,229,0.45)_46%,transparent_74%)]"
          />
          <div className="mx-auto max-w-[560px] rounded-[2.25rem] bg-white/60 p-2 shadow-[0_30px_80px_-52px_rgba(27,26,25,0.5)] ring-1 ring-[color:var(--m-line)] sm:p-3">
            <HeroMedia />
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
          <MarketingHandoffLink href="/product/order-operations" label="How order changes work" />
          <MarketingHandoffLink href="/product/customer-support" label="How replies use your store’s knowledge" />
        </div>
      </div>
    </section>
  );
}
