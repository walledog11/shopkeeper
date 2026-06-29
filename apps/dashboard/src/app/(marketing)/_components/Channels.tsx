import { Reveal } from "./Reveal";

const surfaces = [
  {
    name: "Telegram",
    body: "Approve replies, ask about any order, get the morning digest — all without opening a laptop.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
        <path d="M21.9 4.6a1.5 1.5 0 0 0-2-1.1L2.9 10.2c-1.3.5-1.2 2.3.1 2.7l4.3 1.4 1.7 5.2c.4 1.2 1.9 1.5 2.7.6l2.4-2.6 4.5 3.3c.9.6 2.1.2 2.4-.9l3-14.2-.1-.1zM9.4 13.7l8.4-5.3c.4-.2.7.3.4.6l-6.9 6.4-.3 3-1.6-4.7z" />
      </svg>
    ),
  },
  {
    name: "Dashboard",
    body: "A full inbox with every conversation, your knowledge base, and team seats.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 21h8" />
        <path d="M12 18v3" />
      </svg>
    ),
  },
  {
    name: "iMessage",
    body: "Text your store's employee straight from iMessage — order lookups, daily digests, and one-tap approvals, right in the app you already live in.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
        <path d="M12 3C6.5 3 2 6.6 2 11c0 2.45 1.38 4.62 3.5 6.02-.18 1.2-.76 2.32-1.6 3.2-.22.23-.06.62.26.58 1.74-.22 3.3-.86 4.54-1.86.42.04.85.06 1.3.06 5.5 0 10-3.6 10-8s-4.5-8-10-8z" />
      </svg>
    ),
  },
  {
    name: "WhatsApp",
    body: "The same employee, one more doorway. Coming soon.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5 13.7c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.8 2c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.2 1.2z" />
      </svg>
    ),
  },
];

export function Channels() {
  return (
    <section id="channels" className="mx-auto max-w-6xl border-t border-stone-900/10 px-6 py-24 text-center">
      <Reveal>
        <h2 className="mx-auto mb-5 max-w-[22ch] text-[clamp(36px,5vw,68px)] font-black leading-[1] tracking-[-0.01em] [font-family:var(--m-caveat)]">
          Reach your new hire from <em className="italic text-[#9c9285]">wherever you already are.</em>
        </h2>
        <p className="mx-auto mb-14 max-w-[52ch] text-[16px] leading-relaxed text-stone-700">
          Texting Shopkeeper feels like texting your best employee — because that&apos;s what it is.
        </p>
      </Reveal>

      <div className="grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
        {surfaces.map((s, i) => (
          <Reveal key={s.name} delay={i * 100}>
            <div className="h-full rounded-3xl border border-stone-900/10 bg-[#fdfbf7] p-7 transition-transform duration-300 hover:-translate-y-1">
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#efe9df] text-stone-800">
                {s.icon}
              </div>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-[26px] font-bold tracking-tight [font-family:var(--m-caveat)]">{s.name}</h3>
              </div>
              <p className="text-[14px] leading-relaxed text-stone-700">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
