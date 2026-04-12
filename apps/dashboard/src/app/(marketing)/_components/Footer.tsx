import Link from "next/link";
import { Bot } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-slate-200 bg-transparent pt-16 pb-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">

          {/* Brand & Description */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6 transition-opacity hover:opacity-80">
              <Bot className="size-6 text-amber-400" />
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                clerk
              </span>
            </Link>
            <p className="text-base text-slate-500 max-w-xs leading-relaxed">
              The only customer service employee you&apos;ll need. Consolidate channels and automate support with agentic AI.
            </p>
          </div>

          {/* Links */}
          <div className="col-span-1">
            <h3 className="font-semibold text-slate-900 mb-4">Product</h3>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><Link href="#features" className="hover:text-slate-900 transition-colors">Features</Link></li>
              <li><Link href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</Link></li>
              <li><Link href="/login" className="hover:text-slate-900 transition-colors">Login</Link></li>
              <li><Link href="/signup" className="hover:text-slate-900 transition-colors">Sign up</Link></li>
            </ul>
          </div>

          <div className="col-span-1">
            <h3 className="font-semibold text-slate-900 mb-4">Legal</h3>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><Link href="/privacy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-slate-900 transition-colors">Terms of Service</Link></li>
              <li><a href="mailto:hello@useclerk.co" className="hover:text-slate-900 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} clerk. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-medium text-slate-500">
            <Link href="#" className="hover:text-slate-900 transition-colors">Twitter / X</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">LinkedIn</Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">GitHub</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}