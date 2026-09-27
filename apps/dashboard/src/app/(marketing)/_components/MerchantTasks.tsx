"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";

const STORE = "Linen & Loom";

const tasks = [
  {
    label: "Run a sale",
    headline: "Run a sale without opening admin.",
    about:
      "Text the discount and end date. Shopkeeper creates the automatic discount in Shopify and tells you when it’s live.",
    prompt: "Put the store on sale until Sunday.",
    response: "Done — 15% off the whole store through Sunday night.",
    gradient: "/marketing/bento/bento-1-gradient.svg",
  },
  {
    label: "Check stock",
    headline: "Get a count in the words you already use.",
    about:
      "Name the product, size, and color—the way you’d ask someone on the floor. Shopkeeper reads inventory and answers in the thread.",
    prompt: "How many sand linen jumpsuits do we have in Small?",
    response: "Twelve in Small / Sand.",
    gradient: "/marketing/bento/bento-3-gradient.svg",
  },
  {
    label: "Change an order",
    headline: "Fix an order before it ships.",
    about:
      "Give a customer name or order number and say what to change. Shopkeeper updates the order in Shopify and confirms what changed.",
    prompt: "On Maya’s order #3102, swap the Medium jumpsuit for a Small.",
    response: "Updated #3102 — Small / Sand now, same total.",
    gradient: "/marketing/bento/bento-2-gradient.svg",
  },
  {
    label: "Work the inbox",
    headline: "Your queue, in one ask.",
    about:
      "Shopkeeper lists what needs your approval, what it can reply to on its own, and what only you can handle—then waits for your call on each.",
    prompt: "What’s waiting on me?",
    response:
      "Maya’s swap is ready for your OK. Priya needs an answer about international shipping. Alex’s refund needs you — it’s above your limit.",
    gradient: "/marketing/bento/bento-4-gradient.svg",
  },
  {
    label: "Email a customer",
    headline: "Reach out when you’re starting the thread.",
    about:
      "Some updates don’t begin with a customer DM. Tell Shopkeeper the address and message; it sends the email and keeps a record.",
    prompt: "Email jamie@example.com — their replacement ships tomorrow.",
    response: "Sent.",
    gradient: "/marketing/bento/bento-2-gradient.svg",
  },
] as const;

const panelReveal = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.22 } },
};

function MerchantThread({
  headline,
  about,
  prompt,
  response,
  gradient,
}: {
  headline: string;
  about: string;
  prompt: string;
  response: string;
  gradient: string;
}) {
  return (
    <figure className="relative mx-auto w-full max-w-[400px] lg:mx-0 lg:max-w-none">
      <figcaption className="sr-only">
        {headline} {about} Example for {STORE}: {prompt} {response}
      </figcaption>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 overflow-hidden rounded-[3rem] lg:hidden [mask-image:radial-gradient(70%_65%_at_50%_50%,black_20%,transparent_78%)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG burst, same as bento cards */}
        <img src={gradient} alt="" className="size-full scale-110 object-cover opacity-80" />
      </div>
      <div className="m-merchant-device">
        <div className="m-merchant-phone">
          <div className="m-merchant-phone-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="m-merchant-phone-avatar">SK</span>
            <div className="m-merchant-phone-who">
              <p>Shopkeeper</p>
              <p>{STORE}</p>
            </div>
            <Image src="/logos/imessage.svg" alt="" width={22} height={22} className="ml-auto shrink-0 opacity-90" />
          </div>
          <div className="m-merchant-phone-thread">
            <p className="m-merchant-phone-time">Today 9:14 AM</p>
            <div className="m-merchant-phone-row is-out">
              <p className="m-merchant-phone-out">{prompt}</p>
            </div>
            <div className="m-merchant-phone-row is-in">
              <span className="m-merchant-phone-avatar is-tiny">SK</span>
              <p className="m-merchant-phone-in">{response}</p>
            </div>
          </div>
          <div className="m-merchant-phone-compose">
            <span>iMessage</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

function MerchantCopy({ headline, about }: { headline: string; about: string }) {
  return (
    <div className="flex flex-col justify-center">
      <h3 className="m-display text-[clamp(1.45rem,2.2vw,1.85rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-stone-950">
        {headline}
      </h3>
      <p className="mt-4 max-w-[42ch] text-[16px] leading-[1.65] text-stone-600">{about}</p>
    </div>
  );
}

export function MerchantTasks() {
  const [active, setActive] = useState(0);
  const task = tasks[active];

  return (
    <LazyMotion features={domAnimation} strict>
      <section id="workflow" aria-labelledby="merchant-tasks-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14 sm:px-6 sm:py-20">
        <m.header
          className="mb-8 max-w-[min(720px,100%)] text-left sm:mb-10"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2
            id="merchant-tasks-heading"
            className="m-display text-[clamp(2rem,4.2vw,3.35rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-stone-950"
          >
            “Put the store on sale until Sunday.”
          </h2>
          <p className="m-display mt-4 text-[clamp(1.2rem,2.2vw,1.65rem)] font-medium leading-[1.28] tracking-[-0.03em] text-stone-500">
            When you start the conversation—not the customer.
          </p>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-stone-600 sm:text-[17px]">
            Up above, Shopkeeper handles a customer who wrote first. Here, you’re the one with a job: a sale, a stock
            check, an order fix, the inbox, an outbound email. Same agent on iMessage or the dashboard; the work still
            lands in Shopify. Each tab is one way {STORE}’s owner might text Shopkeeper.
          </p>
        </m.header>

        <m.div
          className="m-merchant-panel overflow-hidden rounded-[1.35rem]"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="border-b border-stone-900/8 bg-[#fcfcfb] px-4 py-4 sm:px-6 sm:py-5">
            <div
              role="tablist"
              aria-label="Example jobs"
              className="m-merchant-tabs flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tasks.map((item, index) => {
                const selected = active === index;
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    id={`merchant-task-tab-${index}`}
                    aria-selected={selected}
                    aria-controls="merchant-task-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(index)}
                    className={`m-merchant-tab shrink-0 ${selected ? "is-active" : ""}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            id="merchant-task-panel"
            role="tabpanel"
            aria-labelledby={`merchant-task-tab-${active}`}
            className="m-merchant-panel-body"
          >
            <AnimatePresence mode="wait">
              <m.div
                key={active}
                variants={panelReveal}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:min-h-[420px]"
              >
                <div className="order-2 border-t border-stone-900/8 bg-white px-5 py-8 sm:px-8 sm:py-10 lg:order-1 lg:border-t-0 lg:border-r lg:py-12">
                  <MerchantCopy headline={task.headline} about={task.about} />
                </div>
                <div className="m-merchant-well relative order-1 flex items-center justify-center px-4 py-10 sm:px-8 sm:py-12 lg:order-2 lg:py-14">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(180deg,black_55%,transparent_100%)]"
                  >
                    <Image
                      src="/atmosphere/hero-light.jpg"
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 480px, 100vw"
                      className="object-cover opacity-70 [filter:blur(28px)_sepia(0.12)_saturate(0.9)_brightness(1.05)]"
                    />
                  </div>
                  <MerchantThread
                    headline={task.headline}
                    about={task.about}
                    prompt={task.prompt}
                    response={task.response}
                    gradient={task.gradient}
                  />
                </div>
              </m.div>
            </AnimatePresence>
          </div>
        </m.div>
      </section>
    </LazyMotion>
  );
}
