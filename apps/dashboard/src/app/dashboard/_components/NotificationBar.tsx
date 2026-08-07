"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { X, Info, AlertTriangle, Sparkles } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import {
  writeDismissedNotificationIdsCookie,
} from "@/lib/dashboard-dismissals";

export interface Notification {
  id: string;
  title: string;
  message?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  type?: "info" | "warning" | "success";
}

interface NotificationBarProps {
  notifications: Notification[];
  initialDismissedIds: string[];
}

const TYPE_STYLES: Record<NonNullable<Notification["type"]>, { bar: string; icon: string; title: string; action: string }> = {
  info:    { bar: "bg-blue-600/10 text-strong border-border",  icon: "text-blue-700",  title: "text-foreground", action: "text-blue-700" },
  warning: { bar: "bg-amber-500/10 text-strong border-border", icon: "text-amber-600", title: "text-foreground", action: "text-amber-700" },
  success: { bar: "bg-green-600/10 text-strong border-border", icon: "text-green-700", title: "text-foreground", action: "text-green-700" },
};

const TYPE_ICONS = {
  info:    Info,
  warning: AlertTriangle,
  success: Sparkles,
};

export default function NotificationBar({ notifications, initialDismissedIds }: NotificationBarProps) {
  const [dismissedIds, setDismissedIds] = useState(() => new Set(initialDismissedIds));
  const barRef = useRef<HTMLDivElement>(null);

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));
  const count = visibleNotifications.length;

  function dismiss(id: string) {
    setDismissedIds(prev => {
      const next = new Set(prev).add(id);
      writeDismissedNotificationIdsCookie(next);
      return next;
    });
  }

  // Always the oldest outstanding notification. Dismissing it reveals the next
  // one — the merchant advances the queue, not a timer.
  const n = count > 0 ? visibleNotifications[0] : null;
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
    <LazyMotion features={domAnimation}>
    <AnimatePresence initial={false}>
      {n && (
        <m.div
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
            <Icon className={`size-4 shrink-0 ${styles.icon}`} />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-bold whitespace-nowrap ${styles.title}`}>{n.title}</span>
              {n.message && <span className="font-normal text-muted-foreground hidden sm:inline whitespace-nowrap">{n.message}</span>}
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
                    <button type="button"
                      onClick={n.action.onClick}
                      className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ${styles.action}`}
                    >
                      {n.action.label}
                    </button>
                  )}
                </>
              )}
              {count > 1 && (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  +{count - 1} more
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="absolute right-3 p-1.5 rounded hover:bg-foreground/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </m.div>
      )}
    </AnimatePresence>
    </LazyMotion>
  );
}
