import { ChatDemo, type ChatMessage, type ChatVariant } from "./ChatDemo";
import { Reveal } from "./Reveal";

interface Feature {
  num: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  chat: {
    variant: ChatVariant;
    title: string;
    subtitle: string;
    avatar: string;
    avatarBg?: string;
    messages: ChatMessage[];
  };
}

const FEATURES: Feature[] = [
  {
    num: "01",
    title: (
      <>
        Answers customers <em className="italic text-[#9c9285]">while you sleep.</em>
      </>
    ),
    body: "Shopkeeper reads every DM and email the second it lands, pulls the real order from Shopify, and replies the way you would. When it isn't sure, it doesn't guess — it hands the thread to you.",
    bullets: [
      "Instagram, email & iMessage in one brain",
      "Learns your tone from the replies you've already sent",
      "Escalates to you instead of bluffing",
    ],
    chat: {
      variant: "instagram",
      title: "linen & loom",
      subtitle: "Instagram · typically replies instantly",
      avatar: "L",
      avatarBg: "linear-gradient(135deg,#f09433,#dc2743)",
      messages: [
        { from: "user", text: "hey!! my order was supposed to be here friday 😭 it's been a week", time: "2:14 AM" },
        {
          from: "agent",
          text: "So sorry for the wait, Morgan! Just checked — order #2961 is out for delivery right now, due by 8pm tonight. Here's live tracking: usps.com/9400…",
          time: "2:14 AM",
        },
        { from: "user", text: "omg amazing, thank you!!", time: "2:15 AM" },
        { from: "agent", text: "Anytime 💛 I'll keep an eye on it and ping you if anything changes.", time: "2:15 AM" },
      ],
    },
  },
  {
    num: "02",
    title: (
      <>
        Asks <em className="italic text-[#9c9285]">before it acts.</em>
      </>
    ),
    body: "You set the rules — refund caps, blocked actions, how much rope it gets. Shopkeeper starts cautious and earns autonomy one approval at a time, because one bad refund can undo months of trust.",
    bullets: [
      "Refund limits and blocked cancellations you control",
      "Approvals are one tap, right in Telegram",
      "Every action logged on the thread",
    ],
    chat: {
      variant: "imessage",
      title: "Shopkeeper",
      subtitle: "iMessage · your store",
      avatar: "S",
      messages: [
        {
          from: "agent",
          text: "Kim's asking to cancel order #3088 — that's $212. Cancellations need your OK, so I haven't touched it. Refund, or offer store credit first?",
          time: "1:42 PM",
        },
        { from: "user", text: "try credit", time: "1:44 PM" },
        {
          from: "agent",
          text: "Offered $212 in store credit plus 10% as a thank-you. If she still wants the refund, I'll draft it for one-tap approval.",
          time: "1:44 PM",
        },
        { from: "agent", text: "Update: she took the credit 🎉 Order's intact.", time: "1:51 PM" },
      ],
    },
  },
  {
    num: "03",
    title: (
      <>
        Knows your store <em className="italic text-[#9c9285]">cold.</em>
      </>
    ),
    body: "Live Shopify orders and inventory, your policies, every past conversation. Ask it anything about your store and it answers from data, not vibes.",
    bullets: [
      "Reads live orders, inventory & tracking",
      "Remembers every customer conversation",
      "Cites your policies and FAQs, not generic ones",
    ],
    chat: {
      variant: "imessage",
      title: "Shopkeeper",
      subtitle: "iMessage · your store",
      avatar: "S",
      messages: [
        { from: "user", text: "how many linen jumpsuits left in xs?", time: "4:20 PM" },
        {
          from: "agent",
          text: "11 in XS, 3 in S. It's also your most-asked item this week — 9 DMs about a restock.",
          time: "4:20 PM",
        },
        { from: "user", text: "restock lands tuesday", time: "4:22 PM" },
        {
          from: "agent",
          text: "Noted 📌 I'll tell anyone who asks, and I can message the 9 who already did once it drops. Want that?",
          time: "4:22 PM",
        },
      ],
    },
  },
];

export function Features() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-10">
      {FEATURES.map((f, i) => (
        <div
          key={f.num}
          className="grid items-center gap-12 border-t border-stone-900/10 py-20 md:grid-cols-2 md:gap-20"
        >
          <Reveal className={i % 2 === 1 ? "md:order-2" : ""}>
            <div className="mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.15em] text-stone-500 [font-family:var(--m-caveat)]">
              <span className="inline-block h-px w-6 bg-stone-400" />
              {f.num}
            </div>
            <h2 className="mb-5 max-w-[16ch] text-[clamp(36px,4.5vw,60px)] font-extrabold leading-[1] tracking-[-0.01em] [font-family:var(--m-caveat)]">
              {f.title}
            </h2>
            <p className="mb-7 max-w-[46ch] text-[16px] leading-relaxed text-stone-700">{f.body}</p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[14px] text-stone-700">
              {f.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#2b2118] text-[9px] text-[#f6f2eb]">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className={i % 2 === 1 ? "md:order-1" : ""}>
            <ChatDemo {...f.chat} />
          </Reveal>
        </div>
      ))}
    </section>
  );
}
