const channels = [
  {
    num: "CH/01",
    iconBg: "linear-gradient(135deg,#f09433,#dc2743)",
    iconText: "IG",
    title: "Instagram DMs",
    body: "Story replies, comments, and direct messages. Clerk knows the difference and routes accordingly.",
    statLabel: "avg setup",
    statVal: "90s",
  },
  {
    num: "CH/02",
    iconBg: "#5a8f3a",
    iconText: "SH",
    title: "Shopify orders",
    body: "Refunds, address changes, tracking — Clerk pulls order data and can take action with your approval.",
    statLabel: "avg setup",
    statVal: "2m",
  },
  {
    num: "CH/03",
    iconBg: "#7c4dff",
    iconText: "SMS",
    title: "SMS, Email, WhatsApp",
    body: "One thread per customer no matter where they reach out. Switch channels mid-conversation without losing context.",
    statLabel: "avg setup",
    statVal: "4m",
  },
];

export function Channels() {
  return (
    <section id="channels" style={{ padding: "80px 28px", maxWidth: 1280, margin: "0 auto", borderTop: "1px solid var(--m-line)" }}>
      <div style={{ fontFamily: "var(--m-mono)", fontSize: 11, color: "var(--m-ink-2)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 24, height: 1, background: "var(--m-ink-2)", display: "inline-block" }} />
        01 · Channels
      </div>
      <h2 style={{ fontFamily: "var(--m-serif)", fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 0.95, letterSpacing: "-0.02em", maxWidth: "18ch", margin: "0 0 24px" }}>
        Every place a customer might find you,{" "}
        <em style={{ fontStyle: "italic", color: "var(--m-acid)" }}>in one inbox.</em>
      </h2>
      <p style={{ fontSize: 19, lineHeight: 1.45, color: "var(--m-ink-2)", maxWidth: "52ch", margin: "0 0 48px" }}>
        Connect once. Clerk pulls every conversation into a single thread per customer — so you stop scrolling between four apps.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
        {channels.map(ch => (
          <div key={ch.num} style={{ background: "var(--m-paper-2)", border: "1px solid var(--m-line)", borderRadius: 12, padding: 28, position: "relative", overflow: "hidden" }}>
            <div style={{ fontFamily: "var(--m-mono)", fontSize: 11, color: "var(--m-ink-2)", marginBottom: 32 }}>{ch.num}</div>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: ch.iconBg, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              {ch.iconText}
            </div>
            <h3 style={{ fontFamily: "var(--m-serif)", fontSize: 30, fontWeight: 400, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{ch.title}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--m-ink-2)", margin: "0 0 20px" }}>{ch.body}</p>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--m-line)", fontSize: 12 }}>
              <span style={{ color: "var(--m-ink-2)" }}>{ch.statLabel}</span>
              <span style={{ fontFamily: "var(--m-mono)", fontWeight: 500 }}>{ch.statVal}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}