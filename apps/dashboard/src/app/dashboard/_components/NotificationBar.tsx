"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { X, Info, AlertTriangle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface Notification {
  id: string;
  title: string;
  message?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  type?: "info" | "warning" | "success";
}

interface NotificationBarProps {
  notifications: Notification[];
}

const TYPE_STYLES: Record<NonNullable<Notification["type"]>, { bar: string; icon: string; title: string; action: string }> = {
  info:    { bar: "bg-linear-to-b from-indigo-900/70 to-black/70 text-white/60 border-white[0.1]", icon: "text-indigo-400", title: "text-white/80", action: "text-indigo-400" },
  warning: { bar: "bg-linear-to-b from-amber-900/70 to-black/70 text-white/60 border-white[0.1]", icon: "text-amber-400",  title: "text-amber-400", action: "text-amber-400" },
  success: { bar: "bg-linear-to-b from-emerald-900/70 to-black/70 text-white/60 border-white[0.1]", icon: "text-emerald-400", title: "text-emerald-400", action: "text-emerald-400" },
};

const TYPE_ICONS = {
  info:    Info,
  warning: AlertTriangle,
  success: Sparkles,
};

const STORAGE_KEY = "notificationBar_dismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export default function NotificationBar({ notifications }: NotificationBarProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState(0);
  const directionRef = useRef(1);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDismissedIds(loadDismissed());
  }, []);

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));
  const count = visibleNotifications.length;

  const safeIndex = Math.min(current, Math.max(0, count - 1));

  useEffect(() => {
    if (safeIndex !== current) setCurrent(safeIndex);
  }, [current, safeIndex]);

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      directionRef.current = 1;
      setCurrent(c => (c + 1) % count);
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  function dismiss(id: string) {
    setDismissedIds(prev => {
      const next = new Set(prev).add(id);
      saveDismissed(next);
      return next;
    });
    if (current >= count - 1) setCurrent(Math.max(0, count - 2));
  }

  const n = count > 0 ? visibleNotifications[safeIndex] : null;
  const type = n?.type ?? "info";
  const styles = TYPE_STYLES[type];
  const Icon = TYPE_ICONS[type];

  useEffect(() => {
    const el = barRef.current;
    if (!el) {
      document.documentElement.style.setProperty("--notification-bar-height", "2px");
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty("--notification-bar-height", `${entry.contentRect.height + 2}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  return (
    <AnimatePresence initial={false}>
      {n && (
        <motion.div
          ref={barRef}
          data-dashboard-notification-bar
          key="bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className={`relative z-20 flex items-center justify-center pl-3 pr-10 md:px-10 text-xs md:text-sm shrink-0 border-b overflow-hidden ${styles.bar}`}
        >
          <div className="py-2 md:py-3 flex items-center gap-2 md:gap-2.5">
            <AnimatePresence mode="wait" custom={directionRef.current}>
              <motion.div
                key={n.id}
                custom={directionRef.current}
                variants={{
                  enter: (d: number) => ({ opacity: 0, y: d * 8 }),
                  center: { opacity: 1, y: 0 },
                  exit: (d: number) => ({ opacity: 0, y: d * -8 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="flex items-center gap-2.5 transition-colors"
              >
                <Icon className={`w-4 h-4 shrink-0 ${styles.icon}`} />
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`font-bold whitespace-nowrap ${styles.title}`}>{n.title}</span>
                  {n.message && <span className="font-normal text-white/40 hidden sm:inline whitespace-nowrap">{n.message}</span>}
                  {n.action && (
                    <>
                      {" "}
                      {n.action.href ? (
                        <Link
                          href={n.action.href}
                          className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ${styles.action}`}
                        >
                          {n.action.label}
                        </Link>
                      ) : (
                        <button
                          onClick={n.action.onClick}
                          className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ${styles.action}`}
                        >
                          {n.action.label}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <motion.button
            onClick={() => dismiss(n.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="absolute right-3 p-1.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
