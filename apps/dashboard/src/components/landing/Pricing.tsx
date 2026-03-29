"use client";

import { useState } from "react";
import { Check, Zap, Bot, Shield, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { motion } from "motion/react";

const tiers = [
  {
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
    cta: "Start Free Trial",
    popular: false,
  },
  {
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
    cta: "Deploy Agent",
    popular: true,
  },
  {
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
    cta: "Contact Sales",
    popular: false,
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="relative w-full py-24 bg-slate-50/50 overflow-hidden">
      <div className="container relative z-10 mx-auto px-4 md:px-6">
        
        {/* Header Section */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-yellow-500" /> Select Your Agent
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Pricing that scales with your efficiency.
          </h2>
          
          {/* Custom Toggle */}
          <div className="flex items-center justify-center gap-4 mt-2 bg-white border border-slate-200 p-2 rounded-full shadow-sm">
            <span className={`text-sm font-bold px-3 transition-colors ${!annual ? "text-slate-900" : "text-slate-400"}`}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className="relative inline-flex h-8 w-14 items-center rounded-full bg-slate-100 transition-colors shadow-inner border border-slate-200/50"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${
                  annual ? "translate-x-7 border border-yellow-400" : "translate-x-1 border border-slate-200"
                }`}
              >
                {annual && <div className="absolute inset-0 bg-yellow-400 rounded-full opacity-20" />}
              </span>
            </button>
            <div className="flex items-center gap-1.5 px-3">
              <span className={`text-sm font-bold transition-colors ${annual ? "text-slate-900" : "text-slate-400"}`}>
                Annually
              </span>
              <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide border border-yellow-200">
                Save 20%
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto items-center">
          {tiers.map((tier, index) => {
            const price = annual ? tier.priceAnnually : tier.priceMonthly;

            return (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className={`relative flex flex-col rounded-[2rem] p-8 transition-all duration-300 bg-white ${
                  tier.popular
                    ? "border-2 border-yellow-400 shadow-[0_20px_60px_-15px_rgba(250,204,21,0.25)] lg:-translate-y-4 z-10"
                    : "border border-slate-200 shadow-sm hover:shadow-md"
                }`}
              >
                {/* Popular Glow Background inside card */}
                {tier.popular && (
                  <div className="absolute inset-0 bg-gradient-to-b from-yellow-50/50 to-transparent rounded-[2rem] pointer-events-none" />
                )}

                {/* Popular Badge */}
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-yellow-400 text-yellow-950 text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Most Popular
                    </span>
                  </div>
                )}

                {/* Tier Header */}
                <div className="mb-6 relative z-10">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border ${
                    tier.popular ? 'bg-white border-yellow-200 shadow-sm' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <tier.icon className={`w-6 h-6 ${tier.popular ? 'text-yellow-500' : 'text-slate-600'}`} />
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-2">
                    {tier.name}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500 h-10">
                    {tier.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-8 flex items-end gap-1.5 relative z-10">
                  <span className="text-5xl font-extrabold tracking-tighter text-slate-900">
                    ${price}
                  </span>
                  <span className="text-sm font-semibold mb-1.5 text-slate-500">/mo</span>
                </div>

                {/* CTA Button */}
                <Button
                  className={`w-full rounded-full h-12 text-sm font-bold transition-all mb-8 group relative z-10 ${
                    tier.popular
                      ? "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 shadow-md"
                      : "bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                  asChild
                >
                  <a href="#" className="flex items-center justify-center gap-2">
                    {tier.cta} 
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>

                <div className="h-px w-full mb-6 bg-slate-100 relative z-10" />

                {/* Features */}
                <div className="relative z-10">
                  <p className="text-[10px] font-extrabold tracking-widest uppercase mb-4 text-slate-400">
                    {tier.featuresLabel}
                  </p>
                  <ul className="space-y-4 flex-1">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <div className={`mt-0.5 shrink-0 ${f.ai ? 'text-yellow-500' : 'text-slate-400'}`}>
                          {f.ai ? <Zap className="w-4 h-4 fill-yellow-500/20" /> : <Check className="w-4 h-4" />}
                        </div>
                        <span className="font-medium text-slate-700">
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}