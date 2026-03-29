"use client";

import { useRef } from "react";
import { Bot, Sparkles, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { motion, useInView } from "motion/react";

export default function HeroGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "200px" });

  return (
    // Adjusted mobile aspect ratio to 3/4 to eliminate the massive top/bottom whitespace
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto aspect-[3/4] sm:aspect-square md:aspect-[4/3] lg:aspect-[5/4] xl:aspect-square flex items-center justify-center p-2 sm:p-4 perspective-1000">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-gradient-to-tr from-yellow-300/30 via-yellow-400/10 to-transparent blur-[80px] rounded-full z-0" />

      <motion.div
        initial={{ opacity: 0, rotateX: 10, y: 30 }}
        whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        // Added h-[95%] for mobile to maximize the inner usable space
        className="relative z-10 w-full h-[95%] sm:h-[92%] lg:h-[88%] xl:h-[85%] rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200/80 bg-white/60 backdrop-blur-2xl shadow-2xl overflow-hidden flex"
      >
        <div className="w-14 sm:w-20 border-r border-slate-200/60 bg-slate-50/40 p-2 flex flex-col items-center gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-1 sm:mb-2 w-full mt-2">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-slate-300" />
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-slate-300" />
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-slate-300" />
          </div>
          
          {[
            { icon: "/logos/instagram-logo.png", name: "Instagram", badge: 1, active: true },
            { icon: "/logos/shopify-inbox.png", name: "Shopify", badge: 2 },
            { icon: "/logos/sms.svg", name: "SMS", badge: 4 },
            { icon: "/logos/gmail.png", name: "Email", badge: 0 },
          ].map((ch) => (
            <div key={ch.name} className={`relative flex items-center justify-center p-1.5 sm:p-2 rounded-xl transition-all w-full max-w-[48px] sm:max-w-[56px] ${ch.active ? 'bg-white shadow-sm border border-slate-200' : 'opacity-60 grayscale-[50%]'}`}>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-slate-100 p-1 flex items-center justify-center shrink-0">
                <Image src={ch.icon} width={20} height={20} alt={ch.name} className="object-contain" />
              </div>
              
              {ch.badge > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[7px] sm:text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                  {ch.badge}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 p-3 sm:p-5 flex flex-col relative overflow-hidden bg-white/40">
          <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-slate-200/60 mb-3 sm:mb-4 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              <span className="text-[11px] sm:text-sm font-extrabold text-slate-800">clerk</span>
            </div>
          </div>

          {/* Changed justify-center to justify-start and optimized gaps so cards flow naturally from the top */}
          <div className="relative flex-1 flex flex-col justify-start gap-2.5 sm:gap-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="w-full sm:w-[85%] bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm relative shrink-0"
            >
              <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] font-bold text-slate-500">
                  <Image src="/logos/instagram-logo.png" width={10} height={10} alt="IG" className="sm:w-3 sm:h-3" />
                  @sarah_styles
                </div>
                <span className="text-[7px] sm:text-[9px] text-slate-400">Just now</span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-700 font-medium leading-snug">
                "Hi! I ordered the wrong size, can I switch to a Medium?"
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="self-end w-[95%] sm:w-[85%] bg-slate-900 rounded-xl p-2.5 shadow-lg border border-slate-700 relative overflow-hidden shrink-0"
            >
              <motion.div 
                animate={isInView ? { x: ["-100%", "200%"] } : { x: "-100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 bottom-0 w-[50%] bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"
              />

              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 border-b border-slate-700/80 pb-1.5">
                <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-400" />
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-200 uppercase tracking-widest">AI Analysis</span>
              </div>
              <div className="space-y-1 sm:space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] sm:text-[10px] text-slate-400">Intent:</span>
                  <span className="text-[8px] sm:text-[10px] font-bold text-yellow-400">Modify Order</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] sm:text-[10px] text-slate-400">Entity:</span>
                  <span className="text-[8px] sm:text-[10px] font-bold text-white">Size (Medium)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] sm:text-[10px] text-slate-400">Action:</span>
                  <span className="text-[8px] sm:text-[10px] font-bold text-white">Shopify Update</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 3, duration: 0.5 }}
              className="w-full sm:w-[85%] bg-green-50 border border-green-200 rounded-xl p-2.5 shadow-sm flex items-start gap-2 shrink-0"
            >
              <div className="mt-0.5">
                <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
              </div>
              <div>
                <div className="text-[9px] sm:text-[11px] font-bold text-green-900 mb-0.5">Resolved Automatically</div>
                <p className="text-[9px] sm:text-[10px] text-green-700 leading-snug">
                  Size updated to Medium in Shopify. Customer notified via IG DM.
                </p>
              </div>
            </motion.div>

          </div>
        </div>
      </motion.div>

      {/* Floating Sticky Note 1 (Yellow) */}
      <motion.div
        animate={isInView ? { y: [-5, 5, -5], rotate: [6, 8, 6] } : { y: 0, rotate: 6 }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-4 right-0 sm:-top-6 sm:right-[-2%] lg:right-[-4%] w-16 h-16 sm:w-24 sm:h-24 lg:w-28 lg:h-28 bg-yellow-200 shadow-lg flex items-center justify-center p-2 sm:p-3 -z-10"
        style={{ fontFamily: "var(--font-caveat)" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-2 bg-yellow-400/30 -mt-1 shadow-sm mix-blend-multiply" />
        <span className="text-yellow-950 text-[10px] sm:text-sm lg:text-lg leading-tight text-center rotate-[-2deg] font-bold">
          Check SMS inbox for unread messages
        </span>
      </motion.div>

      {/* Floating Sticky Note 2 (Blue) */}
      <motion.div
        animate={isInView ? { y: [5, -5, 5], rotate: [-8, -6, -8] } : { y: 0, rotate: -8 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-4 left-0 sm:-bottom-6 sm:left-[-2%] lg:left-[-4%] w-14 h-14 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-blue-200 shadow-lg flex items-center justify-center p-2 sm:p-3 -z-10"
        style={{ fontFamily: "var(--font-caveat)" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-2 bg-blue-400/30 -mt-1 shadow-sm mix-blend-multiply" />
        <span className="text-blue-950 text-[9px] sm:text-xs lg:text-base leading-tight text-center rotate-[2deg] font-bold">
          Update #34893 about out of stock
        </span>
      </motion.div>
    </div>
  );
}