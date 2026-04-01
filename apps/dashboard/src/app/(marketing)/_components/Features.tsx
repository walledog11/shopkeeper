"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  MessageCircle, Filter, Bell, Zap, Bot, Link2,
  RefreshCw, Plus, CheckCircle2, MessageSquare,
  Lock, Check, Search, Settings2, Send, FileText, Clock,
} from "lucide-react";

const features = [
  {
    id: "inbox",
    category: "INBOX",
    title: "All your messages,\none clean dashboard",
    description:
      "Customer messages from Instagram, SMS, Shopify, and Email — routed to one place. No more switching tabs.",
    preview: "inbox",
    bgClass: "bg-blue-50/70",
    categoryColor: "text-blue-600",
    subFeatures: [
      { icon: MessageCircle, label: "Multi-channel" },
      { icon: RefreshCw, label: "Real-time sync" },
      { icon: Filter, label: "Smart filters" },
      { icon: Bell, label: "Notifications" },
    ],
  },
  {
    id: "summarize",
    category: "SUMMARIZE",
    title: "From ticket\nto insight, instantly",
    description:
      "Every incoming ticket is summarized with vital details — order numbers, tracking info, customer intent — so you respond in seconds.",
    preview: "summary",
    bgClass: "bg-amber-50/70",
    categoryColor: "text-amber-600",
    subFeatures: [
      { icon: Zap, label: "Instant analysis" },
      { icon: FileText, label: "Key details" },
      { icon: Clock, label: "Time saved" },
      { icon: CheckCircle2, label: "Auto-resolved" },
    ],
  },
  {
    id: "respond",
    category: "RESPOND",
    title: "Delegate tasks,\nlike a real employee",
    description:
      "Type @clerk in your notes tab to instruct the AI agent. It runs the action, updates Shopify, and replies — you just review.",
    preview: "respond",
    bgClass: "bg-violet-50/60",
    categoryColor: "text-violet-600",
    subFeatures: [
      { icon: Bot, label: "AI agent" },
      { icon: Send, label: "Auto-reply" },
      { icon: Check, label: "Action log" },
      { icon: RefreshCw, label: "Shopify sync" },
    ],
  },
  {
    id: "integrations",
    category: "CONNECT",
    title: "Connect all your\nchannels in minutes",
    description:
      "Plug in Instagram, SMS, Shopify, and your business email. New channels added regularly. Setup takes under 5 minutes.",
    preview: "integrations",
    bgClass: "bg-slate-100/80",
    categoryColor: "text-slate-600",
    subFeatures: [
      { icon: Link2, label: "Easy setup" },
      { icon: Settings2, label: "Configure" },
      { icon: RefreshCw, label: "Auto-sync" },
      { icon: Plus, label: "Extensible" },
    ],
  },
];

/* ─── InboxPreview ─────────────────────────────────────────────────────────── */
function InboxPreview() {
  const threads = [
    {
      logo: "/logos/instagram-logo.png",
      platform: "Instagram",
      customer: "sarah_styles",
      subject: "Order size change request",
      preview: "Hi! I ordered the wrong size, can I switch to Medium?",
      time: "Just now",
      active: true,
      awaiting: true,
    },
    {
      logo: "/logos/gmail.png",
      platform: "Email",
      customer: "david@example.com",
      subject: "Refund request for #3012",
      preview: "I'd like to request a refund for my recent order.",
      time: "2m",
      active: false,
      awaiting: true,
    },
    {
      logo: "/logos/sms.svg",
      platform: "SMS",
      customer: "+1 (555) 234-5678",
      subject: "Address change for order",
      preview: "Can I update my shipping address before it ships?",
      time: "5m",
      active: false,
      awaiting: false,
    },
  ];

  return (
    <div className="flex justify-center w-full h-[480px]">
      <div className="w-[330px] h-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col font-sans">

        {/* Window chrome */}
        <div className="h-9 bg-white border-b border-slate-100 flex items-center px-3.5 gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs font-extrabold text-slate-800 tracking-tight">clerk</span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-white space-y-2 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 h-8">
            <Search className="w-3 h-3 text-slate-300 shrink-0" />
            <span className="text-xs text-slate-300">Search all tickets…</span>
          </div>

          <div className="flex bg-slate-100 rounded-md p-0.5 gap-0.5">
            <div className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded bg-white shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-slate-900">Open</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white">3</span>
            </div>
            <div className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="text-xs font-semibold text-slate-500">Closed</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-8 rounded-md border border-slate-900 bg-slate-900 text-[11px] font-semibold text-white flex items-center justify-center">All</div>
            {["/logos/instagram-logo.png", "/logos/gmail.png", "/logos/sms.svg"].map((logo, i) => (
              <div key={i} className="flex-1 h-8 rounded-md border border-slate-200 bg-white flex items-center justify-center">
                <Image src={logo} alt="logo" width={13} height={13} className="object-contain" />
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 font-medium px-0.5">3 tickets</p>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-hidden divide-y divide-slate-50">
          {threads.map((t, i) => (
            <div key={i} className={`relative px-4 py-3.5 ${t.active ? "bg-slate-50" : ""}`}>
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
                t.active ? "bg-amber-400" : t.awaiting ? "bg-amber-200" : "bg-transparent"
              }`} />

              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-4 h-4 relative shrink-0">
                    <Image src={t.logo} fill alt={t.platform} className="object-contain" />
                  </div>
                  <span className="text-xs font-semibold text-slate-900 truncate">{t.customer}</span>
                  {t.awaiting && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{t.time}</span>
              </div>

              <p className="text-[11px] font-medium text-slate-700 truncate mb-1">{t.subject}</p>
              <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{t.preview}</p>

              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Open
                </span>
                {t.awaiting && (
                  <span className="text-[10px] font-semibold text-amber-600">Awaiting reply</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── SummaryPreview ───────────────────────────────────────────────────────── */
const SUMMARY_TEXT =
  "Customer (@sarah_styles) wants to exchange order #2849 from size Small to Medium. Item not yet shipped. No previous contact history.";

let summaryPlayed = false;

function SummaryPreview() {
  const [step, setStep] = useState(() => summaryPlayed ? 2 : 0);
  const [typed, setTyped] = useState(() => summaryPlayed ? SUMMARY_TEXT : "");

  useEffect(() => {
    if (summaryPlayed) return;
    const t1 = setTimeout(() => setStep(1), 900);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (step !== 1 || summaryPlayed) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(SUMMARY_TEXT.slice(0, i));
      if (i >= SUMMARY_TEXT.length) {
        clearInterval(iv);
        setStep(2);
        summaryPlayed = true;
      }
    }, 18);
    return () => clearInterval(iv);
  }, [step]);

  return (
    <div className="flex justify-center w-full h-[520px]">
      <div className="w-[350px] h-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col font-sans">

        {/* Header */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-5 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 leading-tight">sarah_styles</h3>
            <p className="text-xs text-slate-400 font-medium">via Instagram</p>
          </div>
          <button className="bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 h-8 px-3 rounded-md">
            <CheckCircle2 className="w-3 h-3" /> Resolve
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 text-white">
            <MessageSquare className="w-3 h-3" /> Conversation
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded text-slate-400 hover:bg-slate-50">
            <Lock className="w-3 h-3" /> Notes
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden p-4 space-y-3 bg-slate-50/40">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col gap-1 items-start"
          >
            <div className="px-4 py-3.5 text-[13px] leading-relaxed bg-white border border-slate-200 text-slate-800 rounded-md rounded-tl-sm shadow-sm max-w-[85%]">
              Hi! I ordered the wrong size, can I switch to a Medium?
            </div>
            <span className="text-[10px] text-slate-400 mx-1">2m ago</span>
          </motion.div>
        </div>

        {/* Clerk Context panel */}
        <div className="border-t border-slate-100 bg-white px-4 py-4 shrink-0 min-h-[120px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest">Clerk Context</p>
            <RefreshCw className={`w-3 h-3 text-slate-300 ${step === 1 ? "animate-spin" : ""}`} />
          </div>
          {step === 0 && (
            <p className="text-xs text-slate-300 italic">Generating summary…</p>
          )}
          {step >= 1 && (
            <p className="text-xs text-slate-500 leading-relaxed">
              {typed}
              {step === 1 && (
                <span className="inline-block w-[2px] h-3 bg-slate-400 align-middle ml-px animate-pulse" />
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── RespondPreview ───────────────────────────────────────────────────────── */
const INSTRUCTION = "update the address to 1234 Main St and notify the customer";
let respondPlayed = false;

function RespondPreview() {
  const [step, setStep] = useState(() => respondPlayed ? 3 : 0);
  const [typed, setTyped] = useState(() => respondPlayed ? INSTRUCTION : "");

  useEffect(() => {
    if (respondPlayed) return;
    const t1 = setTimeout(() => setStep(1), 400);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (step !== 1 || respondPlayed) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(INSTRUCTION.slice(0, i));
      if (i >= INSTRUCTION.length) {
        clearInterval(iv);
        setTimeout(() => setStep(2), 350);
        setTimeout(() => {
          setStep(3);
          respondPlayed = true;
        }, 1800);
      }
    }, 28);
    return () => clearInterval(iv);
  }, [step]);

  const actions = [
    "Fetched Shopify customer",
    "Updated shipping address",
    "Sent reply to customer",
  ];

  return (
    <div className="flex justify-center w-full h-[520px]">
      <div className="w-[340px] h-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col font-sans">

        {/* Header */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 leading-tight">sarah_styles</h3>
            <p className="text-xs text-slate-400 font-medium">via Instagram</p>
          </div>
          <button className="bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 h-8 px-3 rounded-md">
            <CheckCircle2 className="w-3 h-3" /> Resolve
          </button>
        </div>

        {/* Tab bar — Notes active */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded text-slate-400">
            <MessageSquare className="w-3 h-3" /> Conversation
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-violet-100 text-violet-800">
            <Lock className="w-3 h-3" /> Notes
          </div>
        </div>

        {/* Notes area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-violet-50/30 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

          {/* User instruction bubble */}
          {step >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-1 items-end"
            >
              <div className="px-4 py-3.5 text-[13px] leading-relaxed bg-slate-100 text-slate-700 rounded-md rounded-tr-sm max-w-[85%]">
                <span className="text-violet-600 font-semibold">@clerk</span>{" "}
                {typed}
                {step === 1 && (
                  <span className="inline-block w-[2px] h-3 bg-slate-500 align-middle ml-px animate-pulse" />
                )}
              </div>
            </motion.div>
          )}

          {/* Agent response */}
          {step >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-1 items-start"
            >
              <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                <Bot className="w-3 h-3 text-violet-500" />
                <span className="text-[11px] font-semibold text-violet-600">Clerk Agent</span>
              </div>
              <div className="px-4 py-3 bg-violet-50 border border-violet-200 rounded-md rounded-tl-sm shadow-sm space-y-2 max-w-[85%]">
                {step === 2 ? (
                  <div className="flex items-center gap-1.5 text-xs text-violet-500">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Working on it…
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {actions.map((a, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3 text-green-500 shrink-0" />
                          <span className="text-xs text-slate-500">{a}</span>
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-[13px] text-slate-700 leading-relaxed">
                      Done. Address updated for order #2849 and customer notified via Instagram DM.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Composer — @clerk mode */}
        <div className="px-4 pb-4 pt-3 bg-white border-t border-slate-100 shrink-0">
          <div className="border border-violet-400 rounded-md overflow-hidden bg-white">
            <div className="flex items-baseline gap-2 px-4 pt-3 pb-2 min-h-[52px]">
              <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-[11px] font-semibold px-2.5 py-[4px] rounded-full shrink-0">
                <Bot className="w-3 h-3" />
                @clerk
              </span>
              <span className="text-xs text-slate-300">What should Clerk do?</span>
            </div>
            <div className="flex justify-end items-center px-3 pb-2.5">
              <button className="flex items-center gap-1.5 text-xs font-semibold bg-violet-600 text-white h-8 px-4 rounded-md">
                <Bot className="w-3.5 h-3.5" /> Ask Clerk
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── IntegrationsPreview ──────────────────────────────────────────────────── */
function IntegrationsPreview() {
  const channels = [
    { name: "Instagram DM", icon: "/logos/instagram-logo.png" },
    { name: "SMS (Twilio)", icon: "/logos/sms.svg" },
    { name: "Shopify", icon: "/logos/shopify-inbox.png" },
    { name: "Gmail", icon: "/logos/gmail.png" },
  ];

  return (
    <div className="flex justify-center w-full h-[460px]">
      <div className="w-[340px] h-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col font-sans">

        {/* Header */}
        <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Integrations</span>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
            4 Active
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Channels</p>
            <p className="text-sm font-semibold text-slate-800">Manage your linked platforms</p>
          </div>

          <div className="space-y-2">
            {channels.map((ch, i) => (
              <motion.div
                key={ch.name}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
                className="flex items-center justify-between border border-slate-200 rounded-md p-3 bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <Image src={ch.icon} alt={ch.name} width={16} height={16} className="object-contain" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800">{ch.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
                      <span className="text-[10px] text-slate-400">Connected</span>
                    </div>
                  </div>
                </div>

                {/* Toggle */}
                <div className="w-8 h-4 rounded-full bg-amber-400 relative cursor-pointer shadow-inner shrink-0">
                  <div className="absolute top-[2px] right-[2px] w-3 h-3 rounded-full bg-white shadow-sm" />
                </div>
              </motion.div>
            ))}
          </div>

          <button className="w-full py-2.5 border border-dashed border-slate-200 bg-slate-50 rounded-md text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Connect New Channel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Registry ─────────────────────────────────────────────────────────────── */
const previewComponents: Record<string, React.FC> = {
  inbox: InboxPreview,
  summary: SummaryPreview,
  respond: RespondPreview,
  integrations: IntegrationsPreview,
};

/* ─── Main Section ─────────────────────────────────────────────────────────── */
export function Features() {
  return (
    <section id="features" className="relative z-10 w-full py-14 bg-background">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <h2 className="text-center text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-16">
          Everything you need in one place
        </h2>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ── HERO: AI Summarization — 2 cols × 2 rows ── */}
          <motion.div
            className="group md:col-span-2 md:row-span-2 rounded-2xl border border-slate-200 bg-amber-50/70 overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="h-[340px] overflow-hidden flex justify-center pt-6">
              <div className="transform scale-[0.72] origin-top">
                <SummaryPreview />
              </div>
            </div>
            <div className="p-7 border-t border-amber-100 flex-1 flex flex-col justify-center">
              <span className="text-xs font-semibold tracking-widest uppercase text-amber-600 mb-3 block">
                SUMMARIZE
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-3">
                From ticket<br />to insight, instantly
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Every incoming ticket is summarized with vital details — order numbers, tracking info, customer intent — so you respond in seconds.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-5 max-w-xs">
                {features[1].subFeatures.map((sf) => (
                  <div key={sf.label} className="flex items-center gap-2">
                    <sf.icon className="w-4 h-4 text-foreground/60 shrink-0" />
                    <span className="text-xs font-medium text-foreground">{sf.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── INBOX ── */}
          <motion.div
            className="group rounded-2xl border border-slate-200 bg-blue-50/70 overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="h-[200px] overflow-hidden flex justify-center pt-4">
              <div className="transform scale-[0.55] origin-top">
                <InboxPreview />
              </div>
            </div>
            <div className="p-5 border-t border-blue-100 flex-1">
              <span className="text-xs font-semibold tracking-widest uppercase text-blue-600 mb-2 block">INBOX</span>
              <h3 className="text-lg font-bold text-foreground leading-tight mb-2">
                All your messages,<br />one clean dashboard
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Customer messages from Instagram, SMS, Shopify, and Email — routed to one place. No more switching tabs.
              </p>
            </div>
          </motion.div>

          {/* ── CONNECT ── */}
          <motion.div
            className="group rounded-2xl border border-slate-200 bg-slate-100/80 overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="h-[200px] overflow-hidden flex justify-center pt-4">
              <div className="transform scale-[0.55] origin-top">
                <IntegrationsPreview />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex-1">
              <span className="text-xs font-semibold tracking-widest uppercase text-slate-600 mb-2 block">CONNECT</span>
              <h3 className="text-lg font-bold text-foreground leading-tight mb-2">
                Connect all your<br />channels in minutes
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Plug in Instagram, SMS, Shopify, and your business email. Setup takes under 5 minutes.
              </p>
            </div>
          </motion.div>

          {/* ── RESPOND — spans full width ── */}
          <motion.div
            className="group md:col-span-3 rounded-2xl border border-slate-200 bg-violet-50/60 overflow-hidden flex flex-col md:flex-row transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="md:w-64 h-[220px] md:h-auto overflow-hidden flex justify-center pt-4 md:pt-6">
              <div className="transform scale-[0.52] origin-top">
                <RespondPreview />
              </div>
            </div>
            <div className="p-6 md:p-8 border-t md:border-t-0 md:border-l border-violet-100 flex-1 flex flex-col justify-center">
              <span className="text-xs font-semibold tracking-widest uppercase text-violet-600 mb-3 block">RESPOND</span>
              <h3 className="text-xl md:text-2xl font-bold text-foreground leading-tight mb-3">
                Delegate tasks,<br />like a real employee
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Type @clerk in your notes tab to instruct the AI agent. It runs the action, updates Shopify, and replies — you just review.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3 mt-5">
                {features[2].subFeatures.map((sf) => (
                  <div key={sf.label} className="flex items-center gap-2">
                    <sf.icon className="w-4 h-4 text-foreground/60 shrink-0" />
                    <span className="text-xs font-medium text-foreground">{sf.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
