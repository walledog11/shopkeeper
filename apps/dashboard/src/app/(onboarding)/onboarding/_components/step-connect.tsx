import { useEffect, useReducer, useRef, type ComponentType } from "react";
import useSWR from "swr";
import { Check, Copy, ExternalLink, Loader2, Send, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { fetcher } from "@/lib/api/fetcher";
import { captureClientProductEvent } from "@/lib/product-events";
import { cn } from "@/lib/ui/cn";
import { Accent, Headline, Lede } from "./primitives";

interface TelegramStatus {
  connected: boolean;
  chats: { chatId: string; displayLabel: string | null }[];
}

interface ImessageStatus {
  connected: boolean;
  handles: { senderId: string; displayLabel: string }[];
}

// The line is a phone number, so an `sms:` deep link pre-fills both recipient and
// connect code; scanned with the iPhone camera, Messages opens ready to send.
// Body uses `&` (not `?`) per iOS.
function buildSmsDeepLink(handle: string, token: string): string {
  const number = handle.replace(/[^\d+]/g, "");
  return `sms:${number}&body=${encodeURIComponent(token)}`;
}

function formatHandleLabel(label: string): string {
  if (/[^\d\s()+\-.]/.test(label)) return label;
  const digits = label.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1);
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return label;
}

export function StepConnect({ telegramBotUsername, imessageHandle }: {
  telegramBotUsername: string | null;
  imessageHandle: string | null;
}) {
  const imessageAvailable = Boolean(imessageHandle);
  const telegramAvailable = Boolean(telegramBotUsername);

  const { data: telegramStatus } = useSWR<TelegramStatus>("/api/integrations/telegram", fetcher);
  const { data: imessageStatus } = useSWR<ImessageStatus>("/api/integrations/imessage/bind", fetcher);
  const anyConnected = Boolean(telegramStatus?.connected || imessageStatus?.connected);

  return (
    <div className="flex flex-col items-center">
      <Headline>
        Put me in your pocket.
        <Accent>Approvals and your morning briefing, by text.</Accent>
      </Headline>
      <Lede>
        Choose one place for approvals, questions, and your morning briefing. You can add the other later.
      </Lede>

      {!imessageAvailable && !telegramAvailable ? (
        <div className="mt-6 w-full max-w-[560px] rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-6 text-left text-[13px] leading-relaxed text-white/60">
          Messaging isn&apos;t set up on this deployment yet — you&apos;ll approve replies and read briefings
          right here in the dashboard for now.
        </div>
      ) : (
        <div className="mt-6 grid w-full max-w-[560px] grid-cols-1 gap-4 text-left md:grid-cols-2">
          {imessageAvailable && <ImessageConnector handle={imessageHandle as string} />}
          {telegramAvailable && <TelegramConnector />}
        </div>
      )}

      <div className="mt-5 flex w-full max-w-[560px] items-center gap-2.5 border-t border-dashed border-white/[0.07] pt-4 text-left text-[12px] leading-snug text-white/45">
        {anyConnected ? (
          <>
            <span className="inline-flex size-4 items-center justify-center rounded bg-foreground/[0.08] text-foreground">
              <Check className="size-3" />
            </span>
            You&apos;re reachable. I&apos;ll send your first briefing tomorrow morning.
          </>
        ) : (
          <>Prefer to set this up later? You can keep going — but until you link a phone, I can only reach you here in the dashboard.</>
        )}
      </div>
    </div>
  );
}

interface ConnectorState {
  connectValue: string | null; // iMessage token or Telegram deep-link URL
  minting: boolean;
  copied: boolean;
  error: string | null;
}

const INITIAL_CONNECTOR_STATE: ConnectorState = {
  connectValue: null,
  minting: false,
  copied: false,
  error: null,
};

function mergeState(state: ConnectorState, patch: Partial<ConnectorState>): ConnectorState {
  return { ...state, ...patch };
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
            <span className="text-[15px] font-semibold text-white">{name}</span>
            {connected && (
              <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                Linked
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-white/45">{tagline}</div>
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
    <div className="flex items-center gap-2 text-[12px] text-white/45">
      <Loader2 className="size-3.5 animate-spin" /> Waiting for your text…
    </div>
  );
}

function ImessageConnector({ handle }: { handle: string }) {
  const { data, mutate } = useSWR<ImessageStatus>("/api/integrations/imessage/bind", fetcher);
  const [{ connectValue: token, minting, copied, error }, update] = useReducer(mergeState, INITIAL_CONNECTOR_STATE);
  const handleCountAtMint = useRef(0);

  const handles = data?.handles ?? [];
  const connected = handles.length > 0;
  const deepLink = token ? buildSmsDeepLink(handle, token) : null;

  // Poll while a code is showing so the freshly linked handle appears.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => { void mutate(); }, 3500);
    return () => clearInterval(id);
  }, [token, mutate]);

  // Once the texted code lands, the handle list grows — clear the code.
  useEffect(() => {
    if (!token || handles.length <= handleCountAtMint.current) return;
    update({ connectValue: null });
  }, [token, handles.length]);

  async function mint() {
    update({ minting: true, error: null });
    try {
      void captureClientProductEvent({ event: "integration_connection_started", platform: "imessage" });
      const res = await fetch("/api/integrations/imessage/bind", { method: "POST" });
      const body = await res.json() as { token?: string; error?: string };
      if (!res.ok || !body.token) throw new Error(body.error || "Couldn't create a connect code");
      handleCountAtMint.current = handles.length;
      update({ connectValue: body.token });
    } catch (e) {
      update({ error: e instanceof Error ? e.message : "Couldn't create a connect code" });
    } finally {
      update({ minting: false });
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      update({ copied: true });
      setTimeout(() => update({ copied: false }), 2000);
    } catch {
      // Clipboard may be unavailable — the code is still shown.
    }
  }

  return (
    <ChannelShell icon={Smartphone} name="iMessage" tagline="Text me from your iPhone" connected={connected}>
      {error && <p className="mb-2 text-[12px] text-red-400">{error}</p>}

      {connected ? (
        <p className="text-[12.5px] text-white/70">
          Linked to <span className="font-medium text-white">{formatHandleLabel(handles[handles.length - 1].displayLabel)}</span>.
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
          <p className="text-center text-[12px] leading-snug text-white/50">
            <span className="hidden sm:inline">On another device, scan the code. </span>
            Messages opens with your private connection code ready to send.
          </p>
          <div className="flex w-full items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 font-mono text-[12px] text-white/80">
              {token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              aria-label="Copy connect code"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {copied ? <Check className="size-3.5 text-foreground" /> : <Copy className="size-3.5" />}
            </button>
          </div>
          <p className="w-full text-[12px] leading-snug text-white/50">
            Or text this code to <span className="font-medium text-white/70">{handle}</span>.
          </p>
          <div className="w-full"><WaitingRow /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="list-inside list-decimal space-y-1 text-[12.5px] leading-relaxed text-white/55">
            <li>Create a private connection code</li>
            <li>Open Messages or scan the code from another device</li>
            <li>Send the prefilled message</li>
          </ol>
          <MintButton label="Link my iPhone" onClick={mint} minting={minting} />
        </div>
      )}
    </ChannelShell>
  );
}

function TelegramConnector() {
  const { data, mutate } = useSWR<TelegramStatus>("/api/integrations/telegram", fetcher);
  const [{ connectValue: url, minting, error }, update] = useReducer(mergeState, INITIAL_CONNECTOR_STATE);
  const chatCountAtMint = useRef(0);

  const chats = data?.chats ?? [];
  const connected = chats.length > 0;

  useEffect(() => {
    if (!url) return;
    const id = setInterval(() => { void mutate(); }, 3500);
    return () => clearInterval(id);
  }, [url, mutate]);

  useEffect(() => {
    if (!url || chats.length <= chatCountAtMint.current) return;
    update({ connectValue: null });
  }, [url, chats.length]);

  async function mint() {
    update({ minting: true, error: null });
    try {
      const res = await fetch("/api/integrations/telegram", { method: "POST" });
      const body = await res.json() as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't start Telegram connect");
      chatCountAtMint.current = chats.length;
      update({ connectValue: body.url });
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      update({ error: e instanceof Error ? e.message : "Couldn't start Telegram connect" });
    } finally {
      update({ minting: false });
    }
  }

  return (
    <ChannelShell icon={Send} name="Telegram" tagline="Approve and chat from anywhere" connected={connected}>
      {error && <p className="mb-2 text-[12px] text-red-400">{error}</p>}

      {connected ? (
        <p className="text-[12.5px] text-white/70">
          Linked{chats[chats.length - 1].displayLabel ? <> to <span className="font-medium text-white">{chats[chats.length - 1].displayLabel}</span></> : ""}.
        </p>
      ) : url ? (
        <div className="flex flex-col items-center gap-3">
          <QrFrame value={url} title="Telegram connect QR code" />
          <p className="text-center text-[11.5px] leading-snug text-white/45">
            Scan with your phone, or open Telegram and tap Start.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.10]"
          >
            <ExternalLink className="size-4" /> Open Telegram
          </a>
          <div className="w-full"><WaitingRow /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="list-inside list-decimal space-y-1 text-[12.5px] leading-relaxed text-white/55">
            <li>Tap the button below — opens the Shopkeeper bot</li>
            <li>Tap Start in Telegram to link this device</li>
            <li>Approve replies and get updates from there</li>
          </ol>
          <MintButton label="Link Telegram" onClick={mint} minting={minting} />
        </div>
      )}
    </ChannelShell>
  );
}
