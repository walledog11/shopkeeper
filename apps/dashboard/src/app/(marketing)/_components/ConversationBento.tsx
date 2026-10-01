"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { ActionLog, ChannelsOrbit, GuidanceVisual, ShopperChat } from "./BentoVisuals";
import { SectionLabel } from "./SectionLabel";

type BentoGradientPosition = "br" | "bottom-left";

const cardReveal = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.75,
      delay: i * 0.11,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

function BentoCard({
  title,
  children,
  gradientSrc,
  gradientPosition = "br",
  index,
  headingClassName,
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  gradientSrc: string;
  gradientPosition?: BentoGradientPosition;
  index: number;
  headingClassName?: string;
  contentClassName?: string;
}) {
  return (
    <m.article
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.22, margin: "0px 0px -6% 0px" }}
      variants={cardReveal}
      className="m-bento-card group relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-[1.5rem] p-6 sm:min-h-0 sm:p-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG burst */}
      <img
        src={gradientSrc}
        alt=""
        className={`m-bento-gradient-burst${gradientPosition === "bottom-left" ? " m-bento-gradient-burst--bl" : ""}`}
      />
      <h3 className={`m-display m-h3 relative z-[1] ${headingClassName ?? "max-w-[18ch]"}`}>{title}</h3>
      <div className={`relative z-[1] flex flex-1 flex-col ${contentClassName ?? "mt-4 sm:mt-5"}`}>{children}</div>
    </m.article>
  );
}

function ConvertBentoCard({ index }: { index: number }) {
  return (
    <m.article
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.22, margin: "0px 0px -6% 0px" }}
      variants={cardReveal}
      className="m-bento-card m-bento-card--horizontal group relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-[1.5rem] p-6 sm:min-h-0 sm:p-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG burst */}
      <img src="/marketing/bento/bento-4-gradient.svg" alt="" className="m-bento-gradient-burst" />
      <div className="m-bento-convert-copy relative z-[1] flex max-w-[18.3rem] shrink-0 flex-col">
        <h3 className="m-display m-h3">Answers shoppers on your site.</h3>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--m-ink-2)]">
          Shoppers ask where their order is. Shopkeeper looks it up in Shopify and replies with the status.
        </p>
      </div>
      <ShopperChat />
    </m.article>
  );
}

export function ConversationBento() {
  return (
    <LazyMotion features={domAnimation} strict>
      <section
        aria-labelledby="conversation-bento-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24"
      >
        <m.header
          className="mb-10 max-w-[min(900px,100%)] text-left sm:mb-12"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionLabel align="start">Get to know Shopkeeper</SectionLabel>
          <h2 id="conversation-bento-heading" className="m-display m-h2">
            Built for stores where every conversation counts.{" "}
            <span className="m-tail">Shopkeeper handles the routine and brings you the rest.</span>
          </h2>
        </m.header>

        <div className="m-bento-grid">
          <div className="h-full md:col-span-4 md:row-start-1">
            <BentoCard
              index={0}
              gradientSrc="/marketing/bento/bento-1-gradient.svg"
              title="Writes in your voice, by your rules"
              headingClassName="max-w-[18.3rem]"
              contentClassName="mt-auto min-h-[400px] flex-1"
            >
              <GuidanceVisual />
            </BentoCard>
          </div>

          <div className="h-full md:col-span-2 md:row-start-1">
            <BentoCard
              index={1}
              gradientSrc="/marketing/bento/bento-2-gradient.svg"
              title="One conversation. Everywhere."
              contentClassName="mt-auto min-h-0 flex-1"
            >
              <ChannelsOrbit />
            </BentoCard>
          </div>

          <div className="h-full md:col-span-2 md:row-start-2">
            <BentoCard
              index={2}
              gradientSrc="/marketing/bento/bento-3-gradient.svg"
              gradientPosition="bottom-left"
              title="Every action on the record."
              contentClassName="relative z-[1] mt-auto flex min-h-0 flex-1 flex-col"
            >
              <ActionLog />
            </BentoCard>
          </div>

          <div className="h-full md:col-span-4 md:row-start-2">
            <ConvertBentoCard index={3} />
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}
