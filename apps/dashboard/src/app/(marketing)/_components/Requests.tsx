import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { Camera, CircleX, Globe, PackageSearch, Repeat2, ShieldAlert, Store, Truck, UserRoundCheck } from "lucide-react";
import { cn } from "@/lib/ui/cn";

// The three lanes are `decideAutonomy`'s outcomes in the default "Ask first"
// tier: a read-and-reply sends on its own, anything that writes to Shopify waits
// for approval, and the escalation reasons in `routing-evidence.ts` (dispute
// language, wholesale, a claimed prior approval) go straight to the merchant.

type Channel = "instagram" | "email";

interface Request {
  channel: Channel;
  from: string;
  text: string;
  outcome: string;
  Icon: LucideIcon;
}

interface Lane {
  tone: "auto" | "ask" | "you";
  title: string;
  note: string;
  requests: Request[];
}

const lanes: Lane[] = [
  {
    tone: "auto",
    title: "Answers on its own",
    note: "When the answer is in your store.",
    requests: [
      { channel: "instagram", from: "jess.makes", text: "where’s my order?? it’s been a week", outcome: "Replies with live tracking.", Icon: Truck },
      { channel: "email", from: "Daniel Ortiz", text: "Do you ship to Canada?", outcome: "Answers from your shipping policy.", Icon: Globe },
      { channel: "instagram", from: "noor.studio", text: "is the jumpsuit back in a small?", outcome: "Checks stock and replies.", Icon: PackageSearch },
    ],
  },
  {
    tone: "ask",
    title: "Asks you first",
    note: "Before any change or refund.",
    requests: [
      { channel: "instagram", from: "maya.chen", text: "can I switch to a Small before it ships?", outcome: "Swaps the size on the order.", Icon: Repeat2 },
      { channel: "email", from: "Sam Whitfield", text: "I ordered twice by mistake. Can you cancel one?", outcome: "Cancels the duplicate and refunds it.", Icon: CircleX },
      { channel: "email", from: "Ava Lindqvist", text: "My mug arrived cracked.", outcome: "Asks for a photo, then proposes a refund.", Icon: Camera },
    ],
  },
  {
    tone: "you",
    title: "Hands it to you",
    note: "When it needs your judgment.",
    requests: [
      { channel: "email", from: "R. Patel", text: "I’ve opened a dispute with my bank.", outcome: "Flags a possible chargeback.", Icon: ShieldAlert },
      { channel: "instagram", from: "kindred.goods", text: "do you offer wholesale pricing?", outcome: "Tells you it’s a wholesale inquiry.", Icon: Store },
      { channel: "email", from: "Chris Moreau", text: "Your team already approved my refund.", outcome: "Warns you to check that yourself.", Icon: UserRoundCheck },
    ],
  },
];

const channelLogo: Record<Channel, { src: string; label: string }> = {
  instagram: { src: "/logos/instagram-logo.png", label: "Instagram message from" },
  email: { src: "/logos/gmail.png", label: "Email from" },
};

function RequestCard({ channel, from, text, outcome, Icon }: Request) {
  return (
    <li className="m-req">
      <p className="m-req-from">
        <Image src={channelLogo[channel].src} alt="" width={14} height={14} />
        <span className="sr-only">{channelLogo[channel].label}</span>
        {from}
      </p>
      <p className="m-req-text">{text}</p>
      <p className="m-req-outcome">
        <Icon aria-hidden strokeWidth={2} />
        {outcome}
      </p>
    </li>
  );
}

export function Requests() {
  return (
    <section id="what-it-handles" aria-labelledby="requests-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <h2 id="requests-heading" className="m-display m-h2">
          It handles the everyday. <span className="m-tail">You handle the exceptions.</span>
        </h2>
        <p className="m-lede mt-5 text-[1.125rem]">
          Questions get answered from your store. Changes wait for your yes. Anything unusual comes straight to you.
        </p>
      </div>

      <div className="m-lanes is-scroll mt-12 sm:mt-14">
        {lanes.map((lane) => (
          <div key={lane.tone} className={cn("m-lane", `is-${lane.tone}`)}>
            <div className="m-lane-head">
              <h3 className="m-lane-title">
                <span aria-hidden className="m-lane-dot" />
                {lane.title}
              </h3>
              <p className="m-lane-note">{lane.note}</p>
            </div>
            <ul className="m-lane-list">
              {lane.requests.map((request) => (
                <RequestCard key={request.text} {...request} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
