"use client";

import { useEffect, useRef } from "react";

// Darkens the sticky navbar while it sits over a section marked
// `data-nav-dark`, so it reads as part of the night sky instead of a white band.
export function NavTone() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    let frame = 0;

    function update() {
      frame = 0;
      const line = header!.getBoundingClientRect().bottom;
      const dark = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-dark]")).some((zone) => {
        const rect = zone.getBoundingClientRect();
        return rect.height > 0 && rect.top <= line + 1 && rect.bottom > line;
      });
      header!.dataset.tone = dark ? "dark" : "light";
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <span ref={ref} hidden />;
}
