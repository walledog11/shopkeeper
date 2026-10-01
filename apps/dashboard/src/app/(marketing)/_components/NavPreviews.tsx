import type { ReactNode } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { ChannelsOrbit } from "./BentoVisuals";
import { logos, type PreviewKind } from "./nav-config";

/* One small scene per Product menu row. The menu shows the scene for the row
   that is hovered or focused, so the panel beside the list always explains the
   item you are on. The content repeats the page's own demo (Maya, order #3102)
   and the dashboard's real labels; nothing here is a metric or a quote. The
   Integrations scene is the bento's channel orbit, shared rather than redrawn. */

type Tone = "green" | "white" | "grey" | "ink";
type Side = "mine" | "theirs";

function Bubble({ tone, side, children }: { tone: Tone; side: Side; children: ReactNode }) {
  return <p className={`m-nav-pv-bubble is-${tone} is-${side}`}>{children}</p>;
}

const logoSize = { 12: "size-3", 14: "size-3.5" } as const;

function Logo({ src, size }: { src: string; size: keyof typeof logoSize }) {
  return <Image src={src} alt="" width={size} height={size} className={`shrink-0 object-contain ${logoSize[size]}`} />;
}

function TextScene() {
  return (
    <div className="m-nav-pv">
      <Bubble tone="green" side="mine">Put the store on sale until Sunday.</Bubble>
      <Bubble tone="white" side="theirs">Done — 15% off the whole store through Sunday night.</Bubble>
      <Bubble tone="green" side="mine">How many sand linen jumpsuits do we have in Small?</Bubble>
      <Bubble tone="white" side="theirs">Twelve in Small / Sand.</Bubble>
    </div>
  );
}

function SupportScene() {
  return (
    <div className="m-nav-pv">
      <div className="m-nav-pv-who">
        <span className="m-nav-pv-avatar">MC</span>
        Maya Chen
        <Logo src={logos.instagram} size={14} />
      </div>
      <Bubble tone="grey" side="theirs">hey! I ordered the linen jumpsuit in M but need S. Can you switch it before it ships?</Bubble>
      <div className="m-nav-pv-card">
        <p className="m-nav-pv-card-title">
          <Logo src={logos.shopify} size={12} />
          Order #3102 · Paid · Unfulfilled
        </p>
        <p className="m-nav-pv-card-sub">Small / Sand · 12 in stock</p>
      </div>
      <Bubble tone="ink" side="mine">Done — your jumpsuit is now Small / Sand.</Bubble>
    </div>
  );
}

function ApprovalsScene() {
  return (
    <div className="m-nav-pv">
      <span className="m-nav-pv-label">Trust level</span>
      <div className="m-nav-pv-seg">
        <span>Draft only</span>
        <span className="is-on">Ask first</span>
        <span>Trusted</span>
      </div>
      <p className="m-nav-pv-note">Routine replies go out. Changes, money, and exceptions wait for you.</p>
      <div className="m-nav-pv-card">
        <p className="m-nav-pv-card-title">Maya wants a Small</p>
        <p className="m-nav-pv-card-sub">Same price, and it’s in stock.</p>
        <span className="m-nav-pv-approve">
          <Check className="size-3" strokeWidth={2.5} aria-hidden />
          Approve
        </span>
      </div>
    </div>
  );
}

const scenes: Record<PreviewKind, () => ReactNode> = {
  text: TextScene,
  support: SupportScene,
  approvals: ApprovalsScene,
  integrations: ChannelsOrbit,
};

export function NavPreview({ kind }: { kind: PreviewKind }) {
  const Scene = scenes[kind];
  return <Scene />;
}
