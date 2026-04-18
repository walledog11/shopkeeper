"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ── SVG Icons ── */
function IgIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}
function EmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function SmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11, display: "block" }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
function ChevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
function ShopifyPill() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1, background: "rgba(245,158,11,.14)", color: "#f59e0b" }}>
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><path d="M13 2 L5 5 L3 20 L12 22 L21 20 L19 6 L15 6 L13 2 Z M13 5 L14 7 L12 7 L13 5 Z" /></svg>
      Shopify
    </span>
  );
}
function ReplyPill() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1, background: "rgba(74,144,226,.14)", color: "#60a5fa" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      Reply
    </span>
  );
}
function LookupPill() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      Lookup
    </span>
  );
}

type StepState = "done" | "active" | "pending";
interface PlanStep { label: string; state: StepState; }
interface Msg { dir: "in" | "out"; text: string; ts: string; }
interface ConvCtx { name: string; email: string; tier: string; orderId: string; orderName: string; orderMeta: string; }
interface Conv { av: string; avBg: string; chLine: string; msgs: Msg[]; draft: string; used: string; ctx: ConvCtx; plan: PlanStep[]; }
interface Ticket { id: string; name: string; ch: "ig" | "em" | "sm"; subject: string; preview: string; tag: string; time: string; status: string; isNew?: boolean; }

const INITIAL_TICKETS: Ticket[] = [
  { id: "t1", name: "sarah_styles", ch: "ig", subject: "wrong size, can i swap?", preview: "hi! ordered the wrong size, can i switch to medium?", tag: "returns", time: "now", status: "live" },
  { id: "t2", name: "david@gmail.com", ch: "em", subject: "refund request #3012", preview: "I'd like to request a refund for my recent order.", tag: "refund", time: "2m", status: "awaiting" },
  { id: "t3", name: "+1 (555) 234-5678", ch: "sm", subject: "address change", preview: "Can I update shipping address before it ships?", tag: "address", time: "5m", status: "awaiting" },
  { id: "t4", name: "morgan.f", ch: "ig", subject: "where is my order?", preview: "omg it has been a week pls help", tag: "tracking", time: "8m", status: "awaiting" },
  { id: "t5", name: "kim.lee@hotmail.com", ch: "em", subject: "discount code not working", preview: "WELCOME20 says invalid?", tag: "discount", time: "12m", status: "awaiting" },
];

const CONVERSATIONS: Record<string, Conv> = {
  t1: {
    av: "S", avBg: "linear-gradient(135deg,#f09433,#dc2743)",
    chLine: "Instagram DM · Customer since Aug 2025",
    msgs: [
      { dir: "in", text: "hi! I ordered the wrong size, can I switch to a Medium?", ts: "2 min ago" },
      { dir: "in", text: "order is #2849 if that helps 🙏", ts: "1 min ago" },
    ],
    draft: "Hey Sarah! totally — order #2849 hasn't shipped yet so I can swap it to a Medium for you right now. The Small will go back into stock 💛 anything else?",
    used: "Used: order lookup · stock check · returns policy",
    ctx: { name: "Sarah Mendez", email: "sarah.m@gmail.com", tier: "2 prior orders · $187 LTV", orderId: "#2849", orderName: "Linen Cropped Tee — Small", orderMeta: "Ordered 2 days ago · not yet shipped" },
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
    draft: "Hi David — sorry the fit was off! Order #3012 is within our 30-day window so I can issue a full refund of $84. I'll send a prepaid return label to this email. Once we receive the item, refund hits your card in 3-5 days.",
    used: "Used: order lookup · refund policy · return label",
    ctx: { name: "David Park", email: "david@gmail.com", tier: "4 prior orders · $412 LTV", orderId: "#3012", orderName: "Wool Overshirt — Large", orderMeta: "Delivered 8 days ago · within return window" },
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
    draft: "Hi! Got it — updating your order to 1284 Beacon St, Brookline MA 02446 right now. You'll get a confirmation text once it's locked in. 📦",
    used: "Used: order lookup · address validation · Shopify update",
    ctx: { name: "Rachel Kim", email: "+1 (555) 234-5678", tier: "1 prior order · $62 LTV", orderId: "#3104", orderName: "Cotton Throw Blanket", orderMeta: "Order placed 4h ago · awaiting fulfillment" },
    plan: [
      { label: "Parse address from message", state: "done" },
      { label: "Validate against USPS", state: "done" },
      { label: "Update Shopify order address", state: "active" },
      { label: "Draft confirmation reply", state: "pending" },
    ],
  },
  t4: {
    av: "M", avBg: "linear-gradient(135deg,#f09433,#dc2743)",
    chLine: "Instagram DM · @morgan.f",
    msgs: [{ dir: "in", text: "omg it has been a week pls help where is my order??", ts: "8 min ago" }],
    draft: "Hey Morgan — so sorry for the wait!! Order #2961 is out for delivery today, USPS tracking 9400... here's the link: usps.com/track/9400... arriving by 8pm. Let me know if it doesn't show up 💛",
    used: "Used: order lookup · USPS tracking API",
    ctx: { name: "Morgan F.", email: "(via IG)", tier: "1st order", orderId: "#2961", orderName: "Linen Robe — Medium", orderMeta: "Out for delivery today" },
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
    draft: "Hi Kim — sorry about that! WELCOME20 expired last week, but I just generated a fresh code for you: KIMLEE15 (15% off, no minimum). Apply at checkout. Welcome to the brand 🤍",
    used: "Used: discount codes · code generator",
    ctx: { name: "Kim Lee", email: "kim.lee@hotmail.com", tier: "New customer", orderId: "—", orderName: "No active order", orderMeta: "Cart abandoned 2x in past week" },
    plan: [
      { label: "Check WELCOME20 status", state: "done" },
      { label: "Generate replacement code", state: "done" },
      { label: "Draft welcoming reply", state: "active" },
    ],
  },
};

function classifyStep(label: string) {
  const l = label.toLowerCase();
  if (/shopify|refund|address|usps|update|return label|stock|medium/.test(l)) return "shopify";
  if (/draft|reply|response|confirm|notif|welcom/.test(l)) return "reply";
  return "search";
}

function ChannelBadge({ ch }: { ch: "ig" | "em" | "sm" }) {
  const styles: Record<string, React.CSSProperties> = {
    ig: { background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" },
    em: { background: "#4a90e2" },
    sm: { background: "#7c4dff" },
  };
  return (
    <span style={{ width: 16, height: 16, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, ...styles[ch] }}>
      {ch === "ig" && <IgIcon />}
      {ch === "em" && <EmIcon />}
      {ch === "sm" && <SmIcon />}
    </span>
  );
}

function ProposedPlan({ plan, draft }: { plan: PlanStep[]; draft: string }) {
  const total = plan.length;
  const checked = plan.filter((p) => p.state === "done" || p.state === "active").length;
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ fontSize: 12, color: "var(--m-paper)", fontWeight: 500 }}>Proposed plan</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          <span>{checked} of {total} steps</span>
          <span style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", color: "rgba(255,255,255,0.6)" }}><ChevIcon /></span>
          <span style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", color: "rgba(255,255,255,0.6)" }}><RefreshIcon /></span>
        </span>
      </div>
      <div style={{ padding: "4px 0" }}>
        {plan.map((p, i) => {
          const kind = classifyStep(p.label);
          const isChecked = p.state === "done" || p.state === "active";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "12px 14px", borderBottom: i < plan.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: isChecked ? "rgba(255,255,255,0.18)" : "transparent", border: `1px solid ${isChecked ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.2)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 1, cursor: "pointer", flexShrink: 0, color: "var(--m-paper)" }}>
                {isChecked && <CheckIcon />}
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  {kind === "shopify" && <ShopifyPill />}
                  {kind === "reply" && <ReplyPill />}
                  {kind === "search" && <LookupPill />}
                  <span style={{ color: "var(--m-paper)", fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                </div>
                {kind === "reply" && (
                  <div style={{ borderLeft: "2px solid #4a90e2", paddingLeft: 10, fontStyle: "italic", color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 1.5 }}>
                    &ldquo;{draft.split(/\. |\? |! /)[0].trim().slice(0, 110)}&rdquo;
                  </div>
                )}
                {kind === "shopify" && (
                  <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 1.5 }}>
                    {/address/i.test(p.label) ? "Update their shipping address on Shopify." : /refund/i.test(p.label) ? `Issue a refund on Shopify.` : "Execute on Shopify."}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button style={{ background: "#2f7a4a", color: "#0d0c0b", fontWeight: 600, fontSize: 13, padding: "9px 16px", borderRadius: 8, border: 0, cursor: "pointer" }}>
          Run plan
        </button>
        <button style={{ background: "transparent", color: "var(--m-paper)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 13, padding: "9px 16px", borderRadius: 8, cursor: "pointer" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function LiveDemo() {
  const [tickets, setTickets] = useState<Ticket[]>(INITIAL_TICKETS);
  const [convs, setConvs] = useState<Record<string, Conv>>(CONVERSATIONS);
  const [activeId, setActiveId] = useState("t1");
  const [draftText, setDraftText] = useState("");
  const typeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const typeText = useCallback((text: string) => {
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    setDraftText("");
    let i = 0;
    const tick = () => {
      i++;
      setDraftText(text.slice(0, i));
      if (i < text.length) {
        typeTimerRef.current = setTimeout(tick, 12 + Math.random() * 22);
      }
    };
    typeTimerRef.current = setTimeout(tick, 50);
  }, []);

  useEffect(() => {
    const c = convs[activeId];
    if (c) typeText(c.draft);
    return () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current); };
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulated incoming ticket
  useEffect(() => {
    const t = setTimeout(() => {
      const newTicket: Ticket = {
        id: "t6", name: "jules.rae", ch: "ig",
        subject: "is this restocking?", preview: "will the linen jumpsuit come back in xs??",
        tag: "stock", time: "now", status: "live", isNew: true,
      };
      const newConv: Conv = {
        av: "J", avBg: "linear-gradient(135deg,#f09433,#dc2743)", chLine: "Instagram DM · @jules.rae",
        msgs: [{ dir: "in", text: "will the linen jumpsuit come back in xs?? been waiting forever 🥲", ts: "just now" }],
        draft: "Hi Jules — yes! we restock XS next Tuesday. Want me to add you to the early-access notification so you get first dibs?",
        used: "Used: inventory · restock calendar",
        ctx: { name: "Jules Rae", email: "(via IG)", tier: "browser · 0 orders", orderId: "—", orderName: "Linen Jumpsuit (out of stock)", orderMeta: "Restock: Tuesday" },
        plan: [
          { label: "Check inventory status", state: "done" },
          { label: "Pull restock calendar", state: "done" },
          { label: "Draft pre-order offer", state: "active" },
        ],
      };
      setTickets((prev) => [newTicket, ...prev]);
      setConvs((prev) => ({ ...prev, t6: newConv }));
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  const handleApprove = () => {
    const c = convs[activeId];
    if (!c) return;
    setConvs((prev) => ({
      ...prev,
      [activeId]: {
        ...c,
        msgs: [...c.msgs, { dir: "out", text: c.draft, ts: "just now" }],
        draft: "Reply sent. Watching for response…",
        plan: c.plan.map((p) => ({ ...p, state: "done" as StepState })),
      },
    }));
    typeText("Reply sent. Watching for response…");
  };

  const activeTicket = tickets.find((t) => t.id === activeId);
  const activeConv = convs[activeId];

  return (
    <div id="demo" style={{ margin: "32px 28px 80px", maxWidth: 1280, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ background: "#161413", color: "var(--m-paper)", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,.08)" }}>
        {/* Browser chrome */}
        <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["rgba(255,255,255,0.2)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0.2)"].map((bg, i) => (
              <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: bg, display: "inline-block" }} />
            ))}
          </div>
          <div style={{ fontFamily: "var(--m-mono)", color: "rgba(255,255,255,0.5)", fontSize: 11 }}>clerk.app/inbox</div>
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.56)", fontSize: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--m-acid)", display: "inline-block", animation: "m-pulse 1.8s ease infinite" }} />
            live demo · interact with anything
          </div>
        </div>

        {/* 3-panel stage */}
        <div className="m-demo-stage" style={{ display: "grid", gridTemplateColumns: "280px 1fr 320px", height: 560, background: "#0d0c0b" }}>
          {/* ── INBOX ── */}
          <div className="m-demo-inbox" style={{ borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              <span>Inbox</span>
              <span style={{ fontFamily: "var(--m-mono)" }}>{tickets.length} open</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }} className="no-scrollbar">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: "pointer",
                    position: "relative",
                    background: t.id === activeId ? "rgba(255,255,255,0.06)" : undefined,
                    animation: t.isNew ? "m-slidein 0.5s ease" : undefined,
                  }}
                >
                  {t.id === activeId && (
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--m-acid)" }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
                    <ChannelBadge ch={t.ch} />
                    <span style={{ fontWeight: 500, color: "var(--m-paper)" }}>{t.name}</span>
                    <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.31)", fontSize: 11 }}>{t.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.preview}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: "var(--m-mono)", background: t.status === "live" ? "rgba(255,91,31,0.15)" : "rgba(255,255,255,0.07)", color: t.status === "live" ? "var(--m-acid)" : "rgba(255,255,255,0.56)" }}>
                      {t.status}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: "var(--m-mono)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.56)" }}>
                      {t.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CONVERSATION ── */}
          <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {activeConv && (
              <>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: activeConv.avBg, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                    {activeConv.av}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "var(--m-paper)", fontSize: 14 }}>{activeTicket?.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.37)", marginTop: 2 }}>{activeConv.chLine}</div>
                  </div>
                  <button style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, fontWeight: 500, background: "rgba(255,255,255,0.08)", color: "var(--m-paper)", border: 0, cursor: "pointer" }}>
                    Resolve
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }} className="no-scrollbar">
                  {activeConv.msgs.map((m, i) => (
                    <div key={i} style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, background: m.dir === "in" ? "rgba(255,255,255,0.08)" : "var(--m-paper)", color: m.dir === "in" ? "var(--m-paper)" : "#161413", alignSelf: m.dir === "in" ? "flex-start" : "flex-end", borderBottomLeftRadius: m.dir === "in" ? 4 : 14, borderBottomRightRadius: m.dir === "out" ? 4 : 14 }}>
                      {m.text}
                      <span style={{ fontSize: 10, color: m.dir === "in" ? "rgba(255,255,255,0.31)" : "rgba(22,20,19,0.63)", marginTop: 6, display: "block" }}>{m.ts}</span>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "14px 18px" }}>
                  <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--m-acid)", borderRadius: 12, padding: "14px 16px", position: "relative" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--m-acid)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--m-acid)", display: "inline-block", animation: "m-pulse 1.8s ease infinite" }} />
                      Clerk drafted a reply
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--m-paper)", minHeight: 42 }}>
                      {draftText}
                      {draftText !== activeConv.draft && draftText.length > 0 && (
                        <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--m-acid)", animation: "m-blink 1s step-end infinite", verticalAlign: "middle", marginLeft: 2 }} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                      <span style={{ marginRight: "auto", fontSize: 11, color: "rgba(255,255,255,0.37)" }}>{activeConv.used}</span>
                      <button style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, fontWeight: 500, background: "rgba(255,255,255,0.08)", color: "var(--m-paper)", border: 0, cursor: "pointer" }}>Edit</button>
                      <button onClick={handleApprove} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, fontWeight: 500, background: "var(--m-acid)", color: "#fff", border: 0, cursor: "pointer" }}>
                        Approve & send →
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── CONTEXT ── */}
          <div className="m-demo-context" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              <span>Context</span>
              <span style={{ fontFamily: "var(--m-mono)", color: "var(--m-acid)" }}>● live</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18, fontSize: 12 }} className="no-scrollbar">
              {activeConv && (
                <>
                  {/* Customer */}
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,0.31)", marginBottom: 8, fontWeight: 600 }}>Customer</div>
                    {[["name", activeConv.ctx.name], ["contact", activeConv.ctx.email], ["history", activeConv.ctx.tier]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ color: "rgba(255,255,255,0.44)", fontSize: 11 }}>{k}</span>
                        <span style={{ fontFamily: "var(--m-mono)", fontSize: 11 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Order */}
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,0.31)", marginBottom: 8, fontWeight: 600 }}>Order</div>
                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: "var(--m-mono)", color: "var(--m-acid)", fontSize: 12, fontWeight: 500 }}>{activeConv.ctx.orderId}</div>
                      <div style={{ color: "var(--m-paper)", fontSize: 13, marginTop: 6 }}>{activeConv.ctx.orderName}</div>
                      <div style={{ color: "rgba(255,255,255,0.37)", fontSize: 11, marginTop: 4 }}>{activeConv.ctx.orderMeta}</div>
                    </div>
                  </div>

                  {/* Action plan */}
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,0.31)", marginBottom: 8, fontWeight: 600 }}>Action plan</div>
                    <ProposedPlan plan={activeConv.plan} draft={activeConv.draft} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
