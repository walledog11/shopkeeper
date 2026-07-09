import { Check, ChevronLeft, ChevronRight, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Accent, Headline } from "./primitives";
import type { OnboardingData } from "./model";

export function StepPlan({
  data,
  hasEmail,
  hasMessaging,
  hasShopify,
  onStart,
  onBack,
}: {
  data: OnboardingData;
  hasEmail: boolean;
  hasMessaging: boolean;
  hasShopify: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const storeName = data.storeName || "your store";
  const firstName = data.founderName.trim();
  const greeting = firstName ? `Good morning, ${firstName}.` : "Good morning.";

  return (
    <div className="flex flex-col items-center">
      <Headline>
        {hasEmail ? "You're all set." : `${storeName} is ready.`}
        <Accent>{hasEmail ? `I'll start on ${storeName} tonight.` : "Add a customer channel when you are."}</Accent>
      </Headline>
      <p className="mx-auto mt-3 max-w-[520px] text-center text-[15px] leading-relaxed text-foreground/60">
        {hasEmail
          ? `${PRODUCT_NAME} prepares every reply and Shopify action, then waits for your approval. Nothing customer-facing sends on its own.`
          : `Shopify is connected and ${PRODUCT_NAME} is in approval mode. Connect a customer channel from Integrations when you're ready for messages.`}
      </p>

      <div className="mt-7 w-full max-w-[440px] rounded-2xl border border-foreground/10 bg-card p-4 text-left">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/40">
          {hasMessaging ? <Smartphone className="size-3.5" /> : <Mail className="size-3.5" />}
          {hasMessaging ? "Tomorrow · 8:00am · your phone" : "Tomorrow morning · your dashboard"}
        </div>
        <div className="flex justify-end">
          <div className="max-w-[92%] rounded-2xl rounded-br-md bg-green-600 px-3.5 py-2.5 text-[13.5px] leading-snug text-[#f6f2eb]">
            {greeting} Quiet night — 2 new tickets, I drafted both replies. One needs your okay on a $40 refund.
          </div>
        </div>
        <div className="mt-1.5 text-right text-[11px] text-foreground/35">Your first briefing</div>
      </div>

      <div className="mt-5 w-full max-w-[440px] space-y-2.5 text-left">
        <SetupRow icon={ShieldCheck} label="Shopify" value={hasShopify ? "Orders and policies connected" : "Not connected"} ready={hasShopify} />
        <SetupRow icon={Mail} label="Customer inbox" value={hasEmail ? (data.primaryEmail.trim() || "Connected") : "Add one later"} ready={hasEmail} optional={!hasEmail} />
        <SetupRow icon={Smartphone} label="Approvals" value={hasMessaging ? "On your phone" : "In the dashboard"} ready={hasMessaging} optional={!hasMessaging} />
      </div>

      <p className="mt-5 max-w-[440px] text-center text-[12.5px] leading-relaxed text-foreground/45">
        You start in approval mode: every reply, refund, and cancellation waits for you, refunds stay capped at $50,
        and everything is recorded. Change any of it in Agent → Settings.
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
        <Button
          onClick={onStart}
          disabled={!hasShopify}
          className="h-11 gap-2 rounded-full bg-foreground px-6 text-[14px] font-semibold text-background hover:bg-foreground/85"
        >
          {hasEmail ? "Start working" : "Finish setup"} <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground">
          <ChevronLeft className="mr-1 size-4" /> Change something
        </Button>
      </div>
    </div>
  );
}

function SetupRow({
  icon: Icon,
  label,
  value,
  ready,
  optional = false,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  ready: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-card px-4 py-3">
      <Icon className="size-4 shrink-0 text-foreground/45" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground">{label}</div>
        <div className="truncate text-[12px] text-foreground/50">{value}</div>
      </div>
      {ready ? (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-3" />
        </span>
      ) : optional ? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-foreground/35">Optional</span>
      ) : null}
    </div>
  );
}
