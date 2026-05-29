const STATS = [
  { dim: "[live]", val: "2,847 tickets resolved", accent: "today" },
  { dim: "avg first response", val: "", accent: "42s" },
  { dim: "brands using clerk", val: "", accent: "1,204" },
  { dim: "messages drafted last hour", val: "", accent: "8,931" },
  { dim: "refunds processed", val: "", accent: "$184k this week" },
];

const TICKER_STATS = [
  ...STATS.map((stat) => ({ ...stat, key: `first-${stat.dim}-${stat.accent}` })),
  ...STATS.map((stat) => ({ ...stat, key: `second-${stat.dim}-${stat.accent}` })),
];

function TickerItem({ dim, val, accent }: { dim: string; val: string; accent: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-white/40">{dim}</span>
      {val && <span>{val}</span>}
      <span className="text-green-600">{accent}</span>
    </span>
  );
}

export function StatsTicker() {
  return (
    <div className="max-w-[100vw] overflow-hidden border-y border-solid border-stone-900/10 bg-stone-900">
      <div className="flex w-max animate-[m-scroll_40s_linear_infinite] items-center gap-16 px-7 py-6 text-[13px] text-stone-100 [font-family:var(--m-mono)]">
        {TICKER_STATS.map((s) => (
          <TickerItem key={s.key} {...s} />
        ))}
      </div>
    </div>
  );
}
