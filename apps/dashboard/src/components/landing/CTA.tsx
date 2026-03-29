import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";

export function CTA() {
  return (
    <section className="relative w-full py-24 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] border bg-background px-6 py-20 text-center shadow-sm flex flex-col items-center justify-center">
          
          {/* Subtle background texture */}
          <DotPattern
            className={cn(
              "[mask-image:radial-gradient(600px_circle_at_center,white,transparent)]",
              "opacity-50"
            )}
          />

          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-6 max-w-2xl leading-[1.1]">
              Ready to give your customers faster answers?
            </h2>
            
            <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-lg sm:text-xl">
              Join Clerk today. Consolidate your support channels and let agentic AI handle the repetitive tasks.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Button 
                size="lg" 
                className="text-lg h-14 px-10 rounded-full w-full sm:w-auto transition-transform hover:scale-105 active:scale-95" 
                asChild
              >
                <Link href="/signup">Get started free</Link>
              </Button>
              
              <span className="-rotate-3 hover:rotate-3 transition duration-300 ease-in-out hidden sm:block">
                <Image 
                  src="/images/no-credit-card-required.png" 
                  alt="No credit card required" 
                  width={140} 
                  height={140} 
                  className="select-none pointer-events-none"
                />
              </span>
            </div>

            {/* Mobile-only graphic display */}
            <div className="mt-8 sm:hidden flex justify-center">
               <span className="-rotate-3">
                <Image 
                  src="/images/no-credit-card-required.png" 
                  alt="No credit card required" 
                  width={120} 
                  height={120} 
                  className="select-none pointer-events-none"
                />
              </span>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}