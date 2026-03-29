"use client";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send, Plug, MessageCircle, Filter, Bell,
  Star, Zap, Clock, FileText, Bot, PenLine,
  Link2, Settings, RefreshCw, Shield, Sparkles,
  Loader2, CheckCircle2, ArrowRight, Ticket, Settings2, Plus
} from "lucide-react";

const features = [
  {
    id: "inbox",
    category: "INBOX",
    title: "All your messages,\none clean dashboard",
    description:
      "Customer messages from Instagram, SMS, Shopify, and Email — routed to one place. No more switching tabs.",
    preview: "inbox",
    bgClass: "bg-blue-100/60",
    categoryColor: "text-blue-600",
    subFeatures: [
      { icon: MessageCircle, label: "Multi-channel" },
      { icon: RefreshCw, label: "Real-time Sync" },
      { icon: Filter, label: "Smart Filters" },
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
    bgClass: "bg-amber-100/60",
    categoryColor: "text-amber-600",
    subFeatures: [
      { icon: Zap, label: "Instant Analysis" },
      { icon: FileText, label: "Key Details" },
      { icon: Clock, label: "Time Saved" },
      { icon: Star, label: "Smart Priority" },
    ],
  },
  {
    id: "respond",
    category: "RESPOND",
    title: "Delegate tasks,\nlike a real employee",
    description:
      "Communicate with clerk like a team member. Delegate tasks by simply instructing what you'd like done.",
    preview: "respond",
    bgClass: "bg-green-100/60",
    categoryColor: "text-green-600",
    subFeatures: [
      { icon: Bot, label: "AI Agent" },
      { icon: Send, label: "Auto-respond" },
      { icon: PenLine, label: "Draft & Edit" },
      { icon: Shield, label: "Brand Voice" },
    ],
  },
  {
    id: "integrations",
    category: "CONNECT",
    title: "Connect all your\nchannels in minutes",
    description:
      "Plug in Instagram, SMS, Shopify, and your business email. New channels added regularly. Setup takes under 5 minutes.",
    preview: "integrations",
    bgClass: "bg-purple-100/60",
    categoryColor: "text-purple-600",
    subFeatures: [
      { icon: Link2, label: "Easy Setup" },
      { icon: Settings, label: "Configure" },
      { icon: RefreshCw, label: "Auto-sync" },
      { icon: Plug, label: "Extensible" },
    ],
  },
];

function InboxPreview() {
  return (
    <div className="flex justify-center w-full">
      <div className="relative w-[260px] aspect-[9/19.5] rounded-[2.5rem] border-[6px] border-slate-900 bg-white shadow-xl overflow-hidden flex flex-col">
        <div className="relative flex items-center justify-center pt-3 pb-2 bg-white">
          <div className="w-20 h-5 bg-slate-900 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
          <span className="text-xs font-semibold text-foreground">Inbox</span>
          <span className="text-[10px] text-muted-foreground">4 new</span>
        </div>
        <div className="divide-y flex-1">
          {[
            { platform: "IG", color: "bg-pink-100 text-pink-600", name: "Sarah M.", msg: "Hi, I need help with my order #2849..." },
            { platform: "SM", color: "bg-blue-100 text-blue-700", name: "James L.", msg: "Can I change my shipping address?" },
            { platform: "SP", color: "bg-green-100 text-green-700", name: "Emma R.", msg: "When will my item be back in stock?" },
            { platform: "EM", color: "bg-red-100 text-red-500", name: "David K.", msg: "Requesting a refund for order #3012" },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${item.color}`}>
                {item.platform}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{item.name}</div>
                <div className="text-xs text-muted-foreground truncate">{item.msg}</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            </div>
          ))}
        </div>
        <div className="flex justify-center py-3 bg-white mt-auto">
          <div className="w-24 h-1 bg-slate-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function SummaryPreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1000), // Cursor moves in
      setTimeout(() => setStep(2), 2200), // Cursor clicks
      setTimeout(() => setStep(3), 2400), // Processing state starts
      setTimeout(() => setStep(4), 4800), // Success state
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex justify-center w-full h-[520px]">
      <div className="relative w-full max-w-[360px] h-full rounded-[2rem] bg-[#FAFAFC] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-slate-200/60 flex flex-col overflow-hidden font-sans">
        <div className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-5 shrink-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800 tracking-tight">AI Triage</span>
          </div>
          <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
            3 Pending
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden relative">
            <div className={`transition-opacity duration-300 ${step >= 3 ? 'opacity-0 hidden' : 'opacity-100'}`}>
              <div className="p-4 pb-3">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[11px] font-medium text-slate-400">Marketplace Prints • #MXP29187</span>
                  <span className="text-[10px] font-semibold tracking-wide bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md">
                    Modify Order
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                  Customer wants to remove the &quot;Canvas Tote&quot; from their order before it ships.
                </p>
              </div>
              
              <div className="p-3 mx-3 mb-3 bg-slate-50 rounded-xl border border-slate-100/60">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-semibold text-slate-800">Suggested Action</span>
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Check if shipped. If not, remove item, issue $24.00 refund, and notify customer.
                </p>
                <div className="flex gap-2">
                  <button className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
                    ${step === 2 ? 'bg-slate-800 text-white scale-[0.97]' : 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'}`}>
                    Approve & Run
                  </button>
                  <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
                    Edit
                  </button>
                </div>
              </div>
            </div>

            <div className={`absolute inset-0 bg-white flex flex-col justify-center items-center p-5 transition-opacity duration-300 
              ${step >= 3 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {step === 3 && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center space-y-4"
                >
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  <div className="text-center">
                    <div className="text-xs font-semibold text-slate-800">Executing workflow</div>
                    <div className="text-[11px] text-slate-400 mt-1">Checking fulfillment status...</div>
                  </div>
                </motion.div>
              )}
              {step >= 4 && (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center w-full"
                >
                  <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 mb-4">Resolved Successfully</span>
                  <div className="w-full space-y-2">
                    {["Item removed from #MXP29187", "$24.00 refunded to original payment", "Confirmation email sent"].map((txt, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * i }}
                        key={i} 
                        className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"
                      >
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        {txt}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 p-4 opacity-90">
            <div className="flex justify-between items-start mb-3">
              <span className="text-[11px] font-medium text-slate-400">Color Couture • Instagram</span>
              <span className="text-[10px] font-semibold tracking-wide bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">
                Restock Info
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed font-medium mb-4">
              User asking &quot;When will the summer dress be back in stock?&quot;
            </p>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100/80">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-500">Draft ready to review</span>
              </div>
              <button className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition-colors">
                View →
              </button>
            </div>
          </div>
        </div>

        <div 
          className="absolute z-50 pointer-events-none transition-all duration-[1200ms] ease-out"
          style={{ top: step >= 1 ? '168px' : '400px', left: step >= 1 ? '110px' : '280px', opacity: step >= 3 ? 0 : 1 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg scale-110">
            <path d="M5.5 3.21V20.8C5.5 21.43 6.24 21.76 6.71 21.34L11.43 17.16H18C18.55 17.16 19 16.71 19 16.16V3.21C19 2.66 18.55 2.21 18 2.21H6.5C5.95 2.21 5.5 2.66 5.5 3.21Z" fill="black"/>
            <path d="M6 3.21V20.8C6 21.12 6.37 21.28 6.6 21.08L11.23 17H18C18.28 17 18.5 16.78 18.5 16.5V3.21C18.5 2.93 18.28 2.71 18 2.71H6.5C6.22 2.71 6 2.93 6 3.21Z" fill="white"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

let respondAnimationPlayed = false;
const YOU_SAID_TEXT = "Update the address and inform the customer about the changes";

function RespondPreview() {
  const [step, setStep] = useState(() => (respondAnimationPlayed ? 4 : 0));
  const [typedText, setTypedText] = useState(() => (respondAnimationPlayed ? YOU_SAID_TEXT : ""));
  const [showCursor, setShowCursor] = useState(false);
  const typingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (respondAnimationPlayed) return;

    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 1400),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (step !== 2 || respondAnimationPlayed) return;

    setShowCursor(true);
    let charIndex = 0;
    typingInterval.current = setInterval(() => {
      charIndex++;
      setTypedText(YOU_SAID_TEXT.slice(0, charIndex));
      if (charIndex >= YOU_SAID_TEXT.length) {
        clearInterval(typingInterval.current!);
        setShowCursor(false);
        setTimeout(() => setStep(3), 400);
      }
    }, 24);

    return () => {
      if (typingInterval.current) clearInterval(typingInterval.current);
    };
  }, [step]);

  useEffect(() => {
    if (step !== 3 || respondAnimationPlayed) return;

    const timer = setTimeout(() => {
      setStep(4);
      respondAnimationPlayed = true;
    }, 1200);

    return () => clearTimeout(timer);
  }, [step]);

  return (
    <div className="flex justify-center w-full h-[460px]">
      {/* App Window Shell */}
      <div className="relative w-[340px] h-full rounded-2xl border border-slate-200 bg-slate-50 shadow-xl overflow-hidden flex flex-col font-sans">
        
        {/* Header */}
        <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 z-10 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-yellow-400 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Agent Chat</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
            Online
          </span>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          {/* Step 0: System Context (Ticket Reference) */}
          <div className={`transition-all duration-700 ease-out ${step >= 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="flex flex-col gap-1 items-start">
              <span className="text-[10px] font-medium text-slate-400 ml-1 uppercase tracking-wider">Context</span>
              <div className="bg-white border border-slate-200 rounded-xl rounded-tl-sm p-3 shadow-sm max-w-[90%]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Ticket className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Ticket #2849</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Customer requested an address change to: <br />
                  <span className="font-medium text-slate-800">1234 Main Street, Los Angeles, CA 90210</span>
                </p>
              </div>
            </div>
          </div>

          {/* Step 1/2: User Input */}
          <div className={`transition-all duration-700 ease-out flex justify-end ${step >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="bg-slate-800 text-white rounded-xl rounded-tr-sm p-3 shadow-sm max-w-[85%]">
              <p className="text-[11px] leading-relaxed">
                {typedText}
                {showCursor && <span className="inline-block w-[2px] h-3 bg-white align-middle ml-[1px] animate-pulse" />}
              </p>
            </div>
          </div>

          {/* Step 3/4: AI Response & Action */}
          <div className={`transition-all duration-700 ease-out ${step >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="flex flex-col gap-1 items-start w-full">
              <span className="text-[10px] font-medium text-slate-400 ml-1 uppercase tracking-wider flex items-center gap-1">
                <Bot className="w-3 h-3" /> clerk agent
              </span>
              
              <div className="bg-white border border-slate-200 rounded-xl rounded-tl-sm p-1 shadow-sm w-full relative overflow-hidden">
                
                {/* Thinking State */}
                <div className={`p-3 transition-opacity duration-500 ease-in-out ${step === 3 ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"}`}>
                   <div className="flex items-center gap-1.5 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>

                {/* Draft Ready State */}
                <div className={`transition-opacity duration-500 ease-in-out flex flex-col ${step >= 4 ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"}`}>
                  
                  {/* Routing Header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 rounded-t-lg">
                    <span className="text-[10px] font-bold text-slate-500">Drafted Reply</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100">
                      Instagram DM
                    </span>
                  </div>

                  {/* Message Content */}
                  <div className="p-3">
                    <p className="text-[11px] text-slate-700 leading-relaxed mb-3">
                      Hi Sarah! We&apos;ve updated the shipping address for your order #2849 and it will ship to the new address tomorrow. Let us know if you need anything else!
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button className="flex-1 py-1.5 bg-foreground text-background rounded-md text-[11px] font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-1.5">
                        <Zap className="w-3 h-3" /> Approve & Send
                      </button>
                      <button className="px-4 py-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-md text-[11px] font-medium transition-colors">
                        Edit
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function IntegrationsPreview() {
  const channels = [
    { name: "Instagram DM", icon: "/logos/instagram-logo.png", status: "Connected & Syncing", toggle: true },
    { name: "SMS (Twilio)", icon: "/logos/sms.svg", status: "Connected & Syncing", toggle: true },
    { name: "Shopify", icon: "/logos/shopify-inbox.png", status: "Connected & Syncing", toggle: true },
    { name: "Gmail Support", icon: "/logos/gmail.png", status: "Connected & Syncing", toggle: true },
  ];

  return (
    <div className="flex justify-center w-full h-[460px]">
      {/* App Window Shell */}
      <div className="relative w-[340px] h-full rounded-2xl border border-slate-200 bg-slate-50 shadow-xl overflow-hidden flex flex-col font-sans">
        
        {/* Header */}
        <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 z-10 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-yellow-400 flex items-center justify-center shadow-sm">
              <Settings2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Settings</span>
          </div>
          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
            4 Active
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          <div className="mb-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Channels</h4>
            <p className="text-xs text-slate-800 font-semibold">Manage your linked platforms</p>
          </div>

          {/* Channel Cards */}
          <div className="space-y-2.5">
            {channels.map((ch) => (
              <div 
                key={ch.name} 
                className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm group hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <Image src={ch.icon} alt={ch.name} width={20} height={20} className="object-contain" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">{ch.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                      <span className="text-[10px] text-slate-500">{ch.status}</span>
                    </div>
                  </div>
                </div>
                
                {/* Custom Toggle Switch */}
                <div className={`w-8 h-4.5 rounded-full ${ch.toggle ? "bg-yellow-400" : "bg-slate-200"} relative cursor-pointer shadow-inner`}>
                  <div className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${ch.toggle ? "right-[2px]" : "left-[2px]"}`} />
                </div>
              </div>
            ))}
          </div>

          {/* Add New Button */}
          <div className="pt-2">
            <button className="w-full py-3 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl text-xs font-semibold text-slate-500 hover:bg-white hover:border-slate-300 hover:text-slate-700 transition-all flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Connect New Channel
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
const previewComponents: Record<string, React.FC> = {
  inbox: InboxPreview,
  summary: SummaryPreview,
  respond: RespondPreview,
  integrations: IntegrationsPreview,
};

export function Features() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section id="features" className="relative z-10 w-full py-14 bg-background">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        {/* Section heading */}
        <h2 className="text-center text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-16 md:mb-24">
          Everything you need in one place
        </h2>

        <div className="flex flex-col md:flex-row gap-12 lg:gap-20 items-start">
          
          {/* Desktop Left Side: Sticky Visual Pane */}
          {/* Hides on mobile (hidden md:flex), stays sticky on desktop */}
          <div className="hidden md:flex w-full md:w-1/2 sticky top-24 h-[600px] items-center justify-center rounded-3xl overflow-hidden transition-colors duration-500">
            <AnimatePresence mode="wait">
              {features.map((feature, index) => {
                if (index !== activeIndex) return null;
                const PreviewComponent = previewComponents[feature.preview];
                return (
                  <motion.div
                    key={feature.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className={`absolute inset-0 flex items-center justify-center p-6 sm:p-10 ${feature.bgClass}`}
                  >
                    <PreviewComponent />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Right Side: Text & Mobile Graphics */}
          <div className="w-full md:w-1/2 pb-12 md:pb-[50vh]">
            {features.map((feature, index) => {
              const isActive = index === activeIndex;
              const MobilePreviewComponent = previewComponents[feature.preview];
              
              return (
                <motion.div
                  key={feature.id}
                  // Detects scroll position to trigger desktop graphics
                  onViewportEnter={() => setActiveIndex(index)}
                  viewport={{ margin: "-45% 0px -45% 0px" }} 
                  className={`
                    flex flex-col justify-center transition-all duration-500
                    mb-24 md:mb-0 md:min-h-[80vh]
                    ${isActive ? "md:opacity-100 md:translate-x-0" : "md:opacity-30 md:-translate-x-4"}
                  `}
                >
                  
                  {/* Mobile Preview Block */}
                  {/* Only shows on mobile (< md), creates the standard stacked layout */}
                  <div className={`md:hidden w-full h-[500px] sm:h-[550px] mb-8 rounded-3xl flex items-center justify-center p-4 relative overflow-hidden ${feature.bgClass}`}>
                    <MobilePreviewComponent />
                  </div>

                  {/* Category label */}
                  <span className={`text-xs font-semibold tracking-widest uppercase ${feature.categoryColor} mb-4`}>
                    {feature.category}
                  </span>

                  {/* Heading */}
                  <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight whitespace-pre-line">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-md">
                    {feature.description}
                  </p>

                  {/* Sub-features 2×2 grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-8 max-w-md">
                    {feature.subFeatures.map((sf) => (
                      <div key={sf.label} className="flex items-center gap-2.5">
                        <sf.icon className="w-5 h-5 text-foreground/70 shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {sf.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-10">
                    <a href="/signup" className="inline-block px-6 py-3 bg-foreground text-background rounded-full text-sm font-medium hover:opacity-90 transition-opacity shadow-sm">
                      Get started free
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}