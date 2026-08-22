import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, PackageCheck } from "lucide-react";

const requests = [
  "Where is my order?",
  "Can you change my shipping address?",
  "Can you swap this for a small?",
  "Can you cancel it before it ships?",
  "I need to return this.",
  "What is your return policy?",
] as const;

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-24 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="max-w-3xl">
          <p className="m-kicker">What you can hand over</p>
          <h2 className="m-display mt-5 max-w-[16ch] text-[clamp(2.1rem,4.6vw,4.15rem)]">
            The questions that keep repeating. And the work behind them.
          </h2>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-relaxed text-stone-600">
            Shopkeeper answers from the real store and can prepare or complete supported
            Shopify work when the order is eligible and your settings allow it.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-stretch lg:gap-12">
          <div>
            <ul className="flex snap-x snap-mandatory list-none gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:block md:overflow-visible md:pb-0">
              {requests.map((request, index) => (
                <li
                  key={request}
                  className="min-w-[82%] snap-start border-y border-stone-900/10 px-1 py-5 first:border-t md:min-w-0 md:border-b md:border-t-0 md:first:border-t"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="text-[11px] font-semibold tabular-nums text-stone-400">0{index + 1}</span>
                    <span className="text-[clamp(1.1rem,2.1vw,1.45rem)] font-medium tracking-[-0.025em] text-stone-800">
                      “{request}”
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[12px] text-stone-500 md:hidden">Swipe to see more requests →</p>
          </div>

          <figure className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-[#fdfbf7] shadow-[0_30px_70px_-52px_rgba(43,33,24,0.5)]">
            <figcaption className="flex items-center justify-between gap-4 border-b border-stone-900/10 px-5 py-4 sm:px-7">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">Example order · Demo data</p>
                <p className="mt-1 text-[15px] font-semibold text-stone-800">Order #3102 · Linen Jumpsuit</p>
              </div>
              <Image src="/logos/shopify.svg" alt="Shopify" width={26} height={30} className="h-[30px] w-auto" />
            </figcaption>

            <div className="grid sm:grid-cols-[0.92fr_1.08fr]">
              <div className="border-b border-stone-900/10 p-5 sm:border-r sm:border-b-0 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">Shopkeeper checked</p>
                <dl className="mt-5 space-y-4">
                  <Fact term="Fulfillment" detail="Unfulfilled" />
                  <Fact term="Requested size" detail="Small / Sand" />
                  <Fact term="Inventory" detail="12 available" />
                  <Fact term="Price difference" detail="$0.00" />
                </dl>
              </div>
              <div className="bg-[#2b2118] p-5 text-[#f6f2eb] sm:p-7">
                <span className="grid size-10 place-items-center rounded-full bg-emerald-200/10 text-emerald-100">
                  <PackageCheck className="size-5" aria-hidden />
                </span>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f6f2eb]/40">Prepared result</p>
                <h3 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.03em]">Swap Medium → Small</h3>
                <ul className="mt-5 list-none space-y-3 p-0 text-[12px] leading-relaxed text-[#f6f2eb]/60">
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" aria-hidden />Order change is ready for approval</li>
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" aria-hidden />Customer reply is prepared</li>
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" aria-hidden />Decision and outcome stay in history</li>
                </ul>
              </div>
            </div>
          </figure>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-stone-900/10 pt-6 sm:flex-row sm:items-center">
          <p className="max-w-[64ch] text-[13px] leading-relaxed text-stone-500">
            Supported work also includes eligible exact full refunds, exchanges,
            gift cards, return labels, customer updates, notes, and fulfillment with tracking.
          </p>
          <Link
            href="/product/order-operations"
            className="inline-flex shrink-0 items-center gap-2 text-[13px] font-semibold text-stone-800 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600"
          >
            See order operations <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-900/8 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[12px] text-stone-500">{term}</dt>
      <dd className="text-right text-[12px] font-semibold text-stone-800">{detail}</dd>
    </div>
  );
}
