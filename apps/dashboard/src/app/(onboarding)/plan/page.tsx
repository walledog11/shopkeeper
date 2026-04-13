"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Check, Zap, Shield, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  async function selectTier(tier: typeof tiers[number]) {
    if (tier.enterprise) {
      window.location.href = "mailto:sales@useclerk.com?subject=Enterprise%20Plan%20Inquiry";
      return;
    }
    setLoading(tier.slug);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.slug }),
      });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      router.push(url);
    } catch {
      setLoading(null);
    }
  }

  return (
    <OnboardingShell
      step={3}
      title="Choose your plan."
      subtitle="All plans include a 14-day free trial. No credit card charged until your trial ends."
      headerWidth="max-w-xl"
    >
      {/* Billing toggle */}
      <div className="flex items-center gap-4 bg-white border border-slate-200 p-1.5 rounded-full shadow-sm mb-10">
        <button
          onClick={() => setAnnual(false)}
          className={`text-sm font-bold px-4 py-1.5 rounded-full transition-all ${
            !annual ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={`flex items-center gap-2 text-sm font-bold px-4 py-1.5 rounded-full transition-all ${
            annual ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
          }`}
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
              className={`relative flex flex-col rounded-[2rem] p-8 bg-white transition-all duration-300 ${
                tier.popular
                  ? "border-2 border-green-400 shadow-[0_20px_60px_-15px_rgba(74,222,128,0.25)] md:-translate-y-3 z-10"
                  : "border border-slate-200 shadow-sm hover:shadow-md"
              }`}
            >
              {tier.popular && (
                <div className="absolute inset-0 bg-gradient-to-b from-green-50/50 to-transparent rounded-[2rem] pointer-events-none" />
              )}
              {tier.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-green-400 text-green-950 text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Most Popular
                  </span>
                </div>
              )}

              <div className="mb-5 relative z-10">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 border ${
                  tier.popular ? "bg-white border-green-200 shadow-sm" : "bg-slate-50 border-slate-200"
                }`}>
                  <TierIcon className={`w-5 h-5 ${tier.popular ? "text-green-500" : "text-slate-600"}`} />
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-slate-900 mb-1.5">{tier.name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{tier.description}</p>
              </div>

              <div className="mb-6 relative z-10">
                {tier.enterprise ? (
                  <p className="text-4xl font-extrabold tracking-tighter text-slate-900">Custom</p>
                ) : (
                  <div className="flex items-end gap-1.5">
                    <span className="text-4xl font-extrabold tracking-tighter text-slate-900">${price}</span>
                    <span className="text-sm font-semibold text-slate-500 mb-1">/mo</span>
                  </div>
                )}
                {annual && !tier.enterprise && (
                  <p className="text-xs text-slate-400 mt-1">Billed annually · ${price * 12}/yr</p>
                )}
              </div>

              <Button
                onClick={() => selectTier(tier)}
                disabled={isDisabled || isLoading}
                className={`w-full rounded-full h-11 text-sm font-bold mb-6 group relative z-10 transition-all ${
                  tier.popular
                    ? "bg-green-400 text-green-950 hover:bg-green-500 shadow-md disabled:opacity-60"
                    : "bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60"
                }`}
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

              <div className="h-px w-full mb-5 bg-slate-100 relative z-10" />

              <div className="relative z-10">
                <p className="text-[10px] font-extrabold tracking-widest uppercase mb-3.5 text-slate-400">
                  {tier.featuresLabel}
                </p>
                <ul className="space-y-3">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className={`mt-0.5 shrink-0 ${f.ai ? "text-green-500" : "text-slate-400"}`}>
                        {f.ai
                          ? <Zap className="w-3.5 h-3.5 fill-green-500/20" />
                          : <Check className="w-3.5 h-3.5" />
                        }
                      </div>
                      <span className="font-medium text-slate-700">{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/dashboard"
        className="mt-10 text-sm text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-4"
      >
        Skip for now — explore the dashboard
      </Link>
    </OnboardingShell>
  );
}
