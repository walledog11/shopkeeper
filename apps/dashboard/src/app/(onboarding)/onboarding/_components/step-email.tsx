import { useState } from "react";
import { AlertCircle, ChevronDown, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { EmailForwardingSetupPanel } from "@/components/integrations/EmailForwardingDisclosure";
import { BigTitle, Kicker, Lede } from "./primitives";
import { RETURN_TO, type OnboardingData } from "./model";

export function StepEmail({
  data,
  update,
  emailConnected,
  orgReady,
  orgLoading,
  orgError,
  onRetryOrg,
  emailSaving,
  onSaveEmail,
  onOAuth,
}: {
  data: OnboardingData;
  update: (p: Partial<OnboardingData>) => void;
  emailConnected: boolean;
  orgReady: boolean;
  orgLoading: boolean;
  orgError: boolean;
  onRetryOrg: () => void;
  emailSaving: boolean;
  onSaveEmail: () => void;
  onOAuth: (url: string) => void;
}) {
  const [oauthOpen, setOauthOpen] = useState(false);
  const returnTo = encodeURIComponent(RETURN_TO);

  return (
    <div>
      <Kicker step={4} label="SET UP EMAIL" />
      <BigTitle>Forward your support inbox to me</BigTitle>
      <Lede>
        Forwarding is the fastest way to start. I&apos;ll read incoming mail, draft replies, and send from your support address.
      </Lede>

      {orgLoading && (
        <div className="mt-7 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-10">
          <Loader2 className="size-5 animate-spin text-white/50" />
          <span className="text-sm text-white/55">Preparing your inbox address…</span>
        </div>
      )}

      {!orgLoading && orgError && (
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white">Couldn&apos;t set up your workspace yet</p>
            <p className="mt-1 text-[12.5px] leading-snug text-white/60">
              Go back and confirm your store name, then try again.
            </p>
            <button
              type="button"
              onClick={onRetryOrg}
              className="mt-3 text-[12.5px] font-semibold text-amber-300 hover:text-amber-200"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!orgLoading && orgReady && (
        <>
          <div className="mt-7 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <EmailForwardingSetupPanel
              isConnected={emailConnected}
              email={data.primaryEmail}
              setEmail={v => update({ primaryEmail: v })}
              loading={emailSaving}
              onSave={onSaveEmail}
            />
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
            Send a test email to your support address — it should appear in your inbox within a minute once forwarding is set up.
          </p>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setOauthOpen(o => !o)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/50 transition-colors hover:text-white/75"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", oauthOpen && "rotate-180")} />
              Connect Gmail or Outlook instead
            </button>
            {oauthOpen && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.07] bg-black/30 p-3.5">
                <p className="text-[11.5px] leading-snug text-white/45">
                  OAuth is optional. Forwarding is the default — use this only if you prefer direct inbox access.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onOAuth(`/api/integrations/gmail/auth?returnTo=${returnTo}`)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] text-[13px] font-semibold text-white hover:bg-white/[0.10]"
                  >
                    <Mail className="size-4 text-white/70" /> Gmail
                  </button>
                  <button
                    type="button"
                    onClick={() => onOAuth(`/api/integrations/outlook/auth?returnTo=${returnTo}`)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] text-[13px] font-semibold text-white hover:bg-white/[0.10]"
                  >
                    <Mail className="size-4 text-white/70" /> Outlook
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-6 text-center text-[11.5px] text-white/40">
        Instagram, Telegram, and more — add later in Integrations.
      </p>
    </div>
  );
}
