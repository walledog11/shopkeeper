import { Check, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Accent, Headline, Lede } from "./primitives";
import { PracticeDraft } from "./practice-draft";
import type { KbSyncViewModel, StepId } from "../_lib/onboarding-model";

export function StepPlan({ hasCustomerChannel, hasEmail, hasForwarding, hasInstagram, hasMessaging, hasShopify, hasStorefrontChat, storeDomain, kbSync, onNavigate, saving }: {
  hasCustomerChannel: boolean; hasEmail: boolean; hasForwarding: boolean; hasInstagram: boolean; hasMessaging: boolean; hasShopify: boolean; hasStorefrontChat: boolean;
  storeDomain?: string; kbSync: KbSyncViewModel; onNavigate: (step: StepId) => void; saving: boolean;
}) {
  const channels = [hasEmail && "Gmail connected", hasForwarding && "Forwarding address saved", hasInstagram && "Instagram connected", hasStorefrontChat && "Storefront chat enabled"].filter(Boolean).join(" · ");
  return <div className="flex flex-col items-center">
    <Headline>{hasShopify ? <>See your shopkeeper at work.<Accent>You keep the final say.</Accent></> : "Let’s connect your store first."}</Headline>
    <Lede>{hasShopify ? "Try a customer question using your store’s knowledge. Read the source, edit the draft, and practice giving the go-ahead." : "Your Shopify connection is missing. Connect it to use your policies and finish setting up your workspace."}</Lede>
    <div className="mt-7 w-full max-w-[520px] text-left">
      <PracticeDraft enabled={hasShopify} syncing={kbSync.status === "pending"} onRetrySync={kbSync.status === "failed" && kbSync.canRetry ? kbSync.retry : undefined} />
    </div>
    <div className="mt-5 w-full max-w-[520px] space-y-2.5 text-left">
      <SetupRow icon={ShieldCheck} label="Your store" value={hasShopify ? storeDomain || "Shopify connected" : "Not connected"} ready={hasShopify} onEdit={() => onNavigate("shopify")} disabled={saving} />
      <SetupRow icon={Mail} label="Customer messages" value={channels || "No channel connected yet"} ready={hasCustomerChannel} onEdit={() => onNavigate("email")} disabled={saving} />
      <SetupRow icon={Smartphone} label="Your approvals" value={hasMessaging ? "iMessage and dashboard" : "In the dashboard"} ready onEdit={() => onNavigate("connect")} disabled={saving} />
    </div>
    <p className="mt-5 max-w-[520px] text-center text-[12.5px] leading-relaxed text-foreground/45">You’ll start in approval mode. You review customer replies and store changes before they happen.</p>
    {!hasCustomerChannel && <p className="mt-3 max-w-[520px] text-center text-[12.5px] leading-relaxed text-foreground/45">You can finish setting up your workspace now. Connect a customer channel before expecting messages.</p>}
    {hasForwarding && <p className="mt-3 max-w-[520px] text-center text-[12.5px] leading-relaxed text-foreground/45">Forwarding still needs to be configured in your email provider and checked with a test message.</p>}
    {hasShopify && <p className="mt-3 max-w-[520px] text-center text-[12.5px] leading-relaxed text-foreground/45">The practice draft is optional. You can finish setup whenever you’re ready.</p>}
  </div>;
}

function SetupRow({ icon: Icon, label, value, ready, onEdit, disabled }: { icon: typeof Mail; label: string; value: string; ready: boolean; onEdit: () => void; disabled: boolean }) {
  return <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-card px-4 py-3">
    <Icon className="size-4 shrink-0 text-foreground/45" />
    <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold text-foreground">{label}</div><p className="break-words text-[12px] text-foreground/50">{value}</p></div>
    {ready && <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>}
    <button className="rounded text-[12px] text-foreground/55 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" onClick={onEdit} disabled={disabled} aria-label={`Edit ${label.toLowerCase()}`}>Edit</button>
  </div>;
}
