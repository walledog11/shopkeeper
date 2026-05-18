"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Zap, Shield, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import OnboardingShell from "../_components/OnboardingShell";

const tiers = [
  {
    slug: "starter",
    name: "Starter",
    icon: Bot,
    priceMonthly: 19,
    priceAnnually: 14,
    description: "Everything you need to centralize support across your channels.",
    featuresLabel: "WHAT YOU GET",
    features: [
      { text: "Unified inbox (Instagram, Email)", ai: false },
      { text: "AI ticket summaries", ai: true },
      { text: "AI draft replies", ai: true },
      { text: "Analytics dashboard", ai: false },
    ],
    cta: "Start free trial",
    popular: false,
    enterprise: false,
  },
  {
    slug: "pro",
    name: "Professional",
    icon: Zap,
    priceMonthly: 49,
    priceAnnually: 39,
    description: "Full agentic capabilities to automate omnichannel support end-to-end.",
    featuresLabel: "EVERYTHING IN STARTER, PLUS",
    features: [
      { text: "All channels (+ SMS, Shopify)", ai: false },
      { text: "AI agent — delegate tasks by instruction", ai: true },
      { text: "Shopify order context in every ticket", ai: true },
      { text: "Team members & role permissions", ai: false },
      { text: "Activity history & audit log", ai: false },
    ],
    cta: "Start free trial",
    popular: true,
    enterprise: false,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    icon: Shield,
    priceMonthly: 129,
    priceAnnually: 99,
    description: "Dedicated infrastructure and hands-on support for high-volume brands.",
    featuresLabel: "EVERYTHING IN PRO, PLUS",
    features: [
      { text: "Custom AI instructions & brand voice", ai: true },
      { text: "Priority support & onboarding", ai: false },
      { text: "Custom roles & permissions", ai: false },
      { text: "SLA guarantees", ai: false },
      { text: "Dedicated success manager", ai: false },
    ],
    cta: "Contact sales",
    popular: false,
    enterprise: true,
  },
];

export default function PlanPage() {
  const router = useRouter();
  const [annual,  setAnnual]  = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function selectTier(tier: typeof tiers[number]) {
    if (tier.enterprise) {
      window.location.href = "mailto:sales@useclerk.com?subject=Enterprise%20Plan%20Inquiry";
      return;
    }
    setLoading(tier.slug);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.slug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Could not start checkout. Please try again.");
      }
      const { url } = await res.json();
      router.push(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
      setLoading(null);
    }
  }

  return (
    <OnboardingShell
      step={2}
      title="Choose your plan."
      subtitle="All plans include a 14-day free trial. No credit card charged until your trial ends."
      headerWidth="max-w-xl"
    >
      {/* Billing toggle */}
      <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-1.5 rounded-full mb-10">
        <button
          onClick={() => setAnnual(false)}
          className={cn(
            "text-sm font-bold px-4 py-1.5 rounded-full transition-all",
            !annual ? "bg-white text-slate-900 shadow-sm" : "text-white/50 hover:text-white/80"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={cn(
            "flex items-center gap-2 text-sm font-bold px-4 py-1.5 rounded-full transition-all",
            annual ? "bg-white text-slate-900 shadow-sm" : "text-white/50 hover:text-white/80"
          )}
        >
          Annually
          <span className="bg-green-400 text-green-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Save 20%
          </span>
        </button>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl items-center">
        {tiers.map((tier) => {
          const price      = annual ? tier.priceAnnually : tier.priceMonthly;
          const isLoading  = loading === tier.slug;
          const isDisabled = loading !== null && !isLoading;
          const TierIcon   = tier.icon;

          return (
            <div
              key={tier.slug}
              className={cn(
                "relative flex flex-col rounded-[2rem] p-8 transition-all duration-300",
                tier.popular
                  ? "border border-green-400/40 bg-gradient-to-b from-green-400/[0.08] to-white/[0.02] shadow-[0_20px_60px_-20px_rgba(74,222,128,0.35)] ring-1 ring-green-400/30 md:-translate-y-3 z-10"
                  : "border border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-green-400 text-green-950 text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Most Popular
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center mb-4 border",
                  tier.popular ? "bg-green-400/10 border-green-400/30" : "bg-white/[0.04] border-white/10"
                )}>
                  <TierIcon className={cn("w-5 h-5", tier.popular ? "text-green-300" : "text-white/70")} />
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-white mb-1.5">{tier.name}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{tier.description}</p>
              </div>

              <div className="mb-6">
                {tier.enterprise ? (
                  <p className="text-4xl font-extrabold tracking-tighter text-white">Custom</p>
                ) : (
                  <div className="flex items-end gap-1.5">
                    <span className="text-4xl font-extrabold tracking-tighter text-white">${price}</span>
                    <span className="text-sm font-semibold text-white/50 mb-1">/mo</span>
                  </div>
                )}
                {annual && !tier.enterprise && (
                  <p className="text-xs text-white/40 mt-1">Billed annually · ${price * 12}/yr</p>
                )}
              </div>

              <Button
                onClick={() => selectTier(tier)}
                disabled={isDisabled || isLoading}
                className={cn(
                  "w-full rounded-full h-11 text-sm font-bold mb-6 group transition-all",
                  tier.popular
                    ? "bg-green-400 text-green-950 hover:bg-green-300 disabled:opacity-60"
                    : "bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.10] disabled:opacity-60"
                )}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Redirecting…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {tier.cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>

              <div className="h-px w-full mb-5 bg-white/10" />

              <div>
                <p className="text-[10px] font-extrabold tracking-widest uppercase mb-3.5 text-white/40">
                  {tier.featuresLabel}
                </p>
                <ul className="space-y-3">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className={cn("mt-0.5 shrink-0", f.ai ? "text-green-400" : "text-white/40")}>
                        {f.ai
                          ? <Zap className="w-3.5 h-3.5 fill-green-400/20" />
                          : <Check className="w-3.5 h-3.5" />
                        }
                      </div>
                      <span className="font-medium text-white/80">{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-8 text-sm font-medium text-red-400">{error}</p>
      )}
    </OnboardingShell>
  );
}
