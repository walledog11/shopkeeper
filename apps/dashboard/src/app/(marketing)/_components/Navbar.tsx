import Link from "next/link";
import { AuthNavLinks } from "./AuthNavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-900/5 bg-[#f6f2eb]/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
        <Link href="/" className="text-[26px] leading-none tracking-tight text-stone-900 no-underline [font-family:var(--m-serif)]">
          shopkeeper
        </Link>

        <div className="hidden gap-7 text-sm font-medium text-stone-600 md:flex">
          <Link href="#how" className="text-inherit transition-colors hover:text-stone-900">How it works</Link>
          <Link href="#channels" className="text-inherit transition-colors hover:text-stone-900">Channels</Link>
          <Link href="#pricing" className="text-inherit transition-colors hover:text-stone-900">Pricing</Link>
          <Link href="#faq" className="text-inherit transition-colors hover:text-stone-900">FAQ</Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AuthNavLinks />
        </div>
      </nav>
    </header>
  );
}
