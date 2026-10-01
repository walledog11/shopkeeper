"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, MessageCircle, PackageCheck, Sparkles, Store, X } from "lucide-react";

/* Card visuals for the landing bento, built as live components so the copy can
   be edited in place. Linen & Loom is the demo store. Each visual shows
   something the product does, so none of them carries a metric or a quote. */

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

/** "Writes in your voice, by your rules": store notes next to a chat that follows them. */
export function GuidanceVisual() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-guidance${seen ? " is-playing" : ""}`}>
      <div className="m-bv-win m-bv-guide m-bv-step" style={delay(0)}>
        <div className="m-bv-win-head">
          <span className="m-bv-win-title">Store notes</span>
          <X className="size-3.5 text-[color:var(--m-ink-3)]" />
        </div>
        <p className="m-bv-rule">Address changes</p>
        <p className="m-bv-note">Fine until the order ships. Check its status first.</p>
        <p className="m-bv-rule">Tone</p>
        <p className="m-bv-note">Short and warm. Don’t over-apologize.</p>
        <p className="m-bv-rule">Delivery dates</p>
        <p className="m-bv-note">Don’t promise one.</p>
      </div>

      <div className="m-bv-win m-bv-test m-bv-step" style={delay(0.35)}>
        <div className="m-bv-win-head">
          <span className="m-bv-win-title">Website chat</span>
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

/** "One conversation. Everywhere.": the channels that are live, around the shop. Also the
 *  Integrations preview in the Product menu. */
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

const LOG = [
  { title: "Swap approved", detail: "Order #3102, by you", icon: Check },
  { title: "Order updated", detail: "Small / Sand in Shopify", icon: PackageCheck },
  { title: "Reply sent", detail: "To Maya, after the update", icon: MessageCircle },
] as const;

/** "Every action on the record.": the trail one approved change leaves behind. */
export function ActionLog() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-log${seen ? " is-playing" : ""}`}>
      {LOG.map((entry, index) => {
        const Icon = entry.icon;
        return (
          <div key={entry.title} className="m-bv-log-item m-bv-step" style={delay(0.1 + index * 0.18)}>
            <div>
              <p className="m-bv-log-title">{entry.title}</p>
              <p className="m-bv-log-detail">{entry.detail}</p>
            </div>
            <span className="m-bv-log-icon">
              <Icon className="size-3.5" strokeWidth={2.25} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "Answers shoppers on your site.": a shopper asks where an order is, the agent looks it up. */
export function ShopperChat() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} aria-hidden className={`m-bv m-bv-convert${seen ? " is-playing" : ""}`}>
      <p className="m-bv-bubble is-customer m-bv-step" style={delay(0.2)}>
        Hi! Where’s my order? It’s #3099.
      </p>
      <div className="m-bv-products">
        <div className="m-bv-product m-bv-step" style={delay(1)}>
          <span className="m-bv-swatch is-oat">
            <PackageCheck className="size-5" strokeWidth={1.5} />
          </span>
          <div>
            <p className="m-bv-product-name">Order #3099 · 2 items</p>
            <p className="m-bv-product-price">Paid · Shipped</p>
          </div>
        </div>
      </div>
      <div className="m-bv-agent m-bv-step" style={delay(2.1)}>
        <p className="m-bv-name">
          <Sparkles className="size-3" /> Shopkeeper
        </p>
        <p className="m-bv-bubble is-agent">It shipped yesterday with UPS and should arrive Thursday.</p>
      </div>
    </div>
  );
}
