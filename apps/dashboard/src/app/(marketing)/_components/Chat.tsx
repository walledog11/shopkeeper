import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/* Phone conversations drawn in each app's own style, so the page shows what the
   merchant and their customer actually see. `delay` is a Tailwind
   `[animation-delay:…]` class: a line with one arrives in sequence, a line
   without one is simply there. */

export function ChatPanel({
  app,
  name,
  initials,
  children,
  className,
}: {
  app: "instagram" | "imessage";
  name: string;
  initials: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("m-chat", `m-chat--${app}`, className)}>
      <div className="m-chat-head">
        <span className="m-chat-avatar">{initials}</span>
        <span className="m-chat-name">{name}</span>
        {app === "instagram" ? <InstagramGlyph /> : null}
      </div>
      <div className="m-chat-thread">{children}</div>
    </div>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ml-auto size-[18px]">
      <defs>
        <radialGradient id="m-chat-ig" cx="30%" cy="107%" r="130%">
          <stop offset="0%" stopColor="#fdc468" />
          <stop offset="45%" stopColor="#df4996" />
          <stop offset="100%" stopColor="#6a3fd3" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#m-chat-ig)" />
      <rect x="7" y="7" width="10" height="10" rx="5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="#fff" />
    </svg>
  );
}

export function Bubble({
  from,
  wide = false,
  delay,
  children,
}: {
  from: "them" | "me";
  wide?: boolean;
  delay?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("m-chat-bubble", from === "me" ? "is-me" : "is-them", wide && "is-wide", delay && ["m-chat-step", delay])}>
      {children}
    </div>
  );
}

export function Stamp({ delay, children }: { delay?: string; children: ReactNode }) {
  return <p className={cn("m-chat-stamp", delay && ["m-chat-step", delay])}>{children}</p>;
}
