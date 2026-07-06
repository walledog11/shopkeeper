"use client";

import { useEffect, useRef } from "react";

/* A pencil line wandering down the left page margin, drawn in lockstep with
   scroll progress — scrolling the page is the pen moving down the sheet.
   Desktop-gutter only; fades out before the footer photograph. */
export function MarginThread() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = pathRef.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 1;
      el.style.strokeDashoffset = String(1 - progress);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-8 hidden w-8 lg:block [mask-image:linear-gradient(180deg,transparent_0%,black_3%,black_90%,transparent_97%)]"
    >
      <svg className="h-full w-full" viewBox="0 0 32 1200" preserveAspectRatio="none" fill="none">
        <path
          ref={pathRef}
          d="M16 0 C 22 80 10 160 16 240 C 21 320 11 400 16 480 C 22 560 10 640 15 720 C 20 800 11 880 16 960 C 21 1040 12 1120 16 1200"
          pathLength={1}
          stroke="rgba(43,33,24,0.24)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
        />
      </svg>
    </div>
  );
}
