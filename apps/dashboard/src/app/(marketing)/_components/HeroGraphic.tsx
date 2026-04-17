"use client";

import { useRef } from "react";
import Image from "next/image";


export default function HeroGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-start justify-center"
    >
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-gradient-to-tr from-slate-300/20 via-slate-400/10 to-transparent blur-[80px] rounded-full z-0" />

      <Image src="/illustrations/dashboard-picture.png" alt="dashboard" width={1000} height={1000} className="rounded-2xl"/>
    </div>
  );
}
