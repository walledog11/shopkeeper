"use client";

import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { useRightRail } from "./RightRailContext";

export function MainContentScrim() {
  const { isOpen, close } = useRightRail();

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <m.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="absolute inset-0 z-10 hidden bg-foreground/[0.06] md:block"
          />
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
