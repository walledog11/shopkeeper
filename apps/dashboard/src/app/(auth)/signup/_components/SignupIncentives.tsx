import { Inbox, MessageSquare, ShoppingBag, Smartphone } from "lucide-react";

const signupFeatures = [
  {
    icon: Inbox,
    label: "Unified inbox",
    detail: "IG, email & SMS in one place",
  },
  {
    icon: MessageSquare,
    label: "AI drafts every reply",
    detail: "Learns your tone, you approve",
  },
  {
    icon: ShoppingBag,
    label: "Shopify built in",
    detail: "Orders, refunds & tracking",
  },
  {
    icon: Smartphone,
    label: "Approve from Telegram",
    detail: "One tap from your phone",
  },
] as const;

export function SignupIncentives() {
  return (
    <ul className="space-y-4">
      {signupFeatures.map((feature) => (
        <li key={feature.label} className="flex items-center gap-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#2f7a4a]/15 bg-[#2f7a4a]/10 text-[#2f7a4a]">
            <feature.icon className="size-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-[#2b2118]">{feature.label}</p>
            <p className="mt-0.5 text-sm leading-snug text-stone-600">{feature.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
