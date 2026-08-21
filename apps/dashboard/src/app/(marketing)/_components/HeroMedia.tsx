import { ArrowRight, Check } from "lucide-react";

function SeededWorkflow() {
  return (
    <div
      role="img"
      aria-label="Seeded order-change workflow: customer requests a size swap, merchant approves, Shopify updates, and the action is logged"
      className="grid size-full place-content-center bg-[#fdfbf7] p-4 text-left sm:p-10"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
        Seeded order-change walkthrough
      </p>
      <div className="mt-3 grid grid-cols-3 items-stretch gap-2 sm:mt-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-3">
        <div className="rounded-xl border border-stone-900/10 bg-white p-2 sm:p-4">
          <p className="text-[10px] text-stone-500 sm:text-xs">Customer</p>
          <p className="mt-1 text-[10px] font-semibold leading-tight text-stone-900 sm:mt-2 sm:text-sm">Swap #3102 from M to S</p>
        </div>
        <ArrowRight className="mx-auto hidden size-4 text-stone-400 sm:block" aria-hidden />
        <div className="rounded-xl border border-stone-900/10 bg-white p-2 sm:p-4">
          <p className="text-[10px] text-stone-500 sm:text-xs">Merchant</p>
          <p className="mt-1 text-[10px] font-semibold leading-tight text-stone-900 sm:mt-2 sm:text-sm">Approves in iMessage</p>
        </div>
        <ArrowRight className="mx-auto hidden size-4 text-stone-400 sm:block" aria-hidden />
        <div className="rounded-xl border border-stone-900/10 bg-white p-2 sm:p-4">
          <p className="flex items-center gap-1 text-[10px] text-[#2f7a4a] sm:gap-1.5 sm:text-xs">
            <Check className="size-3.5" aria-hidden /> Completed
          </p>
          <p className="mt-1 text-[10px] font-semibold leading-tight text-stone-900 sm:mt-2 sm:text-sm">Shopify updated + logged</p>
        </div>
      </div>
    </div>
  );
}

export function HeroMedia() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[880px] overflow-hidden rounded-[28px] border border-stone-900/5 bg-[#fdfbf7] shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)]">
      <SeededWorkflow />
    </div>
  );
}
