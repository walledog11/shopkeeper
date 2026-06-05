"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Data ──────────────────────────────────────────────────────────────────── */
type TicketStatus = "live" | "awaiting";
type Channel = "ig" | "em" | "sm";

interface Ticket {
  id: string;
  name: string;
  ch: Channel;
  preview: string;
  tag: string;
  time: string;
  status: TicketStatus;
  isNew?: boolean;
}

interface Step {
  label: string;
  state: "done" | "active" | "pending";
}

interface Conv {
  av: string;
  avBg: string;
  chLine: string;
  msgs: { dir: "in" | "out"; text: string; ts: string }[];
  draft: string;
  used: string;
  ctx: { name: string; email: string; tier: string; orderId: string; orderName: string; orderMeta: string };
  plan: Step[];
}

const INIT_TICKETS: Ticket[] = [
  { id: "t1", name: "sarah_styles", ch: "ig", preview: "hi! ordered the wrong size, can i switch to medium?", tag: "returns", time: "now", status: "live" },
  { id: "t2", name: "david@gmail.com", ch: "em", preview: "I'd like to request a refund for my recent order.", tag: "refund", time: "2m", status: "awaiting" },
  { id: "t3", name: "+1 (555) 234-5678", ch: "sm", preview: "Can I update shipping address before it ships?", tag: "address", time: "5m", status: "awaiting" },
  { id: "t4", name: "morgan.f", ch: "ig", preview: "omg it has been a week pls help", tag: "tracking", time: "8m", status: "awaiting" },
  { id: "t5", name: "kim.lee@hotmail.com", ch: "em", preview: "WELCOME20 says invalid?", tag: "discount", time: "12m", status: "awaiting" },
];

const CONVS: Record<string, Conv> = {
  t1: {
    av: "S", avBg: "linear-gradient(135deg,#f09433,#dc2743)",
    chLine: "Instagram DM · Customer since Aug 2025",
    msgs: [
      { dir: "in", text: "hi! I ordered the wrong size, can I switch to a Medium?", ts: "2 min ago" },
      { dir: "in", text: "order is #2849 if that helps 🙏", ts: "1 min ago" },
    ],
    draft: "Hey Sarah! totally , order #2849 hasn't shipped yet so I can swap it to a Medium for you right now. The Small will go back into stock 💛 anything else?",
    used: "Used: order lookup · stock check · returns policy",
    ctx: { name: "Sarah Mendez", email: "sarah.m@gmail.com", tier: "2 prior orders · $187 LTV", orderId: "#2849", orderName: "Linen Cropped Tee , Small", orderMeta: "Ordered 2 days ago · not yet shipped" },
    plan: [
      { label: "Read message + history", state: "done" },
      { label: "Pull order #2849 from Shopify", state: "done" },
      { label: "Check Medium availability", state: "done" },
      { label: "Draft reply in Sarah's tone", state: "active" },
    ],
  },
  t2: {
    av: "D", avBg: "linear-gradient(135deg,#4a90e2,#357abd)",
    chLine: "Email · david@gmail.com",
    msgs: [{ dir: "in", text: "Hi, I'd like to request a refund for my recent order #3012. The fit isn't right.", ts: "2 min ago" }],
    draft: "Hi David , sorry the fit was off! Order #3012 is within our 30-day window so I can issue a full refund of $84. I'll send a prepaid return label to this email.",
    used: "Used: order lookup · refund policy · return label",
    ctx: { name: "David Park", email: "david@gmail.com", tier: "4 prior orders · $412 LTV", orderId: "#3012", orderName: "Wool Overshirt , Large", orderMeta: "Delivered 8 days ago · within return window" },
    plan: [
      { label: "Read refund request", state: "done" },
      { label: "Verify order eligibility", state: "done" },
      { label: "Calculate refund amount", state: "done" },
      { label: "Draft response with return label", state: "active" },
    ],
  },
  t3: {
    av: "+", avBg: "linear-gradient(135deg,#7c4dff,#5e35b1)",
    chLine: "SMS · +1 (555) 234-5678",
    msgs: [
      { dir: "in", text: "Hi! Can I update the shipping address for my order? I just moved.", ts: "5 min ago" },
      { dir: "in", text: "New address: 1284 Beacon St, Brookline MA 02446", ts: "5 min ago" },
    ],
    draft: "Hi! Got it , updating your order to 1284 Beacon St, Brookline MA 02446 right now. You'll get a confirmation text once it's locked in. 📦",
    used: "Used: order lookup · address validation · Shopify update",
    ctx: { name: "Rachel Kim", email: "+1 (555) 234-5678", tier: "1 prior order · $62 LTV", orderId: "#3104", orderName: "Cotton Throw Blanket", orderMeta: "Order placed 4h ago · awaiting fulfillment" },
    plan: [
      { label: "Parse address from message", state: "done" },
      { label: "Validate against USPS", state: "done" },
      { label: "Update Shopify order", state: "active" },
      { label: "Draft confirmation reply", state: "pending" },
    ],
  },
  t4: {
    av: "M", avBg: "linear-gradient(135deg,#f09433,#dc2743)",
    chLine: "Instagram DM · @morgan.f",
    msgs: [{ dir: "in", text: "omg it has been a week pls help where is my order??", ts: "8 min ago" }],
    draft: "Hey Morgan , so sorry for the wait!! Order #2961 is out for delivery today, USPS tracking 9400… arriving by 8pm. Let me know if it doesn't show up 💛",
    used: "Used: order lookup · USPS tracking API",
    ctx: { name: "Morgan F.", email: "(via IG)", tier: "1st order", orderId: "#2961", orderName: "Linen Robe , Medium", orderMeta: "Out for delivery today" },
    plan: [
      { label: "Detect frustration tone", state: "done" },
      { label: "Pull order + tracking", state: "done" },
      { label: "Draft empathetic reply", state: "active" },
    ],
  },
  t5: {
    av: "K", avBg: "linear-gradient(135deg,#4a90e2,#357abd)",
    chLine: "Email · kim.lee@hotmail.com",
    msgs: [{ dir: "in", text: "Hi, your code WELCOME20 says invalid when I try to use it on my cart?", ts: "12 min ago" }],
    draft: "Hi Kim , sorry about that! WELCOME20 expired last week, but I just generated a fresh code for you: KIMLEE15 (15% off, no minimum). Apply at checkout. Welcome to the brand 🤍",
    used: "Used: discount codes · code generator",
    ctx: { name: "Kim Lee", email: "kim.lee@hotmail.com", tier: "New customer", orderId: ",", orderName: "No active order", orderMeta: "Cart abandoned 2x in past week" },
    plan: [
      { label: "Check WELCOME20 status", state: "done" },
      { label: "Generate replacement code", state: "done" },
      { label: "Draft welcoming reply", state: "active" },
    ],
  },
  t6: {
    av: "J", avBg: "linear-gradient(135deg,#f09433,#dc2743)",
    chLine: "Instagram DM · @jules.rae",
    msgs: [{ dir: "in", text: "will the linen jumpsuit come back in xs?? been waiting forever 🥲", ts: "just now" }],
    draft: "Hi Jules , yes! we restock XS next Tuesday. Want me to add you to the early-access notification so you get first dibs?",
    used: "Used: inventory · restock calendar",
    ctx: { name: "Jules Rae", email: "(via IG)", tier: "browser · 0 orders", orderId: ",", orderName: "Linen Jumpsuit (out of stock)", orderMeta: "Restock: Tuesday Apr 22" },
    plan: [
      { label: "Check inventory status", state: "done" },
      { label: "Pull restock calendar", state: "done" },
      { label: "Draft pre-order offer", state: "active" },
    ],
  },
};

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function IgIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function EmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function SmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ShopifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}>
      <path d="M13 2 L5 5 L3 20 L12 22 L21 20 L19 6 L15 6 L13 2 Z M13 5 L14 7 L12 7 L13 5 Z" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
    </svg>
  );
}

const CH_BG: Record<Channel, string> = {
  ig: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
  em: "#4a90e2",
  sm: "#7c4dff",
};

const PROPOSED_PLAN_PILL_CLASS: Record<string, string> = {
  shopify: "bg-amber-500/15 text-amber-500",
  reply: "bg-blue-500/15 text-blue-400",
  search: "bg-white/10 text-white/90",
};

function ChBadge({ ch }: { ch: Channel }) {
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded text-white"
      style={{ background: CH_BG[ch] }}
    >
      {ch === "ig" ? <IgIcon /> : ch === "em" ? <EmIcon /> : <SmIcon />}
    </span>
  );
}

function classifyStep(label: string): "shopify" | "reply" | "search" {
  const l = label.toLowerCase();
  if (/shopify|refund|address|usps|update|return label|stock|availability/.test(l)) return "shopify";
  if (/draft|reply|response|confirm|notif|welcom/.test(l)) return "reply";
  return "search";
}

function ProposedPlan({ conv }: { conv: Conv }) {
  const steps = conv.plan;
  const checked = steps.filter(p => p.state === "done" || p.state === "active").length;
  return (
    <div className="bg-white/[0.05] border border-solid border-white/[0.1] overflow-hidden rounded-xl" >
      <div className="flex align-center justify-between py-2 px-3 border-b border-b-solid border-b-white/[0.10]" >
        <span className="text-xs text-stone-200 font-medium" >Proposed plan</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          <span>{checked} of {steps.length} steps</span>
          <span style={{ cursor: "pointer", display: "inline-flex" }}><RefreshIcon /></span>
        </span>
      </div>
      <div style={{ padding: "2px 0" }}>
        {steps.map((step, i) => {
          const kind = classifyStep(step.label);
          const isChecked = step.state === "done" || step.state === "active";
          return (
            <div key={step.label} style={{
              display: "grid", gridTemplateColumns: "auto 1fr", gap: 9,
              padding: "9px 13px", borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}>
              <span className={`mt-px inline-flex size-[17px] shrink-0 items-center justify-center rounded border border-white/20 ${isChecked ? "bg-white/20" : "bg-transparent"}`}>
                {isChecked && <span className="text-stone-100"><CheckIcon /></span>}
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <span className={`inline-flex items-center gap-1 rounded-full px-[7px] py-0.5 text-xs font-semibold leading-none ${PROPOSED_PLAN_PILL_CLASS[kind]}`}>
                    {kind === "shopify" ? <ShopifyIcon /> : kind === "reply" ? <ReplyIcon /> : <SearchIcon />}
                    {kind === "shopify" ? "Shopify" : kind === "reply" ? "Reply" : "Lookup"}
                  </span>
                  <span className="text-xs font-medium text-stone-100">{step.label}</span>
                </div>
                {kind === "reply" && (
                  <div style={{ borderLeft: "2px solid #4a90e2", paddingLeft: 7, fontStyle: "italic", color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                    &ldquo;{conv.draft.split(/\. |\? |! /)[0].slice(0, 72)}&rdquo;
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[7px] border-t border-solid border-white/10 px-[13px] py-[11px]">
        <button type="button" className="cursor-pointer rounded-[7px] border-0 bg-green-700 px-[13px] py-[7px] text-xs font-semibold text-white [font-family:inherit]">Run plan</button>
        <button type="button" className="cursor-pointer rounded-[7px] border border-solid border-white/20 bg-transparent px-[13px] py-[7px] text-xs text-stone-100 [font-family:inherit]">Dismiss</button>
      </div>
    </div>
  );
}

function DemoCard() {
  const [tickets, setTickets] = useState<Ticket[]>(INIT_TICKETS);
  const [activeId, setActiveId] = useState("t1");
  const [convs, setConvs] = useState<Record<string, Conv>>(CONVS);
  const conv = convs[activeId];
  const active = tickets.find(t => t.id === activeId) ?? tickets[0];
  const draftText = conv.draft;

  useEffect(() => {
    const t = setTimeout(() => {
      setTickets(prev => [
        { id: "t6", name: "jules.rae", ch: "ig", preview: "will the linen jumpsuit come back in xs??", tag: "stock", time: "now", status: "live", isNew: true },
        ...prev,
      ]);
    }, 7000);
    return () => clearTimeout(t);
  }, []);

  const handleApprove = useCallback(() => {
    setConvs(prev => ({
      ...prev,
      [activeId]: {
        ...prev[activeId],
        msgs: [...prev[activeId].msgs, { dir: "out", text: prev[activeId].draft, ts: "just now" }],
        draft: "Reply sent. Watching for response…",
        plan: prev[activeId].plan.map(p => ({ ...p, state: "done" as const })),
      },
    }));
  }, [activeId]);

  return (
    <div className="bg-stone-900 text-stone-100" style={{ margin: "10px", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,.08)" }}>
      {/* Browser chrome */}
      <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["dot-1", "dot-2", "dot-3"].map(key => <span key={key} style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />)}
        </div>
        <span style={{ fontFamily: "var(--m-mono)", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>clerk.app/inbox</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.56)", fontSize: 12 }}>
          <span className="inline-block size-1.5 animate-[m-pulse_1.8s_ease_infinite] rounded-full bg-green-600" />
          live demo · interact with anything
        </span>
      </div>

      {/* 3-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", height: 600, background: "#0d0c0b" }}>

        {/* INBOX */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            <span>Inbox</span>
            <span style={{ fontFamily: "var(--m-mono)" }}>{tickets.length} open</span>
          </div>
          <div style={{ overflowY: "auto" }} className="no-scrollbar">
            {tickets.map(t => (
              <button
                type="button"
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`relative w-full cursor-pointer border-0 border-b border-white/[0.05] px-[15px] py-[11px] text-left [font:inherit] ${t.id === activeId ? "bg-white/[0.07]" : "bg-transparent"} ${t.isNew ? "animate-[m-slidein_0.5s_ease]" : ""}`}
              >
                {t.id === activeId && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-green-600" />}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, fontSize: 12 }}>
                  <ChBadge ch={t.ch} />
                  <span className="flex-1 truncate text-xs font-medium text-stone-100">{t.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, flexShrink: 0 }}>{t.time}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{t.preview}</div>
                <div style={{ marginTop: 5, display: "flex", gap: 4 }}>
                  <span className={`rounded-[3px] px-1.5 py-0.5 text-xs [font-family:var(--m-mono)] ${t.status === "live" ? "bg-green-600/20 text-green-600" : "bg-white/10 text-white/70"}`}>{t.status}</span>
                  <span style={{ fontSize: 12, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", fontFamily: "var(--m-mono)" }}>{t.tag}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CONVERSATION */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateRows: "auto 1fr auto", overflow: "hidden" }}>
          <div style={{ padding: "11px 17px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
            <div
              className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: conv.avBg }}
            >
              {conv.av}
            </div>
            <div style={{ flex: 1 }}>
              <div className="text-[13px] font-semibold text-stone-100">{active.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{conv.chLine}</div>
            </div>
            <button type="button" className="cursor-pointer rounded-md border-0 bg-white/10 px-2.5 py-[5px] text-xs text-stone-100 [font-family:inherit]">Resolve</button>
          </div>
          <div style={{ overflowY: "auto", padding: "20px 20px", display: "flex", flexDirection: "column", gap: 11 }} className="no-scrollbar">
            {conv.msgs.map((m) => (
              <div
                key={`${m.dir}-${m.ts}-${m.text}`}
                className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-[13px] leading-[1.5] ${m.dir === "in" ? "self-start rounded-bl bg-white/10 text-stone-100" : "self-end rounded-br bg-stone-100 text-stone-900"}`}
              >
                {m.text}
                <span style={{ fontSize: 12, display: "block", marginTop: 4, color: m.dir === "in" ? "rgba(255,255,255,0.38)" : "rgba(22,20,19,0.5)" }}>{m.ts}</span>
              </div>
            ))}
            <div style={{ marginTop: 2 }}>
              <ProposedPlan conv={conv} />
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "12px 15px" }}>
            <div className="border border-solid border-green-600 bg-white/[0.06]" style={{ borderRadius: 10, padding: "11px 13px" }}>
              <div className="mb-[5px] flex items-center gap-[5px] text-xs font-semibold uppercase tracking-[0.12em] text-green-600">
                <span className="inline-block size-[5px] animate-[m-pulse_1.8s_ease_infinite] rounded-full bg-green-600" />
                Clerk drafted a reply
              </div>
              <div style={{ minHeight: 32, maxHeight: 72, overflowY: "auto" }} className="no-scrollbar text-[13px] leading-[1.5] text-stone-100">
                {draftText}
                <span className="ml-0.5 inline-block h-[13px] w-0.5 animate-[m-blink_1s_step-end_infinite] bg-green-600 align-middle" />
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center" }}>
                <span style={{ marginRight: "auto", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{conv.used}</span>
                <button type="button" className="cursor-pointer rounded-[5px] border-0 bg-white/10 px-2.5 py-[5px] text-xs text-stone-100 [font-family:inherit]">Edit</button>
                <button type="button" onClick={handleApprove} className="cursor-pointer rounded-[5px] border-0 bg-green-600 px-2.5 py-[5px] text-xs font-semibold text-white [font-family:inherit]">Approve &amp; send →</button>
              </div>
            </div>
          </div>
        </div>

        {/* CONTEXT */}
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            <span>Context</span>
            <span className="text-xs text-green-600 [font-family:var(--m-mono)]">● live</span>
          </div>
          <div style={{ overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 14 }} className="no-scrollbar">
            {/* Customer */}
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginBottom: 7, fontWeight: 600 }}>Customer</div>
              {[["name", conv.ctx.name],["contact", conv.ctx.email],["history", conv.ctx.tier]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{k}</span>
                  <span className="max-w-[60%] text-right text-xs text-stone-100 [font-family:var(--m-mono)]">{v}</span>
                </div>
              ))}
            </div>
            {/* Order */}
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginBottom: 7, fontWeight: 600 }}>Order</div>
              <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: 10 }}>
                <div className="text-xs font-medium text-green-600 [font-family:var(--m-mono)]">{conv.ctx.orderId}</div>
                <div className="mt-[5px] text-[13px] text-stone-100">{conv.ctx.orderName}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3 }}>{conv.ctx.orderMeta}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileDemoCard() {
  const conv = CONVS["t1"];
  const draftText = conv.draft;
  return (
    <div className="bg-stone-900 text-stone-100" style={{ margin: "10px", borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 50px -10px rgba(0,0,0,0.3)" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
        <div style={{ display: "flex", gap: 5 }}>{["dot-1", "dot-2", "dot-3"].map(key => <span key={key} style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />)}</div>
        <span style={{ fontFamily: "var(--m-mono)", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>clerk.app/inbox</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          <span className="inline-block size-[5px] animate-[m-pulse_1.8s_ease_infinite] rounded-full bg-green-600" />
          live
        </span>
      </div>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: conv.avBg }}
        >
          S
        </div>
        <div style={{ flex: 1 }}>
          <div className="text-[13px] font-semibold text-stone-100">sarah_styles</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Instagram DM · returns</div>
        </div>
        <span className="rounded px-2 py-[3px] text-xs text-stone-100 bg-white/10">Resolve</span>
      </div>
      <div style={{ padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: 9 }}>
        {conv.msgs.map((m) => (
          <div key={`${m.dir}-${m.ts}-${m.text}`} className="bg-white/10 text-stone-100" style={{ maxWidth: "82%", padding: "9px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.45, alignSelf: "flex-start", borderBottomLeftRadius: 3 }}>{m.text}</div>
        ))}
      </div>
      <div style={{ padding: "8px 14px 14px" }}>
        <div className="border border-solid border-green-600 bg-white/[0.06]" style={{ borderRadius: 9, padding: "10px 12px" }}>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-green-600">✦ Clerk drafted a reply</div>
          <div className="text-xs leading-[1.5] text-stone-100">
            {draftText}<span className="ml-0.5 inline-block h-3 w-0.5 animate-[m-blink_1s_step-end_infinite] bg-green-600 align-middle" />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button type="button" className="rounded-[5px] border-0 bg-white/10 px-[9px] py-[5px] text-xs text-stone-100 [font-family:inherit]">Edit</button>
            <button type="button" className="rounded-[5px] border-0 bg-green-600 px-[9px] py-[5px] text-xs font-semibold text-white [font-family:inherit]">Approve →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveDemo() {
  return (
    <div id="demo" style={{ margin: "32px 20px 72px", maxWidth: 1280, marginLeft: "auto", marginRight: "auto" }}>
      <div className="hidden lg:block"><DemoCard /></div>
      <div className="lg:hidden"><MobileDemoCard /></div>
    </div>
  );
}
