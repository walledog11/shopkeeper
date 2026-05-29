import { SignUp } from "@clerk/nextjs";
import { Star, Zap } from "lucide-react";
import AuthShell from "../_components/AuthShell";
import { getAuthClerkAppearance } from "../_components/clerk-appearance";

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

function SignupAside() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_24px_100px_-56px_rgba(0,0,0,0.95)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
            Clerk Inbox
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-400">
            <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {inboxFeed.map((item) => (
            <div key={`${item.channel}-${item.sender}`} className="flex items-start gap-3 px-4 py-3.5">
              <div
                className="mt-0.5 shrink-0 size-7 rounded-lg flex items-center justify-center text-white text-xs font-extrabold tracking-wide"
                style={item.channelStyle}
              >
                {item.channelLabel}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-white/85 truncate">
                    {item.sender}
                    <span className="font-normal text-white/40 ml-1.5">· {item.channel}</span>
                  </p>
                  <span className="text-xs text-white/40 shrink-0">{item.time}</span>
                </div>
                <p className="text-xs text-white/55 mt-0.5 truncate">{item.preview}</p>
                <div className="mt-1.5">
                  {item.aiDrafted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-300 bg-green-400/10 border border-green-400/30 rounded-full px-2 py-0.5">
                      <Zap className="size-2.5" />
                      AI drafted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/50 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5">
                      Pending review
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02]">
            <span className="text-xs text-white/55 font-medium">
              <span className="font-extrabold text-white/85">143</span> tickets resolved today
            </span>
            <span className="text-xs font-extrabold text-green-300">
              AI handled 91%
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_100px_-56px_rgba(0,0,0,0.95)]">
        <div className="flex gap-0.5 mb-2.5">
          {["star-1", "star-2", "star-3", "star-4", "star-5"].map((key) => (
            <Star key={key} className="size-3 text-green-400 fill-green-400" />
          ))}
        </div>
        <p className="text-sm text-white/75 leading-relaxed italic">
          &ldquo;{testimonial.quote}&rdquo;
        </p>
        <div className="mt-3.5 flex items-center gap-2.5">
          <div className="size-7 rounded-full bg-green-400/15 border border-green-400/30 flex items-center justify-center text-green-300 text-xs font-extrabold">
            {testimonial.initials}
          </div>
          <div>
            <p className="text-xs font-bold text-white/85">{testimonial.name}</p>
            <p className="text-xs text-white/45">{testimonial.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <AuthShell
      backHref="/"
      backLabel="Back to home"
      eyebrow="Free 14-day trial"
      title={
        <>
          Support that
          <br />
          <span className="text-green-400">runs itself.</span>
        </>
      }
      description="Every DM, SMS, and Shopify order in one inbox. Clerk reads, drafts, and resolves , you just approve."
      aside={<SignupAside />}
    >
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={getAuthClerkAppearance({
          header: "hidden",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
        })}
      />
    </AuthShell>
  );
}
