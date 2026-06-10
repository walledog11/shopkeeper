import Image from "next/image";

const integrations = [
  { name: "Shopify", logo: "/logos/shopify.svg" },
  { name: "Instagram", logo: "/logos/instagram-logo.png" },
  { name: "Gmail", logo: "/logos/gmail.png" },
  { name: "Email", logo: "/logos/email.svg" },
  { name: "SMS", logo: "/logos/sms.svg" },
  { name: "TikTok", logo: "/logos/tiktok-logo.png", soon: true },
];

export function Integrations() {
  return (
    <section className="mx-auto max-w-6xl border-t border-stone-900/10 px-6 py-20 text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 [font-family:var(--m-mono)]">
        Friends with your stack
      </p>
      <h2 className="mx-auto mb-10 max-w-[24ch] text-[clamp(28px,3.5vw,44px)] font-normal leading-[1.05] tracking-[-0.01em] [font-family:var(--m-serif)]">
        One employee, plugged into <em className="italic text-[#2f7a4a]">everything you run.</em>
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {integrations.map((i) => (
          <span
            key={i.name}
            className="inline-flex items-center gap-2.5 rounded-full border border-stone-900/10 bg-[#fdfbf7] px-5 py-2.5 text-sm font-medium text-stone-800"
          >
            <Image src={i.logo} alt="" width={20} height={20} className="size-5 object-contain" />
            {i.name}
            {i.soon && <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">soon</span>}
          </span>
        ))}
      </div>
    </section>
  );
}
