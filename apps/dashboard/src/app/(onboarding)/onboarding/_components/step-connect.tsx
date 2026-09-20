import { useEffect, useRef, useState, type ComponentType } from "react";
import { Copy, Loader2, MessageCircle, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  channelBindingError,
  channelBindingValue,
  useChannelBindingAttempt,
} from "@/hooks/useChannelBindingAttempt";
import { useOperatorChannels } from "@/hooks/useOperatorChannels";
import { buildSmsDeepLink, formatHandleLabel } from "@/lib/imessage-connect";
import {
  startImessageBinding,
  startTelegramBinding,
} from "@/lib/integrations/channel-binding-client";
import { captureClientProductEvent } from "@/lib/product-events";
import { cn } from "@/lib/ui/cn";
import { Headline, Lede } from "./primitives";

type RefreshStatus = () => unknown | Promise<unknown>;

export function StepConnect({ imessageHandle }: { imessageHandle: string | null }) {
  const { imessage, telegram, refreshImessage, refreshTelegram } = useOperatorChannels();
  const telegramAvailable = Boolean(telegram?.botUsername);
  const imessageAvailable = Boolean(imessageHandle);
  const noChannelAvailable = !imessageAvailable && !telegramAvailable && telegram !== undefined;
  const bothAvailable = imessageAvailable && telegramAvailable;

  return (
    <div className="flex flex-col items-center">
      <Headline>Link your phone.</Headline>
      <Lede>
        Approvals and morning briefings by text.
        {bothAvailable ? " Either channel works." : ""}
      </Lede>

      {noChannelAvailable ? (
        <div className="mt-6 w-full max-w-[560px] rounded-2xl border border-foreground/10 bg-foreground/[0.04] px-6 py-6 text-left text-[13px] leading-relaxed text-foreground/60">
          Messaging isn&apos;t set up on this deployment yet — you&apos;ll approve replies and read briefings
          right here in the dashboard for now.
        </div>
      ) : (
        <div className="mt-6 grid w-full max-w-[560px] grid-cols-1 gap-4 text-left">
          {imessageHandle && (
            <ImessageConnector
              handle={imessageHandle}
              onRefresh={refreshImessage}
              handles={imessage?.handles ?? []}
            />
          )}
          {telegramAvailable && (
            <TelegramConnector
              onRefresh={refreshTelegram}
              chats={telegram?.chats ?? []}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChannelShell({ icon: Icon, name, tagline, connected, children }: {
  icon: ComponentType<{ className?: string }>;
  name: string;
  tagline: string;
  connected: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "flex flex-col rounded-2xl border border-foreground/10 bg-card px-5 py-5",
      connected && "border-l-2 border-l-foreground",
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-xl",
          connected ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/60",
        )}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{name}</span>
            {connected && (
              <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                Linked
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-foreground/45">{tagline}</div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function QrFrame({ value, title }: { value: string; title: string }) {
  return (
    <div className="rounded-lg bg-[#ffffff] p-2 shadow-sm">
      <QRCodeSVG value={value} size={150} level="M" marginSize={2} title={title} />
    </div>
  );
}

function MintButton({ label, onClick, minting }: { label: string; onClick: () => void; minting: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={minting}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {minting ? <Loader2 className="size-4 animate-spin" /> : label}
    </button>
  );
}

function WaitingRow() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-foreground/45">
      <Loader2 className="size-3.5 animate-spin" /> Waiting for your text…
    </div>
  );
}

function ImessageConnector({ handle, onRefresh, handles }: {
  handle: string;
  onRefresh: RefreshStatus;
  handles: { senderId: string; displayLabel: string }[];
}) {
  const connected = handles.length > 0;
  const binding = useChannelBindingAttempt({
    connectionCount: handles.length,
    requestBinding: (signal) => {
      void captureClientProductEvent({ event: "integration_connection_started", platform: "imessage" });
      return startImessageBinding({ signal });
    },
    refreshStatus: onRefresh,
    requestFailureMessage: "Couldn't create a connect code.",
    refreshFailureMessage: "Couldn't verify the iMessage connection. Try again.",
  });
  const token = channelBindingValue(binding.state);
  const minting = binding.state.status === "requesting";
  const error = channelBindingError(binding.state);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLink = token ? buildSmsDeepLink(handle, token) : null;

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard may be unavailable — the code is still shown.
    }
  }

  return (
    <ChannelShell icon={Smartphone} name="iMessage" tagline="Text me from your iPhone" connected={connected}>
      {error && <p className="mb-2 text-[12px] text-red-600">{error}</p>}

      {connected ? (
        <p className="text-[12.5px] text-foreground/70">
          Linked to <span className="font-medium text-foreground">{formatHandleLabel(handles[handles.length - 1].displayLabel)}</span>.
        </p>
      ) : deepLink ? (
        <div className="flex flex-col items-center gap-3">
          <div className="hidden sm:block">
            <QrFrame value={deepLink} title="iMessage connect QR code" />
          </div>
          <a
            href={deepLink}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85"
          >
            <Smartphone className="size-4" /> Open Messages
          </a>
          <p className="text-center text-[12px] leading-snug text-foreground/50">
            Scan or tap, then send the prefilled message
            {handle ? (
              <> (or text the code below to <span className="font-medium text-foreground/70">{handle}</span>)</>
            ) : null}
            .
          </p>
          <div className="flex w-full items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-foreground/10 bg-foreground/[0.04] px-2.5 py-2 font-mono text-[12px] text-foreground/80">
              {token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              aria-label="Copy connect code"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-foreground/10 text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {copied ? <span className="text-[11px] font-semibold text-foreground">Copied</span> : <Copy className="size-3.5" />}
            </button>
          </div>
          <div className="w-full"><WaitingRow /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-foreground/55">
            You&apos;ll get a code to send from Messages.
          </p>
          <MintButton
            label="Link my iPhone"
            onClick={() => { void binding.start(); }}
            minting={minting}
          />
        </div>
      )}
    </ChannelShell>
  );
}

function TelegramConnector({ onRefresh, chats }: {
  onRefresh: RefreshStatus;
  chats: { chatId: string; displayLabel: string | null }[];
}) {
  const connected = chats.length > 0;
  const binding = useChannelBindingAttempt({
    connectionCount: chats.length,
    requestBinding: (signal) => {
      void captureClientProductEvent({ event: "integration_connection_started", platform: "telegram" });
      return startTelegramBinding({ signal });
    },
    refreshStatus: onRefresh,
    requestFailureMessage: "Couldn't start Telegram connect.",
    refreshFailureMessage: "Couldn't verify the Telegram connection. Try again.",
  });
  const deepLink = channelBindingValue(binding.state);
  const minting = binding.state.status === "requesting";
  const error = channelBindingError(binding.state);
  const lastLabel = connected ? chats[chats.length - 1].displayLabel : null;

  return (
    <ChannelShell icon={MessageCircle} name="Telegram" tagline="Message me from any phone" connected={connected}>
      {error && <p className="mb-2 text-[12px] text-red-600">{error}</p>}

      {connected ? (
        <p className="text-[12.5px] text-foreground/70">
          {lastLabel
            ? <>Linked to <span className="font-medium text-foreground">{lastLabel}</span>.</>
            : "Linked."}
        </p>
      ) : deepLink ? (
        <div className="flex flex-col items-center gap-3">
          <div className="hidden sm:block">
            <QrFrame value={deepLink} title="Telegram connect QR code" />
          </div>
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85"
          >
            <MessageCircle className="size-4" /> Open Telegram
          </a>
          <p className="text-center text-[12px] leading-snug text-foreground/50">
            Scan or tap, then send the prefilled message in Telegram.
          </p>
          <div className="w-full"><WaitingRow /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-foreground/55">
            You&apos;ll get a link to open in Telegram.
          </p>
          <MintButton
            label="Link Telegram"
            onClick={() => { void binding.start(); }}
            minting={minting}
          />
        </div>
      )}
    </ChannelShell>
  );
}
