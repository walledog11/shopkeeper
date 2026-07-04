"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Wraps an inline phrase in a rough, hand-drawn pen underline that draws
 *  itself on when scrolled into view — same stroke-dashoffset technique as the
 *  Channels timeline path. Inherits the phrase color via currentColor, so the
 *  stroke reads as the same pen. Single-line phrases only (the box can't wrap). */
export function HandUnderline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      {children}
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-[0.06em] left-0 h-[0.34em] w-full overflow-visible"
        viewBox="0 0 300 12"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M5 8 C 70 4.5, 130 9.5, 200 6 C 245 3.8, 275 6.5, 296 5"
          pathLength={1}
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          className={`[stroke-dasharray:1] transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none ${
            inView
              ? "[stroke-dashoffset:0]"
              : "[stroke-dashoffset:1] motion-reduce:[stroke-dashoffset:0]"
          }`}
        />
      </svg>
    </span>
  );
}
