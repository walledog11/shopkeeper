import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="border-t border-stone-900/10 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
        <div>
          <div className="text-[22px] leading-none tracking-tight [font-family:var(--m-serif)]">shopkeeper</div>
          <div className="mt-1.5 text-[12px] text-stone-500">The AI employee for Shopify brands.</div>
        </div>
        <div className="flex flex-wrap gap-5 text-[13px] text-stone-600">
          <Link href="/privacy" className="text-inherit transition-colors hover:text-stone-900">Privacy</Link>
          <Link href="/terms" className="text-inherit transition-colors hover:text-stone-900">Terms</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-inherit transition-colors hover:text-stone-900">Contact</a>
        </div>
      </div>
    </footer>
  );
}
