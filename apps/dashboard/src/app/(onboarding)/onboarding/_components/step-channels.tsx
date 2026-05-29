import { useState } from "react";
import { AtSign, Check, Mail, SkipForward } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import { BigTitle, Kicker, Lede } from "./primitives";
import { CHANNEL_META, RETURN_TO, type ChannelKey, type OnboardingData } from "./model";

export function StepChannels({ data, update, connected, onSkip, onOAuth }: {
  data: OnboardingData; update: (p: Partial<OnboardingData>) => void; connected: Set<ChannelKey>; onSkip: () => void; onOAuth: (url: string) => void;
}) {
  const count = connected.size;
  return (
    <div>
      <Kicker step={4} label="WHERE I'LL LISTEN" />
      <BigTitle>Where do customers reach you?</BigTitle>
      <Lede>Connect the channels I should watch. You can add more later , this is just to start.</Lede>

      <div className="mt-7 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {CHANNEL_META.map(c => (
          <ChannelCard key={c.key} meta={c} connected={connected.has(c.key)} onOAuth={onOAuth} />
        ))}
        <SkipCard onSkip={onSkip} />
      </div>

      {connected.has("email") && (
        <div className="mt-4 flex items-center gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
          <AtSign className="size-4 text-white/55" />
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold text-white">Your support email</div>
            <div className="mt-0.5 text-[11.5px] text-white/45">For aliases and the address customers reply to. You can change this in Settings.</div>
          </div>
          <Input
            value={data.primaryEmail}
            onChange={e => update({ primaryEmail: e.target.value })}
            placeholder="support@yourstore.co"
            className="h-9 w-60 border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus-visible:border-green-400/40 focus-visible:ring-green-400/30"
          />
        </div>
      )}

      <div className="mt-5 text-center font-mono text-[12px] text-white/45">
        Watching <b className="text-white">{count}</b> channel{count === 1 ? "" : "s"} · change any time in Settings
      </div>
    </div>
  );
}

function ChannelCard({ meta, connected, onOAuth }: { meta: typeof CHANNEL_META[number]; connected: boolean; onOAuth: (url: string) => void }) {
  const { Icon, key, label, description } = meta;
  const returnTo = encodeURIComponent(RETURN_TO);

  function connectHref(): string | null {
    if (key === "ig_dm") return `/api/integrations/instagram/auth?returnTo=${returnTo}`;
    return null; // email is a multi-provider picker; shopify is step 03
  }

  const body = (
    <div className={cn(
      "flex h-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
      connected
        ? "border-green-400/40 bg-green-400/[0.06] ring-1 ring-green-400/20"
        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
    )}>
      <span className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border",
        connected ? "border-green-400/30 bg-green-400/15 text-green-400" : "border-white/10 bg-white/[0.06] text-white/70"
      )}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-semibold text-white">{label}</span>
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-white/45">{description}</div>
      </div>
      <span className={cn(
        "inline-flex h-[22px] shrink-0 items-center justify-center rounded-md text-xs font-bold transition-all",
        connected
          ? "bg-green-400/15 px-2 text-green-400"
          : "border border-white/15 bg-white/[0.06] px-2 text-white/70"
      )}>
        {connected ? <><Check className="mr-1 size-3" /> Connected</> : "Connect"}
      </span>
    </div>
  );

  if (connected) return body;

  if (key === "email") {
    return <EmailCard body={body} onOAuth={onOAuth} />;
  }

  const href = connectHref();
  if (!href) return body;

  return (
    <button type="button" onClick={() => onOAuth(href)} className="block size-full text-left">
      {body}
    </button>
  );
}

function SkipCard({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="flex h-full items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-white/25 hover:bg-white/[0.04]"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/55">
        <SkipForward className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-semibold text-white">Skip for now</span>
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-white/45">Add channels later in Settings.</div>
      </div>
    </button>
  );
}

function EmailCard({ body, onOAuth }: { body: React.ReactNode; onOAuth: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const returnTo = encodeURIComponent(RETURN_TO);
  return (
    <div className="h-full">
      <button type="button" onClick={() => setOpen(o => !o)} className="block size-full text-left">{body}</button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-3">
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
      )}
    </div>
  );
}
