import Link from "next/link";
import { Bot } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 border-t bg-background pt-16 pb-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
          
          {/* Brand & Description */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6 transition-opacity hover:opacity-80">
              <Bot className="size-6 text-yellow-400" />
              <span className="text-xl font-extrabold tracking-tight text-foreground">
                clerk
              </span>
            </Link>
            <p className="text-base text-muted-foreground max-w-xs leading-relaxed">
              The only customer service employee you&apos;ll need. Consolidate channels and automate support with agentic AI.
            </p>
          </div>
          
          {/* Links */}
          <div className="col-span-1">
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#features" className="hover:text-foreground transition-colors">Features</Link></li>
              <li><Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              <li><Link href="/login" className="hover:text-foreground transition-colors">Login</Link></li>
              <li><Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link></li>
            </ul>
          </div>
          
          <div className="col-span-1">
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-foreground transition-colors">About</Link></li>
              <li><Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link></li>
              <li><Link href="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
              <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
            </ul>
          </div>
          
          <div className="col-span-1">
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} clerk. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">Twitter / X</Link>
            <Link href="#" className="hover:text-foreground transition-colors">LinkedIn</Link>
            <Link href="#" className="hover:text-foreground transition-colors">GitHub</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}