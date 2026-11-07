import Image from "next/image";
import type { ReactNode } from "react";
import { BookOpen, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";

// Each tile shows the product doing the thing it describes. The wording on the
// visuals follows the app: Memory's "Suggested brand voice" proposal (made from
// at least `VOICE_SYNTHESIS_MIN_EDITS` edits), the DM order check before a change
// (agent-runtime decision Q), and the phone's reply when an answer is saved.

const logos = {
  instagram: "/logos/instagram-logo.png",
  email: "/logos/gmail.png",
} as const;

const inbox = [
  { initials: "MC", name: "Maya Chen", channel: "instagram", text: "can I switch to a Small before it ships?", status: "Waiting for your yes", tone: "ask", time: "2:14 AM" },
  { initials: "DO", name: "Daniel Ortiz", channel: "email", text: "Do you ship to Canada?", status: "Answered", tone: "auto", time: "1:52 AM" },
  { initials: "JM", name: "jess.makes", channel: "instagram", text: "where’s my order?? it’s been a week", status: "Answered", tone: "auto", time: "12:40 AM" },
  { initials: "RP", name: "R. Patel", channel: "email", text: "I’ve opened a dispute with my bank.", status: "Needs you", tone: "you", time: "Yesterday" },
] as const;

function InboxVisual() {
  return (
    <div className="m-inbox">
      <div className="m-inbox-head">
        <span>Inbox</span>
        <span className="m-inbox-tabs">
          <span className="is-active">All</span>
          <span>Instagram</span>
          <span>Email</span>
        </span>
      </div>
      <ul>
        {inbox.map((row) => (
          <li key={row.name} className="m-inbox-row">
            <span className="m-inbox-avatar">{row.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="m-inbox-name">
                {row.name}
                <Image src={logos[row.channel]} alt="" width={12} height={12} />
                <span className="m-inbox-time">{row.time}</span>
              </span>
              <span className="m-inbox-text">{row.text}</span>
            </span>
            <span className={cn("m-inbox-status", `is-${row.tone}`)}>{row.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoreVisual() {
  return (
    <div className="m-ctx">
      <div className="m-ctx-head">
        <span className="m-inbox-avatar">MC</span>
        <span>
          <span className="block text-[13px] font-semibold">Maya Chen</span>
          <span className="block text-[12px] text-[#6d7175]">3 orders · $412 spent</span>
        </span>
      </div>
      <ul className="m-ctx-orders">
        <li>
          <span className="font-semibold">#3102</span>
          <span className="m-badge is-open">Unfulfilled</span>
          <span className="ml-auto tabular-nums">$148.00</span>
        </li>
        <li>
          <span className="font-semibold">#2961</span>
          <span className="m-badge is-done">Delivered</span>
          <span className="ml-auto tabular-nums">$96.00</span>
        </li>
      </ul>
      <p className="m-ctx-policy">
        <BookOpen aria-hidden strokeWidth={2} />
        Exchanges within 30 days of delivery
      </p>
    </div>
  );
}

function VerifyVisual() {
  return (
    <div className="m-chat m-chat--instagram m-mini">
      <div className="m-chat-thread">
        <div className="m-chat-bubble is-them">hi! can I change the address on order #3102?</div>
        <div className="m-chat-bubble is-me">Happy to help! What’s the email or zip code on the order?</div>
        <div className="m-chat-bubble is-them">94110</div>
        <p className="m-mini-note">
          <Check aria-hidden strokeWidth={2.5} />
          Order confirmed
        </p>
      </div>
    </div>
  );
}

function VoiceVisual() {
  return (
    <div className="m-voice">
      <p className="m-voice-label">
        <Sparkles aria-hidden strokeWidth={2} />
        Suggested brand voice
      </p>
      <p className="m-voice-text">Warm and brief. Skip the apologies. Sign off with “Linen &amp; Loom”.</p>
      <p className="m-voice-meta">Based on 5 of your edits</p>
      <div className="m-voice-actions">
        <span className="is-primary">Approve</span>
        <span>Not now</span>
      </div>
    </div>
  );
}

function MemoryVisual() {
  return (
    <div className="m-chat m-chat--imessage m-mini">
      <div className="m-chat-thread">
        <div className="m-chat-bubble is-them">A customer asks if you ship to PO boxes. What should I tell them?</div>
        <div className="m-chat-bubble is-me">No, street addresses only.</div>
        <div className="m-chat-bubble is-them">Got it, saved that for next time.</div>
      </div>
    </div>
  );
}

interface Tile {
  title: string;
  body: string;
  visual: ReactNode;
  wide?: boolean;
}

const tiles: Tile[] = [
  {
    title: "One inbox for DMs and email",
    body: "Every conversation sits next to the customer’s orders and everything Shopkeeper did.",
    visual: <InboxVisual />,
    wide: true,
  },
  {
    title: "Knows your store",
    body: "Orders, tracking, stock, policies and pages, read fresh for every reply.",
    visual: <StoreVisual />,
  },
  {
    title: "Checks who’s asking",
    body: "Before it changes an order from a DM, it asks for the email or zip on that order.",
    visual: <VerifyVisual />,
  },
  {
    title: "Learns your voice",
    body: "Edit a few drafts and it suggests how to sound more like you. Nothing changes until you approve.",
    visual: <VoiceVisual />,
  },
  {
    title: "Remembers your answers",
    body: "When your policies don’t cover a question, it asks you once and saves the answer.",
    visual: <MemoryVisual />,
  },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <h2 id="features-heading" className="m-display m-h2">Built for a team of one.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">
          It reads your store, learns how you write and remembers what you tell it.
        </p>
      </div>

      <div className="m-tiles mt-12 sm:mt-14">
        {tiles.map((tile) => (
          <article key={tile.title} className={cn("m-tile", tile.wide && "is-wide")}>
            <div aria-hidden className="m-tile-visual">
              {tile.visual}
            </div>
            <div className="m-tile-copy">
              <h3 className="m-tile-title">{tile.title}</h3>
              <p className="m-tile-body">{tile.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
