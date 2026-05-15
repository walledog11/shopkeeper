"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, ChevronRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import OnboardingShell from "../_components/OnboardingShell";

const NEXT_STEP = "/plan";

type ChannelId = "email" | "instagram" | "shopify";

// ── Inline connect forms ───────────────────────────────────────────────────────

function EmailConnect() {
  const returnTo = encodeURIComponent(NEXT_STEP);
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <p className="text-xs text-slate-500">
        Connect your support inbox via OAuth. Replies will go out from your real address.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`/api/integrations/gmail/auth?returnTo=${returnTo}`}
          className="flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-sm font-semibold text-slate-800 transition-colors"
        >
          <Image src="/logos/gmail.png" alt="" width={16} height={16} className="object-contain" />
          Gmail
        </a>
        <a
          href={`/api/integrations/outlook/auth?returnTo=${returnTo}`}
          className="flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-sm font-semibold text-slate-800 transition-colors"
        >
          <Mail className="w-4 h-4 text-slate-600" />
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
    window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(shop.trim())}&returnTo=${encodeURIComponent(NEXT_STEP)}`;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <p className="text-xs text-slate-500">
        Enter your myshopify.com domain, e.g. <span className="font-mono">mystore.myshopify.com</span>
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="mystore.myshopify.com"
          value={shop}
          onChange={e => setShop(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
          className="text-sm bg-white h-9"
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
        ? "border-green-200 bg-green-50/50 shadow-sm"
        : expanded
          ? "border-slate-300 bg-white shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
    )}>
      <div className="flex items-center gap-3 p-4">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center p-2 shrink-0 border",
          connected ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
        )}>
          <Image src={logo} alt={name} width={26} height={26} className="object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{name}</p>
          <p className="text-xs text-slate-500 leading-snug mt-0.5">{description}</p>
        </div>

        {connected ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-2.5 py-1 shrink-0">
            <Check className="w-3 h-3" /> Connected
          </span>
        ) : (
          <button
            onClick={onExpand}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
              expanded
                ? "text-slate-500 border-slate-200 bg-slate-50"
                : id === "shopify"
                  ? "text-white bg-[#96BF48] border-[#96BF48] hover:bg-[#7da33a]"
                  : "text-slate-800 bg-white border-slate-200 hover:bg-slate-50"
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
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-500 mb-3">
                Connect your Instagram Business account to manage DMs as support tickets.
              </p>
              <a href={`/api/integrations/instagram/auth?returnTo=${encodeURIComponent(NEXT_STEP)}`}>
                <Button size="sm" className="h-9 bg-slate-900 hover:bg-slate-700 text-white font-semibold gap-1.5">
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

  return (
    <OnboardingShell
      step={2}
      title="Connect your first channel."
      subtitle="This is where your customer messages come from. Connect at least one to start receiving tickets."
    >
      <div className="w-full max-w-lg space-y-3">
        {CHANNELS.map(ch => (
          <ChannelCard
            key={ch.id}
            {...ch}
            connected={false}
            expanded={expanded === ch.id}
            onExpand={() => setExpanded(expanded === ch.id ? null : ch.id)}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          onClick={() => router.push(NEXT_STEP)}
          className="h-11 px-8 rounded-full text-sm font-bold transition-all gap-2 bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          <Mail className="w-4 h-4" /> Skip for now
        </Button>
        <p className="text-xs text-slate-400">You can always connect channels later in Settings.</p>
      </div>
    </OnboardingShell>
  );
}
