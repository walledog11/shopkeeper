import Link from "next/link";
import Image from "next/image";
import { AuthNavLinks } from "./AuthNavLinks";

export function Navbar() {
  return (
    <div className="sticky flex top-3 z-30 justify-center mt-4 mb-2 px-4 pointer-events-none" >
    <nav className="flex items-center gap-8 rounded-full max-w-5xl w-full py-2.5 px-4 bg-stone-100 border border-solid border-stone-900/10 pointer-events-auto shadow-[0_2px_16px_rgba(0,0,0,0.06)]" >
      <div className="flex items-center gap-2 font-semibold text-md tracking-tight" >
        <Image src="/logos/shopkeeper-underline-logo.png" alt="Shopkeeper logo" height={32} width={120} className="invert" />
      </div>

      <div className="hidden md:flex gap-6 text-sm font-medium text-stone-500">
        <Link href="#demo" className="text-inherit hover:text-stone-400">Live demo</Link>
        <Link href="#channels" className="text-inherit hover:text-stone-400">Channels</Link>
        <Link href="#pricing" className="text-inherit hover:text-stone-400">Pricing</Link>
      </div>

      <div className="ml-auto flex gap-3 items-center">
        <AuthNavLinks />
      </div>
    </nav>
    </div>
  );
}
