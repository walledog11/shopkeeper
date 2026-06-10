import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";

export function Navbar() {
  return (
    <>
      <div className="h-2 bg-[#2b2118]" />
      <header className="sticky top-0 z-30 border-b border-stone-900/10 bg-[#faf6ef]">
        <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center px-6 py-3.5 md:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex items-center gap-2 text-[24px] leading-none tracking-tight text-[#2b2118] no-underline [font-family:var(--m-serif)]">
            <Store className="size-6" strokeWidth={1.8} />
            shopkeeper
          </Link>

          <div className="hidden gap-8 text-[15px] font-medium text-stone-700 md:flex">
            <Link href="#how" className="text-inherit transition-colors hover:text-[#2b2118]">How it works</Link>
            <Link href="#channels" className="text-inherit transition-colors hover:text-[#2b2118]">Channels</Link>
            <Link href="#pricing" className="text-inherit transition-colors hover:text-[#2b2118]">Pricing</Link>
            <Link href="#faq" className="text-inherit transition-colors hover:text-[#2b2118]">FAQ</Link>
          </div>

          <div className="flex items-center justify-end gap-3">
            <AuthNavLinks />
          </div>
        </nav>
      </header>
    </>
  );
}
