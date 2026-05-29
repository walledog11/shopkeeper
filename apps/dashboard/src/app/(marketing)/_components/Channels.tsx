import Image from "next/image";

const channels = [
  {
    num: "CH/01",
    logo: "/logos/instagram-logo.png",
    toneDown: true,
    title: "Instagram DMs",
    body: "Story replies, comments, and direct messages. Clerk knows the difference and routes accordingly.",
    statLabel: "avg setup",
    statVal: "90s",
  },
  {
    num: "CH/02",
    logo: "/logos/shopify.svg",
    toneDown: true,
    title: "Shopify orders",
    body: "Refunds, address changes, tracking , Clerk pulls order data and can take action with your approval.",
    statLabel: "avg setup",
    statVal: "2m",
  },
  {
    num: "CH/03",
    logo: "/logos/email.svg",
    toneDown: false,
    title: "SMS, Email, WhatsApp",
    body: "One thread per customer no matter where they reach out. Switch channels mid-conversation without losing context.",
    statLabel: "avg setup",
    statVal: "4m",
  },
];

export function Channels() {
  return (
    <section id="channels" className="mx-auto max-w-7xl border-t border-solid border-stone-900/10 px-8 py-20">
      <div className="mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.15em] text-stone-700 [font-family:var(--m-mono)]">
        <span className="inline-block h-px w-6 bg-stone-700" />
        01 · Channels
      </div>
      <h2 className="mb-6 max-w-[18ch] text-[clamp(40px,5vw,72px)] leading-[0.95] tracking-[-0.02em] [font-family:var(--m-serif)]">
        Every place a customer might find you,{" "}
        <em className="italic text-green-600">in one inbox.</em>
      </h2>
      <p className="mb-12 max-w-[52ch] text-[19px] leading-[1.45] text-stone-700">
        Connect once. Clerk pulls every conversation into a single thread per customer , so you stop scrolling between four apps.
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
        {channels.map(ch => (
          <div key={ch.num} className="relative overflow-hidden rounded-xl border border-stone-900/10 bg-stone-200 p-7">
            <div className="mb-8 text-xs text-stone-700 [font-family:var(--m-mono)]">{ch.num}</div>
            <div className="mb-3.5 inline-flex size-[52px] items-center justify-center rounded-[14px] border border-stone-900/10 bg-stone-100 shadow-sm">
              <Image
                src={ch.logo}
                alt={ch.title}
                width={28}
                height={28}
                className={`size-7 object-contain ${ch.toneDown ? "brightness-105 saturate-50" : ""}`}
              />
            </div>
            <h3 className="mb-2 text-3xl tracking-tight [font-family:var(--m-serif)]">{ch.title}</h3>
            <p className="mb-8 text-sm leading-[1.55] text-stone-800">{ch.body}</p>
            <div className="flex justify-between border-t border-solid border-stone-900/10 pt-4 text-sm">
              <span className="text-stone-800">{ch.statLabel}</span>
              <span className="font-mono font-medium">{ch.statVal}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
