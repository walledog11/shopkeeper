import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Check, Hand, HeartPulse, ReceiptText, Tag, Wallet } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

function SectionHeading({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mb-10 text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mx-auto mb-4 max-w-[20ch] text-[clamp(34px,4.5vw,58px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
        {title}
      </h2>
      {body && (
        <p className="mx-auto max-w-[58ch] text-[15px] leading-relaxed text-stone-700 sm:text-[16px]">
          {body}
        </p>
      )}
    </div>
  );
}

function PaperCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-stone-900/10 bg-[#fdfbf7]/90 p-5 shadow-[0_16px_34px_-28px_rgba(22,20,19,0.55)] ${className}`}
    >
      {children}
    </div>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 grid size-10 place-items-center rounded-full bg-[#2b2118]/[0.06] text-[#2b2118]">
      {children}
    </div>
  );
}

const hats = ["The founder", "The packer", "The marketer", "The support desk"] as const;

export function ProblemSection() {
  return (
    <section id="problem" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-14 text-center">
      <Reveal>
        <SectionLabel>sound familiar?</SectionLabel>
        <div className="mb-8 flex flex-wrap justify-center gap-2.5">
          {hats.map((hat, index) => (
            <span
              key={hat}
              className={`rounded-full border border-stone-900/15 bg-[#fdfbf7] px-4 py-2 text-[22px] leading-none [font-family:var(--m-hand)] ${
                index === hats.length - 1 ? "text-[#b0472f] line-through decoration-2" : "text-stone-800"
              }`}
            >
              {hat}
            </span>
          ))}
        </div>
        <h2 className="mx-auto mb-5 max-w-[22ch] text-[clamp(34px,4.5vw,58px)] font-bold leading-[1] tracking-[0.03em] [font-family:var(--m-hand)]">
          You wear every hat. Support shouldn’t be one of them.
        </h2>
        <p className="mx-auto max-w-[56ch] text-[16px] leading-relaxed text-stone-700">
          The inbox piles up over the weekend. Every “where’s my order?” pulls you away
          from the work only you can do. And a helpdesk is software built for a support
          team you don’t have.
        </p>
      </Reveal>
    </section>
  );
}

const night = [
  {
    time: "11:42 PM",
    channel: "Email",
    customer: "“Where’s my order? It’s been five days.”",
    shopkeeper: "Answered with live tracking and the delivery date.",
    tone: "handled",
  },
  {
    time: "2:15 AM",
    channel: "Instagram DM",
    customer: "“Does the clear case work with MagSafe?”",
    shopkeeper: "Answered from your product details, with a link to the case.",
    tone: "handled",
  },
  {
    time: "6:50 AM",
    channel: "Email",
    customer: "“My case arrived cracked.”",
    shopkeeper: "Checked the order, apologized, and drafted a free replacement for you to approve.",
    tone: "plan",
  },
  {
    time: "8:00 AM",
    channel: "Your phone",
    customer: "Your morning briefing arrives.",
    shopkeeper: "You approve the replacement in ten seconds and start your day.",
    tone: "you",
  },
] as const;

const toneStyles = {
  handled: { dot: "bg-[#2f7a4a]", tag: "Handled", tagClass: "bg-[#2f7a4a]/10 text-[#2f7a4a]" },
  plan: { dot: "bg-amber-600", tag: "Waiting for you", tagClass: "bg-amber-700/10 text-amber-800" },
  you: { dot: "bg-[#2b2118]", tag: "Done", tagClass: "bg-[#2b2118]/10 text-[#2b2118]" },
} as const;

export function NightTimeline() {
  return (
    <section id="night" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="a night with shopkeeper"
        title="While you sleep, the shop stays open."
        body="One night at a small phone case store. Nothing here needed the owner until breakfast."
      />

      <ol className="relative m-0 list-none p-0">
        <span aria-hidden className="absolute bottom-6 left-[6rem] top-6 hidden w-px bg-stone-900/15 sm:block" />
        {night.map((moment, index) => {
          const tone = toneStyles[moment.tone];
          return (
            <li key={moment.time} className="relative mb-4 last:mb-0">
              <Reveal delay={index * 90} className="sm:grid sm:grid-cols-[5rem_1fr] sm:gap-8">
                <div className="mb-2 flex items-center gap-2 sm:mb-0 sm:block sm:pt-5 sm:text-right">
                  <span className="text-[22px] font-bold leading-none [font-family:var(--m-hand)]">{moment.time}</span>
                </div>
                <div className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[1.375rem] top-6 hidden size-3 rounded-full ring-4 ring-[#f6f2eb] sm:block ${tone.dot}`}
                  />
                  <PaperCard>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                        {moment.channel}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.tagClass}`}>
                        {tone.tag}
                      </span>
                    </div>
                    <p className="text-[16px] font-semibold leading-snug text-stone-900">{moment.customer}</p>
                    <p className="mt-2 flex items-start gap-2 text-[14px] leading-relaxed text-stone-600">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#2f7a4a]" strokeWidth={2.2} aria-hidden />
                      {moment.shopkeeper}
                    </p>
                  </PaperCard>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const beyond = [
  {
    icon: Tag,
    title: "Flash sales by text",
    body: "Text “20% off everything this weekend.” The sale goes live in Shopify and ends on its own on Sunday night.",
  },
  {
    icon: HeartPulse,
    title: "Know how customers feel",
    body: "Sentiment from your comments and DMs, so you spot a product problem before it turns into a bad review.",
  },
  {
    icon: BookOpen,
    title: "A memory for your policies",
    body: "Answer a question once. Shopkeeper remembers it, and the next customer who asks gets your answer.",
  },
] as const;

export function BeyondSupport() {
  return (
    <section id="beyond" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="more than support"
        title="An employee who learns the business."
        body="It starts with the inbox. It doesn’t stop there."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {beyond.map((item, index) => (
          <Reveal key={item.title} delay={index * 90} className="h-full">
            <PaperCard className="h-full">
              <IconBadge>
                <item.icon className="size-5" aria-hidden />
              </IconBadge>
              <h3 className="text-[25px] font-bold leading-none [font-family:var(--m-hand)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.body}</p>
            </PaperCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const trust = [
  {
    icon: Wallet,
    title: "Money waits for you",
    body: "Refunds, replacements, and order changes come to you as a plan. One reply approves it.",
  },
  {
    icon: ReceiptText,
    title: "Limits you set",
    body: "Pick a refund limit. Anything above it always comes to you, however the customer asks.",
  },
  {
    icon: Hand,
    title: "It asks instead of guessing",
    body: "When it doesn’t know, it checks with you. It never makes up a policy to sound confident.",
  },
  {
    icon: Check,
    title: "Every action on the record",
    body: "What it did, what you approved, and what it told the customer, all in one log.",
  },
] as const;

export function TrustSection() {
  return (
    <section id="controls" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="you stay the boss"
        title="Routine questions, handled. Money, your call."
        body="Routine questions get answered on the spot. Anything involving money comes to you as a plan by text. You approve it with one reply."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trust.map((item, index) => (
          <Reveal key={item.title} delay={index * 80} className="h-full">
            <PaperCard className="h-full">
              <IconBadge>
                <item.icon className="size-5" aria-hidden />
              </IconBadge>
              <h3 className="text-[23px] font-bold leading-none [font-family:var(--m-hand)]">{item.title}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-stone-600">{item.body}</p>
            </PaperCard>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-stone-600">
        Your customers and orders stay yours, and your logins are encrypted.{" "}
        <Link href="/product/security" className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4">
          How we protect your store
        </Link>
      </p>
    </section>
  );
}

// Placeholder proof. Replace with the founder store's real month and with beta
// quotes the merchants agreed to — never publish a number that can't be backed up.
const founderStats = [
  { value: "XXX", label: "customer messages last month" },
  { value: "XX%", label: "handled without me" },
  { value: "XX hrs", label: "back in my week" },
] as const;

const betaQuotes = [
  { quote: "Beta merchant quote goes here.", name: "First name", store: "Store type" },
  { quote: "Second beta merchant quote goes here.", name: "First name", store: "Store type" },
] as const;

export function Proof() {
  return (
    <section id="proof" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-14">
      <SectionHeading
        label="built in a real store"
        title="I built it for my own shop first."
        body="Shopkeeper runs support for my phone case store every day. Here’s last month."
      />
      <Reveal>
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {founderStats.map((stat) => (
            <PaperCard key={stat.label} className="text-center">
              <p className="text-[52px] font-bold leading-none [font-family:var(--m-hand)]">{stat.value}</p>
              <p className="mt-2 text-[13px] text-stone-600">{stat.label}</p>
            </PaperCard>
          ))}
        </div>
      </Reveal>
      <div className="mx-auto mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
        {betaQuotes.map((item, index) => (
          <Reveal key={item.quote} delay={index * 90}>
            <figure className="m-0 h-full rounded-2xl border border-stone-900/10 bg-white/60 p-6">
              <blockquote className="m-0 text-[24px] leading-[1.15] text-stone-800 [font-family:var(--m-hand)]">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-4 text-[13px] font-semibold text-stone-600">
                {item.name} · {item.store}
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
