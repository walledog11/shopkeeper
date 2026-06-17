import { useState } from "react";
import { Check, ChevronRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import { BigTitle, Kicker, Lede } from "./primitives";
import { RETURN_TO, type IntegrationRow, type OnboardingData } from "./model";

export function StepShopify({ data, connected, shopifyRow, onOAuth }: {
  data: OnboardingData; connected: boolean; shopifyRow: IntegrationRow | undefined; onOAuth: (url: string) => void;
}) {
  const [shop, setShop] = useState("");
  const suggestion = (data.storeName || "your-store").toLowerCase().replace(/\s+/g, "");

  function launch() {
    const trimmed = shop.trim();
    if (!trimmed) return;
    onOAuth(`/api/integrations/shopify/auth?shop=${encodeURIComponent(trimmed)}&returnTo=${encodeURIComponent(RETURN_TO)}`);
  }

  return (
    <div>
      <Kicker step={3} label="PLUG ME IN" />
      <BigTitle>Now plug me into Shopify.</BigTitle>
      <Lede>
        This is what makes me useful. Without it I can answer general questions; with it I can actually <i>do</i> things.
      </Lede>

      <div className={cn(
        "mt-7 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5",
        connected ? "border-l-[3px] border-l-green-400" : "border-l-[3px] border-l-green-400/40"
      )}>
        <div className="flex items-center gap-3.5">
          <div className={cn(
            "inline-flex size-[52px] shrink-0 items-center justify-center rounded-xl text-[26px] font-bold",
            connected ? "bg-green-400/15 text-green-400" : "bg-white/[0.06] text-white/55"
          )}>
            {connected ? <Check className="size-7" /> : <ShoppingBag className="size-7" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold text-white">{connected ? "Connected to Shopify" : "Shopify"}</span>
              {connected && (
                <span className="rounded-sm bg-green-400/15 px-1.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-green-400">LIVE</span>
              )}
            </div>
            <div className="mt-0.5 truncate font-mono text-[12.5px] text-white/45">
              {connected ? shopifyRow?.externalAccountId ?? "store.myshopify.com" : "OAuth · read + selective write"}
            </div>
          </div>
        </div>

        {!connected && (
          <div className="mt-4 flex gap-2">
            <Input
              autoFocus
              value={shop}
              onChange={e => setShop(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); launch(); } }}
              placeholder={`${suggestion}.myshopify.com`}
              className="h-10 border-white/10 bg-white/[0.04] font-mono text-[13px] text-white placeholder:text-white/30 focus-visible:border-green-400/40 focus-visible:ring-green-400/30"
            />
            <Button
              onClick={launch}
              disabled={!shop.trim()}
              className="h-10 shrink-0 gap-1 bg-green-400 px-4 text-[13px] font-semibold text-green-950 hover:bg-green-300"
            >
              Connect Shopify <ChevronRight className="size-4" />
            </Button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-dashed border-white/[0.07] pt-4 md:grid-cols-2">
          <AccessRow kind="read"   label="Orders"               hint="lookups, status, items"  on={connected} />
          <AccessRow kind="read"   label="Customers"            hint="profiles, history, LTV"  on={connected} />
          <AccessRow kind="read"   label="Products"             hint="specs, inventory, pricing" on={connected} />
          <AccessRow kind="action" label="Refunds & exchanges"  hint="within your cap"         on={connected} />
          <AccessRow kind="action" label="Address updates"      hint="before fulfillment"       on={connected} />
          <AccessRow kind="action" label="Cancel orders"        hint="always asks first"        on={connected} />
        </div>
      </div>
    </div>
  );
}

function AccessRow({ kind, label, hint, on }: { kind: "read" | "action"; label: string; hint: string; on: boolean }) {
  const badgeTone = kind === "read" ? "text-slate-300 bg-slate-300/15" : "text-amber-300 bg-amber-300/15";
  const badgeText = kind === "read" ? "READ" : "ACTION";
  return (
    <div className={cn("flex items-center gap-2.5 py-1.5 transition-opacity", on ? "opacity-100" : "opacity-60")}>
      <span className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded text-xs font-bold",
        on ? "bg-green-400/15 text-green-400" : "bg-white/[0.06] text-white/45"
      )}>
        {on ? "✓" : "·"}
      </span>
      <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider", badgeTone)}>{badgeText}</span>
      <span className="text-[12.5px] font-medium text-white">{label}</span>
      <span className="text-[11.5px] text-white/45">· {hint}</span>
    </div>
  );
}
