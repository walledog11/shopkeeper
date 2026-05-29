"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function NavProgressBar() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement | null>(null);
  const isNavigating = useRef(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBarStyle = useCallback((width: number, opacity: number, transition: string) => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.width = `${width}%`;
    bar.style.opacity = String(opacity);
    bar.style.transition = transition;
  }, []);

  // Sidebar dispatches "nav-progress-start" on link click so the bar begins before the route resolves
  useEffect(() => {
    function onNavStart() {
      isNavigating.current = true;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      applyBarStyle(0, 1, "none");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyBarStyle(85, 1, "width 3s cubic-bezier(0.05, 0.8, 0.1, 1)");
        });
      });
    }
    window.addEventListener("nav-progress-start", onNavStart);
    return () => window.removeEventListener("nav-progress-start", onNavStart);
  }, [applyBarStyle]);

  // Complete the bar when pathname changes
  useEffect(() => {
    if (!isNavigating.current) return;
    isNavigating.current = false;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    applyBarStyle(100, 1, "width 0.2s ease-out");
    navTimerRef.current = setTimeout(() => {
      applyBarStyle(100, 0, "opacity 0.3s ease-out");
      navTimerRef.current = setTimeout(() => applyBarStyle(0, 0, "none"), 300);
    }, 250);

    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
    };
  }, [pathname, applyBarStyle]);

  return (
    <div data-dashboard-nav-progress className="relative z-20 h-[2px] shrink-0 bg-transparent">
      <div
        ref={barRef}
        className="absolute inset-y-0 left-0 bg-green-500 pointer-events-none"
        style={{ width: "0%", opacity: 0, transition: "none" }}
      />
    </div>
  );
}
