"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Shield,
  Cloud,
  CheckCircle2,
  Users,
  Lock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared small components                                            */
/* ------------------------------------------------------------------ */

function AvatarStack({ colors, overflow }: { colors: string[]; overflow?: number }) {
  return (
    <div className="flex -space-x-1.5 mt-2">
      {colors.map((c, i) => (
        <div key={i} className={`w-5 h-5 rounded-full ${c} border-2 border-white`} />
      ))}
      {overflow && (
        <div className="w-5 h-5 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[7px] font-bold text-slate-500">
          +{overflow}
        </div>
      )}
    </div>
  );
}

const permissions = [
  { label: "View messages ✓", allowed: true },
  { label: "Send replies ✓", allowed: true },
  { label: "Change settings ✗", allowed: false },
];

/* ------------------------------------------------------------------ */
/*  Illustrative graphics for the 3 main feature cards                 */
/* ------------------------------------------------------------------ */

function AccessControlsGraphic() {
  return (
    <div className="relative p-4 space-y-3">
      {/* Role groups */}
      <div className="flex gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex-1 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
              <Shield className="w-3 h-3 text-blue-600" />
            </div>
            <span className="text-[11px] font-semibold text-slate-900">Owner &middot; 2</span>
          </div>
          <div className="text-[10px] text-slate-500 space-y-0.5">
            <div>All Channels</div>
            <div>Full Access</div>
          </div>
          <AvatarStack colors={["bg-blue-400", "bg-pink-400", "bg-amber-400", "bg-green-400"]} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex-1 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
              <Users className="w-3 h-3 text-slate-600" />
            </div>
            <span className="text-[11px] font-semibold text-slate-900">Staff &middot; 8</span>
          </div>
          <div className="text-[10px] text-slate-500 space-y-0.5">
            <div>View &amp; Reply Only</div>
            <div>3 Channels</div>
          </div>
          <AvatarStack colors={["bg-violet-400", "bg-teal-400", "bg-rose-400"]} overflow={13} />
        </div>
      </div>

      {/* Scope controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5">
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-4 h-4 rounded bg-blue-100 flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-blue-600" />
          </div>
          <span className="font-semibold text-slate-900">Permissions</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {permissions.map((p) => (
            <span
              key={p.label}
              className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                p.allowed ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>
        {/* Toggles */}
        {[
          { label: "Let staff share conversations?", on: false },
          { label: "Allow staff to edit AI settings?", on: false },
        ].map((t) => (
          <div key={t.label} className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">{t.label}</span>
            <div className={`w-7 h-4 rounded-full ${t.on ? "bg-blue-500" : "bg-slate-200"} relative`}>
              <div
                className={`w-3 h-3 rounded-full bg-white absolute top-0.5 shadow-sm transition-all ${
                  t.on ? "left-3.5" : "left-0.5"
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLoggingGraphic() {
  const events = [
    { action: "Reply Sent to Customer", user: "Jessica", date: "Mar 10, 2026", color: "bg-blue-500" },
    { action: "AI Auto-Replied", user: "Clerk AI", date: "Mar 10, 2026", color: "bg-violet-500" },
    { action: "New Team Member Added", user: "Dorothy", date: "Mar 10, 2026", color: "bg-pink-500" },
    { action: "Refund Processed", user: "James", date: "Mar 9, 2026", color: "bg-green-500" },
    { action: "Instagram Connected", user: "Daniel", date: "Mar 9, 2026", color: "bg-amber-500" },
  ];

  return (
    <div className="p-4 space-y-2">
      {events.map((e, i) => (
        <motion.div
          key={i}
          className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm flex items-center gap-3"
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.2 + i * 0.08 }}
          viewport={{ once: true }}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${e.color} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-slate-900">{e.action}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-3.5 h-3.5 rounded-full ${e.color} shrink-0`} />
              <span className="text-[10px] text-slate-500">{e.user} &middot; {e.date}</span>
            </div>
          </div>
        </motion.div>
      ))}
      <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
        <div className="bg-slate-50 rounded p-2 text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
            <span>Every action is logged and searchable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VPCGraphic() {
  return (
    <div className="relative flex items-center justify-center h-full min-h-[220px]">
      {/* Cloud outline */}
      <svg
        viewBox="0 0 200 140"
        className="w-48 h-auto"
        fill="none"
      >
        {/* Cloud shape */}
        <path
          d="M160 95c11 0 20-9 20-20s-9-20-20-20c0-22-18-40-40-40-16 0-30 10-36 24-3-2-7-4-12-4-15 0-27 12-27 27 0 1 0 2 0 3C34 68 25 78 25 90c0 14 11 25 25 25h110z"
          stroke="#e2e8f0"
          strokeWidth="2"
          strokeDasharray="6 4"
          className="animate-[dash_20s_linear_infinite]"
        />
        {/* Nodes */}
        {[
          { cx: 70, cy: 75, r: 6, color: "#818cf8" },
          { cx: 100, cy: 55, r: 8, color: "#f472b6" },
          { cx: 130, cy: 75, r: 6, color: "#34d399" },
          { cx: 100, cy: 90, r: 5, color: "#fbbf24" },
        ].map((n, i) => (
          <g key={i}>
            <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} opacity="0.2" />
            <circle cx={n.cx} cy={n.cy} r={n.r - 2} fill={n.color} />
          </g>
        ))}
        {/* Connection lines */}
        {[
          [70, 75, 100, 55],
          [100, 55, 130, 75],
          [70, 75, 100, 90],
          [130, 75, 100, 90],
        ].map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#e2e8f0"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        ))}
        {/* Animated dot traveling along a path */}
        <circle r="3" fill="#818cf8" opacity="0.8">
          <animateMotion
            dur="4s"
            repeatCount="indefinite"
            path="M70 75 L100 55 L130 75 L100 90 Z"
          />
        </circle>
      </svg>
      {/* Floating brand mark */}
      <motion.div
        className="absolute bottom-4 right-4 w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Cloud className="w-5 h-5 text-slate-400" />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export function BuiltFor() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  const cards = [
    {
      title: "Activity History",
      description: "A complete timeline of every reply, team action, and customer interaction — fully searchable",
      graphic: AuditLoggingGraphic,
    },
    {
      title: "Team Roles & Permissions",
      description: "Control who can view messages, send replies, or change settings as your team grows",
      graphic: AccessControlsGraphic,
    },
    {
      title: "Your Data, Always Secure",
      description: "Encrypted in transit and at rest, with strict tenant isolation and no cross-org access",
      graphic: VPCGraphic,
    },
  ];

  return (
    <section ref={sectionRef} className="relative z-10 w-full py-24 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            Built to grow with you
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
            The infrastructure your team needs as ticket volume scales.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              className="group rounded-2xl border border-slate-200 bg-white flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
            >
              <div className="border-b border-slate-100 bg-slate-50/50 min-h-[240px] flex flex-col justify-center">
                <card.graphic />
              </div>
              <div className="p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-1.5">{card.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
