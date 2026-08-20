import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MessageSquare } from "lucide-react";
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
    href: "#how-replies",
    title: "Instagram",
    subtitle: "DMs that answer and sell.",
    logo: "/logos/instagram-logo.png",
  },
  {
    href: "#how-replies",
    title: "Email",
    subtitle: "Replies that sound like you wrote them.",
    logo: "/logos/email.svg",
  },
  {
    href: "#how-replies",
    title: "Your store",
    subtitle: "On-site chat that knows your catalog.",
  },
  {
    href: "#channels",
    title: "iMessage",
    subtitle: "Approve from your lock screen.",
    logo: "/logos/imessage.svg",
  },
];

export function Touchpoints() {
  return (
    <section id="touchpoints" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12">
      <Reveal>
        <SectionLabel>every touchpoint</SectionLabel>
        <h2 className="mx-auto mb-5 max-w-[20ch] text-center text-[clamp(36px,5vw,68px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          One hire.{" "}
          <em className="italic text-[var(--m-quill)]">Every place they write.</em>
        </h2>
        <p className="mx-auto mb-10 max-w-[48ch] text-center text-[16px] leading-relaxed text-stone-700">
          Customers stay on Instagram, email, or your store. You get a text when something
          actually needs you.
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
                  ) : (
                    <MessageSquare className="size-8 text-[#111]" strokeWidth={2} />
                  )}
                </span>
                <span className="m-touch-card-title">{card.title}</span>
                <span className="m-touch-card-subtitle">{card.subtitle}</span>
                <span className="m-touch-card-cta">
                  See in action
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
