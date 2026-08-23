import type { ReactNode } from "react";

/** Shared brochure masthead: a hand-drawn thread dropping into a flanked
 *  hand-lettered kicker. Every marketing section opens with one, so the page
 *  reads as bound spreads — the repeated centered thread is the through-line. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col items-center">
      <svg aria-hidden width="10" height="48" viewBox="0 0 10 48" fill="none" className="mb-4 text-stone-400/55">
        <path
          d="M5 0 C 7.6 11, 2.4 20, 5 29 C 6.9 35, 3.2 41, 5 48"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-center gap-3 text-[19px] leading-none text-stone-600 [font-family:var(--m-hand)]">
        <span aria-hidden className="h-px w-9 bg-stone-400/55" />
        {children}
        <span aria-hidden className="h-px w-9 bg-stone-400/55" />
      </div>
    </div>
  );
}
