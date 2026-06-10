import Image from "next/image";
import { Reveal } from "./Reveal";

function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7">
      <circle cx="12" cy="12" r="11" fill="#229ED9" />
      <path
        fill="#fff"
        d="M17.3 7.3 15.6 16c-.13.6-.49.75-.99.47l-2.74-2.02-1.32 1.27c-.15.15-.27.27-.55.27l.2-2.78 5.06-4.58c.22-.2-.05-.3-.34-.11l-6.25 3.94-2.7-.84c-.58-.18-.6-.58.13-.86l10.55-4.07c.49-.18.92.11.65.61z"
      />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="#25D366">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5 13.7c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.8 2c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.2 1.2z" />
    </svg>
  );
}

/** Floating app tiles arranged in a loose wave, like poke's integrations art. */
const tiles: { name: string; left: string; top: string; logo?: string; mark?: React.ReactNode }[] = [
  { name: "Shopify", left: "4%", top: "44%", logo: "/logos/shopify.svg" },
  { name: "Instagram", left: "16%", top: "24%", logo: "/logos/instagram-logo.png" },
  { name: "Gmail", left: "28%", top: "12%", logo: "/logos/gmail.png" },
  { name: "Email", left: "40%", top: "22%", logo: "/logos/email.svg" },
  { name: "SMS", left: "51%", top: "40%", logo: "/logos/sms.svg" },
  { name: "Telegram", left: "63%", top: "58%", mark: <TelegramMark /> },
  { name: "WhatsApp", left: "75%", top: "70%", mark: <WhatsAppMark /> },
  { name: "TikTok", left: "88%", top: "48%", logo: "/logos/tiktok-logo.png" },
];

export function Integrations() {
  return (
    <section className="relative isolate overflow-hidden border-t border-stone-900/10 py-24">
      {/* Watercolor wash bands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 blur-xl bg-[linear-gradient(180deg,transparent_0%,rgba(170,193,205,0.45)_42%,rgba(212,194,164,0.5)_82%,transparent_100%)]"
      />

      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="mx-auto max-w-3xl text-[clamp(34px,4.5vw,60px)] font-normal leading-[1.15] tracking-[-0.01em] [font-family:var(--m-serif)]">
            <span className="block">
              Shopkeeper fits into your store
              <sup className="ml-0.5 align-super text-[0.38em] text-stone-400 [font-family:var(--m-mono)]">(1)</sup>,
            </span>
            <span className="block pl-[14%] text-[#9c9285] sm:pl-[22%]">not the other way around</span>
          </h2>
        </Reveal>

        {/* Floating tiles */}
        <div className="relative mx-auto mt-6 h-[300px] max-w-4xl sm:h-[340px]">
          {tiles.map((t, i) => (
            <span
              key={t.name}
              title={t.name}
              className="absolute grid size-12 -translate-x-1/2 place-items-center rounded-2xl bg-white shadow-[0_10px_24px_rgba(43,33,24,0.14)] sm:size-14"
              style={{
                left: t.left,
                top: t.top,
                animation: "m-float 5.5s ease-in-out infinite",
                animationDelay: `${-i * 0.7}s`,
              }}
            >
              {t.mark ?? <Image src={t.logo as string} alt={t.name} width={28} height={28} className="size-7 object-contain" />}
            </span>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mx-auto mt-4 max-w-md text-left">
            <p className="mb-1.5 text-sm text-stone-400 [font-family:var(--m-mono)]">(1)</p>
            <p className="text-[16px] leading-relaxed text-stone-600">
              Shopify, Instagram, Gmail, email, and SMS today — WhatsApp and TikTok on the way. One
              employee across all of them, with a personality that keeps things as real as your best hire.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
