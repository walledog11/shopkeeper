import { useState } from "react";
import Image from "next/image";
import { AlertCircle, Check, ChevronDown, Clock3, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { EmailForwardingSetupPanel } from "@/components/integrations/EmailForwardingDisclosure";
import { GmailSupportAddressPanel } from "@/components/integrations/GmailSupportAddressPanel";
import { Accent, Headline, Lede } from "./primitives";
import type { Integration } from "@/types";
import type { OnboardingData } from "./model";
import type { LaunchOnboardingOAuth } from "../_hooks/useOnboardingOAuth";

export function StepEmail({
  data,
  update,
  emailConnected,
  forwardingIntegration,
  gmailIntegration,
  orgReady,
  orgLoading,
  orgError,
  onRetryOrg,
  emailSaving,
  oauthPending,
  onSaveForwarding,
  onSaveGmail,
  onOAuth,
}: {
  data: OnboardingData;
  update: (p: Partial<OnboardingData>) => void;
  emailConnected: boolean;
  forwardingIntegration: Integration | undefined;
  gmailIntegration: Integration | undefined;
  orgReady: boolean;
  orgLoading: boolean;
  orgError: boolean;
  onRetryOrg: () => void;
  emailSaving: boolean;
  oauthPending: boolean;
  onSaveForwarding: (email: string) => void;
  onSaveGmail: (email: string) => void;
  onOAuth: LaunchOnboardingOAuth;
}) {
  const [forwardingOpen, setForwardingOpen] = useState(false);
  const connectedEmail = data.primaryEmail
    || gmailIntegration?.fromEmail
    || gmailIntegration?.externalAccountId
    || forwardingIntegration?.fromEmail
    || forwardingIntegration?.externalAccountId;
  const gmailEmail = data.gmailEmail
    || gmailIntegration?.fromEmail
    || gmailIntegration?.externalAccountId
    || data.primaryEmail;
  const forwardingEmail = data.forwardingEmail
    || forwardingIntegration?.fromEmail
    || forwardingIntegration?.externalAccountId
    || data.primaryEmail;

  return (
    <div className="flex flex-col items-center">
      <Headline>
        Where do customers reach you?
        <Accent>Connect a channel, or skip for now.</Accent>
      </Headline>
      <Lede>
        Link an inbox so customer messages arrive in Shopkeeper. You can always add one later from Integrations.
      </Lede>

      {emailConnected && (
        <div className="mt-6 w-full max-w-[560px] overflow-hidden rounded-xl border border-foreground/12 bg-foreground/[0.03] text-left">
          <div className="flex items-start gap-2.5 px-4 py-3.5">
            <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
            <div>
              <div className="text-[13px] font-semibold text-foreground">Email connected</div>
              <div className="mt-0.5 text-[12.5px] text-foreground/55">
                {connectedEmail || "Your support inbox"} is ready.
              </div>
            </div>
          </div>
          {gmailIntegration && (
            <div className="border-t border-foreground/[0.08]">
              <GmailSupportAddressPanel
                email={gmailEmail}
                setEmail={value => update({ gmailEmail: value })}
                loading={emailSaving}
                onSave={() => onSaveGmail(gmailEmail)}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid w-full max-w-[560px] gap-3 text-left">
        <ChannelCard
          name="Gmail"
          logo="/logos/gmail.png"
          description="Connect Gmail or Google Workspace and reply from your existing address."
          connected={Boolean(gmailIntegration)}
          actionLabel="Connect Gmail"
          onConnect={() => onOAuth("gmail", {})}
          pending={oauthPending}
        />
      </div>

      <div className="mt-3 w-full max-w-[560px] overflow-hidden rounded-xl border border-foreground/10 bg-card text-left">
        <button
          type="button"
          onClick={() => setForwardingOpen(open => !open)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
            <Mail className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
              Forward another inbox
              {forwardingIntegration && (
                <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                  Connected
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-foreground/50">
              When direct Gmail access isn&apos;t an option.
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-foreground/40 transition-transform", forwardingOpen && "rotate-180")} />
        </button>

        {forwardingOpen && (
          <div className="border-t border-foreground/[0.08]">
            {orgLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-9">
                <Loader2 className="size-5 animate-spin text-foreground/45" />
                <span className="text-sm text-foreground/55">Preparing your forwarding address…</span>
              </div>
            )}

            {!orgLoading && orgError && (
              <div className="m-4 flex items-start gap-3 rounded-xl border border-foreground/12 bg-foreground/[0.03] px-4 py-4">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">Couldn&apos;t prepare a forwarding address</p>
                  <button
                    type="button"
                    onClick={onRetryOrg}
                    className="mt-2 text-[12.5px] font-semibold text-foreground underline underline-offset-2 hover:text-foreground/70"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {!orgLoading && orgReady && (
              <EmailForwardingSetupPanel
                isConnected={Boolean(forwardingIntegration)}
                email={forwardingEmail}
                setEmail={value => update({ forwardingEmail: value })}
                loading={emailSaving}
                onSave={() => onSaveForwarding(forwardingEmail)}
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-foreground/35">
        <Clock3 className="size-3.5" />
        Add Instagram and other channels from Integrations after setup
      </div>
    </div>
  );
}

function ChannelCard({
  name,
  logo,
  description,
  connected,
  actionLabel,
  onConnect,
  pending,
}: {
  name: string;
  logo: string;
  description: string;
  connected: boolean;
  actionLabel: string;
  onConnect: () => void;
  pending: boolean;
}) {
  return (
    <div className={cn(
      "flex min-h-40 flex-col rounded-xl border bg-card p-4",
      connected ? "border-foreground/25" : "border-foreground/10",
    )}>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center overflow-hidden rounded-lg bg-[#ffffff] ring-1 ring-foreground/10">
          <Image src={logo} alt="" width={28} height={28} className="size-7 object-contain" />
        </span>
        <div className="text-[15px] font-semibold text-foreground">{name}</div>
        {connected && <Check className="ml-auto size-4 text-foreground" />}
      </div>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-foreground/55">{description}</p>
      <button
        type="button"
        onClick={onConnect}
        disabled={pending}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : connected ? `Reconnect ${name}` : actionLabel}
      </button>
    </div>
  );
}
