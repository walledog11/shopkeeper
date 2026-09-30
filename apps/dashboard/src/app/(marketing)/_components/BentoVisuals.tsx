"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Clock, MessageCircle, PackageCheck, Settings, Shirt, Sparkles, Store, X } from "lucide-react";

/* Card visuals for the landing bento, built as live components so the copy can
   be edited in place. All of the content is placeholder: Linen & Loom is the
   demo store, and every number and quote here is illustrative. */

/** True once the element has scrolled into view; the CSS sequences key off it. */
function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, seen] as const;
}

function delay(seconds: number) {
  return { "--d": `${seconds}s` } as CSSProperties;
}

function ShopifyChip({ children }: { children: string }) {
  return (
    <span className="m-bv-chip">
      <Image src="/logos/shopify.svg" alt="" width={11} height={12} className="h-3 w-auto" />
      {children}
    </span>
  );
}

/** "AI Agent trained on your brand": a store instruction next to a test chat. */
export function GuidanceVisual() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-guidance${seen ? " is-playing" : ""}`}>
      <div className="m-bv-win m-bv-guide m-bv-step" style={delay(0)}>
        <div className="m-bv-win-head">
          <span className="m-bv-win-title">Guidance</span>
          <span className="m-bv-pill">Test</span>
          <X className="size-3.5 text-[color:var(--m-ink-3)]" />
        </div>
        <p className="m-bv-rule">When a customer asks to edit the shipping address</p>
        <p className="m-bv-note">Check order status before responding</p>
        <p className="m-bv-label">IF:</p>
        <div className="m-bv-cond">
          <ShopifyChip>Order: Created Datetime</ShopifyChip>
          <span>is less than 30min ago, and</span>
        </div>
        <div className="m-bv-cond">
          <ShopifyChip>Order: Fulfillment Status</ShopifyChip>
          <span>is “Unfulfilled”</span>
        </div>
        <p className="m-bv-label">THEN:</p>
        <div className="m-bv-cond">
          <Check className="size-3.5" strokeWidth={2.5} />
          <span className="m-bv-chip">Use Action: Order Edit</span>
        </div>
      </div>

      <div className="m-bv-win m-bv-test m-bv-step" style={delay(0.35)}>
        <div className="m-bv-win-head">
          <span className="m-bv-win-title">Test</span>
          <Settings className="size-3.5 text-[color:var(--m-ink-3)]" />
        </div>
        <div className="m-bv-chat">
          <div className="m-bv-msg m-bv-step" style={delay(1)}>
            <span className="m-bv-avatar">MC</span>
            <div>
              <p className="m-bv-name">Maya Chen</p>
              <p className="m-bv-bubble">I put the wrong apartment number. Can you fix it before it ships?</p>
            </div>
          </div>
          <div className="m-bv-slot">
            <p className="m-bv-think" style={delay(2)}>
              <Sparkles className="size-3" /> Gathering details…
            </p>
            <div className="m-bv-msg is-agent m-bv-step" style={delay(3.4)}>
              <p className="m-bv-name">
                <Sparkles className="size-3" /> Shopkeeper
              </p>
              <p className="m-bv-bubble">Found #3102. It hasn’t shipped, so I can update it now. What’s the right unit number?</p>
            </div>
          </div>
        </div>
        <div className="m-bv-input">
          <span>Ask a question…</span>
          <span className="m-bv-send">Send</span>
        </div>
      </div>
    </div>
  );
}

const ORBIT_NODES = [
  { label: "Instagram", logo: "/logos/instagram-outline.svg" },
  { label: "Email", logo: "/logos/email.svg" },
  { label: "Website chat", icon: MessageCircle },
  { label: "iMessage", logo: "/logos/imessage.svg" },
  { label: "Shopify", logo: "/logos/shopify.svg" },
] as const;

/** "One conversation. Everywhere.": the channels that are live, around the shop. */
export function ChannelsOrbit() {
  return (
    <div aria-hidden className="m-bv m-bv-orbit">
      <span className="m-bv-ring m-bv-ring-outer" />
      <span className="m-bv-ring m-bv-ring-inner" />
      <span className="m-bv-core">
        <Store className="size-6" strokeWidth={1.75} />
      </span>
      <div className="m-bv-spin">
        {ORBIT_NODES.map((node, index) => (
          <span key={node.label} className="m-bv-node" style={{ "--a": `${index * (360 / ORBIT_NODES.length)}deg` } as CSSProperties}>
            <span className="m-bv-node-chip">
              {"icon" in node ? (
                <node.icon className="size-5" strokeWidth={1.75} />
              ) : (
                <Image src={node.logo} alt="" width={22} height={22} className="size-[22px] object-contain" />
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const STATS = [
  { value: "94%", label: "replies sent as drafted", icon: Check },
  { value: "2.1 min", label: "median first response", icon: Clock },
  { value: "31", label: "order fixes made in Shopify", icon: PackageCheck },
] as const;

/** "High-quality answers. Measurable results.": three placeholder stat cards. */
export function StatCards() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-stats${seen ? " is-playing" : ""}`}>
      {STATS.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="m-bv-stat m-bv-step" style={delay(0.1 + index * 0.18)}>
            <div>
              <p className="m-bv-stat-value">{stat.value}</p>
              <p className="m-bv-stat-label">{stat.label}</p>
            </div>
            <span className="m-bv-stat-icon">
              <Icon className="size-3.5" strokeWidth={2.25} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ProductTile({ name, price, tone, at }: { name: string; price: string; tone: "sand" | "oat"; at: number }) {
  return (
    <div className="m-bv-product m-bv-step" style={delay(at)}>
      <span className={`m-bv-swatch is-${tone}`}>
        <Shirt className="size-5" strokeWidth={1.5} />
      </span>
      <div>
        <p className="m-bv-product-name">{name}</p>
        <p className="m-bv-product-price">{price}</p>
      </div>
    </div>
  );
}

/** "Engage. Guide. Convert.": a shopper asks, the agent recommends. */
export function ConvertChat() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-convert${seen ? " is-playing" : ""}`}>
      <p className="m-bv-bubble is-customer m-bv-step" style={delay(0.2)}>
        Hi! I’m looking for something breezy to wear to a beach wedding.
      </p>
      <div className="m-bv-products">
        <ProductTile name="Linen Jumpsuit · Sand" price="$148" tone="sand" at={1} />
        <ProductTile name="Wide-Leg Linen Pant · Oat" price="$98" tone="oat" at={1.35} />
      </div>
      <div className="m-bv-agent m-bv-step" style={delay(2.1)}>
        <p className="m-bv-name">
          <Sparkles className="size-3" /> Shopkeeper
        </p>
        <p className="m-bv-bubble is-agent">The Sand jumpsuit pairs well with the Oat wrap for cooler evenings.</p>
      </div>
    </div>
  );
}

/** Faint concentric dashed rings behind the quote, standing in for a chart. */
export function ConvertRings() {
  return (
    <svg aria-hidden viewBox="0 0 200 200" fill="none" className="m-bv-rings">
      <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" />
      <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" />
      <path d="M100 8a92 92 0 0 1 79 45" stroke="var(--m-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M38 100a62 62 0 0 1 62-62" stroke="var(--m-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
