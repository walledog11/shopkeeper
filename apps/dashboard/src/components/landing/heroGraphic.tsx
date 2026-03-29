"use client";

import { useRef } from "react";
import { Bot, CheckCircle2, RefreshCw } from "lucide-react";
import Image from "next/image";
import { motion, useInView } from "motion/react";

const SIDEBAR_CHANNELS = [
  { icon: "/logos/instagram-logo.png", name: "Instagram", badge: 1, active: true },
  { icon: "/logos/shopify-inbox.png",  name: "Shopify",   badge: 2 },
  { icon: "/logos/gmail.png",          name: "Email",     badge: 0 },
  { icon: "/logos/sms.svg",            name: "SMS",       badge: 4 },
];

const THREADS = [
  {
    logo: "/logos/instagram-logo.png",
    customer: "sarah_styles",
    subject: "Order size change",
    preview: "Hi! I ordered the wrong size…",
    time: "Just now",
    active: true,
    awaiting: true,
  },
  {
    logo: "/logos/gmail.png",
    customer: "david@example.com",
    subject: "Refund request #3012",
    preview: "I'd like to request a refund…",
    time: "3m",
    active: false,
    awaiting: true,
  },
  {
    logo: "/logos/sms.svg",
    customer: "+1 (555) 234-5678",
    subject: "Address change",
    preview: "Can I update my shipping…",
    time: "7m",
    active: false,
    awaiting: false,
  },
];

export default function HeroGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "200px" });

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-2xl mx-auto aspect-[3/4] sm:aspect-square md:aspect-[4/3] lg:aspect-[5/4] xl:aspect-square flex items-center justify-center p-2 sm:p-4"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-gradient-to-tr from-yellow-300/20 via-yellow-400/8 to-transparent blur-[80px] rounded-full z-0" />

      {/* Dashboard frame */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 w-full h-[92%] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex"
      >
        {/* ── Sidebar ── */}
        <div className="w-12 sm:w-16 bg-[#1e3f3b] flex flex-col items-center py-3 gap-3 shrink-0">
          {/* Logo */}
          <div className="flex items-center justify-center w-full mb-1">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
          </div>

          {SIDEBAR_CHANNELS.map((ch) => (
            <div
              key={ch.name}
              className={`relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-md transition-all ${
                ch.active
                  ? "bg-white/15 ring-1 ring-white/20"
                  : "opacity-50 hover:opacity-80"
              }`}
            >
              <Image
                src={ch.icon}
                width={18}
                height={18}
                alt={ch.name}
                className="object-contain"
              />
              {ch.badge > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-yellow-400 flex items-center justify-center text-[7px] font-bold text-slate-900 ring-1 ring-[#1e3f3b]">
                  {ch.badge}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Thread list column ── */}
        <div className="w-[38%] border-r border-slate-100 flex flex-col shrink-0 bg-white">
          {/* Column header */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2 shrink-0">
            <div className="flex bg-slate-100 rounded-md p-0.5 gap-0.5">
              <div className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-white shadow-sm">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-900">Open</span>
                <span className="text-[8px] sm:text-[9px] font-bold px-1 rounded-full bg-slate-900 text-white">3</span>
              </div>
              <div className="flex-1 flex items-center justify-center py-1 rounded">
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">Closed</span>
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium px-0.5">3 tickets</p>
          </div>

          {/* Threads */}
          <div className="flex-1 overflow-hidden divide-y divide-slate-50">
            {THREADS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                className={`relative px-3 py-2.5 ${t.active ? "bg-slate-50" : ""}`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
                  t.active ? "bg-amber-400" : t.awaiting ? "bg-amber-200" : "bg-transparent"
                }`} />

                <div className="flex items-center justify-between mb-1 gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-3 h-3 relative shrink-0">
                      <Image src={t.logo} fill alt="" className="object-contain" />
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-900 truncate">{t.customer}</span>
                    {t.awaiting && <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />}
                  </div>
                  <span className="text-[8px] sm:text-[9px] text-slate-400 shrink-0">{t.time}</span>
                </div>

                <p className="text-[9px] sm:text-[10px] font-medium text-slate-700 truncate mb-0.5">{t.subject}</p>
                <p className="text-[8px] sm:text-[9px] text-slate-400 truncate">{t.preview}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Conversation view ── */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          {/* Conversation header */}
          <div className="h-10 sm:h-12 border-b border-slate-100 flex items-center justify-between px-3 sm:px-4 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-900 leading-tight truncate">sarah_styles</p>
              <p className="text-[8px] sm:text-[10px] text-slate-400">via Instagram</p>
            </div>
            <button className="bg-slate-900 text-white text-[9px] sm:text-[10px] font-semibold flex items-center gap-1 h-6 sm:h-7 px-2 sm:px-2.5 rounded-md shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">Resolve</span>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-hidden p-2.5 sm:p-4 space-y-2.5 sm:space-y-3 bg-slate-50/40">
            {/* Customer message */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-col gap-1 items-start"
            >
              <div className="px-2.5 sm:px-3 py-2 sm:py-2.5 text-[9px] sm:text-[11px] leading-relaxed bg-white border border-slate-200 text-slate-800 rounded-md rounded-tl-sm shadow-sm max-w-[90%]">
                Hi! I ordered the wrong size, can I switch to a Medium?
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 mx-0.5">2m ago</span>
            </motion.div>

            {/* Agent reply */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="flex flex-col gap-1 items-end"
            >
              <div className="px-2.5 sm:px-3 py-2 sm:py-2.5 text-[9px] sm:text-[11px] leading-relaxed bg-slate-900 text-white rounded-md rounded-tr-sm shadow-sm max-w-[90%] relative overflow-hidden">
                <motion.div
                  animate={isInView ? { x: ["-100%", "200%"] } : { x: "-100%" }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 1.5 }}
                  className="absolute top-0 left-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"
                />
                Of course! I&apos;ve updated your order to size Medium. You&apos;ll get a confirmation email shortly.
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 mx-0.5">Just now</span>
            </motion.div>

            {/* Resolved badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 2.0, duration: 0.4, type: "spring" }}
              className="flex justify-center"
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[8px] sm:text-[10px] font-semibold text-green-700">
                <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                Resolved automatically
              </div>
            </motion.div>
          </div>

          {/* Clerk Context strip */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="border-t border-slate-100 bg-white px-3 sm:px-4 py-2 sm:py-2.5 shrink-0"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[8px] sm:text-[9px] font-bold text-yellow-600 uppercase tracking-widest">Clerk Context</p>
              <RefreshCw className="w-2.5 h-2.5 text-slate-300" />
            </div>
            <p className="text-[8px] sm:text-[10px] text-slate-500 leading-relaxed line-clamp-2">
              Customer wants to exchange order #2849 (size S → M). Item not yet shipped. First contact.
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Floating badge — new tickets */}
      <motion.div
        animate={isInView ? { y: [-4, 4, -4] } : { y: 0 }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-3 right-2 sm:-top-4 sm:right-0 bg-white border border-slate-200 shadow-lg rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 z-20"
      >
        <div className="relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-400" />
        </div>
        <span className="text-[10px] sm:text-xs font-semibold text-slate-700">4 new tickets</span>
      </motion.div>

      {/* Floating badge — reply sent */}
      <motion.div
        animate={isInView ? { y: [4, -4, 4] } : { y: 0 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        className="absolute -bottom-3 left-2 sm:-bottom-4 sm:left-0 bg-white border border-green-200 shadow-lg rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 z-20"
      >
        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500 shrink-0" />
        <span className="text-[10px] sm:text-xs font-semibold text-slate-700">Reply sent via Instagram</span>
      </motion.div>
    </div>
  );
}
