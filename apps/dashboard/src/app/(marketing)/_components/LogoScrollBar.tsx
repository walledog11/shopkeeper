"use client";

import Image from "next/image";
import { motion } from "motion/react";

export function LogoScrollBar() {
  const integrations = [
    { name: "Instagram", logo: "/logos/instagram-logo.png" },
    { name: "Shopify", logo: "/logos/shopify-inbox.png" },
    { name: "Gmail", logo: "/logos/gmail.png" },
    { name: "SMS", logo: "/logos/sms.svg" },
    { name: "Instagram", logo: "/logos/instagram-logo.png" },
    { name: "Shopify", logo: "/logos/shopify-inbox.png" },
    { name: "Gmail", logo: "/logos/gmail.png" },
    { name: "SMS", logo: "/logos/sms.svg" },
  ];

  const duplicated = [...integrations, ...integrations];

  return (
    <section className="relative w-full py-12 md:py-16 bg-white border-y border-slate-100 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">

        <div className="flex flex-col items-center justify-center text-center mb-8 md:mb-10">
          <p className="text-[11px] font-extrabold tracking-widest uppercase text-slate-400">
            Works with the channels your customers already use
          </p>
        </div>

        {/* Marquee with fade edges */}
        <div className="relative w-full max-w-3xl mx-auto overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
          <motion.div
            className="flex items-center gap-12 sm:gap-20 w-max"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            {duplicated.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 shrink-0 opacity-50 hover:opacity-80 transition-opacity"
              >
                <Image
                  src={item.logo}
                  alt={item.name}
                  width={28}
                  height={28}
                  className="object-contain"
                />
                <span className="text-sm font-semibold text-slate-500">{item.name}</span>
              </div>
            ))}
          </motion.div>
        </div>

      </div>
    </section>
  );
}
