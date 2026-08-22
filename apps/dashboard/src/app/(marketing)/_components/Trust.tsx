import Link from "next/link";
import { ArrowRight, KeyRound, ScrollText, ShieldCheck } from "lucide-react";

const facts = [
  {
    icon: KeyRound,
    title: "Protected connections",
    body: "Connected-provider credentials are encrypted before storage.",
  },
  {
    icon: ShieldCheck,
    title: "Scoped access",
    body: "Store and customer access stays tied to the organization workspace.",
  },
  {
    icon: ScrollText,
    title: "Reviewable work",
    body: "Proposals, approvals, Shopify results, and customer replies stay together.",
  },
] as const;

export function Trust() {
  return (
    <section id="security" className="scroll-mt-24 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="rounded-[2rem] border border-stone-900/10 bg-[#fdfbf7]/75 p-6 shadow-[0_30px_70px_-58px_rgba(43,33,24,0.45)] sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-16">
            <div>
              <p className="m-kicker">Your store. Your customers. Your rules.</p>
              <h2 className="m-display mt-5 max-w-[15ch] text-[clamp(2rem,4.5vw,4rem)]">
                Customer messages do not train general-purpose AI models.
              </h2>
            </div>
            <div>
              <p className="text-[16px] leading-[1.7] text-stone-600">
                Shopkeeper uses connected data to provide the support workflows the
                merchant requests. Access and actions are bounded, and the work remains
                reviewable after the conversation moves on.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold">
                <Link href="/product/security" className="inline-flex items-center gap-1.5 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600">
                  Security details <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                <Link href="/privacy" className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 grid border-t border-stone-900/10 md:grid-cols-3 md:divide-x md:divide-stone-900/10">
            {facts.map(({ icon: Icon, title, body }) => (
              <div key={title} className="border-b border-stone-900/10 py-6 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0">
                <Icon className="size-5 text-stone-500" strokeWidth={1.8} aria-hidden />
                <h3 className="mt-4 text-[14px] font-semibold text-stone-800">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-stone-500">{body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t border-stone-900/10 pt-5 text-[12px] leading-relaxed text-stone-500">
            These are product controls, not external certification claims. The example
            workflows on this page use demo data; no customer results are implied.
          </p>
        </div>
      </div>
    </section>
  );
}
