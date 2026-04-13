"use client";

import Link from "next/link";
import { Bot, ArrowLeft, Zap, Star } from "lucide-react";
import { SignUp } from "@clerk/nextjs";
import { DotPattern } from "@/components/ui/dot-pattern";

// Real channel-branded inbox items — immediately shows what the product does
const inboxFeed = [
  {
    channelStyle: { background: "linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)" },
    channelLabel: "IG",
    channel: "Instagram",
    sender: "@kaylasmith98",
    preview: "hey when will my order arrive?? been waiting 2 weeks",
    time: "just now",
    aiDrafted: true,
  },
  {
    channelStyle: { background: "#10b981" },
    channelLabel: "SMS",
    channel: "SMS",
    sender: "+1 (555) 204-3891",
    preview: "Package shows delivered but I never received it",
    time: "2m ago",
    aiDrafted: true,
  },
  {
    channelStyle: { background: "#95BF47" },
    channelLabel: "SH",
    channel: "Shopify · #4821",
    sender: "Emma Torres",
    preview: "Can I still change my shipping address before it ships?",
    time: "5m ago",
    aiDrafted: false,
  },
];

const testimonial = {
  quote:
    "We went from 200 unread DMs a week to inbox zero. Response time dropped from 14 hours to 20 minutes.",
  name: "Maya Chen",
  role: "Head of CX, Solaris Skincare",
  initials: "MC",
};

export default function SignUpPage() {
  return (
    <div className="min-h-screen relative flex bg-black overflow-hidden font-sans">

      {/* Background — identical to landing hero */}
      <DotPattern
        width={26}
        height={26}
        cr={1}
        className="absolute inset-0 z-0 opacity-70 [mask-image:linear-gradient(to_bottom,white_40%,transparent_100%)]"
      />
      {/* Tight top-left glow — less creamy than centered */}
      <div className="absolute top-0 left-0 w-[500px] h-[350px] opacity-[0.10] pointer-events-none blur-[120px] bg-green-400 z-0" />

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-[54%] relative flex-col px-14 xl:px-20 py-12">
        <div className="relative z-10 flex flex-col h-full">

          {/* Logo — matches navbar exactly */}
          <Link href="/" className="flex items-center gap-2 group w-fit">
            <Bot className="w-5 h-5 text-slate-800 group-hover:text-green-500 transition-colors" />
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
          </Link>

          {/* Headline block */}
          <div className="mt-14 xl:mt-20">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-widest mb-5 shadow-sm">
              <Zap className="w-3 h-3 text-green-500" />
              Free 14-day trial
            </div>

            <h1 className="text-5xl xl:text-6xl font-extrabold tracking-tighter text-slate-900 leading-[1.05] mb-4">
              Support that<br />
              <span className="text-green-500">runs itself.</span>
            </h1>

            <p className="text-slate-500 text-base leading-relaxed max-w-sm">
              Every DM, SMS, and Shopify order in one inbox. Clerk reads, drafts, and resolves — you just approve.
            </p>
          </div>

          {/* ── Mini Live Inbox ── */}
          <div className="mt-8 max-w-[420px]">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Clerk Inbox
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
              {inboxFeed.map((item, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  {/* Channel badge with real brand color */}
                  <div
                    className="mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-extrabold tracking-wide"
                    style={item.channelStyle}
                  >
                    {item.channelLabel}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {item.sender}
                        <span className="font-normal text-slate-400 ml-1.5">· {item.channel}</span>
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.time}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{item.preview}</p>
                    <div className="mt-1.5">
                      {item.aiDrafted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          AI drafted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                          Pending review
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Stats strip inside the feed */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80">
                <span className="text-[11px] text-slate-500 font-medium">
                  <span className="font-extrabold text-slate-800">143</span> tickets resolved today
                </span>
                <span className="text-[11px] font-extrabold text-green-600">
                  AI handled 91%
                </span>
              </div>
            </div>
          </div>

          {/* Testimonial — pushed to bottom */}
          <div className="mt-auto pt-8 max-w-[420px]">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <div className="flex gap-0.5 mb-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3 h-3 text-green-400 fill-green-400" />
                ))}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed italic">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="mt-3.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-green-100 border border-green-200 flex items-center justify-center text-green-700 text-[10px] font-extrabold">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{testimonial.name}</p>
                  <p className="text-[11px] text-slate-400">{testimonial.role}</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Vertical divider */}
      <div className="hidden lg:block w-px bg-slate-200/70 self-stretch my-12 relative z-10 shrink-0" />

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-6 py-12">

        <Link
          href="/"
          className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>

        {/* Mobile-only logo */}
        <div className="lg:hidden mb-8">
          <Link href="/" className="flex items-center gap-2 group">
            <Bot className="w-5 h-5 text-slate-800 group-hover:text-green-500 transition-colors" />
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
          </Link>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Create your account
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Start your free 14-day trial — no card needed.
            </p>
          </div>

          <SignUp
            routing="hash"
            signInUrl="/login"
            fallbackRedirectUrl="/welcome"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "rounded-2xl shadow-sm border border-slate-200 bg-white w-full",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                header: "hidden",
                formButtonPrimary:
                  "bg-slate-900 hover:bg-slate-800 rounded-full font-bold transition-colors",
                footerActionLink: "text-green-600 hover:text-green-700 font-bold",
                formFieldInput:
                  "rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-green-400 transition-all",
                socialButtonsBlockButton:
                  "rounded-full border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 bg-white transition-colors",
                dividerLine: "bg-slate-200",
                dividerText: "text-slate-400 text-xs font-medium",
                formFieldLabel: "text-slate-700 font-semibold text-sm",
                identityPreviewText: "text-slate-700",
                identityPreviewEditButtonIcon: "text-green-500",
              },
            }}
          />

          <p className="text-center text-xs text-slate-400 mt-5">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-slate-600 transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-slate-600 transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
