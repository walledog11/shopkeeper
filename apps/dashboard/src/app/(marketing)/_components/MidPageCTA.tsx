import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function MidPageCTA() {
  return (
    <section className="relative w-full py-16 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3">
          See it in action — set up in 5 minutes
        </h2>
        <p className="text-base text-slate-500 mb-6 max-w-lg mx-auto">
          Connect your first channel and let Clerk handle the rest. No credit card required.
        </p>
        <Button
          size="lg"
          className="h-12 px-8 text-base font-semibold rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all group"
          asChild
        >
          <Link href="/signup" className="flex items-center gap-2">
            Start free trial
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
