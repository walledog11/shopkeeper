import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-[100] w-full flex justify-center pt-4 px-4 pointer-events-none">
  
      <nav className="pointer-events-auto w-full max-w-5xl rounded-full border border-slate-200/60 backdrop-blur-xl bg-white/80 shadow-sm px-6 py-3 flex items-center justify-between transition-all">
        
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2 group">
            <Bot className="w-5 h-5 text-slate-800 transition-colors group-hover:text-green-500"/>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
          </Link>
          
          <div className="hidden md:flex gap-8 ml-4">
            <Link href="#features" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">Features</Link>
            <Link href="#how-it-works" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">How it Works</Link>
            <Link href="#pricing" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">Pricing</Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden sm:block text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">Log in</Link>
          <Button className="rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 text-sm font-bold shadow-md px-6 py-2 ring-2 ring-amber-300/60 hover:ring-amber-400/80 transition-all" asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

      </nav>
    </header>
  );
}