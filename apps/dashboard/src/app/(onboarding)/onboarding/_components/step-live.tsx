import type { ComponentType } from "react";
import { Inbox, Mail, Smartphone } from "lucide-react";
import { Headline, Lede } from "./primitives";
import type { StepId } from "../_lib/onboarding-model";

// The last step says what happens from here: routine questions are answered,
// and anything else comes to the merchant first.
export function StepLive({ channels, hasMessaging, onNavigate, disabled }: {
  /** The customer channels connected so far, as the merchant would name them. */
  channels: string[];
  hasMessaging: boolean;
  onNavigate: (step: StepId) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <Headline>I’m ready to start.</Headline>
      <Lede>Here’s how I’ll look after your customers.</Lede>
      <ul className="mt-7 w-full max-w-[560px] space-y-2.5 text-left">
        <LiveRow icon={Mail} title="I’ll answer routine questions in your voice.">
          {channels.length > 0 ? (
            <>Like where an order is, from {channels.join(" and ")}.</>
          ) : (
            <>
              No customer messages can reach me yet.{" "}
              <button type="button" disabled={disabled} onClick={() => onNavigate("email")} className="font-semibold text-foreground underline underline-offset-4">
                Connect where customers write to you
              </button>
            </>
          )}
        </LiveRow>
        <LiveRow icon={hasMessaging ? Smartphone : Inbox} title="I’ll ask you before anything else.">
          {hasMessaging
            ? "Refunds, cancellations and order changes come to your phone first. Reply yes and I do it."
            : "Refunds, cancellations and order changes wait for your OK in your inbox."}
        </LiveRow>
      </ul>
    </div>
  );
}

function LiveRow({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-card px-4 py-3.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground/55" />
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/60">{children}</p>
      </div>
    </li>
  );
}
