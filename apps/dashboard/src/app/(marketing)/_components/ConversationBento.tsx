"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { BentoLottie } from "./BentoLottie";

type BentoGlow = "br" | "center" | "bottom";
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
  glow,
  gradientSrc,
  gradientPosition = "br",
  index,
  headingClassName,
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  glow?: BentoGlow;
  gradientSrc?: string;
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
      className="m-bento-card group relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-[1.25rem] p-6 sm:min-h-0 sm:p-8"
    >
      {gradientSrc ? (
        <img
          src={gradientSrc}
          alt=""
          className={`m-bento-gradient-burst${gradientPosition === "bottom-left" ? " m-bento-gradient-burst--bl" : ""}`}
        />
      ) : glow ? (
        <div aria-hidden className={`m-bento-glow m-bento-glow--${glow}`} />
      ) : null}
      <h3
        className={`m-display relative z-[1] text-[clamp(1.35rem,2.2vw,1.65rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-stone-950 ${headingClassName ?? "max-w-[18ch]"}`}
      >
        {title}
      </h3>
      <div
        className={`relative z-[1] flex flex-1 flex-col ${contentClassName ?? "mt-4 sm:mt-5"}`}
      >
        {children}
      </div>
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
      className="m-bento-card m-bento-card--horizontal group relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-[1.25rem] p-6 sm:min-h-0 sm:p-8"
    >
      <img
        src="/marketing/bento/bento-4-gradient.svg"
        alt=""
        className="m-bento-gradient-burst"
      />
      <div className="m-bento-convert-copy relative z-[1] flex max-w-[18.3rem] shrink-0 flex-col">
        <h3 className="m-display text-[clamp(1.35rem,2.2vw,1.65rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-stone-950">
          Engage. Guide. Convert.
        </h3>
        <div className="m-bento-stat-card">
          <img
            src="/marketing/bento/bareminerals-logo.svg"
            alt="bareMinerals"
            className="m-bento-stat-logo"
          />
          <div className="flex flex-col gap-2">
            <p className="text-xl font-medium leading-[1.3] tracking-[-0.02em] text-stone-950">
              8.83× ROI
            </p>
            <p className="text-base leading-relaxed text-stone-600">
              “The AI upsells with a conversational tone that feels genuinely
              helpful, not pushy. It asks the right follow-up questions and
              improves AOV. It’s exactly how we train our human agents.”
            </p>
          </div>
        </div>
        <img
          src="/marketing/bento/bento-chart.svg"
          alt=""
          className="m-bento-4-chart"
        />
      </div>
      <BentoLottie
        src="/marketing/bento/bento-03.json"
        className="m-bento-lottie m-bento-lottie--bento-4"
      />
    </m.article>
  );
}

export function ConversationBento() {
  return (
    <LazyMotion features={domAnimation} strict>
      <section
        aria-labelledby="conversation-bento-heading"
        className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20"
      >
        <m.header
          className="mb-10 max-w-[min(720px,100%)] text-left sm:mb-12"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2
            id="conversation-bento-heading"
            className="m-display text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-stone-950"
          >
            Built for brands that know every conversation counts.
          </h2>
          <p className="m-display mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] font-medium leading-[1.25] tracking-[-0.03em] text-stone-500">
            Automate routine tickets and personalize the rest.
          </p>
        </m.header>

        <div className="m-bento-grid">
          <div className="h-full md:col-span-4 md:row-start-1">
            <BentoCard
              index={0}
              gradientSrc="/marketing/bento/bento-1-gradient.svg"
              title="AI Agent trained on your brand"
              headingClassName="max-w-[18.3rem]"
              contentClassName="mt-auto min-h-[400px] flex-1"
            >
              <BentoLottie
                src="/marketing/bento/bento-01.json"
                className="m-bento-lottie"
              />
            </BentoCard>
          </div>

          <div className="h-full md:col-span-2 md:row-start-1">
            <BentoCard
              index={1}
              gradientSrc="/marketing/bento/bento-2-gradient.svg"
              title="One conversation. Everywhere."
              contentClassName="mt-auto min-h-0 flex-1"
            >
              <BentoLottie
                src="/marketing/bento/bento-02.json"
                className="m-bento-lottie m-bento-lottie--fill"
              />
            </BentoCard>
          </div>

          <div className="h-full md:col-span-2 md:row-start-2">
            <BentoCard
              index={2}
              gradientSrc="/marketing/bento/bento-3-gradient.svg"
              gradientPosition="bottom-left"
              title="High-quality answers. Measurable results."
              contentClassName="relative z-[1] mt-auto flex min-h-0 flex-1 flex-col"
            >
              <img
                src="/marketing/bento/bento-3-ui.svg"
                alt=""
                className="m-bento-3-ui"
              />
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
