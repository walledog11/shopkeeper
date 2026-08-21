import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

type TouchCard = {
  href: string;
  title: string;
  subtitle: string;
  logo?: string;
};

const cards: TouchCard[] = [
  {
    href: "#system",
    title: "Instagram",
    subtitle: "Customer support intake",
    logo: "/logos/instagram-logo.png",
  },
  {
    href: "#system",
    title: "Email",
    subtitle: "Customer support intake",
    logo: "/logos/email.svg",
  },
  {
    href: "#system",
    title: "Shopify",
    subtitle: "Order context and execution",
    logo: "/logos/shopify.svg",
  },
  {
    href: "#system",
    title: "Merchant control",
    subtitle: "Approvals through iMessage or the dashboard",
    logo: "/logos/imessage.svg",
  },
];

export function Touchpoints() {
  return (
    <section id="touchpoints" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12">
      <Reveal>
        <SectionLabel>one operating system</SectionLabel>
        <h2 className="mx-auto mb-5 max-w-[20ch] text-center text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          Every surface has a clear job.{" "}
          <em className="italic text-[var(--m-quill)]">One complete workflow.</em>
        </h2>
        <p className="mx-auto mb-10 max-w-[48ch] text-center text-[16px] leading-relaxed text-stone-700">
          Customer intake, merchant control, Shopify execution, and dashboard review work together
          without pretending every integration is the same kind of inbox.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <div className="m-touch-stage">
          <div className="m-touch-stage-frame">
            <Image
              src="/atmosphere/using-phone-pov.jpg"
              alt=""
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="m-touch-stage-photo object-cover object-[center_38%]"
            />
            <div aria-hidden className="m-touch-stage-shade" />
          </div>
          <div className="m-touch-row">
            {cards.map((card) => (
              <Link key={card.title} href={card.href} className="m-touch-card">
                <span className="m-touch-card-icon">
                  {card.logo ? (
                    <Image
                      src={card.logo}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 object-contain"
                    />
                  ) : null}
                </span>
                <span className="m-touch-card-title">{card.title}</span>
                <span className="m-touch-card-subtitle">{card.subtitle}</span>
                <span className="m-touch-card-cta">
                  See its role
                  <ChevronRight className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
