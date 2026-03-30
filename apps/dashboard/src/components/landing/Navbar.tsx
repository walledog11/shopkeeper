import Link from "next/link";
import { Button } from "../ui/button";
import { Bot } from "lucide-react";

export function Navbar() {
  return (
    // Changed "sticky" to "fixed top-0 inset-x-0" and elevated to "z-[100]"
    <header className="fixed top-0 inset-x-0 z-[100] w-full flex justify-center pt-4 px-4 pointer-events-none">
  
      <nav className="pointer-events-auto w-full max-w-5xl rounded-full border border-slate-200/60 backdrop-blur-xl bg-white/80 shadow-sm px-6 py-3 flex items-center justify-between transition-all">
        
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2 group">
            <Bot className="w-5 h-5 text-slate-800 transition-colors group-hover:text-yellow-500"/>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
          </Link>
          
          <div className="hidden md:flex gap-8 ml-4">
            <Link href="#features" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">Features</Link>
            <Link href="#how-it-works" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">How it Works</Link>
            <Link href="#pricing" className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">Pricing</Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" className="hidden sm:inline-flex rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button className="rounded-full bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold shadow-sm px-5" asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

      </nav>
    </header>
  );
}