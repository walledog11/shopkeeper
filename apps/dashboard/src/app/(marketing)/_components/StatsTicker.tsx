const STATS = [
  { dim: "[live]", val: "2,847 tickets resolved", accent: "today" },
  { dim: "avg first response", val: "", accent: "42s" },
  { dim: "brands using clerk", val: "", accent: "1,204" },
  { dim: "messages drafted last hour", val: "", accent: "8,931" },
  { dim: "refunds processed", val: "", accent: "$184k this week" },
];

function TickerItem({ dim, val, accent }: { dim: string; val: string; accent: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
      <span style={{ color: "rgba(255,255,255,0.37)" }}>[{dim}]</span>
      {val && <span>{val}</span>}
      <span style={{ color: "var(--m-acid)" }}>{accent}</span>
    </span>
  );
}

export function StatsTicker() {
  return (
    <div style={{ overflow: "hidden", background: "#161413", borderTop: "1px solid var(--m-line)", borderBottom: "1px solid var(--m-line)" }}>
      <div
        style={{
          display: "flex",
          gap: 64,
          alignItems: "center",
          fontFamily: "var(--m-mono)",
          fontSize: 13,
          color: "var(--m-paper)",
          padding: "24px 0",
          animation: "m-scroll 40s linear infinite",
          width: "max-content",
        }}
      >
        {[...STATS, ...STATS].map((s, i) => (
          <TickerItem key={i} {...s} />
        ))}
      </div>
    </div>
  );
}
