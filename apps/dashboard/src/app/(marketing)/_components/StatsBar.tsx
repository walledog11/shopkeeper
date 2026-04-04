"use client";

import { motion } from "motion/react";
import { MessageCircle, Clock, Zap, BarChart2 } from "lucide-react";

const stats = [
  {
    icon: MessageCircle,
    value: "10,000+",
    label: "Support conversations tracked",
  },
  {
    icon: Clock,
    value: "< 30s",
    label: "Average first response time",
  },
  {
    icon: Zap,
    value: "80%",
    label: "AI-assisted resolution rate",
  },
  {
    icon: BarChart2,
    value: "4 KPIs",
    label: "Volume, AI rate, team performance, SLA",
  },
];

export function StatsBar() {
  return (
    <section className="relative w-full py-14 bg-slate-50 border-y border-slate-100">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center text-center gap-2"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-1">
                <stat.icon className="w-5 h-5 text-slate-600" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                {stat.value}
              </span>
              <span className="text-xs font-medium text-slate-500 leading-snug max-w-[120px]">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
