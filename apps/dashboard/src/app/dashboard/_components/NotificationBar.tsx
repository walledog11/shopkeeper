"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { X, Info, AlertTriangle, Sparkles } from "lucide-react";

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
  info:    { bar: "bg-white text-slate-600", icon: "text-indigo-500", title: "text-slate-900", action: "text-indigo-600" },
  warning: { bar: "bg-white text-slate-600", icon: "text-amber-500",  title: "text-amber-700", action: "text-amber-700" },
  success: { bar: "bg-white text-slate-600", icon: "text-emerald-500", title: "text-emerald-700", action: "text-emerald-700" },
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
  // `displayed` is the index actually rendered — trails `current` during the transition
  const [displayed, setDisplayed] = useState(0);
  const [visible, setVisible] = useState(true);
  const animatingRef = useRef(false);

  useEffect(() => {
    setDismissedIds(loadDismissed());
  }, []);

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));
  const count = visibleNotifications.length;

  const safeIndex = Math.min(current, Math.max(0, count - 1));
  if (safeIndex !== current) setCurrent(safeIndex);

  // Auto-rotate every 5 seconds when there are multiple notifications
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setCurrent(c => (c + 1) % count);
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  // Animate out → swap content → animate in whenever `current` changes
  useEffect(() => {
    if (current === displayed) return;
    if (animatingRef.current) return;
    animatingRef.current = true;

    setVisible(false);
    const swap = setTimeout(() => {
      setDisplayed(current);
      setVisible(true);
      animatingRef.current = false;
    }, 200); // matches transition duration below

    return () => clearTimeout(swap);
  }, [current, displayed]);

  function dismiss(id: string) {
    setDismissedIds(prev => {
      const next = new Set(prev).add(id);
      saveDismissed(next);
      return next;
    });
    if (current >= count - 1) setCurrent(Math.max(0, count - 2));
  }

  if (count === 0) return null;

  const safeDisplayed = Math.min(displayed, count - 1);
  const n = visibleNotifications[safeDisplayed];
  const type = n.type ?? "info";
  const styles = TYPE_STYLES[type];
  const Icon = TYPE_ICONS[type];

  return (
    <div className={`relative flex items-center justify-center px-10 py-3 text-sm shrink-0 border-b border-slate-200 overflow-hidden ${styles.bar}`}>
      <div
        className="flex items-center gap-2.5 transition-all duration-200 ease-in-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-6px)",
        }}
      >
        <Icon className={`w-4 h-4 shrink-0 ${styles.icon}`} />
        <p className="text-center">
          <span className={`font-bold ${styles.title}`}>{n.title}</span>
          {n.message && <span className="font-normal text-slate-500"> {n.message}</span>}
          {n.action && (
            <>
              {" "}
              {n.action.href ? (
                <Link
                  href={n.action.href}
                  className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity ${styles.action}`}
                >
                  {n.action.label}
                </Link>
              ) : (
                <button
                  onClick={n.action.onClick}
                  className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity ${styles.action}`}
                >
                  {n.action.label}
                </button>
              )}
            </>
          )}
        </p>
      </div>

      <button
        onClick={() => dismiss(n.id)}
        className="absolute right-3 p-1.5 rounded hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
