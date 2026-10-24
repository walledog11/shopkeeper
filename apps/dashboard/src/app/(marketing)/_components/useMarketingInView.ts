"use client";

import { useEffect, useRef, useState } from "react";

type MarketingInViewOptions = {
  threshold?: number;
  rootMargin?: string;
  /** Reveal-style: show immediately if already in the viewport on mount. */
  checkInitialViewport?: boolean;
  viewportRatio?: number;
};

/** Fires once when the element enters the viewport; respects reduced motion. */
export function useMarketingInViewOnce<T extends HTMLElement>({
  threshold = 0.3,
  rootMargin = "0px",
  checkInitialViewport = false,
  viewportRatio = 0.9,
}: MarketingInViewOptions = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }

    if (checkInitialViewport) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight * viewportRatio) {
        setInView(true);
        return;
      }
      setArmed(true);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        setArmed(false);
        observer.disconnect();
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, checkInitialViewport, viewportRatio]);

  return { ref, inView, armed } as const;
}
