"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  MessageCircle, Bot,
  RefreshCw, CheckCircle2, MessageSquare,
  Lock, Check, Search, Send, Tag,
} from "lucide-react";

/* ─── InboxPreview ─────────────────────────────────────────────────────────── */
function InboxPreview() {
  const threads = [
    {
      logo: "/logos/instagram-logo.png",
      platform: "Instagram",
      customer: "sarah_styles",
      subject: "Order size change request",
      preview: "Hi! I ordered the wrong size, can I switch to Medium?",
      tag: "Returns",
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
      tag: "Refund",
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
      tag: "Address",
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
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Open
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {t.tag}
                  </span>
                </div>
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

/* ─── Main Section — 3-step solution flow ──────────────────────────────────── */
export function Features() {
  return (
    <section id="features" className="relative z-10 w-full py-24 bg-[#fffaf5]">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        {/* Section header */}
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            How Clerk works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            From message to resolution in three steps.
          </p>
        </div>

        {/* Step 1 — text left, preview right */}
        <motion.div
          className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center mb-28"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-8 rounded-full bg-amber-400 text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
              <span className="text-xs font-bold tracking-widest uppercase text-amber-600">Connect</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">
              Every message,<br />one inbox
            </h3>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md">
              Instagram DMs, emails, SMS, and Shopify messages all land in a single queue. Each ticket is auto-tagged so triage takes seconds, not minutes.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              {[
                { icon: MessageCircle, label: "Multi-channel" },
                { icon: Tag, label: "Auto-tagging" },
                { icon: RefreshCw, label: "Real-time sync" },
              ].map((sf) => (
                <div key={sf.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <sf.icon className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-medium">{sf.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="transform scale-[0.85] origin-top">
                <InboxPreview />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Step 2 — preview left, text right */}
        <motion.div
          className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center mb-28"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex justify-center order-2 md:order-1">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="transform scale-[0.85] origin-top">
                <SummaryPreview />
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-8 rounded-full bg-amber-400 text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
              <span className="text-xs font-bold tracking-widest uppercase text-amber-600">Triage</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">
              AI reads, summarizes,<br />and drafts a plan
            </h3>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md">
              Clerk extracts order context, identifies customer intent, and generates a step-by-step action plan — before your team even opens the ticket.
            </p>
          </div>
        </motion.div>

        {/* Step 3 — HERO: Human approves (centered, full width, emphasized) */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-8 h-8 rounded-full bg-amber-400 text-white text-sm font-bold flex items-center justify-center shrink-0">3</span>
              <span className="text-xs font-bold tracking-widest uppercase text-amber-600">Approve</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">
              You approve. Clerk executes.
            </h3>
            <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Type @clerk in internal notes, review the proposed steps, toggle what should run, and approve. Nothing reaches the customer without your sign-off.
            </p>
          </div>
          <div className="flex justify-center">
            <div className="rounded-2xl border-2 border-amber-200 bg-white shadow-xl overflow-hidden ring-1 ring-amber-100">
              <div className="transform scale-[0.9] origin-top">
                <RespondPreview />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
