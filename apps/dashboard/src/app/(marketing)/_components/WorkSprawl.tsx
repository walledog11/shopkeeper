"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import Image from "next/image";
import { Search, Loader2 } from "lucide-react";

export function WorkSprawl() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative z-10 w-full py-24 md:py-32 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        
        {/* ── Headline ── */}
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16 md:mb-24"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.1] text-slate-900">
            Customer support shouldn&apos;t be a
            <br className="hidden md:block" />
            <span className="text-slate-400"> full-time job.</span>
          </h2>
          <p className="mt-6 text-lg md:text-xl text-slate-500 leading-relaxed">
            As your e-commerce brand grows, keeping up with customers becomes a nightmare. 
            You&apos;re losing time to the chaos instead of growing your business.
          </p>
        </motion.div>

        {/* ── Three Pain Point Cards ── */}
        <div className="relative max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
            
            {/* Pain Point 1: Scattered Channels */}
            <motion.div
              className="group flex flex-col bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden"
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {/* Eye-catching Graphic Area */}
              <div className="h-56 relative bg-slate-50/50 overflow-hidden border-b border-slate-100/80">
                {/* Glowing background blob */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl" />
                
                {/* Floating Notification Pills */}
                <div className="absolute inset-0 flex items-center justify-center">
                  
                  {/* IG Notification */}
                  <motion.div 
                    animate={{ y: [-5, 5, -5], rotate: [-2, 2, -2] }} 
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="absolute top-4 left-6 bg-white/90 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-slate-200/60 flex items-center gap-3 z-20"
                  >
                    <Image src="/logos/instagram-logo.png" alt="IG" width={20} height={20} className="object-contain" />
                    <div className="flex flex-col gap-1">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full" />
                      <div className="w-10 h-1.5 bg-slate-100 rounded-full" />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                      3
                    </div>
                  </motion.div>

                  {/* SMS Notification */}
                  <motion.div
                    animate={{ y: [5, -5, 5], rotate: [1, -1, 1] }}
                    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-6 right-4 bg-white/90 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-slate-200/60 flex items-center gap-3 z-10"
                  >
                    <Image src="/logos/sms.svg" alt="SMS" width={20} height={20} className="object-contain" />
                    <div className="flex flex-col gap-1">
                      <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                      <div className="w-14 h-1.5 bg-slate-100 rounded-full" />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                      7
                    </div>
                  </motion.div>

                  {/* Email Notification */}
                  <motion.div 
                    animate={{ y: [0, -8, 0], scale: [1, 1.02, 1] }} 
                    transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.5 }}
                    className="absolute top-14 right-8 w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/60 flex items-center justify-center z-0"
                  >
                    <Image src="/logos/gmail.png" alt="Email" width={24} height={24} className="object-contain" />
                    <div className="absolute top-0 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                  </motion.div>

                </div>
              </div>
              
              {/* Text Area */}
              <div className="p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Scattered Channels</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  Messages are slipping through the cracks. Bouncing between Instagram DMs, SMS, Shopify, and email means missed requests and angry customers.
                </p>
              </div>
            </motion.div>

            {/* Pain Point 2: Digging for Context */}
            <motion.div
              className="group flex flex-col bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden"
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Eye-catching Graphic Area */}
              <div className="h-56 relative bg-slate-50/50 overflow-hidden border-b border-slate-100/80 flex items-center justify-center">
                {/* Glowing background blob */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-amber-300/20 rounded-full blur-3xl" />
                
                {/* Mini Dashboard Mockup */}
                <div className="relative w-48 h-32 bg-white rounded-xl shadow-lg border border-slate-200/60 p-3 flex flex-col gap-2 z-10">
                  {/* Search bar skeleton */}
                  <div className="w-full bg-slate-50 rounded-md border border-slate-100 p-1.5 flex items-center gap-2">
                    <Search className="w-3 h-3 text-slate-400" />
                    <div className="w-20 h-1.5 bg-slate-200 rounded-full" />
                  </div>
                  {/* Results skeleton */}
                  <div className="w-full flex-1 border border-slate-100 rounded-md border-dashed flex flex-col items-center justify-center gap-2 bg-slate-50/50">
                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                    <div className="w-16 h-1.5 bg-slate-200 rounded-full" />
                  </div>
                </div>

                {/* Animated Scanner line */}
                <motion.div
                  animate={{ top: ["10%", "80%", "10%"] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute left-1/2 -translate-x-1/2 w-56 h-8 bg-gradient-to-b from-amber-400/0 via-amber-400/20 to-amber-400/0 z-20 pointer-events-none"
                >
                  <div className="w-full h-[1px] bg-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                </motion.div>
              </div>

              {/* Text Area */}
              <div className="p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Digging for Orders</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  Every &quot;Where is my package?&quot; forces you to leave the chat, log into Shopify, hunt down the tracking number, and paste it back.
                </p>
              </div>
            </motion.div>

            {/* Pain Point 3: The Time Sink */}
            <motion.div
              className="group flex flex-col bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden"
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {/* Eye-catching Graphic Area */}
              <div className="h-56 relative bg-slate-50/50 overflow-hidden border-b border-slate-100/80 flex items-center justify-center">
                {/* Glowing background blob */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl" />
                
                {/* Chat Bubble Animations */}
                <div className="relative w-full h-full flex flex-col justify-center items-center gap-3">
                  
                  {/* Customer Bubble */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: [0, 1, 1, 0], y: [10, 0, -10, -20] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", times: [0, 0.2, 0.8, 1] }}
                    className="bg-white px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-md border border-slate-100 flex items-center gap-2 z-10 mr-12"
                  >
                    <div className="w-20 h-2 bg-slate-200 rounded-full" />
                  </motion.div>

                  {/* "You" Typing Bubble */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: [0, 0, 1, 1], y: [10, 10, 0, -10] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", times: [0, 0.3, 0.5, 1] }}
                    className="bg-slate-900 px-4 py-3 rounded-2xl rounded-br-sm shadow-md ml-12 flex items-center justify-center gap-1 z-20"
                  >
                    {/* Animated Typing Dots */}
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} className="w-1.5 h-1.5 bg-white/80 rounded-full" />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }} className="w-1.5 h-1.5 bg-white/80 rounded-full" />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }} className="w-1.5 h-1.5 bg-white/80 rounded-full" />
                  </motion.div>

                </div>

                {/* Overlaid Time Pill */}
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md text-[10px] font-bold text-slate-700 px-3 py-1.5 rounded-full border border-slate-200/60 shadow-lg flex items-center gap-1.5 z-30"
                >
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  2 hrs / day wasted
                </motion.div>
              </div>

              {/* Text Area */}
              <div className="p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Endless Manual Typing</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  You&apos;re wasting hours writing the exact same polite responses and issuing routine refunds instead of focusing on actual business operations.
                </p>
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}