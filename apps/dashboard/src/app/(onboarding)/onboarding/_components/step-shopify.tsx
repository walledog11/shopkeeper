import { useState } from "react";
import { Check, ChevronRight, FlaskConical, Loader2, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import type { Integration } from "@/types";
import { Accent, Headline, Lede } from "./primitives";
import type { KbSyncViewModel, OnboardingData } from "./model";
import type { LaunchOnboardingOAuth } from "../_hooks/useOnboardingOAuth";

export function StepShopify({
  data,
  connected,
  shopifyRow,
  kbSync,
  onOAuth,
  onSimulate,
  simulatorEnabled,
  simulating,
  oauthPending,
}: {
  data: OnboardingData;
  connected: boolean;
  shopifyRow: Integration | undefined;
  kbSync: KbSyncViewModel;
  onOAuth: LaunchOnboardingOAuth;
  onSimulate: () => Promise<boolean>;
  simulatorEnabled: boolean;
  simulating: boolean;
  oauthPending: boolean;
}) {
  const [shop, setShop] = useState("");
  const [simulatorError, setSimulatorError] = useState(false);
  const suggestion = (data.storeName || "your-store").toLowerCase().replace(/\s+/g, "");
  const simulated = isSimulated(shopifyRow?.metadata);

  function launch() {
    const trimmed = shop.trim();
    if (!trimmed) return;
    onOAuth("shopify", { shop: trimmed });
  }

  async function simulate() {
    setSimulatorError(false);
    const ok = await onSimulate();
    if (!ok) setSimulatorError(true);
  }

  return (
    <div className="flex flex-col items-center">
      <Headline>
        Connect Shopify.
        <Accent>So I can look up orders and act on them.</Accent>
      </Headline>
      <Lede>
        I use your orders, products, and policies to answer accurately. Every action still waits for your approval.
      </Lede>

      <div className={cn(
        "mt-7 w-full max-w-[520px] rounded-2xl border border-foreground/10 bg-card px-6 py-5 text-left",
        connected && "border-l-2 border-l-foreground",
      )}>
        <div className="flex items-center gap-3.5">
          <div className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-xl",
            connected ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/55",
          )}>
            {connected ? <Check className="size-6" /> : <ShoppingBag className="size-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold text-foreground">{connected ? "Connected" : "Shopify"}</span>
              {connected && (
                <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                  {simulated ? "Demo" : "Live"}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-foreground/45">
              {connected ? shopifyRow?.externalAccountId ?? "store.myshopify.com" : "Secure connection through Shopify"}
            </div>
          </div>
        </div>

        {!connected && (
          <div className="mt-5">
            <label htmlFor="shopify-store" className="mb-1.5 block text-[13px] font-semibold text-foreground">
              Shopify store URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="shopify-store"
                autoFocus
                value={shop}
                onChange={e => setShop(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); launch(); } }}
                placeholder={`${suggestion}.myshopify.com`}
                className="h-11 border-foreground/12 bg-transparent text-[14px] text-foreground placeholder:text-foreground/30 focus-visible:border-foreground/30 focus-visible:ring-foreground/15"
              />
              <Button
                onClick={launch}
                disabled={!shop.trim() || oauthPending}
                className="h-11 shrink-0 gap-1 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background hover:bg-foreground/85"
              >
                {oauthPending ? <Loader2 className="size-4 animate-spin" /> : <>Connect <ChevronRight className="size-4" /></>}
              </Button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-foreground/45">
              Find your <span className="font-medium text-foreground/60">.myshopify.com</span> address in your Shopify admin URL.
            </p>
            {simulatorEnabled && (
              <div className="mt-4 border-t border-foreground/[0.08] pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { void simulate(); }}
                    disabled={simulating || oauthPending}
                    className="h-10 gap-2 rounded-full border-foreground/15 bg-transparent px-3.5 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05]"
                  >
                    {simulating ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                    Use demo store
                  </Button>
                  <span className="text-[12px] text-foreground/45">Development only · simulated connection</span>
                </div>
                {simulatorError && (
                  <p className="mt-2 text-[12.5px] text-destructive">Couldn&apos;t connect the demo store. Try again.</p>
                )}
              </div>
            )}
          </div>
        )}

        <details className="mt-5 border-t border-foreground/[0.07] pt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-foreground/55 hover:text-foreground/75">
            What {"Shopkeeper"} can access
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
            <AccessRow label="Orders" hint="status, items, tracking" on={connected} />
            <AccessRow label="Customers" hint="profiles and history" on={connected} />
            <AccessRow label="Products" hint="details and inventory" on={connected} />
            <AccessRow label="Returns" hint="after your approval" on={connected} />
            <AccessRow label="Address updates" hint="after your approval" on={connected} />
            <AccessRow label="Refunds & cancellations" hint="after your approval" on={connected} />
          </div>
        </details>
      </div>

      {connected && kbSync.status !== "idle" && (
        <div className="mt-4 flex w-full max-w-[520px] items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3.5 text-left">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground">
            {kbSync.status === "pending" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            {kbSync.status === "pending" ? (
              <>
                <div className="text-[13px] font-semibold text-foreground">Reading your store…</div>
                <div className="mt-0.5 text-[12px] leading-snug text-foreground/55">
                  Pulling your policies and pages into memory so I can answer accurately.
                </div>
              </>
            ) : kbSync.status === "failed" ? (
              <>
                <div className="text-[13px] font-semibold text-foreground">Couldn&apos;t read your store</div>
                <div className="mt-0.5 text-[12px] leading-snug text-foreground/55">
                  Your store is still connected. {kbSync.canRetry ? "Try reading its policies and pages again." : "You can sync it later from Knowledge."}
                </div>
                {kbSync.canRetry && (
                  <Button type="button" variant="outline" size="sm" onClick={kbSync.retry} className="mt-2 h-8 rounded-full px-3 text-[12px]">
                    Try again
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="text-[13px] font-semibold text-foreground">{learnedSummary(kbSync)}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-foreground/55">
                  It&apos;s in my memory now — ask me anything about returns, shipping, or your products.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isSimulated(metadata: unknown): boolean {
  return (
    typeof metadata === "object"
    && metadata !== null
    && "simulated" in metadata
    && metadata.simulated === true
  );
}

function learnedSummary(kbSync: Extract<KbSyncViewModel, { status: "succeeded" }>): string {
  const parts: string[] = [];
  if (kbSync.policies > 0) parts.push(`${kbSync.policies} ${kbSync.policies === 1 ? "policy" : "policies"}`);
  if (kbSync.pages > 0) parts.push(`${kbSync.pages} ${kbSync.pages === 1 ? "page" : "pages"}`);
  if (parts.length === 0) return "I read through your store.";
  return `I read ${parts.join(" and ")} into memory.`;
}

function AccessRow({ label, hint, on }: { label: string; hint: string; on: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 py-1 transition-opacity", on ? "opacity-100" : "opacity-55")}>
      <span className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
        on ? "bg-foreground text-background" : "bg-foreground/[0.08] text-foreground/45",
      )}>
        {on ? "✓" : "·"}
      </span>
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <span className="text-[12px] text-foreground/45">· {hint}</span>
    </div>
  );
}
