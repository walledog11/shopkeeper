import type { ComponentType } from "react";
import { Inbox, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Accent, Headline, Lede } from "./primitives";
import type { StepId } from "../_lib/onboarding-model";

// The last step says what happens from here, in Draft only: every reply waits
// for the merchant, and refunds and order changes stay with them.
export function StepLive({ channels, hasMessaging, onNavigate, disabled }: {
  /** The customer channels connected so far, as the merchant would name them. */
  channels: string[];
  hasMessaging: boolean;
  onNavigate: (step: StepId) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <Headline>I’m ready to start.<Accent>You have the final say.</Accent></Headline>
      <Lede>Here’s how we’ll work together while you get to know my replies.</Lede>
      <ul className="mt-7 w-full max-w-[560px] space-y-2.5 text-left">
        <LiveRow icon={Mail} title="I’ll draft a reply to every new message.">
          {channels.length > 0 ? (
            <>From {channels.join(" and ")}.</>
          ) : (
            <>
              No customer messages can reach me yet.{" "}
              <button type="button" disabled={disabled} onClick={() => onNavigate("email")} className="font-semibold text-foreground underline underline-offset-4">
                Connect where customers write to you
              </button>
            </>
          )}
        </LiveRow>
        <LiveRow icon={hasMessaging ? Smartphone : Inbox} title="You approve each one before it’s sent.">
          {hasMessaging ? "I’ll text each draft to your iPhone. Reply yes and I send it." : "Drafts wait for you in your inbox."}
        </LiveRow>
        <LiveRow icon={ShieldCheck} title="Refunds and order changes stay with you.">
          When you trust my replies, you can let me answer routine questions on my own in Settings.
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
