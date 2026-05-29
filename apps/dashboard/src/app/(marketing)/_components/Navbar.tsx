import Link from "next/link";

export function Navbar() {
  return (
    <div className="sticky flex top-3 z-30 justify-center mt-4 mb-2 px-4 pointer-events-none" >
    <nav className="flex items-center gap-8 rounded-full max-w-5xl w-full py-2.5 px-4 bg-stone-100 border border-solid border-stone-900/10 pointer-events-auto shadow-[0_2px_16px_rgba(0,0,0,0.06)]" >
      <div className="flex items-center gap-2 font-semibold text-md tracking-tight" >
        <span className="inline-block size-3 bg-green-400 rounded-full" />
        clerk
      </div>

      <div className="hidden md:flex gap-6 text-sm font-medium text-stone-500">
        <Link href="#demo" className="text-inherit hover:text-stone-400">Live demo</Link>
        <Link href="#channels" className="text-inherit hover:text-stone-400">Channels</Link>
        <Link href="#pricing" className="text-inherit hover:text-stone-400">Pricing</Link>
      </div>

      <div className="ml-auto flex gap-3 items-center">
        <Link href="/login" className="hidden sm:inline-flex items-center py-2 px-4 rounded-full text-sm font-semibold border border-solid border-stone-500 text-stone-900 hover:text-stone-300 hover:border-stone-400 transition-colors" >
          Sign in
        </Link>
        <Link href="/signup" className="inline-flex items-center py-2 px-4 rounded-full text-sm font-semibold bg-stone-900 text-stone-100 border border-solid border-stone-500">
          Start free →
        </Link>
      </div>
    </nav>
    </div>
  );
}
