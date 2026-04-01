"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function NavProgressBar() {
  const pathname = usePathname();
  const [navBar, setNavBar] = useState<{ width: number; opacity: number; transition: string } | null>(null);
  const isNavigating = useRef(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sidebar dispatches "nav-progress-start" on link click so the bar begins before the route resolves
  useEffect(() => {
    function onNavStart() {
      isNavigating.current = true;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      setNavBar({ width: 0, opacity: 1, transition: "none" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setNavBar({ width: 85, opacity: 1, transition: "width 3s cubic-bezier(0.05, 0.8, 0.1, 1)" });
        });
      });
    }
    window.addEventListener("nav-progress-start", onNavStart);
    return () => window.removeEventListener("nav-progress-start", onNavStart);
  }, []);

  // Complete the bar when pathname changes
  useEffect(() => {
    if (!isNavigating.current) return;
    isNavigating.current = false;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    setNavBar({ width: 100, opacity: 1, transition: "width 0.2s ease-out" });
    navTimerRef.current = setTimeout(() => {
      setNavBar(prev => prev ? { ...prev, opacity: 0, transition: "opacity 0.3s ease-out" } : null);
      navTimerRef.current = setTimeout(() => setNavBar(null), 300);
    }, 250);
  }, [pathname]);

  return (
    <div className="relative h-[2px] shrink-0 bg-transparent">
      {navBar && (
        <div
          className="absolute inset-y-0 left-0 bg-indigo-500 pointer-events-none"
          style={{ width: `${navBar.width}%`, opacity: navBar.opacity, transition: navBar.transition }}
        />
      )}
    </div>
  );
}
