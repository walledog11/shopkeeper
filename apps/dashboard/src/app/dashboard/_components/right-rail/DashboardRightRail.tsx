"use client";

import * as React from "react";
import { X } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { cn } from "@/lib/ui/cn";
import { RIGHT_RAIL_SPRING, RIGHT_RAIL_WIDTH } from "./constants";
import { HelpRailContent } from "./HelpRailContent";
import { useRightRail } from "./RightRailContext";

function RailHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
      <p className="text-base font-semibold leading-none text-foreground">{title}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export default function DashboardRightRail() {
  const { isOpen, close } = useRightRail();
  const isLargeScreen = React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia("(min-width: 768px)");
      const onChange = () => onStoreChange();
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );

  const panelBody = (
    <>
      <RailHeader title="Help" onClose={close} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <HelpRailContent active={isOpen} />
      </div>
    </>
  );

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {isOpen && !isLargeScreen && (
          <m.div
            key="right-rail-mobile"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={RIGHT_RAIL_SPRING}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-muted/30 md:hidden"
          >
            {panelBody}
          </m.div>
        )}
      </AnimatePresence>

      <m.div
        className={cn(
          "relative z-20 hidden h-full shrink-0 overflow-hidden bg-muted/30 md:block",
          isOpen && isLargeScreen && "border-l border-border/60",
        )}
        initial={false}
        animate={{ width: isOpen && isLargeScreen ? RIGHT_RAIL_WIDTH : 0 }}
        transition={RIGHT_RAIL_SPRING}
      >
        <div
          className="flex h-full flex-col overflow-hidden"
          style={{ width: RIGHT_RAIL_WIDTH }}
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          {panelBody}
        </div>
      </m.div>
    </LazyMotion>
  );
}
