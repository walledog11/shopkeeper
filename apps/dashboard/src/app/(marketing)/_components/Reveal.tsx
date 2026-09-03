"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Fades content up into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight * 0.9) {
      setShown(true);
      return;
    }

    setArmed(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        setArmed(false);
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        shown
          ? "animate-[m-rise_0.7s_ease-out_both] motion-reduce:animate-none"
          : armed
            ? "opacity-0"
            : "",
        className,
      )}
      style={shown && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
