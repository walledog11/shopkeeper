"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import useSWR from "swr";
import { Check, ChevronRight, Loader2, Mail, ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import { fetcher } from "@/lib/api/fetcher";
import { getEmailProvider } from "@/lib/messaging/email/providers";
import OnboardingShell from "../_components/OnboardingShell";

const RETURN_TO = "/connect";
const INPUT_CLASS = "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-green-400/40 focus-visible:border-green-400/40";

type ChannelId = "email" | "instagram" | "shopify";

type IntegrationRow = {
  platform: string;
  externalAccountId: string;
  fromEmail: string | null;
  metadata?: unknown;
  lastActivity?: string | null;
};

const PLATFORM_TO_CHANNEL: Record<string, ChannelId> = {
  email: "email",
  ig_dm: "instagram",
  shopify: "shopify",
};

function isInboundCapable(row: IntegrationRow): boolean {
  if (row.platform === "ig_dm") return true;
  if (row.platform === "email") return getEmailProvider(row) === "postmark";
  return false;
}

function describeTestTarget(row: IntegrationRow): { channel: string; target: string; instructions: string } {
  if (row.platform === "ig_dm") {
    const handle = row.externalAccountId.startsWith("@") ? row.externalAccountId : `@${row.externalAccountId}`;
    return {
      channel: "Instagram",
      target: row.fromEmail || handle,
      instructions: "DM your Instagram account from another account to confirm messages route in.",
    };
  }
  return {
    channel: "Email",
    target: row.externalAccountId,
    instructions: "Send an email to your support address from another inbox to confirm messages route in.",
  };
}

// ── Inline connect forms ───────────────────────────────────────────────────────

function EmailConnect() {
  const returnTo = encodeURIComponent(RETURN_TO);
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <p className="text-xs text-white/55">
        Connect your support inbox via OAuth. Replies will go out from your real address.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`/api/integrations/gmail/auth?returnTo=${returnTo}`}
          className="flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.06] border border-white/10 hover:bg-white/[0.10] text-sm font-semibold text-white transition-colors"
        >
          <Image src="/logos/gmail.png" alt="" width={16} height={16} className="object-contain" />
          Gmail
        </a>
        <a
          href={`/api/integrations/outlook/auth?returnTo=${returnTo}`}
          className="flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.06] border border-white/10 hover:bg-white/[0.10] text-sm font-semibold text-white transition-colors"
        >
          <Mail className="w-4 h-4 text-white/70" />
          Outlook
        </a>
      </div>
    </div>
  );
}

function ShopifyForm() {
  const [shop,    setShop]    = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    if (!shop.trim()) return;
    setLoading(true);
    window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(shop.trim())}&returnTo=${encodeURIComponent(RETURN_TO)}`;
  }

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <p className="text-xs text-white/55">
        Enter your myshopify.com domain, e.g. <span className="font-mono text-white/75">mystore.myshopify.com</span>
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="mystore.myshopify.com"
          value={shop}
          onChange={e => setShop(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
          className={cn("text-sm h-9", INPUT_CLASS)}
          autoFocus
        />
        <Button
          size="sm"
          disabled={!shop.trim() || loading}
          onClick={handleSubmit}
          className="shrink-0 h-9 bg-[#96BF48] hover:bg-[#7da33a] text-white font-semibold border-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
        </Button>
      </div>
    </div>
  );
}

// ── Channel card ───────────────────────────────────────────────────────────────

interface ChannelCardProps {
  id: ChannelId;
  logo: string;
  name: string;
  description: string;
  connected: boolean;
  expanded: boolean;
  onExpand: () => void;
}

function ChannelCard({ id, logo, name, description, connected, expanded, onExpand }: ChannelCardProps) {
  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200 overflow-hidden",
      connected
        ? "border-green-400/40 bg-green-400/[0.06] ring-1 ring-green-400/20"
        : expanded
          ? "border-white/20 bg-white/[0.05]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
    )}>
      <div className="flex items-center gap-3 p-4">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center p-2 shrink-0 border",
          connected ? "bg-green-400/10 border-green-400/30" : "bg-white/[0.04] border-white/10"
        )}>
          <Image src={logo} alt={name} width={26} height={26} className="object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-white/55 leading-snug mt-0.5">{description}</p>
        </div>

        {connected ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-200 bg-green-400/15 border border-green-400/30 rounded-full px-2.5 py-1 shrink-0">
            <Check className="w-3 h-3" /> Connected
          </span>
        ) : (
          <button
            onClick={onExpand}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
              expanded
                ? "text-white/60 border-white/10 bg-white/[0.04]"
                : id === "shopify"
                  ? "text-white bg-[#96BF48] border-[#96BF48] hover:bg-[#7da33a]"
                  : "text-white bg-white/[0.08] border-white/15 hover:bg-white/[0.14]"
            )}
          >
            {expanded ? "Cancel" : <><span>Connect</span><ChevronRight className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>

      {!connected && expanded && (
        <div className="px-4 pb-4">
          {id === "email" && <EmailConnect />}
          {id === "instagram" && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-white/55 mb-3">
                Connect your Instagram Business account to manage Direct Messages as support tickets.
              </p>
              <a href={`/api/integrations/instagram/auth?returnTo=${encodeURIComponent(RETURN_TO)}`}>
                <Button size="sm" className="h-9 bg-white text-slate-900 hover:bg-white/90 font-semibold gap-1.5">
                  Connect via Facebook <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
          )}
          {id === "shopify" && <ShopifyForm />}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const CHANNELS: Array<{ id: ChannelId; logo: string; name: string; description: string }> = [
  { id: "email",     logo: "/logos/gmail.png",             name: "Gmail / Email", description: "Route your support inbox directly into Clerk." },
  { id: "instagram", logo: "/logos/instagram-logo.png",    name: "Instagram",     description: "Manage Direct Messages from your Instagram business account." },
  { id: "shopify",   logo: "/logos/shopify.svg",           name: "Shopify",       description: "Sync customer orders and messages directly into Clerk." },
];

export default function ConnectPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<ChannelId | null>(null);

  const rows = (useSWR<IntegrationRow[]>("/api/integrations", fetcher, { refreshInterval: 5000 }).data) ?? [];

  const connectedSet = new Set<ChannelId>(
    rows.map(r => PLATFORM_TO_CHANNEL[r.platform]).filter((c): c is ChannelId => !!c)
  );
  const hasAny = connectedSet.size > 0;

  const inboundCapableRows = rows.filter(isInboundCapable);
  const inboundLanded = inboundCapableRows.some(r => !!r.lastActivity);
  const waitingForInbound = hasAny && inboundCapableRows.length > 0 && !inboundLanded;
  const canContinue = hasAny && !waitingForInbound;

  return (
    <OnboardingShell
      step={3}
      title="Connect your first channel."
      subtitle="This is where your customer messages come from. Connect at least one to start receiving tickets."
    >
      <div className="w-full max-w-lg space-y-3">
        {CHANNELS.map(ch => {
          const connected = connectedSet.has(ch.id);
          return (
            <ChannelCard
              key={ch.id}
              {...ch}
              connected={connected}
              expanded={expanded === ch.id}
              onExpand={() => setExpanded(expanded === ch.id ? null : ch.id)}
            />
          );
        })}
      </div>

      {waitingForInbound && (
        <div className="w-full max-w-lg mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-white/55 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Send a test message</p>
              <p className="text-xs text-white/55 mt-0.5 leading-snug">
                We&apos;re listening for your first inbound. This proves the connection works before you move on.
              </p>
              <div className="mt-3 space-y-2">
                {inboundCapableRows.map(row => {
                  const t = describeTestTarget(row);
                  return (
                    <div key={`${row.platform}:${row.externalAccountId}`} className="rounded-md bg-black/30 border border-white/[0.07] px-3 py-2">
                      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{t.channel}</p>
                      <p className="text-xs font-mono text-white/75 truncate mt-0.5">{t.target}</p>
                      <p className="text-[11px] text-white/40 leading-relaxed mt-1">{t.instructions}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasAny && !waitingForInbound && inboundCapableRows.length > 0 && (
        <div className="w-full max-w-lg mt-5 rounded-xl border border-green-400/30 bg-green-400/[0.06] p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-400/15 border border-green-400/40 flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4 text-green-300" />
          </div>
          <p className="text-sm font-semibold text-white">First message received — you&apos;re live.</p>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          onClick={() => router.push("/dashboard")}
          disabled={!canContinue}
          className={cn(
            "h-11 px-8 rounded-full text-sm font-bold transition-all gap-2",
            canContinue
              ? "bg-green-400 text-green-950 hover:bg-green-300 shadow-[0_8px_24px_-8px_rgba(74,222,128,0.6)]"
              : "bg-white/[0.05] text-white/35 border border-white/10 cursor-not-allowed"
          )}
        >
          Continue to dashboard <ArrowRight className="w-4 h-4" />
        </Button>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xs text-white/45 hover:text-white/70 transition-colors underline underline-offset-4"
        >
          Skip for now — connect channels later in Settings
        </button>
      </div>
    </OnboardingShell>
  );
}
