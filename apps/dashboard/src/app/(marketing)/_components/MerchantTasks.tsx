"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { SectionLabel } from "./SectionLabel";

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
      "Ask the way you’d ask someone on the floor. Shopkeeper reads your inventory and answers in the thread.",
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
      "Shopkeeper lists what needs your approval, what it can answer on its own, and what only you can handle. Then it waits for your call.",
    prompt: "What’s waiting on me?",
    response:
      "Maya’s swap is ready for your OK. Priya needs an answer about international shipping. Alex’s refund needs you — it’s above your limit.",
    gradient: "/marketing/bento/bento-4-gradient.svg",
  },
  {
    label: "Email a customer",
    headline: "Start the conversation yourself.",
    about:
      "Tell Shopkeeper who to email and what to say. It sends the message and keeps a record.",
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
            </div>
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
      <h3 className="m-display m-h3">{headline}</h3>
      <p className="m-lede mt-4 max-w-[42ch] text-[16px]">{about}</p>
    </div>
  );
}

/** Pin height: one viewport segment per task so page scroll scrubs the active tab. */
const SCROLL_SEGMENT_VH = 72;

export function MerchantTasks() {
  const [active, setActive] = useState(0);
  const [scrollScrub, setScrollScrub] = useState(false);
  const pinRef = useRef<HTMLDivElement>(null);
  const task = tasks[active];

  // Pin-and-scrub only where the panel fits under the sticky navbar: desktop-size
  // screens with motion allowed. On a phone the panel is taller than the screen, so
  // it would stay pinned with its bottom cut off for several screens of scrolling;
  // there the tabs are simply tapped.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setScrollScrub(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const updateActiveFromScroll = useCallback(() => {
    if (!scrollScrub) return;
    const pin = pinRef.current;
    if (!pin || tasks.length <= 1) return;

    const rect = pin.getBoundingClientRect();
    const pinTop = window.scrollY + rect.top;
    const viewport = window.innerHeight;
    const scrollRange = Math.max(pin.offsetHeight - viewport, 1);
    const progress = Math.min(1, Math.max(0, (window.scrollY - pinTop) / scrollRange));
    const index = Math.min(tasks.length - 1, Math.round(progress * (tasks.length - 1)));
    setActive(index);
  }, [scrollScrub]);

  useEffect(() => {
    if (!scrollScrub) return;
    updateActiveFromScroll();
    window.addEventListener("scroll", updateActiveFromScroll, { passive: true });
    window.addEventListener("resize", updateActiveFromScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateActiveFromScroll);
      window.removeEventListener("resize", updateActiveFromScroll);
    };
  }, [scrollScrub, updateActiveFromScroll]);

  function goToTask(index: number) {
    setActive(index);
    if (!scrollScrub) return;
    const pin = pinRef.current;
    if (!pin || tasks.length <= 1) return;

    const rect = pin.getBoundingClientRect();
    const pinTop = window.scrollY + rect.top;
    const scrollRange = Math.max(pin.offsetHeight - window.innerHeight, 1);
    const progress = index / (tasks.length - 1);
    const top = pinTop + progress * scrollRange;
    window.scrollTo({ top, behavior: "smooth" });
  }

  const pinHeightVh =
    tasks.length > 1 ? (tasks.length - 1) * SCROLL_SEGMENT_VH + 100 : 100;

  return (
    <LazyMotion features={domAnimation} strict>
      <section id="workflow" aria-labelledby="merchant-tasks-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-24">
        <m.header
          className="mb-8 max-w-[min(720px,100%)] text-left sm:mb-10"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionLabel align="start">Text your shopkeeper</SectionLabel>
          <h2 id="merchant-tasks-heading" className="m-display m-h2">
            “Put the store on sale until Sunday.”
          </h2>
        </m.header>

        <div
          ref={pinRef}
          className="relative"
          style={{ height: scrollScrub ? `${pinHeightVh}vh` : undefined }}
        >
          <m.div
            className={`m-merchant-panel overflow-hidden rounded-[1.5rem] ${scrollScrub ? "sticky top-[4.5rem] z-[1] sm:top-20" : ""}`}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="m-merchant-panel-body flex min-h-0 flex-col sm:min-h-[420px] sm:flex-row lg:min-h-[440px]">
              <div
                role="tablist"
                aria-label="Example jobs"
                aria-orientation="vertical"
                className="m-merchant-tabs m-merchant-tabs-vertical shrink-0 border-b border-[color:var(--m-line)] bg-white px-3 py-3 sm:w-[10.5rem] sm:border-b-0 sm:border-r sm:px-3 sm:py-5 lg:w-[11.25rem]"
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
                      onClick={() => goToTask(index)}
                      className={`m-merchant-tab m-merchant-tab-vertical w-full ${selected ? "is-active" : ""}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div
                id="merchant-task-panel"
                role="tabpanel"
                aria-labelledby={`merchant-task-tab-${active}`}
                className="min-w-0 flex-1"
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
                    <div className="order-2 border-t border-[color:var(--m-line)] bg-white px-5 py-8 sm:px-8 sm:py-10 lg:order-1 lg:border-t-0 lg:border-r lg:py-12">
                      <MerchantCopy headline={task.headline} about={task.about} />
                    </div>
                    <div className="m-merchant-well relative order-1 flex items-center justify-center px-4 py-10 sm:px-8 sm:py-12 lg:order-2 lg:py-14">
                      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG glow, same as bento cards */}
                        <img src={task.gradient} alt="" className="size-full object-cover opacity-90" />
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
            </div>
          </m.div>
        </div>
      </section>
    </LazyMotion>
  );
}
