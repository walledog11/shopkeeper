"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Cached segments resolve in well under 100ms. Painting a progress bar for those
// reads as a flicker, so the bar only appears once a navigation has been in
// flight long enough to be worth reporting.
const SHOW_DELAY_MS = 120;
// A navigation that never lands (aborted, or a route that redirects back onto
// itself) must not strand the bar at 85%.
const STALL_TIMEOUT_MS = 10_000;

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

// Only same-origin clicks that land on a different path start the bar. Clicking
// the route you are already on, or a link that only edits search params (tab
// switches, ?thread=), renders in place — those never change the pathname, so
// starting the bar for them would leave it hanging until the stall timeout.
function changesRoute(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return url.pathname !== window.location.pathname;
}

export default function NavProgressBar() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement | null>(null);
  const isNavigating = useRef(false);
  const isVisible = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBarStyle = useCallback((width: number, opacity: number, transition: string) => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.width = `${width}%`;
    bar.style.opacity = String(opacity);
    bar.style.transition = transition;
  }, []);

  const clearPendingTimers = useCallback(() => {
    for (const timer of [showTimerRef, stallTimerRef, finishTimerRef]) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const hide = useCallback(() => {
    isNavigating.current = false;
    isVisible.current = false;
    clearPendingTimers();
    applyBarStyle(0, 0, "none");
  }, [applyBarStyle, clearPendingTimers]);

  // Any same-origin link click anywhere in the shell starts the bar, so a link
  // does not have to opt in to report progress. Capture phase keeps the decision
  // deterministic rather than dependent on React's listener ordering.
  useEffect(() => {
    function onNavStart() {
      isNavigating.current = true;
      clearPendingTimers();

      stallTimerRef.current = setTimeout(hide, STALL_TIMEOUT_MS);
      showTimerRef.current = setTimeout(() => {
        isVisible.current = true;
        applyBarStyle(0, 1, "none");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyBarStyle(85, 1, "width 3s cubic-bezier(0.05, 0.8, 0.1, 1)");
          });
        });
      }, SHOW_DELAY_MS);
    }

    function onDocumentClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !changesRoute(anchor as HTMLAnchorElement)) return;
      onNavStart();
    }

    window.addEventListener("nav-progress-start", onNavStart);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("nav-progress-start", onNavStart);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [applyBarStyle, clearPendingTimers, hide]);

  // Complete the bar when the pathname lands.
  useEffect(() => {
    if (!isNavigating.current) return;
    isNavigating.current = false;
    clearPendingTimers();

    // Resolved before the bar was ever painted — nothing to finish.
    if (!isVisible.current) return;
    isVisible.current = false;

    applyBarStyle(100, 1, "width 0.2s ease-out");
    finishTimerRef.current = setTimeout(() => {
      applyBarStyle(100, 0, "opacity 0.3s ease-out");
      finishTimerRef.current = setTimeout(() => applyBarStyle(0, 0, "none"), 300);
    }, 250);
  }, [pathname, applyBarStyle, clearPendingTimers]);

  useEffect(() => clearPendingTimers, [clearPendingTimers]);

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
