"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { resolveMobileChromeMode } from "./resolveMobileChromeMode";
import { MOBILE_CHROME_PRIORITY, type MobileChromeMode } from "./types";

interface MobileNavContextValue {
  openNav: () => void;
}

interface MobileChromeContextValue {
  mode: MobileChromeMode;
  registerOverride: (id: string, mode: MobileChromeMode | null) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);
const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

function pickOverride(overrides: Map<string, MobileChromeMode>): MobileChromeMode | null {
  let best: MobileChromeMode | null = null;
  let bestPriority = -1;

  for (const mode of overrides.values()) {
    const priority = MOBILE_CHROME_PRIORITY[mode];
    if (priority > bestPriority) {
      best = mode;
      bestPriority = priority;
    }
  }

  return best;
}

export function MobileChromeProvider({
  children,
  onOpenNav,
}: {
  children: ReactNode;
  onOpenNav: () => void;
}) {
  const pathname = usePathname();
  const routeMode = resolveMobileChromeMode(pathname);
  const [overrides, setOverrides] = useState<Map<string, MobileChromeMode>>(() => new Map());

  const registerOverride = useCallback((id: string, mode: MobileChromeMode | null) => {
    setOverrides((current) => {
      const next = new Map(current);
      if (mode === null) {
        next.delete(id);
      } else {
        next.set(id, mode);
      }
      return next;
    });
  }, []);

  const mode = pickOverride(overrides) ?? routeMode;

  const navValue = useMemo<MobileNavContextValue>(() => ({ openNav: onOpenNav }), [onOpenNav]);
  const chromeValue = useMemo<MobileChromeContextValue>(
    () => ({ mode, registerOverride }),
    [mode, registerOverride],
  );

  return (
    <MobileNavContext.Provider value={navValue}>
      <MobileChromeContext.Provider value={chromeValue}>{children}</MobileChromeContext.Provider>
    </MobileNavContext.Provider>
  );
}

export function useMobileChrome() {
  const ctx = useContext(MobileChromeContext);
  if (!ctx) throw new Error("useMobileChrome must be used inside MobileChromeProvider");
  return ctx.mode;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used inside MobileChromeProvider");
  return ctx;
}

export function useMobileChromeOverride(mode: MobileChromeMode | null) {
  const ctx = useContext(MobileChromeContext);
  if (!ctx) throw new Error("useMobileChromeOverride must be used inside MobileChromeProvider");

  const { registerOverride } = ctx;
  const id = useId();

  useEffect(() => {
    registerOverride(id, mode);
    return () => registerOverride(id, null);
  }, [id, mode, registerOverride]);
}
