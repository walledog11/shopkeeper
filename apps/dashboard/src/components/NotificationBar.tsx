"use client";

import { useState, useEffect, useRef } from "react";
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

export default function NotificationBar({ notifications }: NotificationBarProps) {
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const nextIndex = useRef(0);
  const count = notifications.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      nextIndex.current = (current + 1) % count;
      setPhase("out");
    }, 5000);
    return () => clearInterval(id);
  }, [count, current]);

  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => {
        setCurrent(nextIndex.current);
        setPhase("in");
      }, 400);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("idle"), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (dismissed || count === 0) return null;

  const n = notifications[current];
  const type = n.type ?? "info";
  const styles = TYPE_STYLES[type];
  const Icon = TYPE_ICONS[type];

  const textStyle =
    phase === "out"
      ? "opacity-0 translate-y-2"
      : phase === "in"
      ? "opacity-0 -translate-y-2"
      : "opacity-100 translate-y-0";

  return (
    <div className={`relative flex items-center justify-center px-10 py-3 text-sm shrink-0 border-b border-slate-200 ${styles.bar}`}>
      {/* Content */}
      <div className={`flex items-center gap-2.5 transition-all duration-300 ease-in-out ${textStyle}`}>
        <Icon className={`w-4 h-4 shrink-0 ${styles.icon}`} />
        <p className="text-center">
          <span className={`font-bold ${styles.title}`}>{n.title}</span>
          {n.message && <span className="font-normal text-slate-500"> {n.message}</span>}
          {n.action && (
            <>
              {" "}
              {n.action.href ? (
                <a
                  href={n.action.href}
                  className={`font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity ${styles.action}`}
                >
                  {n.action.label}
                </a>
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

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 p-1.5 rounded hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
