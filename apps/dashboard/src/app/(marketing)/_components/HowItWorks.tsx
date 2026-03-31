"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useInView } from "motion/react";
import { Bot, BrainCircuit, Inbox, Send, Tag, Sparkles } from "lucide-react";

/* ── Card 1: Connect Your Channels ── */
function ConnectCard() {
  const platforms = [
    { src: "/logos/instagram-logo.png", alt: "Instagram", label: "Instagram" },
    { src: "/logos/sms.svg", alt: "SMS", label: "SMS" },
    { src: "/logos/shopify-inbox.png", alt: "Shopify", label: "Shopify" },
    { src: "/logos/gmail.png", alt: "Gmail", label: "Gmail" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm h-full flex flex-col overflow-hidden group">
      {/* Icon grid area */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/50">
        <div className="grid grid-cols-2 gap-4 relative">
          {platforms.map((p, i) => (
            <motion.div
              key={p.alt}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4, type: "spring" }}
              className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:shadow-md transition-all duration-300"
            >
              <Image src={p.src} alt={p.alt} width={32} height={32} className="object-contain" />
            </motion.div>
          ))}
          
          {/* Center Connector Hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center shadow-lg border-2 border-white z-10">
            <Inbox className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Connected preview list */}
      <div className="border-t border-slate-100 bg-white px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Live Channels</span>
          <span className="flex h-2 w-2 relative">
            {/* CSS animations (like ping) are hardware accelerated and don't cause JS lag, so they are safe to leave running */}
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        </div>
        <div className="space-y-2.5">
          {platforms.slice(0, 3).map((p, i) => (
            <motion.div
              key={p.alt}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <Image src={p.src} alt={p.alt} width={20} height={20} className="rounded-md" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-700">{p.label}</span>
              </div>
              <span className="text-[10px] font-medium text-slate-400">Syncing</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Card 2: AI Processes Messages ── */
function AICard() {
  // 1. Set up the ref and useInView hook to monitor visibility
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { margin: "100px" });

  return (
    <div ref={cardRef} className="rounded-xl border border-slate-200 bg-white shadow-sm h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50/50 relative overflow-hidden">
        
        {/* Mock Incoming Message */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm w-full max-w-[260px] relative overflow-hidden z-10"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center text-[9px] font-bold text-pink-600">IG</div>
            <div className="h-2 w-24 bg-slate-100 rounded-full" />
          </div>
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            Hi! Can I update the shipping address for my order #MX8922? I just moved.
          </p>

          {/* 2. Conditionally pause the infinite scanning beam if off-screen */}
          <motion.div
            className="absolute left-0 right-0 h-1 bg-yellow-400/80 shadow-[0_0_15px_rgba(250,204,21,0.6)] z-20"
            animate={isInView ? { top: ["0%", "100%", "0%"] } : { top: "0%" }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>

        {/* Extracted Data Tags */}
        <div className="mt-6 flex flex-col gap-2.5 w-full max-w-[260px]">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[11px] font-bold text-slate-600">Intent</span>
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Address Change</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[11px] font-bold text-slate-600">Entity</span>
            </div>
            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">Order #MX8922</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ── Card 3: Respond & Resolve ── */
function RunCard() {
  const workflowSteps = [
    { icon: Inbox, label: "Ticket Created", sub: "Aggregated in Inbox", iconBg: "bg-slate-100", iconColor: "text-slate-600" },
    { icon: BrainCircuit, label: "AI Decision Engine", sub: "Drafts response & updates CRM", iconBg: "bg-yellow-400", iconColor: "text-white", active: true },
    { icon: Send, label: "Resolution Sent", sub: "Dispatched to Instagram", iconBg: "bg-green-100", iconColor: "text-green-600" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 relative">
        <div className="w-full max-w-[240px] relative">
          
          {/* Connecting Line background */}
          <div className="absolute left-[1.125rem] top-4 bottom-4 w-px bg-slate-200" />

          <div className="space-y-6 relative z-10">
            {workflowSteps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: 15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2, duration: 0.4 }}
                className="flex items-start gap-4"
              >
                <div className={`w-9 h-9 rounded-full ${step.iconBg} flex items-center justify-center shrink-0 shadow-sm border border-white ring-4 ring-slate-50/50`}>
                  <step.icon className={`w-4 h-4 ${step.iconColor}`} />
                </div>
                <div className={`bg-white border ${step.active ? 'border-yellow-300 shadow-md' : 'border-slate-200 shadow-sm'} rounded-xl p-3 flex-1`}>
                  <div className="text-xs font-bold text-slate-800 mb-0.5">{step.label}</div>
                  <div className="text-[10px] text-slate-500">{step.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 w-full py-20">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            From incoming message to automated resolution in seconds.
          </p>
        </div>

        {/* Three cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          
          {/* Card 1 */}
          <div className="flex flex-col">
            <div className="flex-1 min-h-[380px]">
              <ConnectCard />
            </div>
            <div className="mt-6 px-2">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <h3 className="text-lg font-bold text-foreground">Connect Channels</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10 leading-relaxed">
                Link your Instagram, SMS, Shopify, and email in seconds. All messages route to one hub.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="flex flex-col">
            <div className="flex-1 min-h-[380px]">
              <AICard />
            </div>
            <div className="mt-6 px-2">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <h3 className="text-lg font-bold text-foreground">AI Extracts Context</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10 leading-relaxed">
                Incoming messages are instantly parsed. The AI extracts intent, urgency, and specific order details automatically.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="flex flex-col">
            <div className="flex-1 min-h-[380px]">
              <RunCard />
            </div>
            <div className="mt-6 px-2">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <h3 className="text-lg font-bold text-foreground">Respond &amp; Resolve</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-10 leading-relaxed">
                The AI agent drafts the perfect reply and pushes it back out through the original channel to resolve the ticket.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}